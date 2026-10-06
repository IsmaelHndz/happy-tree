"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  FriendItem,
  TreePermissionTier,
  TreeAccessStatus,
  TreeAccessShareItem,
  UserSearchResultItem,
} from "./types";
import { formatFullName } from "./types";
import type { Gender } from "@/types/database.types";
import { otherParty, type SocialConnectionKind } from "./utils/social-connections";
import {
  isMissingColumnError,
  isMissingTableError,
  MISSING_NAME_COLUMNS_MESSAGE,
  MISSING_SOCIAL_TABLE_MESSAGE,
  PROFILE_TIER_MIGRATION,
} from "./utils/db-errors";

interface ServerActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Busca usuarios registrados en el sistema (por nombre o correo) para solicitar acceso a su árbol.
 */
export async function searchUsersForSharingAction(
  searchTerm: string
): Promise<UserSearchResultItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  // 1. Intentar llamar al RPC de búsqueda optimizado
  const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
    "search_users_for_tree_access",
    { p_search_term: searchTerm.trim() }
  );

  if (!rpcError && rpcData) {
    return (rpcData as any[]).map((r) => ({
      userId: r.user_id,
      personId: r.person_id,
      fullName: r.full_name || "Usuario del Sistema",
      email: r.email || "",
      alreadyRequested: Boolean(r.already_requested),
      existingStatus: (r.existing_status as TreeAccessStatus) || null,
      existingTier: (r.existing_tier as TreePermissionTier) || null,
    }));
  }

  // 2. Fallback de consulta directa por si la función RPC aún no se aplica en Supabase
  const { data: profiles } = await supabase
    .from("profiles")
    .select(`
      id,
      person_id,
      persons:person_id (
        id,
        first_name,
        middle_name,
        last_name,
        maternal_last_name
      )
    `)
    .neq("id", user.id)
    .not("person_id", "is", null)
    .limit(20);

  if (!profiles) return [];

  // Consultar solicitudes ya existentes del usuario actual
  const { data: existingShares } = await supabase
    .from("tree_access_shares")
    .select("granter_user_id, status, tier")
    .eq("requester_user_id", user.id);

  const existingMap = new Map(
    (existingShares || []).map((s) => [s.granter_user_id, s])
  );

  const cleanTerm = searchTerm.toLowerCase().trim();
  const results: UserSearchResultItem[] = [];

  for (const pr of profiles) {
    const p = pr.persons as any;
    if (!p) continue;
    const fullName = formatFullName({
      firstName: p.first_name,
      middleName: p.middle_name,
      lastName: p.last_name,
      maternalLastName: p.maternal_last_name,
    });

    if (cleanTerm && !fullName.toLowerCase().includes(cleanTerm)) {
      continue;
    }

    const existing = existingMap.get(pr.id);

    results.push({
      userId: pr.id,
      personId: pr.person_id,
      fullName,
      email: "Usuario registrado",
      alreadyRequested: Boolean(existing),
      existingStatus: (existing?.status as TreeAccessStatus) || null,
      existingTier: (existing?.tier as TreePermissionTier) || null,
    });
  }

  return results;
}

/**
 * Envía una solicitud para ver el árbol de otra persona.
 */
export async function requestTreeAccessAction(
  targetUserId: string,
  message?: string
): Promise<ServerActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Debes iniciar sesión." };
  }

  if (user.id === targetUserId) {
    return {
      success: false,
      error: "No puedes solicitar acceso a tu propio árbol.",
    };
  }

  // 1. Intentar llamar al RPC
  const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
    "request_tree_access",
    {
      p_target_user_id: targetUserId,
      p_message: message || null,
    }
  );

  if (!rpcError && rpcData) {
    const result = rpcData as {
      success: boolean;
      message?: string;
      error?: string;
    };
    if (result.success) {
      revalidatePath("/");
      revalidatePath("/tree");
      return { success: true, message: result.message };
    } else {
      return { success: false, error: result.error };
    }
  }

  // 2. Fallback directo con inserción en la tabla
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("person_id")
    .eq("id", user.id)
    .single();

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("person_id")
    .eq("id", targetUserId)
    .single();

  if (!callerProfile?.person_id || !targetProfile?.person_id) {
    return {
      success: false,
      error: "Ambos usuarios deben tener una ficha personal activa en el sistema.",
    };
  }

  const { data: existing } = await supabase
    .from("tree_access_shares")
    .select("id, status")
    .eq("granter_user_id", targetUserId)
    .eq("requester_user_id", user.id)
    .maybeSingle();

  if (existing) {
    if (existing.status === "approved") {
      return {
        success: true,
        message: "Ya tienes acceso autorizado a este árbol.",
      };
    }

    const { error: updateError } = await supabase
      .from("tree_access_shares")
      .update({
        status: "pending",
        request_message: message || null,
        requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateError) {
      return {
        success: false,
        error: "Error al actualizar la solicitud: " + updateError.message,
      };
    }
  } else {
    const { error: insertError } = await supabase
      .from("tree_access_shares")
      .insert({
        granter_user_id: targetUserId,
        granter_person_id: targetProfile.person_id,
        requester_user_id: user.id,
        requester_person_id: callerProfile.person_id,
        tier: "basic",
        status: "pending",
        request_message: message || null,
      });

    if (insertError) {
      return {
        success: false,
        error: "Error al enviar la solicitud: " + insertError.message,
      };
    }
  }

  revalidatePath("/");
  revalidatePath("/tree");
  return { success: true, message: "Solicitud enviada correctamente." };
}

/**
 * Responde a una solicitud de acceso (Aprobar con nivel, Rechazar, Revocar o Cambiar Nivel)
 */
export async function respondTreeAccessAction(
  shareId: string,
  action: "approved" | "rejected" | "revoked" | "update_tier",
  tier: TreePermissionTier = "basic"
): Promise<ServerActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Debes iniciar sesión." };
  }

  // 1. Intentar RPC
  const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
    "respond_tree_access",
    {
      p_share_id: shareId,
      p_action: action,
      p_tier: tier,
    }
  );

  if (!rpcError && rpcData) {
    const res = rpcData as { success: boolean; message?: string; error?: string };
    if (res.success) {
      revalidatePath("/");
      revalidatePath("/tree");
      return { success: true, message: res.message };
    } else {
      return { success: false, error: res.error };
    }
  }

  // 2. Fallback directo
  const updatePayload: {
    status?: TreeAccessStatus;
    tier?: TreePermissionTier;
    responded_at?: string;
    updated_at: string;
  } = {
    updated_at: new Date().toISOString(),
  };

  if (action === "approved") {
    updatePayload.status = "approved";
    updatePayload.tier = tier;
    updatePayload.responded_at = new Date().toISOString();
  } else if (action === "rejected") {
    updatePayload.status = "rejected";
    updatePayload.responded_at = new Date().toISOString();
  } else if (action === "revoked") {
    updatePayload.status = "revoked";
    updatePayload.responded_at = new Date().toISOString();
  } else if (action === "update_tier") {
    updatePayload.tier = tier;
  }

  const { error } = await supabase
    .from("tree_access_shares")
    .update(updatePayload)
    .eq("id", shareId)
    .eq("granter_user_id", user.id);

  if (error) {
    return {
      success: false,
      error: "Error al procesar la solicitud: " + error.message,
    };
  }

  revalidatePath("/");
  revalidatePath("/tree");
  return { success: true, message: "Acción completada exitosamente." };
}

/**
 * Consulta todas las solicitudes y accesos asociados al usuario actual:
 * - Solicitudes recibidas (incomingPending)
 * - Amigos con acceso concedido a mi árbol (activeFriends)
 * - Árboles a los que tengo acceso de amigos (treesSharedWithMe)
 * - Solicitudes enviadas pendientes (outgoingPending)
 */
export async function getTreeAccessSharesAction(): Promise<{
  incomingPending: TreeAccessShareItem[];
  activeFriends: TreeAccessShareItem[];
  treesSharedWithMe: TreeAccessShareItem[];
  outgoingPending: TreeAccessShareItem[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      incomingPending: [],
      activeFriends: [],
      treesSharedWithMe: [],
      outgoingPending: [],
    };
  }

  // Consultar todas las filas donde participo como granter o requester
  const { data: shares, error } = await supabase
    .from("tree_access_shares")
    .select(`
      id,
      granter_user_id,
      granter_person_id,
      requester_user_id,
      requester_person_id,
      tier,
      status,
      request_message,
      requested_at,
      responded_at
    `)
    .or(`granter_user_id.eq.${user.id},requester_user_id.eq.${user.id}`);

  if (error || !shares) {
    return {
      incomingPending: [],
      activeFriends: [],
      treesSharedWithMe: [],
      outgoingPending: [],
    };
  }

  // Extraer todos los person_ids involucrados para obtener sus nombres
  const personIds = Array.from(
    new Set(
      shares
        .flatMap((s) => [s.granter_person_id, s.requester_person_id])
        .filter((id): id is string => Boolean(id))
    )
  );

  const personsMap = new Map<string, string>();
  if (personIds.length > 0) {
    const { data: persons } = await supabase
      .from("persons")
      .select("id, first_name, middle_name, last_name, maternal_last_name")
      .in("id", personIds);

    if (persons) {
      persons.forEach((p) => {
        personsMap.set(
          p.id,
          formatFullName({
            firstName: p.first_name,
            middleName: p.middle_name,
            lastName: p.last_name,
            maternalLastName: p.maternal_last_name,
          })
        );
      });
    }
  }

  const items: TreeAccessShareItem[] = shares.map((s) => {
    const isOutgoing = s.requester_user_id === user.id;
    return {
      id: s.id,
      granterUserId: s.granter_user_id,
      granterPersonId: s.granter_person_id,
      granterName: personsMap.get(s.granter_person_id) || "Titular del Árbol",
      requesterUserId: s.requester_user_id,
      requesterPersonId: s.requester_person_id,
      requesterName:
        (s.requester_person_id ? personsMap.get(s.requester_person_id) : null) ||
        "Usuario Solicitante",
      tier: s.tier,
      status: s.status,
      requestMessage: s.request_message,
      requestedAt: s.requested_at,
      respondedAt: s.responded_at,
      isOutgoing,
    };
  });

  return {
    incomingPending: items.filter(
      (i) => !i.isOutgoing && i.status === "pending"
    ),
    activeFriends: items.filter(
      (i) => !i.isOutgoing && i.status === "approved"
    ),
    treesSharedWithMe: items.filter(
      (i) => i.isOutgoing && i.status === "approved"
    ),
    outgoingPending: items.filter(
      (i) => i.isOutgoing && i.status === "pending"
    ),
  };
}

/**
 * Elimina o cancela una solicitud de acceso
 */
export async function deleteOrCancelTreeAccessAction(
  shareId: string
): Promise<ServerActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Debes iniciar sesión." };
  }

  const { error } = await supabase
    .from("tree_access_shares")
    .delete()
    .eq("id", shareId)
    .or(`granter_user_id.eq.${user.id},requester_user_id.eq.${user.id}`);

  if (error) {
    return {
      success: false,
      error: "Error al eliminar la solicitud: " + error.message,
    };
  }

  revalidatePath("/");
  revalidatePath("/tree");
  return { success: true, message: "Solicitud eliminada." };
}

// =============================================================================
// AMIGOS Y NOVIAZGOS (social_connections)
// Vínculos sociales separados del árbol: no generan parentesco ni unen familias.
// =============================================================================

async function getMyPersonId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión." } as const;

  const { data: profile } = await supabase
    .from("profiles")
    .select("person_id")
    .eq("id", user.id)
    .single();
  if (!profile?.person_id) return { error: "Tu cuenta no está vinculada a una ficha personal." } as const;

  return { userId: user.id, personId: profile.person_id } as const;
}

/**
 * Lista mis amigos y noviazgos con el estado de su cuenta, su invitación
 * y el nivel de árbol que nos compartimos en cada dirección.
 */
export async function getFriendsAction(): Promise<{ friends: FriendItem[]; inRelationship: boolean; error?: string }> {
  const supabase = await createClient();
  const me = await getMyPersonId(supabase);
  if ("error" in me) return { friends: [], inRelationship: false };

  const involvesMe = `person_a_id.eq.${me.personId},person_b_id.eq.${me.personId}`;
  type ConnectionRow = {
    id: string;
    person_a_id: string;
    person_b_id: string;
    kind: SocialConnectionKind;
    created_at: string;
    proposed_union_type?: "partner" | "married" | null;
    proposed_by_user_id?: string | null;
  };
  let rows: ConnectionRow[] | null = null;
  const first = await supabase
    .from("social_connections")
    .select("id, person_a_id, person_b_id, kind, created_at, proposed_union_type, proposed_by_user_id")
    .or(involvesMe);
  rows = first.data as ConnectionRow[] | null;
  let error = first.error;

  // Si la migración de propuestas aún no se ejecuta, se listan los amigos sin propuestas
  if (error && isMissingColumnError(error)) {
    const fallback = await supabase
      .from("social_connections")
      .select("id, person_a_id, person_b_id, kind, created_at")
      .or(involvesMe);
    rows = fallback.data as ConnectionRow[] | null;
    error = fallback.error;
  }

  if (error) {
    return {
      friends: [],
      inRelationship: false,
      error: isMissingTableError(error) ? MISSING_SOCIAL_TABLE_MESSAGE : error.message,
    };
  }
  if (!rows || rows.length === 0) return { friends: [], inRelationship: false };

  const otherIds = Array.from(
    new Set(rows.map((r) => otherParty(r, me.personId)).filter((id): id is string => Boolean(id)))
  );

  // select("*") para no fallar si las columnas de segundo nombre aún no existen
  const [{ data: people }, { data: tokens }, { data: shares }, { data: activeUnions }] = await Promise.all([
    supabase.from("persons").select("*").in("id", otherIds),
    supabase
      .from("invitation_tokens")
      .select("token, person_id, invited_email, expires_at")
      .in("person_id", otherIds)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("tree_access_shares")
      .select("granter_user_id, requester_user_id, tier, status")
      .or(`granter_user_id.eq.${me.userId},requester_user_id.eq.${me.userId}`)
      .eq("status", "approved"),
    // Parejas vigentes en el árbol (no separados ni divorciados)
    supabase
      .from("union_edges")
      .select("id")
      .or(`person_a_id.eq.${me.personId},person_b_id.eq.${me.personId}`)
      .neq("status", "rejected")
      .not("union_type", "in", '("divorced","separated")')
      .limit(1),
  ]);

  const friends: FriendItem[] = [];
  for (const row of rows) {
    const otherId = otherParty(row, me.personId);
    const p = people?.find((x) => x.id === otherId);
    if (!p) continue;

    const friendUserId = p.is_claimed ? p.claimed_by_user_id ?? null : null;
    const token = tokens?.find((t) => t.person_id === p.id);
    const granted = friendUserId
      ? shares?.find((s) => s.granter_user_id === me.userId && s.requester_user_id === friendUserId)
      : undefined;
    const received = friendUserId
      ? shares?.find((s) => s.granter_user_id === friendUserId && s.requester_user_id === me.userId)
      : undefined;

    friends.push({
      connectionId: row.id,
      kind: row.kind as SocialConnectionKind,
      personId: p.id,
      firstName: p.first_name,
      middleName: p.middle_name,
      lastName: p.last_name,
      maternalLastName: p.maternal_last_name,
      maidenName: p.maiden_name,
      gender: p.gender as Gender,
      birthDate: p.birth_date,
      deathDate: p.death_date,
      isLiving: p.is_living,
      birthPlace: p.birth_place,
      bio: p.bio,
      isClaimed: Boolean(p.is_claimed),
      friendUserId,
      invitationToken: token?.token ?? null,
      invitedEmail: token?.invited_email?.trim() || null,
      grantedTier: (granted?.tier as TreePermissionTier) ?? null,
      receivedTier: (received?.tier as TreePermissionTier) ?? null,
      proposedUnionType: row.proposed_union_type ?? null,
      proposedByMe: Boolean(row.proposed_union_type) && row.proposed_by_user_id === me.userId,
      createdByMe: p.created_by_user_id === me.userId,
      since: row.created_at,
    });
  }

  // Noviazgo primero, luego por nombre
  return {
    // En pareja: noviazgo registrado o unión vigente. La UI oculta la opción de empezar a salir con otros amigos.
    inRelationship: rows.some((r) => r.kind === "dating") || (activeUnions?.length ?? 0) > 0,
    friends: friends.sort(
      (a, b) => Number(b.kind === "dating") - Number(a.kind === "dating") || a.firstName.localeCompare(b.firstName)
    ),
  };
}

/**
 * Registra un amigo o noviazgo. Si la persona ya tiene cuenta se vincula su ficha
 * (`existingPersonId`); si no, se crea una ficha sin reclamar que luego se invita.
 */
export async function createFriendAction(input: {
  kind: SocialConnectionKind;
  existingPersonId?: string | null;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  maternalLastName?: string | null;
  gender?: Gender;
}): Promise<ServerActionResult & { personId?: string }> {
  const supabase = await createClient();
  const me = await getMyPersonId(supabase);
  if ("error" in me) return { success: false, error: me.error };

  let friendPersonId = input.existingPersonId?.trim() || null;
  let createdNow = false;

  if (friendPersonId) {
    if (friendPersonId === me.personId) {
      return { success: false, error: "No puedes agregarte a ti mismo como amigo." };
    }
    const { data: existing, error: lookupError } = await supabase
      .from("social_connections")
      .select("id")
      .or(
        `and(person_a_id.eq.${me.personId},person_b_id.eq.${friendPersonId}),and(person_a_id.eq.${friendPersonId},person_b_id.eq.${me.personId})`
      )
      .maybeSingle();
    if (lookupError) {
      return {
        success: false,
        error: isMissingTableError(lookupError) ? MISSING_SOCIAL_TABLE_MESSAGE : lookupError.message,
      };
    }
    if (existing) return { success: false, error: "Esa persona ya está en tus amigos." };
  } else {
    const firstName = input.firstName?.trim();
    const lastName = input.lastName?.trim();
    if (!firstName || !lastName) {
      return { success: false, error: "El primer nombre y el apellido paterno son obligatorios." };
    }

    const { data: newPerson, error: personError } = await supabase
      .from("persons")
      .insert({
        first_name: firstName,
        middle_name: input.middleName?.trim() || null,
        last_name: lastName,
        maternal_last_name: input.maternalLastName?.trim() || null,
        gender: input.gender ?? "unknown",
        is_living: true,
        is_claimed: false,
        created_by_user_id: me.userId,
      })
      .select("id")
      .single();

    if (personError || !newPerson) {
      if (isMissingColumnError(personError)) return { success: false, error: MISSING_NAME_COLUMNS_MESSAGE };
      return { success: false, error: `Error creando la ficha: ${personError?.message}` };
    }
    friendPersonId = newPerson.id;
    createdNow = true;
  }

  const { error: connectionError } = await supabase.from("social_connections").insert({
    person_a_id: me.personId,
    person_b_id: friendPersonId,
    kind: input.kind,
    created_by_user_id: me.userId,
  });

  if (connectionError) {
    // No dejar fichas "fantasma" sin ningún vínculo
    if (createdNow) await supabase.from("persons").delete().eq("id", friendPersonId);
    return {
      success: false,
      error: isMissingTableError(connectionError)
        ? MISSING_SOCIAL_TABLE_MESSAGE
        : `No se pudo registrar el vínculo: ${connectionError.message}`,
    };
  }

  revalidatePath("/");
  return {
    success: true,
    personId: friendPersonId,
    message: input.kind === "dating" ? "Noviazgo registrado." : "Amigo agregado.",
  };
}

/** Cambia el tipo de vínculo, p. ej. un noviazgo que terminó y quedó en amistad. */
export async function updateFriendKindAction(
  connectionId: string,
  kind: SocialConnectionKind
): Promise<ServerActionResult> {
  const supabase = await createClient();
  const me = await getMyPersonId(supabase);
  if ("error" in me) return { success: false, error: me.error };

  const { data, error } = await supabase
    .from("social_connections")
    .update({ kind, updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .select("id");

  if (error) return { success: false, error: error.message };

  // Cambiar el tipo cancela cualquier propuesta pendiente (la columna puede no existir aún)
  await supabase
    .from("social_connections")
    .update({ proposed_union_type: null, proposed_by_user_id: null })
    .eq("id", connectionId);
  if (!data || data.length === 0) return { success: false, error: "No se encontró el vínculo." };

  revalidatePath("/");
  return {
    success: true,
    message: kind === "friend" ? "Listo: ahora aparece como amistad." : "Listo: ahora aparece como noviazgo.",
  };
}

/**
 * Quita a alguien de mis amigos. Si su ficha la creé yo, no tiene cuenta
 * y no le queda ningún otro vínculo, también se borra para no dejar fichas huérfanas.
 */
export async function removeFriendAction(connectionId: string): Promise<ServerActionResult> {
  const supabase = await createClient();
  const me = await getMyPersonId(supabase);
  if ("error" in me) return { success: false, error: me.error };

  const { data: row } = await supabase
    .from("social_connections")
    .select("id, person_a_id, person_b_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (!row) return { success: false, error: "No se encontró el vínculo." };

  const { error } = await supabase.from("social_connections").delete().eq("id", connectionId);
  if (error) return { success: false, error: error.message };

  const otherId = otherParty(row, me.personId);
  let removedPerson = false;
  if (otherId) {
    const [{ data: person }, { count: edgeCount }, { count: unionCount }, { count: socialCount }] = await Promise.all([
      supabase.from("persons").select("is_claimed, created_by_user_id").eq("id", otherId).maybeSingle(),
      supabase
        .from("parent_child_edges")
        .select("id", { count: "exact", head: true })
        .or(`parent_id.eq.${otherId},child_id.eq.${otherId}`),
      supabase
        .from("union_edges")
        .select("id", { count: "exact", head: true })
        .or(`person_a_id.eq.${otherId},person_b_id.eq.${otherId}`),
      supabase
        .from("social_connections")
        .select("id", { count: "exact", head: true })
        .or(`person_a_id.eq.${otherId},person_b_id.eq.${otherId}`),
    ]);

    const isOrphan = !edgeCount && !unionCount && !socialCount;
    if (person && !person.is_claimed && person.created_by_user_id === me.userId && isOrphan) {
      const { error: deleteError } = await supabase.from("persons").delete().eq("id", otherId);
      removedPerson = !deleteError;
    }
  }

  revalidatePath("/");
  return {
    success: true,
    message: removedPerson ? "Se quitó de tus amigos y se borró su ficha." : "Se quitó de tus amigos.",
  };
}

/**
 * Decide qué nivel de MI árbol ve un amigo que ya tiene cuenta ("none" retira el acceso).
 */
export async function setFriendTreeAccessAction(
  friendPersonId: string,
  tier: TreePermissionTier | "none"
): Promise<ServerActionResult> {
  const supabase = await createClient();
  const me = await getMyPersonId(supabase);
  if ("error" in me) return { success: false, error: me.error };

  const { data: friend } = await supabase
    .from("persons")
    .select("is_claimed, claimed_by_user_id")
    .eq("id", friendPersonId)
    .maybeSingle();
  if (!friend?.is_claimed || !friend.claimed_by_user_id) {
    return { success: false, error: "Esta persona aún no tiene cuenta; podrás darle acceso cuando acepte su invitación." };
  }
  const friendUserId = friend.claimed_by_user_id;

  if (tier === "none") {
    const { error } = await supabase
      .from("tree_access_shares")
      .update({ status: "revoked", responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("granter_user_id", me.userId)
      .eq("requester_user_id", friendUserId);
    if (error) return { success: false, error: error.message };
  } else {
    const { data: rpcData, error: rpcError } = await supabase.rpc("grant_tree_access", {
      p_requester_user_id: friendUserId,
      p_tier: tier,
    });

    if (rpcError && /invalid input value for enum/i.test(rpcError.message)) {
      return {
        success: false,
        error: `Ese nivel aún no existe en la base de datos. Ejecuta ${PROFILE_TIER_MIGRATION} en el SQL Editor de Supabase.`,
      };
    }

    if (rpcError) {
      // Sin la función RPC solo se puede actualizar un acceso que ya exista
      const { data: updated, error } = await supabase
        .from("tree_access_shares")
        .update({ tier, status: "approved", responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("granter_user_id", me.userId)
        .eq("requester_user_id", friendUserId)
        .select("id");
      if (error || !updated || updated.length === 0) {
        return { success: false, error: MISSING_SOCIAL_TABLE_MESSAGE };
      }
    } else {
      const res = rpcData as { success: boolean; error?: string } | null;
      if (!res?.success) return { success: false, error: res?.error ?? "No se pudo conceder el acceso." };
    }
  }

  revalidatePath("/");
  revalidatePath("/tree");
  return { success: true, message: tier === "none" ? "Ya no ve tu árbol." : "Acceso actualizado." };
}
