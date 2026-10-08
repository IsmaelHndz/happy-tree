// Modo "Acomodar": recalcula el árbol en el navegador con reglas manuales (mismo motor que el
// servidor) para ver el resultado al instante antes de guardar.
import type { FamilyGraphData } from "../types/graph.types";
import { computeTreeLayout } from "./tree-layout";
import { arrangeOptions, countLayoutCrossings, ordersFromPositions, type LayoutRule } from "./layout-crossings";

function graphRelations(graph: FamilyGraphData) {
  const parents = new Map<string, string[]>();
  const partners = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.type === "parent-child") parents.set(e.targetId, [...(parents.get(e.targetId) ?? []), e.sourceId]);
    else {
      partners.set(e.sourceId, [...(partners.get(e.sourceId) ?? []), e.targetId]);
      partners.set(e.targetId, [...(partners.get(e.targetId) ?? []), e.sourceId]);
    }
  }
  return { getParents: (id: string) => parents.get(id) ?? [], getPartners: (id: string) => partners.get(id) ?? [] };
}

/** El mismo árbol con posiciones recalculadas según `rules`. */
export function relayoutGraph(graph: FamilyGraphData, rules: LayoutRule[]): FamilyGraphData {
  const positions = computeTreeLayout({
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      generation: n.generation,
      gender: n.gender,
      birthDate: n.birthDate,
      firstName: n.firstName,
    })),
    edges: graph.edges.map((e) => ({ sourceId: e.sourceId, targetId: e.targetId, type: e.type })),
    focusId: graph.focusPerson.id,
    rules,
  });
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const p = positions.get(n.id);
      return p ? { ...n, x: p.x, y: p.y } : n;
    }),
  };
}

export function graphCrossings(graph: FamilyGraphData): number {
  return countLayoutCrossings(
    graph.nodes.filter((n) => n.x !== undefined).map((n) => ({ id: n.id, generation: n.generation, x: n.x! })),
    graphRelations(graph).getParents
  );
}

export function arrangeOptionsFor(graph: FamilyGraphData, personId: string) {
  return arrangeOptions(ordersFromPositions(graph.nodes), personId, graphRelations(graph));
}

/** Personas cuyo lugar en su fila cambió entre dos acomodos (para el "diff" de la revisión). */
export function movedPersonIds(before: FamilyGraphData, after: FamilyGraphData): Set<string> {
  const index = (g: FamilyGraphData) => {
    const result = new Map<string, number>();
    ordersFromPositions(g.nodes).forEach((order) => order.forEach((id, i) => result.set(id, i)));
    return result;
  };
  const a = index(before);
  const b = index(after);
  return new Set([...b].filter(([id, i]) => a.has(id) && a.get(id) !== i).map(([id]) => id));
}

/** Caso de prueba anonimizado (ids → p1, p2…) a partir de un árbol y sus reglas. */
export function anonymizedLayoutCase(graph: FamilyGraphData, baseRules: LayoutRule[], rules: LayoutRule[]) {
  const alias = new Map(graph.nodes.map((n, i) => [n.id, `p${i + 1}`]));
  const a = (id: string) => alias.get(id) ?? "fuera";
  const mapRules = (rs: LayoutRule[]) => rs.map((r) => ({ left: a(r.left), right: a(r.right) }));
  return {
    focusId: a(graph.focusPerson.id),
    nodes: graph.nodes.map((n) => ({ id: a(n.id), generation: n.generation, gender: n.gender })),
    edges: graph.edges.map((e) => ({ sourceId: a(e.sourceId), targetId: a(e.targetId), type: e.type, unionType: e.unionType })),
    baseRules: mapRules(baseRules),
    rules: mapRules(rules),
  };
}
