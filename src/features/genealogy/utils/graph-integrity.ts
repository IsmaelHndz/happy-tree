/**
 * Utilidades puras de integridad genealógica.
 *
 * Detectan contradicciones biológicas en los datos (p. ej. una unión conyugal entre una madre
 * y su propio hijo, o entre dos hermanos) que suelen originarse al corregir parentescos mal
 * capturados: la persona se registró primero como pareja y después se re-vinculó como hijo,
 * pero la unión original nunca se eliminó.
 *
 * Todas las funciones son lineales O(V + E), sin recursión (ver Pitfall 1 en AGENTS.md).
 */

export interface IntegrityParentEdge {
  parent_id: string;
  child_id: string;
}

export interface IntegrityUnion {
  id?: string;
  person_a_id: string;
  person_b_id: string;
  union_type?: string;
  status?: string | null;
}

export type UnionIssueReason = "self" | "parent_child" | "ancestor_descendant" | "siblings";

export interface UnionIssue {
  unionId?: string;
  personAId: string;
  personBId: string;
  reason: UnionIssueReason;
}

function buildParentsIndex(parentEdges: IntegrityParentEdge[]): Map<string, string[]> {
  const parentsOf = new Map<string, string[]>();
  for (const e of parentEdges) {
    const list = parentsOf.get(e.child_id);
    if (list) {
      if (!list.includes(e.parent_id)) list.push(e.parent_id);
    } else {
      parentsOf.set(e.child_id, [e.parent_id]);
    }
  }
  return parentsOf;
}

/**
 * Devuelve el conjunto de ancestros (padres, abuelos, ...) de `personId` mediante BFS iterativo.
 */
export function getAncestorIds(
  personId: string,
  parentEdges: IntegrityParentEdge[],
  parentsIndex?: Map<string, string[]>
): Set<string> {
  const parentsOf = parentsIndex ?? buildParentsIndex(parentEdges);
  const ancestors = new Set<string>();
  const queue = [...(parentsOf.get(personId) ?? [])];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (ancestors.has(curr) || curr === personId) continue;
    ancestors.add(curr);
    for (const p of parentsOf.get(curr) ?? []) {
      if (!ancestors.has(p)) queue.push(p);
    }
  }
  return ancestors;
}

/**
 * `true` si vincular `parentId -> childId` crearía un ciclo (el progenitor propuesto es la
 * misma persona o ya desciende del hijo propuesto).
 */
export function wouldCreateParentCycle(
  parentId: string,
  childId: string,
  parentEdges: IntegrityParentEdge[]
): boolean {
  if (parentId === childId) return true;
  return getAncestorIds(parentId, parentEdges).has(childId);
}

/**
 * Clasifica una unión conyugal como biológicamente inconsistente (o `null` si es válida).
 */
export function classifyUnionIssue(
  personAId: string,
  personBId: string,
  parentEdges: IntegrityParentEdge[],
  parentsIndex?: Map<string, string[]>
): UnionIssueReason | null {
  if (personAId === personBId) return "self";
  const parentsOf = parentsIndex ?? buildParentsIndex(parentEdges);

  const parentsA = parentsOf.get(personAId) ?? [];
  const parentsB = parentsOf.get(personBId) ?? [];

  if (parentsA.includes(personBId) || parentsB.includes(personAId)) return "parent_child";
  if (parentsA.some((p) => parentsB.includes(p))) return "siblings";

  const ancestorsA = getAncestorIds(personAId, parentEdges, parentsOf);
  if (ancestorsA.has(personBId)) return "ancestor_descendant";
  const ancestorsB = getAncestorIds(personBId, parentEdges, parentsOf);
  if (ancestorsB.has(personAId)) return "ancestor_descendant";

  return null;
}

/**
 * Separa las uniones en válidas e inconsistentes. Las uniones rechazadas se ignoran por completo.
 */
export function partitionUnionsByIntegrity<U extends IntegrityUnion>(
  unions: U[],
  parentEdges: IntegrityParentEdge[]
): { validUnions: U[]; issues: UnionIssue[] } {
  const parentsIndex = buildParentsIndex(parentEdges);
  const validUnions: U[] = [];
  const issues: UnionIssue[] = [];

  for (const u of unions) {
    if (u.status === "rejected") continue;
    const reason = classifyUnionIssue(u.person_a_id, u.person_b_id, parentEdges, parentsIndex);
    if (reason) {
      issues.push({ unionId: u.id, personAId: u.person_a_id, personBId: u.person_b_id, reason });
    } else {
      validUnions.push(u);
    }
  }

  return { validUnions, issues };
}

export const UNION_ISSUE_LABELS: Record<UnionIssueReason, string> = {
  self: "unión de una persona consigo misma",
  parent_child: "registrados como pareja, pero uno es progenitor del otro",
  ancestor_descendant: "registrados como pareja, pero uno es ancestro del otro",
  siblings: "registrados como pareja, pero son hermanos (comparten progenitor)",
};
