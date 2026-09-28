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
    .select("person_b_id, union_type")
    .eq("person_a_id", currentPersonId);

  const { data: unionsAsB } = await supabase
    .from("union_edges")
    .select("person_a_id, union_type")
    .eq("person_b_id", currentPersonId);

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
    .select("id, first_name, last_name, gender, birth_date, is_living, is_claimed")
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

    if (parentIds.includes(p.id)) {
      relationshipLabel = p.gender === "female" ? "Madre" : p.gender === "male" ? "Padre" : "Progenitor";
      relationshipCategory = "parent";
    } else if (childIds.includes(p.id)) {
      relationshipLabel = p.gender === "female" ? "Hija" : p.gender === "male" ? "Hijo" : "Descendiente";
      relationshipCategory = "child";
    } else if (spouseIds.includes(p.id)) {
      relationshipLabel = "Cónyuge / Pareja";
      relationshipCategory = "spouse";
    } else if (siblingIds.includes(p.id)) {
      relationshipLabel = p.gender === "female" ? "Hermana" : p.gender === "male" ? "Hermano" : "Hermano/a";
      relationshipCategory = "sibling";
    }

    const inviteToken = tokens?.find((t) => t.person_id === p.id);

    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      gender: p.gender,
      birthDate: p.birth_date,
      isLiving: p.is_living,
      isClaimed: p.is_claimed,
      relationshipLabel,
      relationshipCategory,
      invitationStatus: inviteToken?.status ?? null,
      invitationToken: inviteToken?.token ?? null,
      invitationExpiresAt: inviteToken?.expires_at ?? null,
      invitedEmail: inviteToken?.invited_email ?? null,
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

  // Obtener person_id del usuario
  const { data: profile } = await supabase
    .from("profiles")
    .select("person_id")
    .eq("id", user.id)
    .single();

  if (!profile?.person_id) {
    return { error: "No tienes una ficha genealógica activa." };
  }

  const currentPersonId = profile.person_id;

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

  return {
    success: true,
    personId: newPersonId,
    invitationToken: generatedToken,
  };
}
