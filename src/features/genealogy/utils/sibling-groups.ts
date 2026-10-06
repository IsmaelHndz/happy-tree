// Grupos de hermanos por unidad parental (horquillas del canvas) y su color.
// Cuando una persona tiene hijos con varias parejas, cada grupo recibe un color
// distinto para que se vea de qué unión viene cada hijo.

export const DEFAULT_LINE_COLOR = "#10b981"; // emerald-500, también la línea directa al foco
// Sin rosa (lo usa el corazón) ni verde (línea directa).
export const UNION_PALETTE = ["#38bdf8", "#f59e0b", "#a78bfa", "#fb7185", "#22d3ee", "#a3e635"];

export interface SiblingGroup {
  key: string; // ids de los padres ordenados y unidos con "_"
  parentIds: string[];
  childIds: string[];
  color: string;
  // Algún padre tiene hijos en otro grupo (hijos con más de una pareja)
  isMultiPartner: boolean;
  isDirectLine: boolean;
  // Solo en grupos multi-pareja: "con Juan", "Juan y Ana", "solo de Audelia"
  label: string | null;
}

export function parentGroupKey(parentIds: string[]): string {
  return [...parentIds].sort().join("_");
}

export function buildSiblingGroups(input: {
  focusId: string;
  visibleIds: Set<string>;
  parentEdges: { parentId: string; childId: string }[];
  firstNameOf: (id: string) => string;
}): SiblingGroup[] {
  const { focusId, visibleIds, parentEdges, firstNameOf } = input;

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const { parentId, childId } of parentEdges) {
    const ps = parentsOf.get(childId) ?? [];
    if (!ps.includes(parentId)) ps.push(parentId);
    parentsOf.set(childId, ps);
    const cs = childrenOf.get(parentId) ?? [];
    if (!cs.includes(childId)) cs.push(childId);
    childrenOf.set(parentId, cs);
  }

  // Línea directa: el foco, sus ancestros y sus descendientes (BFS iterativo).
  const directLine = new Set<string>([focusId]);
  for (const next of [parentsOf, childrenOf]) {
    const queue = [focusId];
    while (queue.length) {
      const id = queue.shift()!;
      for (const rel of next.get(id) ?? []) {
        if (!directLine.has(rel)) {
          directLine.add(rel);
          queue.push(rel);
        }
      }
    }
  }

  // Agrupar hijos visibles por sus padres visibles.
  const byKey = new Map<string, { parentIds: string[]; childIds: string[] }>();
  for (const [childId, allParents] of parentsOf) {
    if (!visibleIds.has(childId)) continue;
    const parents = allParents.filter((p) => visibleIds.has(p)).sort();
    if (parents.length === 0) continue;
    const key = parents.join("_");
    const group = byKey.get(key) ?? { parentIds: parents, childIds: [] };
    group.childIds.push(childId);
    byKey.set(key, group);
  }

  const keysByParent = new Map<string, string[]>();
  for (const [key, g] of byKey) {
    for (const p of g.parentIds) keysByParent.set(p, [...(keysByParent.get(p) ?? []), key]);
  }

  const sortedKeys = [...byKey.keys()].sort();
  const colorByKey = new Map<string, string>();
  const groups: SiblingGroup[] = [];

  for (const key of sortedKeys) {
    const { parentIds, childIds } = byKey.get(key)!;
    const sharedParents = parentIds.filter((p) => (keysByParent.get(p)?.length ?? 0) > 1);
    const isMultiPartner = sharedParents.length > 0;
    const isDirectLine = childIds.some((c) => directLine.has(c));

    let color = DEFAULT_LINE_COLOR;
    if (isMultiPartner && !isDirectLine) {
      // Primer color de la paleta que no use otro grupo que comparte un padre.
      const used = new Set(
        sharedParents.flatMap((p) => keysByParent.get(p)!).map((k) => colorByKey.get(k)).filter(Boolean)
      );
      used.add(DEFAULT_LINE_COLOR);
      const free = UNION_PALETTE.filter((c) => !used.has(c));
      color = free[0] ?? UNION_PALETTE[groups.length % UNION_PALETTE.length];
    }
    colorByKey.set(key, color);

    let label: string | null = null;
    if (isMultiPartner) {
      if (parentIds.length === 1) {
        label = `solo de ${firstNameOf(parentIds[0])}`;
      } else {
        const others = parentIds.filter((p) => !sharedParents.includes(p));
        label =
          others.length > 0
            ? `con ${others.map(firstNameOf).join(" y ")}`
            : parentIds.map(firstNameOf).join(" y ");
      }
    }

    groups.push({ key, parentIds, childIds, color, isMultiPartner, isDirectLine, label });
  }

  return groups;
}

// Si dos barras de hermanos caen a la misma altura y se solapan en X,
// desplaza las siguientes hacia abajo para que no se lean como una sola.
export function staggerBusRows<T extends { busY: number; busStartX: number; busEndX: number }>(
  buses: T[],
  step = 14
): T[] {
  const byRow = new Map<number, T[]>();
  for (const b of buses) {
    const row = Math.round(b.busY);
    byRow.set(row, [...(byRow.get(row) ?? []), b]);
  }
  const out: T[] = [];
  for (const row of byRow.values()) {
    const sorted = [...row].sort((a, b) => a.busStartX - b.busStartX);
    const lanes: number[] = []; // fin en X de la última barra de cada carril
    for (const b of sorted) {
      let lane = lanes.findIndex((end) => b.busStartX > end + 6);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(b.busEndX);
      } else {
        lanes[lane] = b.busEndX;
      }
      out.push({ ...b, busY: b.busY + lane * step });
    }
  }
  return out;
}

export interface FamilyBranches {
  // Por cada grupo multi-pareja: sus padres, hijos, descendientes visibles y las parejas de esos descendientes
  membersByKey: Map<string, Set<string>>;
  // Rama a la que pertenece cada persona (la unión multi-pareja más cercana hacia arriba).
  // Los padres compartidos (p. ej. Audelia) no se asignan: pertenecen a varias ramas.
  branchOfPerson: Map<string, string>;
}

export function buildFamilyBranches(input: {
  groups: SiblingGroup[];
  parentEdges: { parentId: string; childId: string }[];
  unions: { personAId: string; personBId: string }[];
  visibleIds: Set<string>;
}): FamilyBranches {
  const { groups, parentEdges, unions, visibleIds } = input;

  const childrenOf = new Map<string, string[]>();
  const coParentsOf = new Map<string, Set<string>>();
  const parentsOfChild = new Map<string, string[]>();
  for (const { parentId, childId } of parentEdges) {
    childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), childId]);
    parentsOfChild.set(childId, [...(parentsOfChild.get(childId) ?? []), parentId]);
  }
  for (const parents of parentsOfChild.values()) {
    for (const p of parents) {
      const set = coParentsOf.get(p) ?? new Set<string>();
      parents.forEach((q) => q !== p && set.add(q));
      coParentsOf.set(p, set);
    }
  }
  for (const { personAId, personBId } of unions) {
    coParentsOf.set(personAId, (coParentsOf.get(personAId) ?? new Set()).add(personBId));
    coParentsOf.set(personBId, (coParentsOf.get(personBId) ?? new Set()).add(personAId));
  }

  const membersByKey = new Map<string, Set<string>>();
  const best = new Map<string, { key: string; depth: number }>();

  for (const group of groups) {
    if (!group.isMultiPartner) continue;
    const members = new Set<string>(group.parentIds);
    // BFS iterativo hacia abajo desde los hijos de esta unión
    const queue: { id: string; depth: number }[] = group.childIds.map((id) => ({ id, depth: 1 }));
    const seen = new Set<string>(group.childIds);
    while (queue.length) {
      const { id, depth } = queue.shift()!;
      if (visibleIds.has(id)) {
        members.add(id);
        const prev = best.get(id);
        if (!prev || depth < prev.depth) best.set(id, { key: group.key, depth });
      }
      for (const partner of coParentsOf.get(id) ?? []) {
        if (visibleIds.has(partner) && !group.parentIds.includes(partner)) members.add(partner);
      }
      for (const child of childrenOf.get(id) ?? []) {
        if (!seen.has(child)) {
          seen.add(child);
          queue.push({ id: child, depth: depth + 1 });
        }
      }
    }
    membersByKey.set(group.key, members);
  }

  const branchOfPerson = new Map<string, string>();
  best.forEach(({ key }, id) => branchOfPerson.set(id, key));
  return { membersByKey, branchOfPerson };
}
