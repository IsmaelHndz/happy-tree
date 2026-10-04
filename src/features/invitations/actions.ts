"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

export async function generateInvitationAction(
  personId: string,
  email?: string | null,
  proposedRelationship?: string
) {
  if (!personId) {
    return { error: "El familiar es obligatorio." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "No estás autenticado." };
  }

  // 1. Validar si el usuario tiene permiso para invitar
  const { data: canInviteData } = await supabase.rpc("check_user_can_invite", {
    p_user_id: user.id,
  });

  const inviteCheck = canInviteData as { can_invite?: boolean; needed?: number } | null;
  if (!inviteCheck?.can_invite) {
    return {
      error: `Aún no tienes los permisos requeridos para invitar. Necesitas ${
        inviteCheck?.needed ?? 3
      } reconocimientos familiares más.`,
    };
  }

  // 2. Validar que la persona no esté ya reclamada
  const { data: person } = await supabase
    .from("persons")
    .select("id, is_claimed, is_living, first_name, last_name")
    .eq("id", personId)
    .single();

  if (!person) {
    return { error: "Familiar no encontrado." };
  }

  if (person.is_claimed) {
    return { error: "Este perfil ya ha sido reclamado." };
  }

  if (!person.is_living) {
    return { error: "No es posible emitir invitaciones para personas registradas como fallecidas." };
  }

  // 3. Verificar si ya existe una invitación pendiente y no expirada
  const { data: existingToken } = await supabase
    .from("invitation_tokens")
    .select("token, expires_at")
    .eq("person_id", personId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existingToken) {
    return {
      success: true,
      token: existingToken.token,
      message: "Se recuperó una invitación activa preexistente para este familiar.",
    };
  }

  // 4. Generar nuevo token criptográfico
  const rawToken = crypto.randomBytes(32).toString("hex");
  const cleanEmail = email && email.trim().length > 0 ? email.trim().toLowerCase() : null;

  let { data: newToken, error: insertError } = await supabase
    .from("invitation_tokens")
    .insert({
      token: rawToken,
      person_id: personId,
      invited_by_user_id: user.id,
      invited_email: cleanEmail,
      proposed_relationship: proposedRelationship || "Familiar",
    })
    .select("token")
    .single();

  // Resiliencia si la columna en la BD remota todavía tiene restricción NOT NULL
  if (insertError && !cleanEmail) {
    const { data: fallbackToken, error: fallbackError } = await supabase
      .from("invitation_tokens")
      .insert({
        token: rawToken,
        person_id: personId,
        invited_by_user_id: user.id,
        invited_email: "",
        proposed_relationship: proposedRelationship || "Familiar",
      })
      .select("token")
      .single();

    if (!fallbackError && fallbackToken) {
      newToken = fallbackToken;
      insertError = null;
    }
  }

  if (insertError || !newToken) {
    return { error: `Error creando invitación: ${insertError?.message}` };
  }

  revalidatePath("/");

  return {
    success: true,
    token: newToken.token,
    message: "Invitación generada exitosamente.",
  };
}
