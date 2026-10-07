// Escena del árbol: qué se dibuja y dónde (tarjetas, barras de hermanos, uniones, colores,
// resaltado). La usan el lienzo interactivo y la exportación a PDF, para que el PDF salga
// exactamente como se ve en pantalla. Pura, sin DOM.
import type { FamilyGraphData, TreeNodeData } from "../types/graph.types";
import { TREE_LAYOUT } from "./tree-layout";
import type { Bounds } from "./viewport";
import {
  buildFamilyBranches,
  buildSiblingGroups,
  parentGroupKey,
  ROOT_STRIPE_COLOR,
  staggerBusRows,
  type SiblingGroup,
} from "./sibling-groups";

export interface SceneNode {
  node: TreeNodeData;
  x: number;
  y: number;
  stripeColor: string;
  isCenter: boolean;
  isDimmed: boolean;
  // Familia que se resalta al tocar a esta persona
  branchKey?: string;
}

export interface SceneBus {
  key: string;
  color: string;
  label: string | null;
  isDimmed: boolean;
  parentMidX: number;
  parentMaxY: number;
  dropStartY: number;
  busY: number;
  busStartX: number;
  busEndX: number;
  children: { id: string; x: number; topY: number }[];
}

export interface SceneUnion {
  id: string;
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midX: number;
  isEnded: boolean; // separados / divorciados
  lineColor: string;
  ringColor: string;
  isDimmed: boolean;
  isActive: boolean;
  branchKey?: string;
}

export interface TreeScene {
  nodes: SceneNode[];
  buses: SceneBus[];
  unions: SceneUnion[];
  bounds: Bounds;
  hasHighlight: boolean;
}

/** Oculta las parejas de hermanos y colaterales, salvo la pareja de la persona central. */
export function visibleTreeNodes(graph: FamilyGraphData, hideSiblingSpouses: boolean): TreeNodeData[] {
  if (!hideSiblingSpouses) return graph.nodes;
  return graph.nodes.filter((node) => {
    if (node.relationshipCategory !== "spouse" || node.id === graph.focusPerson.id) return true;
    return graph.edges.some(
      (e) =>
        e.type === "union" &&
        ((e.sourceId === graph.focusPerson.id && e.targetId === node.id) ||
          (e.targetId === graph.focusPerson.id && e.sourceId === node.id))
    );
  });
}

export function buildTreeScene({
  graph,
  hideSiblingSpouses,
  activeBranchKey,
}: {
  graph: FamilyGraphData;
  hideSiblingSpouses: boolean;
  activeBranchKey: string | null;
}): TreeScene {
  const { NODE_WIDTH: W, NODE_HEIGHT: H } = TREE_LAYOUT;
  const nodeMap = new Map<string, TreeNodeData>();
  visibleTreeNodes(graph, hideSiblingSpouses).forEach((n) => {
    if (n.x !== undefined && n.y !== undefined) nodeMap.set(n.id, n);
  });
  const visibleIds = new Set(nodeMap.keys());

  // Cada grupo de hijos cuelga de su unión; con varias parejas cada grupo lleva color y etiqueta "con X"
  const parentChildPairs = graph.edges
    .filter((e) => e.type === "parent-child")
    .map((e) => ({ parentId: e.sourceId, childId: e.targetId }));
  const groups = buildSiblingGroups({
    focusId: graph.focusPerson.id,
    visibleIds,
    parentEdges: parentChildPairs,
    firstNameOf: (id) => nodeMap.get(id)?.firstName ?? "",
  });
  const groupByKey = new Map<string, SiblingGroup>(groups.map((g) => [g.key, g]));
  const groupKeyOfChild = new Map<string, string>();
  groups.forEach((g) => g.childIds.forEach((c) => groupKeyOfChild.set(c, g.key)));

  const unionEdges = graph.edges.filter(
    (e) => e.type === "union" && nodeMap.has(e.sourceId) && nodeMap.has(e.targetId)
  );
  const unionPairKeys = new Set(unionEdges.map((e) => parentGroupKey([e.sourceId, e.targetId])));

  const { membersByKey, branchOfPerson } = buildFamilyBranches({
    groups,
    parentEdges: parentChildPairs,
    unions: unionEdges.map((e) => ({ personAId: e.sourceId, personBId: e.targetId })),
    visibleIds,
  });
  const highlighted = activeBranchKey ? membersByKey.get(activeBranchKey) ?? null : null;
  const branchOfGroup = (key: string) =>
    membersByKey.has(key) ? key : branchOfPerson.get(groupByKey.get(key)?.childIds[0] ?? "");

  const nodes: SceneNode[] = [...nodeMap.values()].map((node) => {
    const childGroupKey = groupKeyOfChild.get(node.id);
    return {
      node,
      x: node.x!,
      y: node.y!,
      stripeColor: (childGroupKey && groupByKey.get(childGroupKey)?.color) || ROOT_STRIPE_COLOR,
      isCenter: node.id === graph.focusPerson.id,
      isDimmed: highlighted !== null && !highlighted.has(node.id),
      branchKey: branchOfPerson.get(node.id),
    };
  });

  const buses: SceneBus[] = staggerBusRows(
    groups.flatMap((group) => {
      const parents = group.parentIds.map((id) => nodeMap.get(id)!).filter(Boolean);
      const children = group.childIds.map((id) => nodeMap.get(id)!).filter(Boolean);
      if (parents.length === 0 || children.length === 0) return [];
      const parentMidX = parents.length >= 2 ? (parents[0].x! + parents[1].x! + W) / 2 : parents[0].x! + W / 2;
      const parentMaxY = Math.max(...parents.map((p) => p.y!)) + H;
      // Con unión dibujada, la bajada nace justo debajo del corazón
      const startsAtHeart = parents.length === 2 && parents[0].y === parents[1].y && unionPairKeys.has(group.key);
      const dropStartY = startsAtHeart ? parents[0].y! + H / 2 + 10 : parentMaxY;
      const childY = Math.min(...children.map((c) => c.y!));
      const busY = childY > parentMaxY ? parentMaxY + (childY - parentMaxY) / 2 : parentMaxY + 30;
      const childXs = children.map((c) => c.x! + W / 2);
      return [
        {
          key: group.key,
          color: group.color,
          label: group.label,
          isDimmed: highlighted !== null && !group.childIds.some((c) => highlighted.has(c)),
          parentMidX,
          parentMaxY,
          dropStartY,
          busY,
          busStartX: Math.min(...childXs, parentMidX),
          busEndX: Math.max(...childXs, parentMidX),
          children: children.map((c) => ({ id: c.id, x: c.x! + W / 2, topY: c.y! })),
        },
      ];
    })
  );

  const unions: SceneUnion[] = unionEdges.map((edge) => {
    const source = nodeMap.get(edge.sourceId)!;
    const target = nodeMap.get(edge.targetId)!;
    const isLeft = source.x! < target.x!;
    const x1 = isLeft ? source.x! + W : source.x!;
    const x2 = isLeft ? target.x! : target.x! + W;
    const y1 = source.y! + H / 2;
    const y2 = target.y! + H / 2;
    const key = parentGroupKey([edge.sourceId, edge.targetId]);
    const group = groupByKey.get(key);
    const isEnded = edge.unionType === "divorced" || edge.unionType === "separated";
    return {
      id: edge.id,
      key,
      x1,
      y1,
      x2,
      y2,
      midX: (x1 + x2) / 2,
      isEnded,
      lineColor: isEnded ? "#71717a" : group?.color ?? "#f472b6",
      ringColor: group?.color ?? (isEnded ? "#71717a" : "#ec4899"),
      isDimmed: highlighted !== null && !(highlighted.has(edge.sourceId) && highlighted.has(edge.targetId)),
      isActive: activeBranchKey === key,
      branchKey: group ? branchOfGroup(key) : undefined,
    };
  });

  const bounds: Bounds =
    nodes.length === 0
      ? { minX: 0, minY: 0, maxX: W, maxY: H }
      : {
          minX: Math.min(...nodes.map((n) => n.x)),
          minY: Math.min(...nodes.map((n) => n.y)),
          maxX: Math.max(...nodes.map((n) => n.x)) + W,
          maxY: Math.max(...nodes.map((n) => n.y)) + H,
        };

  return { nodes, buses, unions, bounds, hasHighlight: highlighted !== null };
}
