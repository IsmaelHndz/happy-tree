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
