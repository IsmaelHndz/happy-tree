"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatFullName, type FamilyMemberItem, type FamilyRelationshipType } from "./types";
import type { Gender, UnionType } from "@/types/database.types";
import { inferKinship, getConnectedFamilyIds } from "./utils/kinship-inference";
import { isMissingColumnError, MISSING_NAME_COLUMNS_MESSAGE } from "./utils/db-errors";
import { planLink, LINK_RELATION_LABELS, type LinkPlan, type LinkRelation, type PlannerPerson } from "./utils/link-planner";
import crypto from "crypto";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * IDs de las parejas activas (no divorciadas ni separadas) de una persona.
 */
async function getActivePartnerIds(supabase: SupabaseServerClient, personId: string): Promise<string[]> {
  const { data } = await supabase
    .from("union_edges")
    .select("person_a_id, person_b_id")
    .or(`person_a_id.eq.${personId},person_b_id.eq.${personId}`)
    .eq("status", "confirmed")
    .not("union_type", "in", '("divorced","separated")');

  return Array.from(
    new Set((data ?? []).map((u) => (u.person_a_id === personId ? u.person_b_id : u.person_a_id)))
  );
}

/**
 * Componente conectado de la familia del usuario (mismas reglas de visibilidad que el árbol)
 * más los titulares de árboles compartidos aprobados.
 */
async function getUserFamilyScope(
  supabase: SupabaseServerClient,
  userId: string,
  userPersonId: string
): Promise<Set<string>> {
  const { data: allParentEdges } = await supabase
    .from("parent_child_edges")
    .select("parent_id, child_id");

  const { data: allUnions } = await supabase
    .from("union_edges")
    .select("person_a_id, person_b_id, union_type, status");

  const hasSharedChildren = (personA: string, personB: string): boolean => {
    const kidsA = allParentEdges?.filter((e) => e.parent_id === personA).map((e) => e.child_id) ?? [];
    const kidsB = allParentEdges?.filter((e) => e.parent_id === personB).map((e) => e.child_id) ?? [];
    return kidsA.some((id) => kidsB.includes(id));
  };

  const treeVisibleUnions = (allUnions || []).filter((u) => {
    if (u.status === "rejected") return false;
    if (u.union_type === "separated" || u.union_type === "divorced") {
      return hasSharedChildren(u.person_a_id, u.person_b_id);
    }
    return true;
  });

  const familySet = getConnectedFamilyIds(userPersonId, allParentEdges || [], treeVisibleUnions);

  try {
    const { data: shares } = await supabase
      .from("tree_access_shares")
      .select("granter_person_id")
      .eq("requester_user_id", userId)
      .eq("status", "approved");

    shares?.forEach((s) => familySet.add(s.granter_person_id));
  } catch {
    // Ignorar si no existe la tabla
  }

  return familySet;
}

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

  // Solo Usuario Cero (Administrador) puede consultar el directorio desde la perspectiva de otra persona
  let currentPersonId = profile.person_id;
  if (profile.is_user_zero && perspectivePersonId && perspectivePersonId.trim().length > 0) {
    currentPersonId = perspectivePersonId.trim();
  }

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
    if (isMissingColumnError(personsError)) console.error(MISSING_NAME_COLUMNS_MESSAGE);
    else console.error("getFamilyMembers: error consultando persons", personsError);
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

    const personChildren = allParentEdges?.filter((e) => e.parent_id === p.id) || [];
    const childConnections = personChildren.map((e) => {
      const childObj = personsMap.get(e.child_id);
      return {
        id: e.id,
        childId: e.child_id,
        childName: childObj ? `${childObj.firstName} ${childObj.lastName}` : "Descendiente",
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
      childConnections,
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

  // Familiar de Referencia (Anchor): permite al usuario construir ramas familiares
  const requestedAnchorId = (formData.get("anchor_person_id") as string)?.trim();
  const currentPersonId = requestedAnchorId || profile.person_id;

  // REGLA ESTRICTA DE PRIVACIDAD Y SEGURIDAD:
  // Si se solicita anclar a un perfil distinto al del usuario actual, verificar que no sea una ficha reclamada por otro usuario.
  if (requestedAnchorId && requestedAnchorId !== profile.person_id) {
    const { data: anchorPerson } = await supabase
      .from("persons")
      .select("id, is_claimed, first_name, last_name")
      .eq("id", requestedAnchorId)
      .maybeSingle();

    if (anchorPerson?.is_claimed) {
      return {
        error: `No tienes autorización para agregar familiares al perfil verificado de ${anchorPerson.first_name} ${anchorPerson.last_name}. Solo el propio titular puede agregar parientes respecto a su ficha personal.`,
      };
    }
  }

  const firstName = (formData.get("first_name") as string)?.trim();
  const middleName = (formData.get("middle_name") as string)?.trim() || null;
  const lastName = (formData.get("last_name") as string)?.trim();
  const maternalLastName = (formData.get("maternal_last_name") as string)?.trim() || null;
  const gender = (formData.get("gender") as Gender) || "unknown";
  const birthDate = (formData.get("birth_date") as string) || null;
  const isLiving = formData.get("is_living") === "true";
  const relationship = (formData.get("relationship") as FamilyRelationshipType) || "father";
  const siblingType = (formData.get("sibling_type") as "both" | "maternal" | "paternal") || "both";
  const createUnion = formData.get("create_union") === "true";
  // co_parent_id = "none" significa que el usuario indicó explícitamente que el otro progenitor no está registrado
  const coParentRaw = (formData.get("co_parent_id") as string)?.trim() || null;
  const coParentId = coParentRaw && coParentRaw !== "none" ? coParentRaw : null;
  const skipAutoCoParent = coParentRaw === "none";
  const inviteEmail = (formData.get("invite_email") as string)?.trim() || null;

  if (!firstName || !lastName) {
    return { error: "El primer nombre y el apellido paterno son obligatorios." };
  }

  // 1. Crear el nuevo nodo en persons (is_claimed = false)
  const { data: newPerson, error: personError } = await supabase
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

  if (personError || !newPerson) {
    // Nunca guardar en silencio sin el segundo nombre / apellido materno
    if (isMissingColumnError(personError)) {
      return { error: MISSING_NAME_COLUMNS_MESSAGE };
    }
    return { error: `Error creando ficha familiar: ${personError?.message}` };
  }

  const newPersonId = newPerson.id;

  // Si un vínculo falla (RLS o triggers de integridad), se elimina la ficha recién creada
  // para no dejar personas "fantasma" que existen en la BD pero nunca aparecen en el árbol.
  const rollback = async (message: string) => {
    await supabase.from("persons").delete().eq("id", newPersonId);
    return { error: message };
  };

  const linkParent = (parentId: string, childId: string) =>
    supabase.from("parent_child_edges").insert({
      parent_id: parentId,
      child_id: childId,
      relationship_type: "biological",
      status: "confirmed",
      created_by_user_id: user.id,
    });

  // 2. Crear las aristas (Edges) según la relación
  if (relationship === "father" || relationship === "mother") {
    // 2.1 Vincular el nuevo padre/madre con la persona de referencia (anchor)
    const { error: edgeErr } = await linkParent(newPersonId, currentPersonId);
    if (edgeErr) return rollback(`No se pudo vincular al progenitor: ${edgeErr.message}`);

    // 2.2 ÚNICAMENTE si el usuario confirmó explícitamente crear la unión matrimonial/pareja con el otro progenitor
    if (createUnion) {
      const { data: existingParents } = await supabase
        .from("parent_child_edges")
        .select("parent_id")
        .eq("child_id", currentPersonId);

      for (const ep of existingParents ?? []) {
        if (ep.parent_id === newPersonId) continue;

        const { data: existingUnion } = await supabase
          .from("union_edges")
          .select("id")
          .or(`and(person_a_id.eq.${ep.parent_id},person_b_id.eq.${newPersonId}),and(person_a_id.eq.${newPersonId},person_b_id.eq.${ep.parent_id})`)
          .maybeSingle();

        if (!existingUnion) {
          const { error: unionErr } = await supabase.from("union_edges").insert({
            person_a_id: ep.parent_id,
            person_b_id: newPersonId,
            union_type: "married",
            status: "confirmed",
            created_by_user_id: user.id,
          });
          if (unionErr) return rollback(`No se pudo registrar la unión entre los progenitores: ${unionErr.message}`);
        }
      }
    }
  } else if (relationship === "son" || relationship === "daughter") {
    // 2.3 Vincular el hijo con la persona de referencia
    const { error: edgeErr } = await linkParent(currentPersonId, newPersonId);
    if (edgeErr) return rollback(`No se pudo vincular al hijo/a: ${edgeErr.message}`);

    // 2.4 Segundo progenitor: el indicado explícitamente, o la ÚNICA pareja activa (nunca varias)
    let secondParentId = coParentId;
    if (!secondParentId && !skipAutoCoParent) {
      const activePartnerIds = await getActivePartnerIds(supabase, currentPersonId);
      if (activePartnerIds.length === 1) secondParentId = activePartnerIds[0];
    }

    if (secondParentId && secondParentId !== currentPersonId) {
      const { error: coErr } = await linkParent(secondParentId, newPersonId);
      if (coErr) return rollback(`No se pudo vincular al otro progenitor: ${coErr.message}`);
    }
  } else if (relationship === "spouse" || relationship === "partner") {
    const { error: unionErr } = await supabase.from("union_edges").insert({
      person_a_id: currentPersonId,
      person_b_id: newPersonId,
      union_type: relationship === "spouse" ? "married" : "partner",
      status: "confirmed",
      created_by_user_id: user.id,
    });

    if (unionErr) return rollback(`Error al vincular cónyuge/pareja: ${unionErr.message}`);
  } else if (relationship === "brother" || relationship === "sister") {
    // Buscar los padres de la persona ancla junto con su género para afinar el tipo de hermandad
    const { data: parentsData } = await supabase
      .from("parent_child_edges")
      .select("parent_id, persons:parent_id(id, gender)")
      .eq("child_id", currentPersonId);

    if (parentsData && parentsData.length > 0) {
      const parentGender = (pe: (typeof parentsData)[number]) => {
        const p = Array.isArray(pe.persons) ? pe.persons[0] : pe.persons;
        return (p as { gender?: string } | null)?.gender;
      };

      let targetParentsToLink: string[];
      if (siblingType === "maternal") {
        const motherEdge = parentsData.find((pe) => parentGender(pe) === "female") ?? parentsData[0];
        targetParentsToLink = [motherEdge.parent_id];
      } else if (siblingType === "paternal") {
        const fatherEdge = parentsData.find((pe) => parentGender(pe) === "male") ?? parentsData[parentsData.length - 1];
        targetParentsToLink = [fatherEdge.parent_id];
      } else {
        // "both" (hermano completo)
        targetParentsToLink = parentsData.map((pe) => pe.parent_id);
      }

      for (const parentId of targetParentsToLink) {
        const { error: edgeErr } = await linkParent(parentId, newPersonId);
        if (edgeErr) return rollback(`No se pudo vincular al hermano/a con su progenitor: ${edgeErr.message}`);
      }
    } else {
      // Si la persona de referencia no tiene padres registrados aún:
      // Creamos un nodo de progenitor provisional para que ambos hermanos queden conectados en el árbol
      const { data: anchorPerson } = await supabase
        .from("persons")
        .select("first_name, last_name")
        .eq("id", currentPersonId)
        .maybeSingle();

      const lineageLastName = anchorPerson?.last_name || lastName || "Linaje Familiar";
      const { data: sharedParent, error: sharedErr } = await supabase
        .from("persons")
        .insert({
          first_name: "Progenitor/a",
          last_name: lineageLastName,
          gender: "unknown",
          is_living: true,
          is_claimed: false,
          bio: `Nodo provisional creado para conectar a ${anchorPerson?.first_name ?? "familiar"} con su hermano/a ${firstName}. Edítalo para registrar el nombre real del padre o la madre.`,
          created_by_user_id: user.id,
        })
        .select("id")
        .single();

      if (sharedErr || !sharedParent) {
        return rollback(`No se pudo crear el progenitor provisional: ${sharedErr?.message}`);
      }

      const { error: edgesErr } = await supabase.from("parent_child_edges").insert([
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

      if (edgesErr) {
        await supabase.from("persons").delete().eq("id", sharedParent.id);
        return rollback(`No se pudo conectar a los hermanos: ${edgesErr.message}`);
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
    // Nunca guardar en silencio sin el segundo nombre / apellido materno
    if (isMissingColumnError(updateError)) {
      return { error: MISSING_NAME_COLUMNS_MESSAGE };
    }
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

export interface AnchorRelative {
  id: string;
  name: string;
  gender: Gender;
  note?: string;
  kind?: "partner" | "ex" | "coparent";
}

export interface AnchorContext {
  anchorGender: Gender;
  parents: AnchorRelative[];
  coParents: AnchorRelative[];
  defaultCoParentId: string | null;
}

/**
 * Contexto del familiar ancla para el modal de registro:
 * - parents: sus progenitores registrados (para hermanos y para el segundo padre/madre).
 * - coParents: parejas actuales, exparejas y otros progenitores de sus hijos (para elegir con quién tuvo un hijo).
 * - defaultCoParentId: la única pareja activa, si existe exactamente una.
 */
export async function getAnchorContextAction(anchorId: string): Promise<AnchorContext & { error?: string }> {
  const empty: AnchorContext = {
    anchorGender: "unknown",
    parents: [],
    coParents: [],
    defaultCoParentId: null,
  };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !anchorId) return { ...empty, error: "Debes estar autenticado." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("person_id, is_user_zero")
    .eq("id", user.id)
    .single();

  if (!profile?.is_user_zero) {
    if (!profile?.person_id) return empty;
    const familySet = await getUserFamilyScope(supabase, user.id, profile.person_id);
    if (!familySet.has(anchorId)) return empty;
  }

  const [{ data: parentEdges }, { data: childEdges }, { data: unions }] = await Promise.all([
    supabase.from("parent_child_edges").select("parent_id").eq("child_id", anchorId),
    supabase.from("parent_child_edges").select("child_id").eq("parent_id", anchorId),
    supabase
      .from("union_edges")
      .select("person_a_id, person_b_id, union_type, status")
      .or(`person_a_id.eq.${anchorId},person_b_id.eq.${anchorId}`)
      .neq("status", "rejected"),
  ]);

  const parentIds = Array.from(new Set((parentEdges ?? []).map((e) => e.parent_id)));
  const anchorChildIds = new Set((childEdges ?? []).map((e) => e.child_id));

  // Otros progenitores de los hijos ya registrados (co-progenitores aunque no exista unión)
  let otherParentIds: string[] = [];
  if (anchorChildIds.size > 0) {
    const { data: coEdges } = await supabase
      .from("parent_child_edges")
      .select("parent_id")
      .in("child_id", Array.from(anchorChildIds))
      .neq("parent_id", anchorId);
    otherParentIds = (coEdges ?? []).map((e) => e.parent_id);
  }

  const coParentKinds = new Map<string, "partner" | "ex" | "coparent">();
  (unions ?? []).forEach((u) => {
    const partnerId = u.person_a_id === anchorId ? u.person_b_id : u.person_a_id;
    const isEx = u.union_type === "divorced" || u.union_type === "separated";
    coParentKinds.set(partnerId, isEx ? "ex" : "partner");
  });
  otherParentIds.forEach((id) => {
    if (!coParentKinds.has(id)) coParentKinds.set(id, "coparent");
  });
  const coParentIds = Array.from(coParentKinds.keys());

  const allIds = Array.from(
    new Set([
      anchorId,
      ...parentIds,
      ...coParentIds,
    ])
  );

  // select("*") para no fallar si las columnas de segundo nombre aún no existen
  const { data: persons } = await supabase.from("persons").select("*").in("id", allIds);
  const NOTES = { partner: "Pareja actual", ex: "Expareja", coparent: "Otro progenitor de sus hijos" } as const;
  const toRelative = (id: string, kind?: "partner" | "ex" | "coparent"): AnchorRelative | null => {
    const p = persons?.find((x) => x.id === id);
    if (!p) return null;
    return {
      id,
      name: formatFullName({
        firstName: p.first_name,
        middleName: p.middle_name,
        lastName: p.last_name,
        maternalLastName: p.maternal_last_name,
      }),
      gender: p.gender as Gender,
      note: kind ? NOTES[kind] : undefined,
      kind,
    };
  };
  const isRelative = (r: AnchorRelative | null): r is AnchorRelative => r !== null;

  const activePartnerIds = coParentIds.filter((id) => coParentKinds.get(id) === "partner");
  const anchorPerson = persons?.find((p) => p.id === anchorId);

  return {
    anchorGender: (anchorPerson?.gender as Gender) ?? "unknown",
    parents: parentIds.map((id) => toRelative(id)).filter(isRelative),
    coParents: coParentIds.map((id) => toRelative(id, coParentKinds.get(id))).filter(isRelative),
    defaultCoParentId: activePartnerIds.length === 1 ? activePartnerIds[0] : null,
  };
}

/**
 * Carga personas, aristas y uniones para planificar un vínculo manual entre dos personas
 * (respetando el alcance familiar del usuario).
 */
async function loadLinkPlanInput(
  supabase: SupabaseServerClient,
  personAId: string,
  personBId: string,
  relation: LinkRelation
): Promise<{ plan: LinkPlan } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes estar autenticado para realizar esta acción." };
  if (!personAId || !personBId || !LINK_RELATION_LABELS[relation]) {
    return { error: "Elige dos personas y el tipo de relación." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_user_zero, person_id")
    .eq("id", user.id)
    .single();

  if (!profile?.is_user_zero) {
    if (!profile?.person_id) return { error: "Tu cuenta no está vinculada a una ficha familiar." };
    const familySet = await getUserFamilyScope(supabase, user.id, profile.person_id);
    if (!familySet.has(personAId) || !familySet.has(personBId)) {
      return { error: "Solo puedes vincular personas de tu propia familia." };
    }
  }

  const [{ data: parentEdges }, { data: unions }] = await Promise.all([
    supabase.from("parent_child_edges").select("id, parent_id, child_id, relationship_type"),
    supabase.from("union_edges").select("id, person_a_id, person_b_id, union_type, status"),
  ]);

  const involvedIds = new Set<string>([personAId, personBId]);
  (parentEdges ?? []).forEach((e) => {
    if (involvedIds.has(e.child_id) || involvedIds.has(e.parent_id)) {
      involvedIds.add(e.parent_id);
      involvedIds.add(e.child_id);
    }
  });

  // select("*") para no fallar si las columnas de segundo nombre aún no existen
  const { data: people } = await supabase.from("persons").select("*").in("id", Array.from(involvedIds));
  const persons = new Map<string, PlannerPerson>(
    (people ?? []).map((p) => [
      p.id,
      {
        id: p.id,
        name: formatFullName({
          firstName: p.first_name,
          middleName: p.middle_name,
          lastName: p.last_name,
          maternalLastName: p.maternal_last_name,
        }),
        gender: p.gender,
        lockedByOther: Boolean(p.is_claimed && p.claimed_by_user_id !== user.id),
      },
    ])
  );

  return {
    plan: planLink({
      personAId,
      personBId,
      relation,
      persons,
      parentEdges: (parentEdges ?? []).filter((e) => e.relationship_type !== "step"),
      unions: unions ?? [],
    }),
  };
}

/**
 * Server Action: Vista previa de un vínculo manual "A es ___ de B" (no modifica nada).
 */
export async function previewLinkAction(input: {
  personAId: string;
  personBId: string;
  relation: LinkRelation;
}): Promise<{ plan?: LinkPlan; error?: string }> {
  const supabase = await createClient();
  return loadLinkPlanInput(supabase, input.personAId, input.personBId, input.relation);
}

/**
 * Server Action: Aplicar un vínculo manual ya revisado por el usuario.
 * Se vuelve a validar en el servidor; `removeParentKeys` son las opciones de "quitar progenitor"
 * que el usuario marcó explícitamente en la vista previa.
 */
export async function linkPersonsAction(input: {
  personAId: string;
  personBId: string;
  relation: LinkRelation;
  removeParentKeys?: string[];
}): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient();
  const result = await loadLinkPlanInput(supabase, input.personAId, input.personBId, input.relation);
  if ("error" in result) return { error: result.error };

  const { plan } = result;
  if (plan.errors.length > 0) return { error: plan.errors.join(" ") };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes estar autenticado para realizar esta acción." };

  for (const { parentId, childId } of plan.addParentEdges) {
    const { error } = await supabase.from("parent_child_edges").insert({
      parent_id: parentId,
      child_id: childId,
      relationship_type: "biological",
      status: "confirmed",
      created_by_user_id: user.id,
    });
    if (error) return { error: `No se pudo crear el vínculo: ${error.message}` };
  }

  const selected = new Set(input.removeParentKeys ?? []);
  for (const option of plan.replaceOptions.filter((o) => selected.has(o.key))) {
    const { error } = await supabase
      .from("parent_child_edges")
      .delete()
      .eq("parent_id", option.parentId)
      .eq("child_id", option.childId);
    if (error) return { error: `No se pudo quitar el progenitor anterior: ${error.message}` };
  }

  if (plan.union) {
    const { personAId, personBId, existingUnionId } = plan.union;
    const unionType = plan.union.unionType as UnionType;
    const { error } = existingUnionId
      ? await supabase.from("union_edges").update({ union_type: unionType }).eq("id", existingUnionId)
      : await supabase.from("union_edges").insert({
          person_a_id: personAId,
          person_b_id: personBId,
          union_type: unionType,
          status: "confirmed",
          created_by_user_id: user.id,
        });
    if (error) return { error: `No se pudo registrar la unión: ${error.message}` };
  }

  revalidatePath("/");
  revalidatePath("/tree");

  return { success: true };
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
  middleName?: string | null;
  lastName: string;
  maternalLastName?: string | null;
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("person_id, is_user_zero")
    .eq("id", user.id)
    .single();

  const isUserZero = profile?.is_user_zero ?? false;
  const userPersonId = profile?.person_id;

  let allowedPersonIds: string[] | null = null;
  if (!isUserZero && userPersonId) {
    const familySet = await getUserFamilyScope(supabase, user.id, userPersonId);
    allowedPersonIds = Array.from(familySet);
    if (allowedPersonIds.length === 0) {
      return { results: [] };
    }
  }

  // 1. Verificar si coincide con formato UUID (ej. al compartir o pegar el ID)
  const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);

  if (isFullUuid) {
    if (allowedPersonIds && !allowedPersonIds.includes(query)) {
      return { results: [] };
    }

    const { data: personById, error: idError } = await supabase
      .from("persons")
      .select("*")
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
            middleName: personById.middle_name,
            lastName: personById.last_name,
            maternalLastName: personById.maternal_last_name,
            gender: personById.gender as Gender,
            birthDate: personById.birth_date,
            isClaimed: personById.is_claimed,
            matchType: "id",
          },
        ],
      };
    }
  }

  // 2. Búsqueda por texto: cada palabra debe coincidir con algún nombre o apellido
  //    (así "Jorge Andrés" encuentra a quien tiene "Andrés" como segundo nombre)
  const terms = query
    .split(/\s+/)
    .map((t) => t.replace(/[,()%*]/g, ""))
    .filter(Boolean)
    .slice(0, 4);
  if (terms.length === 0) return { results: [] };

  let queryBuilder = supabase
    .from("persons")
    .select("id, first_name, middle_name, last_name, maternal_last_name, gender, birth_date, is_claimed")
    .limit(10);

  if (allowedPersonIds) {
    queryBuilder = queryBuilder.in("id", allowedPersonIds);
  }

  for (const term of terms) {
    queryBuilder = queryBuilder.or(
      `first_name.ilike.%${term}%,middle_name.ilike.%${term}%,last_name.ilike.%${term}%,maternal_last_name.ilike.%${term}%`
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
      middleName: p.middle_name,
      lastName: p.last_name,
      maternalLastName: p.maternal_last_name,
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
 * Server Action: Desvincular una relación vertical específica entre un progenitor y un hijo.
 */
export async function unlinkParentChildAction({
  parentId,
  childId,
}: {
  parentId: string;
  childId: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes estar autenticado para realizar esta acción." };
  }

  const { error } = await supabase
    .from("parent_child_edges")
    .delete()
    .eq("parent_id", parentId)
    .eq("child_id", childId);

  if (error) {
    return { error: `Error desvinculando filiación: ${error.message}` };
  }

  revalidatePath("/");
  revalidatePath("/tree");

  return { success: true, message: "Filiación desvinculada exitosamente." };
}

/**
 * Server Action: Reasignar un familiar que fue registrado erróneamente como progenitor/padre para convertirlo en hermano/a de la familia.
 */
export async function convertParentToSiblingAction({
  personId,
  anchorPersonId,
  siblingType = "both",
}: {
  personId: string;
  anchorPersonId: string;
  siblingType?: "both" | "maternal" | "paternal";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes estar autenticado para realizar esta acción." };
  }

  // 1. Consultar los progenitores reales de la persona ancla (anchorPersonId), excluyendo a personId
  const { data: anchorParents } = await supabase
    .from("parent_child_edges")
    .select("parent_id, persons:parent_id(id, gender)")
    .eq("child_id", anchorPersonId)
    .neq("parent_id", personId);

  const parentIds = (anchorParents || []).map((ap) => ap.parent_id);

  // 2. Consultar los hermanos de la persona ancla para desvincular a personId de esa rama únicamente
  const { data: siblingEdges } = parentIds.length > 0
    ? await supabase
        .from("parent_child_edges")
        .select("child_id")
        .in("parent_id", parentIds)
    : { data: [] };

  const conflictedChildIds = Array.from(
    new Set([anchorPersonId, ...(siblingEdges?.map((s) => s.child_id) ?? [])])
  );

  // 3. Desvincular a personId ÚNICAMENTE de la persona ancla y de sus hermanos
  // (NUNCA borrar a ciegas los hijos legítimos propios que personId pudiera tener)
  for (const cId of conflictedChildIds) {
    await supabase
      .from("parent_child_edges")
      .delete()
      .eq("parent_id", personId)
      .eq("child_id", cId);
  }

  // 4. Eliminar cualquier unión conyugal espuria entre personId y los progenitores del ancla,
  // así como entre personId y el ancla o sus hermanos
  const allConflictedPartnerIds = Array.from(
    new Set([...parentIds, ...conflictedChildIds])
  );

  for (const conflictId of allConflictedPartnerIds) {
    await supabase
      .from("union_edges")
      .delete()
      .or(`and(person_a_id.eq.${personId},person_b_id.eq.${conflictId}),and(person_a_id.eq.${conflictId},person_b_id.eq.${personId})`);
  }

  if (anchorParents && anchorParents.length > 0) {

    // 4. Vincular a personId como HIJO de los progenitores de anchorPersonId según siblingType
    let targetParentIds: string[] = [];
    if (siblingType === "maternal") {
      const mother = anchorParents.find((ap) => {
        const p = Array.isArray(ap.persons) ? ap.persons[0] : ap.persons;
        return (p as { gender?: string } | null)?.gender === "female";
      });
      if (mother) targetParentIds.push(mother.parent_id);
      else targetParentIds.push(anchorParents[0].parent_id);
    } else if (siblingType === "paternal") {
      const father = anchorParents.find((ap) => {
        const p = Array.isArray(ap.persons) ? ap.persons[0] : ap.persons;
        return (p as { gender?: string } | null)?.gender === "male";
      });
      if (father) targetParentIds.push(father.parent_id);
      else targetParentIds.push(anchorParents[anchorParents.length - 1].parent_id);
    } else {
      // "both": enlazar a todos los progenitores de anchorPersonId
      targetParentIds = anchorParents.map((ap) => ap.parent_id);
    }

    for (const pId of targetParentIds) {
      const { data: existingEdge } = await supabase
        .from("parent_child_edges")
        .select("id")
        .eq("parent_id", pId)
        .eq("child_id", personId)
        .maybeSingle();

      if (!existingEdge) {
        await supabase.from("parent_child_edges").insert({
          parent_id: pId,
          child_id: personId,
          relationship_type: "biological",
          status: "confirmed",
          created_by_user_id: user.id,
        });
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/tree");

  return { success: true, message: "Rol reasignado exitosamente como hermano/a." };
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
