"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  TreePermissionTier,
  TreeAccessStatus,
  TreeAccessShareItem,
  UserSearchResultItem,
} from "./types";
import { formatFullName } from "./types";

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
