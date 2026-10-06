/**
 * SELECCIÓN DE PERSONAS VISIBLES EN EL ÁRBOL (pura, sin dependencias de servidor)
 *
 * A partir de la persona central y del nivel de permisos decide qué personas se dibujan:
 * - profile: solo la ficha de la persona central, sin ningún familiar.
 * - basic: familia de casa (padres, hijos, pareja, hermanos).
 * - intermediate / owner: familia extendida (abuelos, tíos, primos, sobrinos, nietos)
 *   más el completado de familias ensambladas (ver paso 3).
 * - advanced: todo lo anterior más el resto del componente conectado (bisabuelos, primos lejanos…).
 *
 * Las uniones recibidas deben estar ya saneadas (`partitionUnionsByIntegrity`) y filtradas
 * por visibilidad (exparejas solo si comparten hijos).
 */

export type VisibilityTier = "profile" | "basic" | "intermediate" | "advanced" | "owner";

export interface VisibleNodesResult {
  nodeIds: string[];
  parentIds: string[];
  childIds: string[];
  spouseIds: string[];
  siblingIds: string[];
  grandParentIds: string[];
  siblingSpouseIds: string[];
  grandChildIds: string[];
  uncleAuntIds: string[];
  uncleSpouseIds: string[];
  cousinIds: string[];
  nephewNieceIds: string[];
}

export function selectVisibleNodeIds({
  centerPersonId,
  parentEdges,
  unions,
  tier,
}: {
  centerPersonId: string;
  parentEdges: { parent_id: string; child_id: string }[];
  unions: { person_a_id: string; person_b_id: string }[];
  tier: VisibilityTier;
}): VisibleNodesResult {
  if (tier === "profile") {
    return {
      nodeIds: [centerPersonId],
      parentIds: [],
      childIds: [],
      spouseIds: [],
      siblingIds: [],
      grandParentIds: [],
      siblingSpouseIds: [],
      grandChildIds: [],
      uncleAuntIds: [],
      uncleSpouseIds: [],
      cousinIds: [],
      nephewNieceIds: [],
    };
  }

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const partnersOf = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, key: string, val: string) => {
    const list = map.get(key);
    if (!list) map.set(key, [val]);
    else if (!list.includes(val)) list.push(val);
  };
  for (const e of parentEdges) {
    if (e.parent_id === e.child_id) continue;
    push(parentsOf, e.child_id, e.parent_id);
    push(childrenOf, e.parent_id, e.child_id);
  }
  for (const u of unions) {
    if (u.person_a_id === u.person_b_id) continue;
    push(partnersOf, u.person_a_id, u.person_b_id);
    push(partnersOf, u.person_b_id, u.person_a_id);
  }

  const parentsOfMany = (ids: string[]) => unique(ids.flatMap((id) => parentsOf.get(id) ?? []));
  const childrenOfMany = (ids: string[]) => unique(ids.flatMap((id) => childrenOf.get(id) ?? []));
  const partnersOfMany = (ids: string[]) => unique(ids.flatMap((id) => partnersOf.get(id) ?? []));

  // 1. Categorías respecto a la persona central
  const parentIds = parentsOf.get(centerPersonId) ?? [];
  const childIds = childrenOf.get(centerPersonId) ?? [];
  const spouseIds = partnersOf.get(centerPersonId) ?? [];
  const siblingIds = childrenOfMany(parentIds).filter((id) => id !== centerPersonId);
  const grandParentIds = parentsOfMany(parentIds);
  const siblingSpouseIds = partnersOfMany(siblingIds).filter((id) => id !== centerPersonId);
  const grandChildIds = childrenOfMany(childIds);
  const uncleAuntIds = childrenOfMany(grandParentIds).filter((id) => !parentIds.includes(id));
  const uncleSpouseIds = partnersOfMany(uncleAuntIds).filter((id) => !parentIds.includes(id));
  const cousinIds = childrenOfMany(uncleAuntIds).filter((id) => id !== centerPersonId && !siblingIds.includes(id));
  const nephewNieceIds = childrenOfMany(siblingIds);

  // 2. Filtrado por nivel de permisos
  const visible = new Set<string>([centerPersonId, ...parentIds, ...childIds, ...spouseIds, ...siblingIds]);

  if (tier !== "basic") {
    [
      ...grandParentIds,
      ...siblingSpouseIds,
      ...grandChildIds,
      ...uncleAuntIds,
      ...uncleSpouseIds,
      ...cousinIds,
      ...nephewNieceIds,
    ].forEach((id) => visible.add(id));

    // 3. Familias ensambladas: completar cada núcleo familiar visible con
    //   - los otros progenitores de tíos, hermanos, hijos, nietos, sobrinos y primos
    //     (p. ej. el padre de un medio hermano o el segundo esposo de la abuela)
    //   - las parejas de todas las personas visibles (padrastros, yernos/nueras, parejas de abuelos…)
    //   - los hijos de esas parejas políticas (hijastros, p. ej. hijos de la esposa de un tío con su expareja)
    const descendantLike = [...uncleAuntIds, ...siblingIds, ...childIds, ...grandChildIds, ...nephewNieceIds, ...cousinIds];
    descendantLike.forEach((id) => (parentsOf.get(id) ?? []).forEach((p) => visible.add(p)));

    // Parientes políticos: cualquier persona visible que no sea consanguínea (parejas y co-progenitores),
    // aunque ya fuera visible por otra vía (p. ej. el padrastro que además es padre de un medio hermano).
    const bloodIds = new Set<string>([
      centerPersonId,
      ...parentIds,
      ...childIds,
      ...siblingIds,
      ...grandParentIds,
      ...grandChildIds,
      ...uncleAuntIds,
      ...cousinIds,
      ...nephewNieceIds,
    ]);
    Array.from(visible).forEach((id) => (partnersOf.get(id) ?? []).forEach((partnerId) => visible.add(partnerId)));
    const inLawIds = Array.from(visible).filter((id) => !bloodIds.has(id));
    inLawIds.forEach((id) => (childrenOf.get(id) ?? []).forEach((c) => visible.add(c)));
  }

  // 4. Avanzado: todo el componente conectado (BFS iterativo por padres, hijos y parejas)
  if (tier === "advanced") {
    const queue = [centerPersonId];
    const seen = new Set<string>(queue);
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      for (const next of [...(parentsOf.get(id) ?? []), ...(childrenOf.get(id) ?? []), ...(partnersOf.get(id) ?? [])]) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    seen.forEach((id) => visible.add(id));
  }

  return {
    nodeIds: Array.from(visible),
    parentIds,
    childIds,
    spouseIds,
    siblingIds,
    grandParentIds,
    siblingSpouseIds,
    grandChildIds,
    uncleAuntIds,
    uncleSpouseIds,
    cousinIds,
    nephewNieceIds,
  };
}

function unique(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

/**
 * Generación de cada persona respecto a la central (0) mediante BFS iterativo:
 * progenitores -1, hijos +1, parejas misma generación. Sin recursión (Pitfall 1).
 */
export function assignGenerations({
  centerPersonId,
  parentEdges,
  unions,
}: {
  centerPersonId: string;
  parentEdges: { parent_id: string; child_id: string }[];
  unions: { person_a_id: string; person_b_id: string }[];
}): Map<string, number> {
  const neighbors = new Map<string, { id: string; delta: number }[]>();
  const add = (from: string, id: string, delta: number) => {
    const list = neighbors.get(from);
    if (list) list.push({ id, delta });
    else neighbors.set(from, [{ id, delta }]);
  };
  // Orden de exploración: progenitores, hijos y parejas
  for (const e of parentEdges) add(e.child_id, e.parent_id, -1);
  for (const e of parentEdges) add(e.parent_id, e.child_id, 1);
  for (const u of unions) {
    add(u.person_a_id, u.person_b_id, 0);
    add(u.person_b_id, u.person_a_id, 0);
  }

  const genMap = new Map<string, number>([[centerPersonId, 0]]);
  const queue = [centerPersonId];
  for (let i = 0; i < queue.length; i++) {
    const curr = queue[i];
    const gen = genMap.get(curr)!;
    for (const { id, delta } of neighbors.get(curr) ?? []) {
      if (genMap.has(id)) continue;
      genMap.set(id, gen + delta);
      queue.push(id);
    }
  }
  return genMap;
}
