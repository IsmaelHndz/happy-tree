/**
 * Utilidades para interpretar errores de Supabase/PostgREST.
 */

export const NAME_COLUMNS_MIGRATION = "supabase/migrations/20261003000002_add_middle_and_maternal_names.sql";

/**
 * true si el error indica que una columna no existe en la base de datos
 * (p. ej. la migración de `middle_name` / `maternal_last_name` aún no se ejecuta).
 */
export function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const msg = error.message ?? "";
  return /column .* does not exist|could not find the '.*' column/i.test(msg);
}

export const MISSING_NAME_COLUMNS_MESSAGE =
  `La base de datos no tiene las columnas de segundo nombre / apellido materno. ` +
  `Ejecuta la migración ${NAME_COLUMNS_MIGRATION} en el SQL Editor de Supabase y vuelve a intentarlo.`;
