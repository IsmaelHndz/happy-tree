"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatFullName, type FamilyMemberItem, type FamilyRelationshipType } from "./types";
import type { Gender } from "@/types/database.types";
import { inferKinship } from "./utils/kinship-inference";
import crypto from "crypto";

const RELATIONSHIP_LABELS: Record<FamilyRelationshipType, string> = {
  father: "Padre",
  mother: "Madre",
  son: "Hijo",
  daughter: "Hija",
  spouse: "Cónyuge / Esposo(a)",
  partner: "Pareja",
  brother: "Hermano",
  sister: "Hermana",
};

/**
 * Obtiene la lista de familiares conectados al usuario actual y su estado de reclamación/invitación.
 */
export async function getFamilyMembers(perspectivePersonId?: string): Promise<FamilyMemberItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  // 1. Obtener person_id del usuario
  const { data: profile } = await supabase
    .from("profiles")
    .select("person_id, is_user_zero")
    .eq("id", user.id)
    .single();

  if (!profile?.person_id) return [];
  const currentPersonId =
    perspectivePersonId && perspectivePersonId.trim().length > 0
      ? perspectivePersonId.trim()
      : profile.person_id;

  // 2. Consultar relaciones verticales (padres e hijos)
  const { data: allParentEdges } = await supabase
    .from("parent_child_edges")
    .select("id, parent_id, child_id, relationship_type");

  const parentIds = allParentEdges?.filter((e) => e.child_id === currentPersonId).map((e) => e.parent_id) ?? [];
  const childIds = allParentEdges?.filter((e) => e.parent_id === currentPersonId).map((e) => e.child_id) ?? [];

  // Hermanos: hijos de los mismos padres distintos al usuario
  let siblingIds: string[] = [];
  if (parentIds.length > 0) {
    siblingIds = Array.from(
      new Set(
        allParentEdges
          ?.filter((e) => parentIds.includes(e.parent_id) && e.child_id !== currentPersonId)
          .map((e) => e.child_id) ?? []
      )
    );
  }

  // 3. Consultar parejas / uniones
  const { data: unionsAsA } = await supabase
    .from("union_edges")
    .select("id, person_a_id, person_b_id, union_type, status")
    .eq("person_a_id", currentPersonId);

  const { data: unionsAsB } = await supabase
    .from("union_edges")
    .select("id, person_a_id, person_b_id, union_type, status")
    .eq("person_b_id", currentPersonId);

  const allUserUnions = [...(unionsAsA ?? []), ...(unionsAsB ?? [])].filter(
    (u) => u.status !== "rejected"
  );

  const spouseIds = [
    ...(unionsAsA?.filter((u) => u.status !== "rejected").map((u) => u.person_b_id) ?? []),
    ...(unionsAsB?.filter((u) => u.status !== "rejected").map((u) => u.person_a_id) ?? []),
  ];

  // 4. Personas creadas por el usuario (para no perder ninguna)
  const { data: createdPersons } = await supabase
    .from("persons")
    .select("id")
    .eq("created_by_user_id", user.id)
    .neq("id", currentPersonId);

  const createdIds = createdPersons?.map((p) => p.id) ?? [];

  // Unificar IDs de familiares
  const allFamilyIds = Array.from(
    new Set([...parentIds, ...childIds, ...siblingIds, ...spouseIds, ...createdIds])
  );

  if (allFamilyIds.length === 0) return [];

  // 5. Consultar los datos de las personas
  type PersonQueryResult = {
    id: string;
    first_name: string;
    middle_name?: string | null;
    last_name: string;
    maternal_last_name?: string | null;
    maiden_name: string | null;
    gender: Gender;
    birth_date: string | null;
    death_date: string | null;
    is_living: boolean;
    birth_place: string | null;
    bio: string | null;
    is_claimed: boolean;
    created_by_user_id: string | null;
  };

  let persons: PersonQueryResult[] | null = null;

  const { data: personsWithNewCols, error: personsError } = await supabase
    .from("persons")
    .select("id, first_name, middle_name, last_name, maternal_last_name, maiden_name, gender, birth_date, death_date, is_living, birth_place, bio, is_claimed, created_by_user_id")
    .in("id", allFamilyIds);

  if (personsError || !personsWithNewCols) {
    const { data: fallbackPersons } = await supabase
      .from("persons")
      .select("id, first_name, last_name, maiden_name, gender, birth_date, death_date, is_living, birth_place, bio, is_claimed, created_by_user_id")
      .in("id", allFamilyIds);

    persons = (fallbackPersons || []).map((p) => ({
      ...p,
      middle_name: null,
      maternal_last_name: null,
      gender: p.gender as Gender,
    }));
  } else {
    persons = (personsWithNewCols || []).map((p) => ({
      ...p,
      gender: p.gender as Gender,
    }));
  }

  if (!persons || persons.length === 0) return [];

  // 6. Consultar tokens de invitación activos
  const { data: tokens } = await supabase
    .from("invitation_tokens")
    .select("token, person_id, status, expires_at, invited_email")
    .in("person_id", allFamilyIds)
    .order("created_at", { ascending: false });

  const personsMap = new Map<string, { id: string; firstName: string; middleName?: string | null; lastName: string; maternalLastName?: string | null; gender: Gender }>(
    persons.map((p) => [
      p.id,
      {
        id: p.id,
        firstName: p.first_name,
        middleName: p.middle_name,
        lastName: p.last_name,
        maternalLastName: p.maternal_last_name,
        gender: p.gender as Gender,
      },
    ])
  );

  // Mapear resultado con inferencia inteligente de parentesco relativa al usuario
  return persons.map((p) => {
    const matchedUnion = allUserUnions.find(
      (u) => (u.person_a_id === currentPersonId && u.person_b_id === p.id) ||
             (u.person_b_id === currentPersonId && u.person_a_id === p.id)
    );

    const unionInfo = matchedUnion
      ? {
          id: matchedUnion.id,
          unionType: matchedUnion.union_type,
          partnerId: currentPersonId,
        }
      : null;

    const kinship = inferKinship({
      rootPersonId: currentPersonId,
      targetPersonId: p.id,
      targetGender: p.gender as Gender,
      parentEdges: allParentEdges || [],
      unions: allUserUnions,
      personsMap,
    });

    const personParents = allParentEdges?.filter((e) => e.child_id === p.id) || [];
    const parentConnections = personParents.map((e) => {
      const parentObj = personsMap.get(e.parent_id);
      return {
        id: e.id,
        parentId: e.parent_id,
        parentName: parentObj ? `${parentObj.firstName} ${parentObj.lastName}` : "Progenitor",
        relationshipType: e.relationship_type || "biological",
      };
    });

    const inviteToken = tokens?.find((t) => t.person_id === p.id);

    return {
      id: p.id,
      firstName: p.first_name,
      middleName: p.middle_name,
      lastName: p.last_name,
      maternalLastName: p.maternal_last_name,
      maidenName: p.maiden_name,
      gender: p.gender,
      birthDate: p.birth_date,
      deathDate: p.death_date,
      isLiving: p.is_living,
      birthPlace: p.birth_place,
      bio: p.bio,
      isClaimed: p.is_claimed,
      createdByUserId: p.created_by_user_id,
      relationshipLabel: kinship.relationshipLabel,
      relationshipCategory: kinship.relationshipCategory,
      relationshipExplanation: kinship.explanation,
      invitationStatus: inviteToken?.status ?? null,
      invitationToken: inviteToken?.token ?? null,
      invitationExpiresAt: inviteToken?.expires_at ?? null,
      invitedEmail: (inviteToken?.invited_email && inviteToken.invited_email.trim() !== "") ? inviteToken.invited_email.trim() : null,
      accountEmail: (inviteToken?.invited_email && inviteToken.invited_email.trim() !== "") ? inviteToken.invited_email.trim() : null,
      parentConnections,
      unionInfo,
    };
  });
}

/**
 * Server Action: Registrar un nuevo familiar y enlazarlo con el nodo del usuario.
 */
export async function createFamilyMemberAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes estar autenticado para registrar familiares." };
  }

  // Obtener person_id del usuario y permisos
  const { data: profile } = await supabase
    .from("profiles")
    .select("person_id, is_user_zero")
    .eq("id", user.id)
    .single();

  if (!profile?.person_id) {
    return { error: "No tienes una ficha genealógica activa." };
  }

  // Familiar de Referencia (Anchor): permite al Usuario Cero construir ramas para mamá, hermanos, etc.
  const requestedAnchorId = (formData.get("anchor_person_id") as string)?.trim();
  const currentPersonId = requestedAnchorId || profile.person_id;

  const firstName = (formData.get("first_name") as string)?.trim();
  const middleName = (formData.get("middle_name") as string)?.trim() || null;
  const lastName = (formData.get("last_name") as string)?.trim();
  const maternalLastName = (formData.get("maternal_last_name") as string)?.trim() || null;
  const gender = (formData.get("gender") as Gender) || "unknown";
  const birthDate = (formData.get("birth_date") as string) || null;
  const isLiving = formData.get("is_living") === "true";
  const relationship = (formData.get("relationship") as FamilyRelationshipType) || "father";
  const inviteEmail = (formData.get("invite_email") as string)?.trim() || null;

  if (!firstName || !lastName) {
    return { error: "El primer nombre y el apellido paterno son obligatorios." };
  }

  // 1. Crear el nuevo nodo en persons (is_claimed = false)
  let newPerson: { id: string } | null = null;
  let personError: { message: string } | null = null;

  const insertWithNewFields = await supabase
    .from("persons")
    .insert({
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      maternal_last_name: maternalLastName,
      gender,
      birth_date: birthDate,
      is_living: isLiving,
      is_claimed: false,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (insertWithNewFields.error) {
    // Reintentar sin columnas nuevas si la migración aún no se ejecuta en la BD
    const fallbackInsert = await supabase
      .from("persons")
      .insert({
        first_name: firstName,
        last_name: lastName,
        gender,
        birth_date: birthDate,
        is_living: isLiving,
        is_claimed: false,
        created_by_user_id: user.id,
      })
      .select("id")
      .single();

    newPerson = fallbackInsert.data;
    personError = fallbackInsert.error;
  } else {
    newPerson = insertWithNewFields.data;
  }

  if (personError || !newPerson) {
    return { error: `Error creando ficha familiar: ${personError?.message}` };
  }

  const newPersonId = newPerson.id;

  // 2. Crear las aristas (Edges) según la relación
  if (relationship === "father" || relationship === "mother") {
    // 2.1 Vincular el nuevo padre/madre con la persona de referencia (anchor)
    await supabase.from("parent_child_edges").insert({
      parent_id: newPersonId,
      child_id: currentPersonId,
      relationship_type: "biological",
      status: "confirmed",
      created_by_user_id: user.id,
    });

    // 2.2 Si la persona de referencia ya tiene otro progenitor registrado y no hay unión activa,
    // consultar si se debe enlazar
    const { data: existingParents } = await supabase
      .from("parent_child_edges")
      .select("parent_id")
      .eq("child_id", currentPersonId);

    if (existingParents && existingParents.length > 0) {
      for (const ep of existingParents) {
        if (ep.parent_id !== newPersonId) {
          // Verificar si ya existe alguna unión entre ambos
          const { data: existingUnion } = await supabase
            .from("union_edges")
            .select("id")
            .or(`and(person_a_id.eq.${ep.parent_id},person_b_id.eq.${newPersonId}),and(person_a_id.eq.${newPersonId},person_b_id.eq.${ep.parent_id})`)
            .maybeSingle();

          if (!existingUnion) {
            await supabase.from("union_edges").insert({
              person_a_id: ep.parent_id,
              person_b_id: newPersonId,
              union_type: "married",
              status: "confirmed",
              created_by_user_id: user.id,
            });
          }
        }
      }
    }
  } else if (relationship === "son" || relationship === "daughter") {
    // 2.4 Vincular el hijo con la persona de referencia
    await supabase.from("parent_child_edges").insert({
      parent_id: currentPersonId,
      child_id: newPersonId,
      relationship_type: "biological",
      status: "confirmed",
      created_by_user_id: user.id,
    });

    // Si la persona de referencia tiene cónyuge/pareja actual, vincular al hijo también con la pareja
    const { data: spousesA } = await supabase
      .from("union_edges")
      .select("person_b_id, union_type")
      .eq("person_a_id", currentPersonId)
      .not("union_type", "in", '("divorced","separated")');

    const { data: spousesB } = await supabase
      .from("union_edges")
      .select("person_a_id, union_type")
      .eq("person_b_id", currentPersonId)
      .not("union_type", "in", '("divorced","separated")');

    const spouseIds = [
      ...(spousesA?.map((s) => s.person_b_id) ?? []),
      ...(spousesB?.map((s) => s.person_a_id) ?? []),
    ];

    for (const spId of spouseIds) {
      await supabase.from("parent_child_edges").insert({
        parent_id: spId,
        child_id: newPersonId,
        relationship_type: "biological",
        status: "confirmed",
        created_by_user_id: user.id,
      });
    }
  } else if (relationship === "spouse" || relationship === "partner") {
    await supabase.from("union_edges").insert({
      person_a_id: currentPersonId,
      person_b_id: newPersonId,
      union_type: relationship === "spouse" ? "married" : "partner",
      status: "confirmed",
      created_by_user_id: user.id,
    });
  } else if (relationship === "brother" || relationship === "sister") {
    // Buscar los padres de la persona ancla
    const { data: parents } = await supabase
      .from("parent_child_edges")
      .select("parent_id")
      .eq("child_id", currentPersonId);

    if (parents && parents.length > 0) {
      for (const parent of parents) {
        await supabase.from("parent_child_edges").insert({
          parent_id: parent.parent_id,
          child_id: newPersonId,
          relationship_type: "biological",
          status: "confirmed",
          created_by_user_id: user.id,
        });
      }
    } else {
      // Si la persona de referencia no tiene padres registrados aún:
      // Creamos un nodo de linaje/progenitor común para que ambos hermanos queden conectados en el árbol
      let anchorPerson: { first_name: string; last_name: string; maternal_last_name?: string | null } | null = null;
      const { data: anchorData, error: anchorErr } = await supabase
        .from("persons")
        .select("first_name, last_name, maternal_last_name")
        .eq("id", currentPersonId)
        .maybeSingle();

      if (anchorErr || !anchorData) {
        const { data: fallbackAnchor } = await supabase
          .from("persons")
          .select("first_name, last_name")
          .eq("id", currentPersonId)
          .maybeSingle();
        anchorPerson = fallbackAnchor;
      } else {
        anchorPerson = anchorData;
      }

      const lineageLastName = anchorPerson?.last_name || lastName || "Linaje Familiar";
      const { data: sharedParent } = await supabase
        .from("persons")
        .insert({
          first_name: "Progenitor/a",
          last_name: lineageLastName,
          gender: "unknown",
          is_living: true,
          is_claimed: false,
          bio: `Nodo de linaje ancestral común creado para conectar a ${anchorPerson?.first_name ?? "familiar"} con su hermano/a ${firstName}. Puedes editar este nodo para registrar el nombre real de tu abuelo/a.`,
          created_by_user_id: user.id,
        })
        .select("id")
        .single();

      if (sharedParent) {
        await supabase.from("parent_child_edges").insert([
          {
            parent_id: sharedParent.id,
            child_id: currentPersonId,
            relationship_type: "biological",
            status: "confirmed",
            created_by_user_id: user.id,
          },
          {
            parent_id: sharedParent.id,
            child_id: newPersonId,
            relationship_type: "biological",
            status: "confirmed",
            created_by_user_id: user.id,
          },
        ]);
      }
    }
  }

  // 3. Si se proporcionó un correo y la persona está viva, generar token de invitación inmediatamente
  let generatedToken: string | null = null;
  if (isLiving && inviteEmail) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const { data: tokenData } = await supabase
      .from("invitation_tokens")
      .insert({
        token: rawToken,
        person_id: newPersonId,
        invited_by_user_id: user.id,
        invited_email: inviteEmail,
        proposed_relationship: RELATIONSHIP_LABELS[relationship],
      })
      .select("token")
      .single();

    generatedToken = tokenData?.token ?? null;
  }

  revalidatePath("/");
  revalidatePath("/tree");

  return {
    success: true,
    personId: newPersonId,
    invitationToken: generatedToken,
  };
}

/**
 * Server Action: Actualizar la información de una ficha familiar existente.
 */
export async function updateFamilyMemberAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes estar autenticado para actualizar fichas familiares." };
  }

  const personId = (formData.get("person_id") as string)?.trim();
  const firstName = (formData.get("first_name") as string)?.trim();
  const middleName = (formData.get("middle_name") as string)?.trim() || null;
  const lastName = (formData.get("last_name") as string)?.trim();
  const maternalLastName = (formData.get("maternal_last_name") as string)?.trim() || null;
  const maidenName = (formData.get("maiden_name") as string)?.trim() || null;
  const gender = (formData.get("gender") as Gender) || "unknown";
  const birthDate = (formData.get("birth_date") as string) || null;
  const isLiving = formData.get("is_living") === "true";
  const deathDate = isLiving ? null : (formData.get("death_date") as string) || null;
  const birthPlace = (formData.get("birth_place") as string)?.trim() || null;
  const bio = (formData.get("bio") as string)?.trim() || null;

  if (!personId) {
    return { error: "El identificador de la persona es obligatorio." };
  }

  if (!firstName || !lastName) {
    return { error: "El primer nombre y el apellido paterno son obligatorios." };
  }

  // Validación de coherencia en fechas
  if (!isLiving && deathDate && birthDate && deathDate < birthDate) {
    return { error: "La fecha de defunción no puede ser anterior a la fecha de nacimiento." };
  }

  // Consultar perfil del usuario y estado del nodo
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_user_zero, person_id")
    .eq("id", user.id)
    .single();

  const { data: targetPerson, error: fetchError } = await supabase
    .from("persons")
    .select("id, is_claimed, claimed_by_user_id, created_by_user_id")
    .eq("id", personId)
    .single();

  if (fetchError || !targetPerson) {
    return { error: "No se encontró la ficha genealógica especificada." };
  }

  // Control de permisos estricto:
  // 1. Si la ficha está reclamada, ÚNICAMENTE su titular puede modificar su información personal.
  // 2. Si la ficha NO está reclamada, cualquier miembro activo de la red familiar o el creador puede editarla.
  const isUserZero = profile?.is_user_zero ?? false;
  const isClaimedOwner = targetPerson.is_claimed && targetPerson.claimed_by_user_id === user.id;
  const isClaimedMember = Boolean(profile?.person_id);
  const isUnclaimed = !targetPerson.is_claimed;

  if (targetPerson.is_claimed && !isClaimedOwner) {
    return {
      error: "Esta ficha pertenece a la cuenta personal de otro familiar y solo su titular puede modificarla.",
    };
  }

  if (isUnclaimed && !isUserZero && !isClaimedMember && targetPerson.created_by_user_id !== user.id) {
    return {
      error: "No tienes permisos para editar esta ficha familiar.",
    };
  }

  // Ejecutar actualización
  const { error: updateError } = await supabase
    .from("persons")
    .update({
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      maternal_last_name: maternalLastName,
      maiden_name: maidenName,
      gender,
      birth_date: birthDate,
      death_date: deathDate,
      is_living: isLiving,
      birth_place: birthPlace,
      bio,
      updated_at: new Date().toISOString(),
    })
    .eq("id", personId);

  if (updateError) {
    // Si falló por falta de columnas nuevas en la base de datos, reintentar con las columnas estándar
    const { error: fallbackError } = await supabase
      .from("persons")
      .update({
        first_name: firstName,
        last_name: lastName,
        maiden_name: maidenName,
        gender,
        birth_date: birthDate,
        death_date: deathDate,
        is_living: isLiving,
        birth_place: birthPlace,
        bio,
        updated_at: new Date().toISOString(),
      })
      .eq("id", personId);

    if (fallbackError) {
      return { error: `Error al actualizar la ficha: ${fallbackError.message}` };
    }
  }

  revalidatePath("/");
  revalidatePath("/tree");

  return { success: true };
}

/**
 * Server Action: Eliminar una ficha familiar (solo si aún no ha sido reclamada).
 */
export async function deleteFamilyMemberAction(personId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes estar autenticado para realizar esta acción." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_user_zero, person_id")
    .eq("id", user.id)
    .single();

  if (profile?.person_id === personId) {
    return { error: "No puedes eliminar tu propia ficha genealógica principal." };
  }

  const { data: targetPerson, error: fetchError } = await supabase
    .from("persons")
    .select("id, is_claimed, created_by_user_id")
    .eq("id", personId)
    .single();

  if (fetchError || !targetPerson) {
    return { error: "No se encontró la ficha familiar a eliminar." };
  }

  if (targetPerson.is_claimed) {
    return {
      error: "No se puede eliminar una ficha que ya fue reclamada por un usuario registrado.",
    };
  }

  const isUserZero = profile?.is_user_zero ?? false;
  const isCreator = targetPerson.created_by_user_id === user.id;
  const isClaimedMember = Boolean(profile?.person_id);

  if (!isUserZero && !isCreator && !isClaimedMember) {
    return { error: "No tienes permiso para eliminar esta ficha familiar." };
  }

  const { error: deleteError } = await supabase
    .from("persons")
    .delete()
    .eq("id", personId);

  if (deleteError) {
    return { error: `Error al eliminar la ficha: ${deleteError.message}` };
  }

  revalidatePath("/");
  revalidatePath("/tree");

  return { success: true };
}

/**
 * Server Action: Actualizar el estado conyugal de una pareja (Casados, Separados, Divorciados, etc.).
 */
export async function updateUnionStatusAction({
  personAId,
  personBId,
  unionType,
}: {
  personAId: string;
  personBId: string;
  unionType: "married" | "civil_union" | "divorced" | "separated" | "partner";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes estar autenticado para modificar vínculos conyugales." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_user_zero, person_id")
    .eq("id", user.id)
    .single();

  const isUserZero = profile?.is_user_zero ?? false;
  const isDirectParty = profile?.person_id === personAId || profile?.person_id === personBId;

  if (!isUserZero && !isDirectParty) {
    return { error: "No tienes permisos para modificar este vínculo conyugal." };
  }

  // Buscar el registro de la unión
  const { data: unionRecord, error: fetchError } = await supabase
    .from("union_edges")
    .select("id")
    .or(
      `and(person_a_id.eq.${personAId},person_b_id.eq.${personBId}),and(person_a_id.eq.${personBId},person_b_id.eq.${personAId})`
    )
    .maybeSingle();

  if (fetchError || !unionRecord) {
    return { error: "No se encontró el vínculo conyugal entre estas dos personas." };
  }

  const { error: updateError } = await supabase
    .from("union_edges")
    .update({
      union_type: unionType,
      updated_at: new Date().toISOString(),
    })
    .eq("id", unionRecord.id);

  if (updateError) {
    return { error: `Error actualizando estado conyugal: ${updateError.message}` };
  }

  revalidatePath("/");
  revalidatePath("/tree");

  return { success: true };
}

/**
 * Server Action: Disolver o eliminar un vínculo de pareja.
 * Si no tienen hijos en común, se elimina completamente la relación.
 * Si tienen hijos en común, se actualiza a 'separated' o 'divorced' para preservar la filiación de los hijos.
 */
export async function dissolveUnionAction({
  personAId,
  personBId,
  deletePersonId,
}: {
  personAId: string;
  personBId: string;
  deletePersonId?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes estar autenticado para realizar esta acción." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_user_zero, person_id")
    .eq("id", user.id)
    .single();

  const isUserZero = profile?.is_user_zero ?? false;
  const isDirectParty = profile?.person_id === personAId || profile?.person_id === personBId;

  if (!isUserZero && !isDirectParty) {
    return { error: "No tienes permisos para disolver este vínculo conyugal." };
  }

  // 1. Verificar si comparten hijos en común
  const { data: childrenA } = await supabase
    .from("parent_child_edges")
    .select("child_id")
    .eq("parent_id", personAId);

  const { data: childrenB } = await supabase
    .from("parent_child_edges")
    .select("child_id")
    .eq("parent_id", personBId);

  const childIdsA = new Set(childrenA?.map((c) => c.child_id) ?? []);
  const sharedChildren = (childrenB?.map((c) => c.child_id) ?? []).filter((id) => childIdsA.has(id));

  // 2. Buscar el registro de la unión
  const { data: unionRecord } = await supabase
    .from("union_edges")
    .select("id")
    .or(
      `and(person_a_id.eq.${personAId},person_b_id.eq.${personBId}),and(person_a_id.eq.${personBId},person_b_id.eq.${personAId})`
    )
    .maybeSingle();

  if (!unionRecord) {
    return { error: "No se encontró el vínculo de pareja a disolver." };
  }

  if (sharedChildren.length > 0) {
    // Si tienen hijos, marcamos como separados para conservar la filiación de los hijos en el árbol
    await supabase
      .from("union_edges")
      .update({
        union_type: "separated",
        status: "confirmed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", unionRecord.id);

    revalidatePath("/");
    revalidatePath("/tree");

    return {
      success: true,
      hasSharedChildren: true,
      message: "Tienen hijos en común: la relación se actualizó a 'Separados' para preservar la filiación familiar.",
    };
  }

  // Si no tienen hijos en común:
  // Intentar eliminar físicamente el registro de la unión
  const { error: deleteError } = await supabase
    .from("union_edges")
    .delete()
    .eq("id", unionRecord.id);

  // Fallback si la política DELETE en Supabase remoto aún no estuviera aplicada
  if (deleteError) {
    await supabase
      .from("union_edges")
      .update({
        union_type: "divorced",
        status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", unionRecord.id);
  }

  // Si se solicitó eliminar también la ficha (por ser innecesaria tras la ruptura)
  let personDeleted = false;
  if (deletePersonId) {
    const { data: targetPerson } = await supabase
      .from("persons")
      .select("id, is_claimed, created_by_user_id")
      .eq("id", deletePersonId)
      .single();

    if (
      targetPerson &&
      !targetPerson.is_claimed &&
      (isUserZero || targetPerson.created_by_user_id === user.id)
    ) {
      const { error: personDelError } = await supabase
        .from("persons")
        .delete()
        .eq("id", deletePersonId);

      if (!personDelError) {
        personDeleted = true;
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/tree");

  return {
    success: true,
    hasSharedChildren: false,
    personDeleted,
    message: personDeleted
      ? "Ficha y vínculo eliminados por completo."
      : "Vínculo de pareja disuelto. Ya no aparecerá en tu árbol.",
  };
}

/**
 * Consulta la lista de todas las personas registradas para usarlas como familiares de referencia (Anchors).
 */
export async function getAvailableAnchors(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: persons } = await supabase
    .from("persons")
    .select("id, first_name, last_name")
    .order("first_name", { ascending: true });

  return persons?.map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` })) ?? [];
}

export interface SearchPersonResult {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  birthDate: string | null;
  isClaimed: boolean;
  matchType?: "id" | "name";
}

/**
 * Server Action: Búsqueda escalable de personas por Nombre, Apellidos o ID exacto.
 * Permite a cualquier usuario o administrador encontrar a alguien por su ID compartido o nombre.
 */
export async function searchPersonsAction(
  rawQuery: string
): Promise<{ results: SearchPersonResult[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { results: [], error: "Debes estar autenticado para buscar personas." };
  }

  const query = rawQuery.trim();
  if (!query) {
    return { results: [] };
  }

  // 1. Verificar si coincide con formato UUID (ej. al compartir o pegar el ID)
  const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);

  if (isFullUuid) {
    const { data: personById, error: idError } = await supabase
      .from("persons")
      .select("id, first_name, last_name, gender, birth_date, is_claimed")
      .eq("id", query)
      .maybeSingle();

    if (idError) {
      return { results: [], error: idError.message };
    }

    if (personById) {
      return {
        results: [
          {
            id: personById.id,
            firstName: personById.first_name,
            lastName: personById.last_name,
            gender: personById.gender as Gender,
            birthDate: personById.birth_date,
            isClaimed: personById.is_claimed,
            matchType: "id",
          },
        ],
      };
    }
  }

  // 2. Búsqueda por texto en Nombre o Apellidos
  const terms = query.split(/\s+/).filter(Boolean);
  let queryBuilder = supabase
    .from("persons")
    .select("id, first_name, last_name, gender, birth_date, is_claimed")
    .limit(10);

  if (terms.length === 1) {
    queryBuilder = queryBuilder.or(`first_name.ilike.%${terms[0]}%,last_name.ilike.%${terms[0]}%`);
  } else {
    queryBuilder = queryBuilder.or(
      `and(first_name.ilike.%${terms[0]}%,last_name.ilike.%${terms[1]}%),first_name.ilike.%${query}%,last_name.ilike.%${query}%`
    );
  }

  const { data: personsByName, error: nameError } = await queryBuilder;

  if (nameError) {
    return { results: [], error: nameError.message };
  }

  return {
    results: (personsByName || []).map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      gender: p.gender as Gender,
      birthDate: p.birth_date,
      isClaimed: p.is_claimed,
      matchType: "name",
    })),
  };
}

/**
 * Server Action: Liberar / Resetear la vinculación de cuenta de una ficha genealógica (Unclaim).
 * Permite a Usuario Cero o al creador desvincular un correo/cuenta erróneo para invitar a la persona correcta.
 */
export async function resetPersonClaimAction(personId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes estar autenticado para realizar esta acción." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_user_zero, person_id")
    .eq("id", user.id)
    .single();

  const isUserZero = profile?.is_user_zero ?? false;

  // Solo el Usuario Cero puede liberar fichas reclamadas
  if (!isUserZero) {
    return { error: "Solo el Administrador Familiar tiene permisos para liberar fichas reclamadas." };
  }

  // Verificar que la persona a liberar no sea el Administrador Fundador
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("is_user_zero")
    .eq("person_id", personId)
    .maybeSingle();

  if (targetProfile?.is_user_zero) {
    return { error: "El perfil del Administrador Fundador no puede ser desvinculado ni reseteado." };
  }

  // 1. Intentar ejecutar función RPC atómica
  const supabaseDynamic = supabase as unknown as {
    rpc: (
      fn: string,
      args?: Record<string, unknown>
    ) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data: rpcData, error: rpcError } = await supabaseDynamic.rpc("reset_person_claim", {
    p_person_id: personId,
    p_admin_user_id: user.id,
  });

  if (!rpcError && rpcData) {
    const res = rpcData as { success?: boolean; error?: string; message?: string };
    if (res.error) {
      return { error: res.error };
    }
    revalidatePath("/");
    revalidatePath("/tree");
    return { success: true, message: res.message || "Ficha liberada exitosamente." };
  }

  // 2. Fallback directo si la migración RPC aún no se ha ejecutado en Supabase remoto
  const { data: targetPerson, error: fetchError } = await supabase
    .from("persons")
    .select("id, is_claimed, claimed_by_user_id, created_by_user_id")
    .eq("id", personId)
    .single();

  if (fetchError || !targetPerson) {
    return { error: "No se encontró la ficha familiar a liberar." };
  }

  if (!isUserZero && targetPerson.created_by_user_id !== user.id) {
    return { error: "No tienes permisos para desvincular esta ficha." };
  }

  // Desvincular en persons
  await supabase
    .from("persons")
    .update({
      is_claimed: false,
      claimed_by_user_id: null,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", personId);

  // Revocar tokens anteriores
  await supabase
    .from("invitation_tokens")
    .update({
      status: "revoked",
    })
    .eq("person_id", personId);

  revalidatePath("/");
  revalidatePath("/tree");

  return {
    success: true,
    message: "Ficha familiar liberada exitosamente. Ya puedes invitar a la persona con su correo real.",
  };
}

/**
 * Server Action: Actualizar o reasignar los progenitores de una persona (corrección de parentesco).
 */
export async function updatePersonParentsAction({
  personId,
  parentIds,
  relationshipType = "biological",
}: {
  personId: string;
  parentIds: string[];
  relationshipType?: "biological" | "adopted" | "foster" | "step";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes estar autenticado para realizar esta acción." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_user_zero, person_id")
    .eq("id", user.id)
    .single();

  const isUserZero = profile?.is_user_zero ?? false;

  // Consultar ficha
  const { data: targetPerson } = await supabase
    .from("persons")
    .select("id, is_claimed, created_by_user_id")
    .eq("id", personId)
    .single();

  if (!targetPerson) {
    return { error: "No se encontró la persona." };
  }

  const isClaimedMember = Boolean(profile?.person_id);
  const isSelf = profile?.person_id === personId;

  // Si la persona objetivo ya reclamó su ficha:
  // ÚNICAMENTE esa misma persona (isSelf) puede modificar sus propios progenitores.
  if (targetPerson.is_claimed && !isSelf) {
    return { error: "No puedes modificar los progenitores de un familiar que ya reclamó su cuenta personal." };
  }

  // Si la ficha no está reclamada, cualquier miembro activo o creador o Usuario Cero puede colaborar:
  if (!targetPerson.is_claimed && !isUserZero && !isClaimedMember && targetPerson.created_by_user_id !== user.id) {
    return { error: "No tienes permisos para modificar los parentescos de esta persona." };
  }

  // 1. Consultar filiaciones actuales
  const { data: currentEdges } = await supabase
    .from("parent_child_edges")
    .select("id, parent_id")
    .eq("child_id", personId);

  const currentParentIds = currentEdges?.map((e) => e.parent_id) ?? [];

  // 2. Eliminar progenitores que fueron quitados
  const parentsToRemove = currentEdges?.filter((e) => !parentIds.includes(e.parent_id)) ?? [];
  for (const edge of parentsToRemove) {
    await supabase.from("parent_child_edges").delete().eq("id", edge.id);
  }

  // 3. Añadir o actualizar nuevos progenitores
  const parentsToAdd = parentIds.filter((pId) => !currentParentIds.includes(pId));
  for (const parentId of parentsToAdd) {
    if (parentId && parentId !== personId) {
      await supabase.from("parent_child_edges").insert({
        parent_id: parentId,
        child_id: personId,
        relationship_type: relationshipType,
        status: "confirmed",
        created_by_user_id: user.id,
      });
    }
  }

  revalidatePath("/");
  revalidatePath("/tree");

  return { success: true, message: "Parentescos actualizados exitosamente." };
}

/**
 * Server Action: Respaldar o endosar a un familiar reclamado (Permisos de Administrador / Invitador)
 */
export async function endorseFamilyMemberAction(endorsedPersonId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes estar autenticado para respaldar a un familiar." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_user_zero, person_id")
    .eq("id", user.id)
    .single();

  if (!profile?.person_id) {
    return { error: "No tienes una ficha genealógica activa." };
  }

  if (profile.person_id === endorsedPersonId) {
    return { error: "No puedes respaldar tu propia ficha." };
  }

  // 1. Intentar invocar función RPC segura
  const { error: rpcError } = await (supabase.rpc as any)("endorse_family_member", {
    p_endorsed_id: endorsedPersonId,
    p_notes: profile.is_user_zero ? "Respaldo directo de Administrador / Usuario Cero" : "Reconocimiento familiar",
  });

  if (rpcError) {
    // 2. Fallback a insert directo
    const { error: insertError } = await supabase.from("endorsements").insert({
      endorser_id: profile.person_id,
      endorsed_id: endorsedPersonId,
      notes: profile.is_user_zero ? "Respaldo directo de Administrador / Usuario Cero" : "Reconocimiento familiar",
    });

    if (insertError && !insertError.message.includes("duplicate") && !insertError.message.includes("unique")) {
      return { error: `Error al respaldar familiar: ${insertError.message}` };
    }
  }

  revalidatePath("/");
  revalidatePath("/tree");

  return {
    success: true,
    message: "Familiar respaldado exitosamente. Ahora cuenta con permisos completos de la red.",
  };
}

export interface EndorsementMemberItem {
  id: string;
  name: string;
  gender: string;
  isClaimed: boolean;
  claimedByEmail?: string | null;
  isEndorsedByMe: boolean;
  totalEndorsements: number;
  canInvite: boolean;
}

/**
 * Consulta la lista de miembros reclamados para el modal de gestión de respaldos.
 */
export async function getEndorsementManagementDataAction(): Promise<{
  members: EndorsementMemberItem[];
  isUserZero: boolean;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { members: [], isUserZero: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_user_zero, person_id")
    .eq("id", user.id)
    .single();

  if (!profile?.person_id) return { members: [], isUserZero: false };

  // Consultar todas las personas que han reclamado su ficha (distintas a la mía)
  const { data: claimedPersons } = await supabase
    .from("persons")
    .select("id, first_name, middle_name, last_name, maternal_last_name, gender, is_claimed, claimed_by_user_id")
    .eq("is_claimed", true)
    .neq("id", profile.person_id);

  if (!claimedPersons || claimedPersons.length === 0) {
    return { members: [], isUserZero: profile.is_user_zero };
  }

  // Consultar todos los respaldos
  const { data: allEndorsements } = await supabase
    .from("endorsements")
    .select("endorser_id, endorsed_id, created_at");

  const myEndorsements = new Set(
    (allEndorsements || [])
      .filter((e) => e.endorser_id === profile.person_id)
      .map((e) => e.endorsed_id)
  );

  const endorsementCounts = new Map<string, number>();
  (allEndorsements || []).forEach((e) => {
    endorsementCounts.set(e.endorsed_id, (endorsementCounts.get(e.endorsed_id) || 0) + 1);
  });

  const members: EndorsementMemberItem[] = claimedPersons.map((p) => {
    const isEndorsedByMe = myEndorsements.has(p.id);
    const count = endorsementCounts.get(p.id) || 0;
    return {
      id: p.id,
      name: formatFullName({
        firstName: p.first_name,
        middleName: p.middle_name,
        lastName: p.last_name,
        maternalLastName: p.maternal_last_name,
      }),
      gender: p.gender,
      isClaimed: p.is_claimed,
      isEndorsedByMe,
      totalEndorsements: count,
      canInvite: profile.is_user_zero ? isEndorsedByMe : count >= 3,
    };
  });

  return {
    members,
    isUserZero: profile.is_user_zero,
  };
}

/**
 * Retira un respaldo previamente otorgado a un familiar.
 */
export async function removeEndorsementAction(endorsedPersonId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("person_id")
    .eq("id", user.id)
    .single();

  if (!profile?.person_id) return { error: "Sin ficha personal" };

  const { error } = await supabase
    .from("endorsements")
    .delete()
    .eq("endorser_id", profile.person_id)
    .eq("endorsed_id", endorsedPersonId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/tree");
  return { success: true, message: "Respaldo retirado exitosamente." };
}
