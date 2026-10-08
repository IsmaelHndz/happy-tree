"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { LAYOUT_ALGORITHM_VERSION, parseLayoutRules, type LayoutRule } from "./utils/layout-crossings";
import { isMissingTableError, MISSING_LAYOUT_TABLES_MESSAGE } from "./utils/db-errors";

// Acomodo manual del árbol y reportes que le llegan al Usuario Cero (tablas layout_preferences
// y layout_feedback). Solo se guardan ids y estructura, sin nombres.

const MAX_RULES = 200;

export interface LayoutContext {
  focusPersonId: string;
  scope?: string | null;
  baseRules: LayoutRule[];
  rules: LayoutRule[];
  crossingsBefore: number;
  crossingsAfter: number;
  comment?: string | null;
}

type ActionResult = { success?: boolean; error?: string; message?: string };

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isUserZero: false };
  const { data: profile } = await supabase.from("profiles").select("is_user_zero").eq("id", user.id).maybeSingle();
  return { supabase, user, isUserZero: Boolean(profile?.is_user_zero) };
}

function cleanRules(rules: unknown): LayoutRule[] | null {
  const parsed = parseLayoutRules(rules);
  return parsed.length > MAX_RULES ? null : parsed;
}

function feedbackRow(userId: string, ctx: LayoutContext, extra: { kind: "manual_adjust" | "report" | "change_request"; treeOwnerUserId: string }) {
  return {
    user_id: userId,
    kind: extra.kind,
    tree_owner_user_id: extra.treeOwnerUserId,
    focus_person_id: ctx.focusPersonId,
    scope: ctx.scope ?? null,
    base_rules: parseLayoutRules(ctx.baseRules),
    rules: parseLayoutRules(ctx.rules),
    crossings_before: Math.max(0, Math.round(ctx.crossingsBefore)),
    crossings_after: Math.max(0, Math.round(ctx.crossingsAfter)),
    algorithm_version: LAYOUT_ALGORITHM_VERSION,
    comment: ctx.comment?.trim().slice(0, 1000) || null,
  };
}

/** Guarda el acomodo de tu propio árbol y envía el reporte automático. */
export async function saveLayoutRulesAction(ctx: LayoutContext): Promise<ActionResult> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const rules = cleanRules(ctx.rules);
  if (!rules) return { error: "Hay demasiados ajustes guardados. Restablece el acomodo e inténtalo de nuevo." };

  const { error } = await supabase
    .from("layout_preferences")
    .upsert({ user_id: user.id, rules, updated_at: new Date().toISOString() });
  if (error) return { error: isMissingTableError(error) ? MISSING_LAYOUT_TABLES_MESSAGE : "No se pudo guardar el acomodo." };

  // El reporte no debe impedir guardar: si falla, el acomodo ya quedó guardado
  await supabase.from("layout_feedback").insert(feedbackRow(user.id, { ...ctx, rules }, { kind: "manual_adjust", treeOwnerUserId: user.id }));

  revalidatePath("/tree");
  return { success: true, message: "Guardamos este acomodo. También nos ayuda a mejorar el árbol." };
}

/** "Reportar acomodo": avisa de un problema, con comentario opcional. */
export async function reportLayoutAction(ctx: LayoutContext & { treeOwnerUserId: string }): Promise<ActionResult> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const { error } = await supabase
    .from("layout_feedback")
    .insert(feedbackRow(user.id, ctx, { kind: "report", treeOwnerUserId: ctx.treeOwnerUserId }));
  if (error) return { error: isMissingTableError(error) ? MISSING_LAYOUT_TABLES_MESSAGE : "No se pudo enviar el reporte." };
  return { success: true, message: "Gracias. Recibimos tu reporte del acomodo." };
}

/** Propone un acomodo para el árbol de otra persona; se aplica solo si el Usuario Cero lo aprueba. */
export async function requestLayoutChangeAction(ctx: LayoutContext & { treeOwnerUserId: string }): Promise<ActionResult> {
  const { supabase, user, isUserZero } = await currentUser();
  if (!user) return { error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  if (ctx.treeOwnerUserId === user.id) return { error: "Este es tu propio árbol: guarda el acomodo directamente." };
  if (!isUserZero) {
    const { data: share } = await supabase
      .from("tree_access_shares")
      .select("id")
      .eq("granter_user_id", ctx.treeOwnerUserId)
      .eq("requester_user_id", user.id)
      .eq("status", "approved")
      .maybeSingle();
    if (!share) return { error: "No tienes acceso a este árbol." };
  }
  const rules = cleanRules(ctx.rules);
  if (!rules) return { error: "La propuesta tiene demasiados ajustes." };
  const { error } = await supabase
    .from("layout_feedback")
    .insert(feedbackRow(user.id, { ...ctx, rules }, { kind: "change_request", treeOwnerUserId: ctx.treeOwnerUserId }));
  if (error) return { error: isMissingTableError(error) ? MISSING_LAYOUT_TABLES_MESSAGE : "No se pudo enviar la propuesta." };
  return { success: true, message: "Enviamos tu propuesta de acomodo para revisión." };
}

/** Usuario Cero: aprobar (aplica el acomodo al titular), rechazar o marcar como revisado. */
export async function reviewLayoutFeedbackAction(input: {
  id: string;
  decision: "approved" | "rejected" | "reviewed";
  note?: string | null;
}): Promise<ActionResult> {
  const { supabase, user, isUserZero } = await currentUser();
  if (!user || !isUserZero) return { error: "Solo el Usuario Cero puede revisar reportes de acomodo." };

  const { data: row, error: readError } = await supabase
    .from("layout_feedback")
    .select("id, kind, rules, tree_owner_user_id, status")
    .eq("id", input.id)
    .maybeSingle();
  if (readError || !row) return { error: "No se encontró el reporte." };

  if (input.decision === "approved") {
    if (row.kind !== "change_request" || !row.tree_owner_user_id) return { error: "Solo las solicitudes de cambio se aprueban." };
    const { error } = await supabase
      .from("layout_preferences")
      .upsert({ user_id: row.tree_owner_user_id, rules: parseLayoutRules(row.rules), updated_at: new Date().toISOString() });
    if (error) return { error: "No se pudo aplicar el acomodo al árbol del titular." };
  }

  const { error } = await supabase
    .from("layout_feedback")
    .update({ status: input.decision, reviewer_note: input.note?.trim() || null, reviewed_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { error: "No se pudo actualizar el reporte." };

  revalidatePath("/admin/acomodo");
  revalidatePath("/tree");
  return {
    success: true,
    message: input.decision === "approved" ? "Aprobado: el acomodo ya se aplica en ese árbol." : "Listo.",
  };
}
