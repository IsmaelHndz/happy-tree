"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AuthActionState, InvitationDetails, UserZeroStatus } from "./types";
import type { Gender } from "@/types/database.types";

/**
 * Consulta si el sistema ya cuenta con el Usuario Cero inicializado.
 */
export async function checkUserZeroExists(): Promise<UserZeroStatus> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, is_user_zero, person_id, persons:person_id (first_name, last_name)")
    .eq("is_user_zero", true)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { exists: false };
  }

  // Type assertion seguro sin any
  const personData = data.persons as unknown as { first_name: string; last_name: string } | null;
  const name = personData ? `${personData.first_name} ${personData.last_name}` : null;

  return {
    exists: true,
    userZeroName: name,
  };
}

/**
 * Server Action: Inicio de sesión tradicional.
 */
export async function loginAction(
  prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Por favor proporciona tu correo y contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return {
      error:
        error.message === "Invalid login credentials"
          ? "Credenciales incorrectas. Verifica tu correo y contraseña."
          : error.message,
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Server Action: Bootstrap del Usuario Cero.
 * Solo puede ejecutarse una sola vez en toda la vida del sistema.
 */
export async function bootstrapUserZeroAction(
  prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;
  const firstName = (formData.get("first_name") as string)?.trim();
  const lastName = (formData.get("last_name") as string)?.trim();
  const gender = (formData.get("gender") as Gender) || "unknown";
  const birthDate = (formData.get("birth_date") as string) || null;

  if (!email || !password || !firstName || !lastName) {
    return { error: "Todos los campos principales (nombre, apellido, correo y contraseña) son obligatorios." };
  }

  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres para seguridad de tu árbol." };
  }

  const supabase = await createClient();

  // 1. Validar que no exista Usuario Cero previo
  const { exists } = await checkUserZeroExists();
  if (exists) {
    return { error: "El Usuario Cero ya ha sido inicializado. Inicia sesión en su lugar." };
  }

  // 2. Registrar usuario en auth.users
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
      },
    },
  });

  if (authError || !authData.user) {
    return { error: authError?.message || "No se pudo registrar la cuenta en el sistema de autenticación." };
  }

  // 3. Ejecutar función RPC atómica para crear persona reclamada y rol Usuario Cero
  const { error: rpcError } = await supabase.rpc("bootstrap_user_zero", {
    p_user_id: authData.user.id,
    p_first_name: firstName,
    p_last_name: lastName,
    p_gender: gender,
    p_birth_date: birthDate || null,
  });

  if (rpcError) {
    return { error: `Error inicializando perfil raíz: ${rpcError.message}` };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Obtiene y valida los detalles de un token de invitación criptográfico.
 */
export async function getInvitationDetails(token: string): Promise<InvitationDetails> {
  if (!token || token.trim().length === 0) {
    return { isValid: false, errorMessage: "Token de invitación no especificado." };
  }

  const supabase = await createClient();

  // Consultar token
  const { data: invite, error: inviteError } = await supabase
    .from("invitation_tokens")
    .select("id, token, person_id, invited_by_user_id, invited_email, proposed_relationship, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (inviteError || !invite) {
    return { isValid: false, errorMessage: "El enlace de invitación no es válido o no existe." };
  }

  if (invite.status !== "pending") {
    return { isValid: false, errorMessage: "Esta invitación ya fue utilizada o revocada previamente." };
  }

  if (new Date(invite.expires_at) < new Date()) {
    return { isValid: false, errorMessage: "Esta invitación ha expirado. Solicita un nuevo enlace." };
  }

  // Obtener ficha genealógica vinculada
  const { data: person } = await supabase
    .from("persons")
    .select("id, first_name, last_name, is_claimed")
    .eq("id", invite.person_id)
    .single();

  if (!person) {
    return { isValid: false, errorMessage: "La ficha familiar vinculada a esta invitación no existe." };
  }

  if (person.is_claimed) {
    return { isValid: false, errorMessage: "Este perfil familiar ya fue reclamado por otro miembro." };
  }

  // Obtener nombre del invitador
  const { data: inviterProfile } = await supabase
    .from("profiles")
    .select("person_id, persons:person_id(first_name, last_name)")
    .eq("id", invite.invited_by_user_id)
    .maybeSingle();

  let inviterName: string | null = null;
  if (inviterProfile?.persons) {
    const inviter = inviterProfile.persons as unknown as { first_name: string; last_name: string };
    inviterName = `${inviter.first_name} ${inviter.last_name}`;
  }

  return {
    isValid: true,
    token: invite.token,
    personId: person.id,
    firstName: person.first_name,
    lastName: person.last_name,
    invitedEmail: invite.invited_email,
    proposedRelationship: invite.proposed_relationship,
    inviterName,
  };
}

/**
 * Server Action: Reclamación de Perfil mediante Token de Invitación.
 */
export async function claimProfileWithTokenAction(
  prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const token = (formData.get("token") as string)?.trim();
  const password = formData.get("password") as string;
  const firstName = (formData.get("first_name") as string)?.trim();
  const lastName = (formData.get("last_name") as string)?.trim();

  if (!token) {
    return { error: "Token de invitación ausente." };
  }

  if (!password || password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  // 1. Revalidar invitación
  const invite = await getInvitationDetails(token);
  if (!invite.isValid || !invite.invitedEmail) {
    return { error: invite.errorMessage || "Invitación inválida." };
  }

  const supabase = await createClient();

  // 2. Registrar usuario en auth.users con el correo invitado
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: invite.invitedEmail,
    password,
    options: {
      data: {
        first_name: firstName || invite.firstName,
        last_name: lastName || invite.lastName,
      },
    },
  });

  if (authError || !authData.user) {
    return { error: authError?.message || "No se pudo registrar la cuenta familiar." };
  }

  // 3. Ejecutar función RPC atómica para reclamar el perfil y quemar el token
  const { error: rpcError } = await supabase.rpc("claim_person_profile", {
    p_token: token,
    p_user_id: authData.user.id,
    p_first_name: firstName || invite.firstName || null,
    p_last_name: lastName || invite.lastName || null,
  });

  if (rpcError) {
    return { error: `Error al reclamar el perfil: ${rpcError.message}` };
  }

  revalidatePath("/", "layout");
  redirect("/");
}
