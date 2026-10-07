// Qué tan extenso ve cada quien su propio árbol (elige la persona; los invitados siguen
// limitados por el nivel que les compartieron).
import type { VisibilityTier } from "./visible-nodes";

export type TreeScope = "close" | "extended" | "full";

export const TREE_SCOPE_COOKIE = "ht_tree_scope";
export const DEFAULT_TREE_SCOPE: TreeScope = "extended";

export const TREE_SCOPE_OPTIONS: { value: TreeScope; label: string; description: string }[] = [
  { value: "close", label: "Cercana", description: "Padres, hermanos, pareja e hijos" },
  {
    value: "extended",
    label: "Extendida",
    description: "Además abuelos, tíos, primos, sobrinos, nietos y toda tu línea directa (bisabuelos…)",
  },
  {
    value: "full",
    label: "Completa",
    description: "Toda la familia conectada: tíos abuelos, primos segundos y las familias de las parejas",
  },
];

export function parseTreeScope(value: string | null | undefined): TreeScope {
  return value === "close" || value === "extended" || value === "full" ? value : DEFAULT_TREE_SCOPE;
}

export function tierForScope(scope: TreeScope): VisibilityTier {
  return scope === "close" ? "basic" : scope === "full" ? "advanced" : "owner";
}

/** Guarda la elección en el navegador (cookie de un año) para que el servidor la use. */
export function saveTreeScope(scope: TreeScope): void {
  document.cookie = `${TREE_SCOPE_COOKIE}=${scope}; path=/; max-age=31536000; samesite=lax`;
}
