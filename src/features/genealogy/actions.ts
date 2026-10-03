"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { FamilyMemberItem, FamilyRelationshipType } from "./types";
import type { Gender } from "@/types/database.types";
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
export async function getFamilyMembers(): Promise<FamilyMemberItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  // 1. Obtener person_id del usuario
  const { data: profile } = await supabase
    .from("profiles")
    .select("person_id")
    .eq("id", user.id)
    .single();

  if (!profile?.person_id) return [];
  const currentPersonId = profile.person_id;

  // 2. Consultar relaciones verticales (padres e hijos)
  const { data: parentEdges } = await supabase
    .from("parent_child_edges")
    .select("parent_id, relationship_type")
    .eq("child_id", currentPersonId);

  const parentIds = parentEdges?.map((e) => e.parent_id) ?? [];

  const { data: childEdges } = await supabase
    .from("parent_child_edges")
    .select("child_id, relationship_type")
    .eq("parent_id", currentPersonId);

  const childIds = childEdges?.map((e) => e.child_id) ?? [];

  // Hermanos: hijos de los mismos padres distintos al usuario
  let siblingIds: string[] = [];
  if (parentIds.length > 0) {
    const { data: siblingEdges } = await supabase
      .from("parent_child_edges")
      .select("child_id")
      .in("parent_id", parentIds)
      .neq("child_id", currentPersonId);

    siblingIds = Array.from(new Set(siblingEdges?.map((e) => e.child_id) ?? []));
  }

  // 3. Consultar parejas / uniones
  const { data: unionsAsA } = await supabase
    .from("union_edges")
    .select("id, person_a_id, person_b_id, union_type")
    .eq("person_a_id", currentPersonId);

  const { data: unionsAsB } = await supabase
    .from("union_edges")
    .select("id, person_a_id, person_b_id, union_type")
    .eq("person_b_id", currentPersonId);

  const allUserUnions = [...(unionsAsA ?? []), ...(unionsAsB ?? [])];

  const spouseIds = [
    ...(unionsAsA?.map((u) => u.person_b_id) ?? []),
    ...(unionsAsB?.map((u) => u.person_a_id) ?? []),
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
  const { data: persons } = await supabase
    .from("persons")
    .select("id, first_name, last_name, maiden_name, gender, birth_date, death_date, is_living, birth_place, bio, is_claimed, created_by_user_id")
    .in("id", allFamilyIds);

  if (!persons) return [];

  // 6. Consultar tokens de invitación activos
  const { data: tokens } = await supabase
    .from("invitation_tokens")
    .select("token, person_id, status, expires_at, invited_email")
    .in("person_id", allFamilyIds)
    .order("created_at", { ascending: false });

  // Mapear resultado con etiqueta de parentesco relativa al usuario
  return persons.map((p) => {
    let relationshipLabel = "Familiar";
    let relationshipCategory: FamilyMemberItem["relationshipCategory"] = "other";

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

    if (parentIds.includes(p.id)) {
      relationshipLabel = p.gender === "female" ? "Madre" : p.gender === "male" ? "Padre" : "Progenitor";
      relationshipCategory = "parent";
    } else if (childIds.includes(p.id)) {
      relationshipLabel = p.gender === "female" ? "Hija" : p.gender === "male" ? "Hijo" : "Descendiente";
      relationshipCategory = "child";
    } else if (spouseIds.includes(p.id)) {
      relationshipCategory = "spouse";
      if (matchedUnion?.union_type === "divorced") {
        relationshipLabel = "Ex-pareja (Divorciados)";
      } else if (matchedUnion?.union_type === "separated") {
        relationshipLabel = "Ex-pareja (Separados)";
      } else if (matchedUnion?.union_type === "partner" || matchedUnion?.union_type === "civil_union") {
        relationshipLabel = "Pareja (Unión Libre)";
      } else {
        relationshipLabel = "Cónyuge / Pareja";
      }
    } else if (siblingIds.includes(p.id)) {
      relationshipLabel = p.gender === "female" ? "Hermana" : p.gender === "male" ? "Hermano" : "Hermano/a";
      relationshipCategory = "sibling";
    }

    const inviteToken = tokens?.find((t) => t.person_id === p.id);

    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      maidenName: p.maiden_name,
      gender: p.gender,
      birthDate: p.birth_date,
      deathDate: p.death_date,
      isLiving: p.is_living,
      birthPlace: p.birth_place,
      bio: p.bio,
      isClaimed: p.is_claimed,
      createdByUserId: p.created_by_user_id,
      relationshipLabel,
      relationshipCategory,
      invitationStatus: inviteToken?.status ?? null,
      invitationToken: inviteToken?.token ?? null,
      invitationExpiresAt: inviteToken?.expires_at ?? null,
      invitedEmail: inviteToken?.invited_email ?? null,
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
  const lastName = (formData.get("last_name") as string)?.trim();
  const gender = (formData.get("gender") as Gender) || "unknown";
  const birthDate = (formData.get("birth_date") as string) || null;
  const isLiving = formData.get("is_living") === "true";
  const relationship = (formData.get("relationship") as FamilyRelationshipType) || "father";
  const inviteEmail = (formData.get("invite_email") as string)?.trim() || null;

  if (!firstName || !lastName) {
    return { error: "El nombre y los apellidos son obligatorios." };
  }

  // 1. Crear el nuevo nodo en persons (is_claimed = false)
  const { data: newPerson, error: personError } = await supabase
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

  if (personError || !newPerson) {
    return { error: `Error creando ficha familiar: ${personError?.message}` };
  }

  const newPersonId = newPerson.id;

  // 2. Crear las aristas (Edges) según la relación
  if (relationship === "father" || relationship === "mother") {
    // 2.1 Vincular el nuevo padre/madre con el usuario actual
    await supabase.from("parent_child_edges").insert({
      parent_id: newPersonId,
      child_id: currentPersonId,
      relationship_type: "biological",
      status: "confirmed",
      created_by_user_id: user.id,
    });

    // 2.2 Si el usuario ya tiene otro progenitor registrado, vincular a ambos progenitores como pareja/cónyuges
    const { data: existingParents } = await supabase
      .from("parent_child_edges")
      .select("parent_id")
      .eq("child_id", currentPersonId);

    if (existingParents && existingParents.length > 0) {
      for (const ep of existingParents) {
        if (ep.parent_id !== newPersonId) {
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

    // 2.3 Si el usuario tiene hermanos registrados (hijos de otros progenitores o familiares), vincular también al nuevo progenitor
    if (existingParents && existingParents.length > 0) {
      const otherParentIds = existingParents
        .map((p) => p.parent_id)
        .filter((id) => id !== newPersonId);

      if (otherParentIds.length > 0) {
        const { data: siblings } = await supabase
          .from("parent_child_edges")
          .select("child_id")
          .in("parent_id", otherParentIds)
          .neq("child_id", currentPersonId);

        if (siblings && siblings.length > 0) {
          for (const sib of siblings) {
            await supabase.from("parent_child_edges").insert({
              parent_id: newPersonId,
              child_id: sib.child_id,
              relationship_type: "biological",
              status: "confirmed",
              created_by_user_id: user.id,
            });
          }
        }
      }
    }
  } else if (relationship === "son" || relationship === "daughter") {
    // 2.4 Vincular el hijo con el usuario actual
    await supabase.from("parent_child_edges").insert({
      parent_id: currentPersonId,
      child_id: newPersonId,
      relationship_type: "biological",
      status: "confirmed",
      created_by_user_id: user.id,
    });

    // Si el usuario tiene cónyuge/pareja, vincular al hijo también con la pareja
    const { data: spousesA } = await supabase
      .from("union_edges")
      .select("person_b_id")
      .eq("person_a_id", currentPersonId);

    const { data: spousesB } = await supabase
      .from("union_edges")
      .select("person_a_id")
      .eq("person_b_id", currentPersonId);

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
    // Buscar los padres del usuario actual para asociar al hermano con ambos
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
  const lastName = (formData.get("last_name") as string)?.trim();
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
    return { error: "El nombre y los apellidos son obligatorios." };
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

  // Control de permisos:
  // 1. Usuario Cero puede editar cualquier ficha.
  // 2. Si la ficha está reclamada, solo el usuario reclamante puede editar su propia información.
  // 3. Si la ficha no está reclamada, el creador puede editarla.
  const isUserZero = profile?.is_user_zero ?? false;
  const isClaimedOwner = targetPerson.is_claimed && targetPerson.claimed_by_user_id === user.id;
  const isCreator = targetPerson.created_by_user_id === user.id;

  if (!isUserZero && !isClaimedOwner && (!isCreator || targetPerson.is_claimed)) {
    return {
      error: targetPerson.is_claimed
        ? "Esta ficha ya fue reclamada por un familiar y solo su titular puede modificarla."
        : "No tienes permisos para editar esta ficha familiar.",
    };
  }

  // Ejecutar actualización
  const { error: updateError } = await supabase
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

  if (updateError) {
    return { error: `Error al actualizar la ficha: ${updateError.message}` };
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

  if (!isUserZero && !isCreator) {
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
  forceRemove = false,
}: {
  personAId: string;
  personBId: string;
  forceRemove?: boolean;
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

  if (sharedChildren.length > 0 && !forceRemove) {
    // Si tienen hijos y no se forzó el borrado, marcamos como separados para conservar la filiación de los hijos
    await supabase
      .from("union_edges")
      .update({
        union_type: "separated",
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

  // Si no tienen hijos en común (o forceRemove = true), se elimina completamente el registro
  const { error: deleteError } = await supabase
    .from("union_edges")
    .delete()
    .eq("id", unionRecord.id);

  if (deleteError) {
    return { error: `Error disolviendo la pareja: ${deleteError.message}` };
  }

  revalidatePath("/");
  revalidatePath("/tree");

  return {
    success: true,
    hasSharedChildren: false,
    message: "Vínculo de pareja disuelto y eliminado exitosamente.",
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


