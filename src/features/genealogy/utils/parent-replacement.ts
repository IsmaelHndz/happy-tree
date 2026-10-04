/**
 * Al vincular un progenitor a un hijo ya registrado, decide qué progenitores previos se reemplazan:
 * los del mismo género que el nuevo progenitor (p. ej. un padre registrado por error al dar de alta
 * a un hermano) y los de género desconocido (nodos provisionales "Progenitor/a").
 * Si el género del nuevo progenitor es desconocido no se reemplaza a nadie.
 */
export function parentsToReplace<T extends { id: string; gender?: string | null }>(
  newParentGender: string | null | undefined,
  existingParents: T[],
  keepIds: string[] = []
): T[] {
  if (newParentGender !== "male" && newParentGender !== "female") return [];
  return existingParents.filter(
    (p) => !keepIds.includes(p.id) && (p.gender === newParentGender || !p.gender || p.gender === "unknown")
  );
}
