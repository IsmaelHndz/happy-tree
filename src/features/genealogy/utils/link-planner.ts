/**
 * PLANIFICADOR DE VÍNCULOS MANUALES (puro, sin dependencias de servidor)
 *
 * Dado un par de personas (A, B) y la relación "A es ___ de B", valida el vínculo contra el grafo
 * actual y devuelve un plan explícito: qué aristas se crean, qué progenitores se podrían quitar,
 * advertencias y errores. El usuario confirma vínculo por vínculo; nada se infiere en silencio.
 */
import { classifyUnionIssue, wouldCreateParentCycle } from "./graph-integrity";
import { parentsToReplace } from "./parent-replacement";

export type LinkRelation =
  | "parent"
  | "child"
  | "sibling_both"
  | "sibling_maternal"
  | "sibling_paternal"
  | "married"
  | "partner"
  | "divorced"
  | "separated";

export const LINK_RELATION_LABELS: Record<LinkRelation, string> = {
  parent: "es padre/madre de",
  child: "es hijo/a de",
  sibling_both: "es hermano/a (mismos padres) de",
  sibling_maternal: "es medio hermano/a por parte de madre de",
  sibling_paternal: "es medio hermano/a por parte de padre de",
  married: "es esposo/a de",
  partner: "es pareja (unión libre) de",
  divorced: "es expareja (divorciados) de",
  separated: "es expareja (separados) de",
};

const UNION_LABELS: Record<string, string> = {
  married: "casados",
  partner: "unión libre",
  civil_union: "unión civil",
  divorced: "divorciados",
  separated: "separados",
};

export interface PlannerPerson {
  id: string;
  name: string;
  gender: string | null;
  /** true si la ficha está reclamada por OTRA cuenta (no se puede modificar) */
  lockedByOther: boolean;
}

export interface PlannerParentEdge {
  id?: string;
  parent_id: string;
  child_id: string;
}

export interface PlannerUnion {
  id?: string;
  person_a_id: string;
  person_b_id: string;
  union_type: string;
  status?: string | null;
}

export interface ReplaceOption {
  key: string; // `${parentId}:${childId}`
  parentId: string;
  childId: string;
  label: string;
  suggested: boolean;
}

export interface LinkPlan {
  errors: string[];
  warnings: string[];
  steps: string[];
  addParentEdges: { parentId: string; childId: string }[];
  union: { personAId: string; personBId: string; unionType: string; existingUnionId?: string } | null;
  replaceOptions: ReplaceOption[];
}

export function planLink({
  personAId,
  personBId,
  relation,
  persons,
  parentEdges,
  unions,
}: {
  personAId: string;
  personBId: string;
  relation: LinkRelation;
  persons: Map<string, PlannerPerson>;
  parentEdges: PlannerParentEdge[];
  unions: PlannerUnion[];
}): LinkPlan {
  const plan: LinkPlan = { errors: [], warnings: [], steps: [], addParentEdges: [], union: null, replaceOptions: [] };
  const A = persons.get(personAId);
  const B = persons.get(personBId);

  if (!A || !B) {
    plan.errors.push("No se encontró a una de las personas seleccionadas.");
    return plan;
  }
  if (A.id === B.id) {
    plan.errors.push("Elige dos personas distintas.");
    return plan;
  }

  const first = (p: PlannerPerson) => p.name.split(" ")[0];
  const nameOf = (id: string) => persons.get(id)?.name ?? "Familiar";
  const parentsOf = (id: string) => parentEdges.filter((e) => e.child_id === id).map((e) => e.parent_id);
  const activeUnions = unions.filter((u) => u.status !== "rejected");
  const unionBetween = (x: string, y: string) =>
    activeUnions.find(
      (u) => (u.person_a_id === x && u.person_b_id === y) || (u.person_a_id === y && u.person_b_id === x)
    );

  // ---------------------------------------------------------------------------
  // Uniones de pareja
  // ---------------------------------------------------------------------------
  if (relation === "married" || relation === "partner" || relation === "divorced" || relation === "separated") {
    if (A.lockedByOther || B.lockedByOther) {
      const locked = A.lockedByOther ? A : B;
      plan.errors.push(`${locked.name} ya reclamó su ficha; solo esa persona puede registrar sus parejas.`);
      return plan;
    }

    const issue = classifyUnionIssue(A.id, B.id, parentEdges);
    if (issue === "parent_child") plan.errors.push(`${first(A)} y ${first(B)} están registrados como padre/madre e hijo/a.`);
    else if (issue === "ancestor_descendant") plan.errors.push(`Uno de ellos es ancestro del otro (abuelo/a, bisabuelo/a…).`);
    else if (issue === "siblings") plan.errors.push(`${first(A)} y ${first(B)} están registrados como hermanos.`);
    if (plan.errors.length > 0) return plan;

    const existing = unionBetween(A.id, B.id);
    if (existing && existing.union_type === relation) {
      plan.errors.push(`Ya están registrados como pareja (${UNION_LABELS[relation]}).`);
      return plan;
    }

    plan.union = { personAId: A.id, personBId: B.id, unionType: relation, existingUnionId: existing?.id };
    plan.steps.push(
      existing
        ? `Cambiar la unión de ${first(A)} y ${first(B)}: de ${UNION_LABELS[existing.union_type] ?? existing.union_type} a ${UNION_LABELS[relation]}.`
        : `Registrar a ${A.name} y ${B.name} como pareja (${UNION_LABELS[relation]}).`
    );
    if (relation === "divorced" || relation === "separated") {
      const sharesChildren = parentEdges.some(
        (e) => e.parent_id === A.id && parentEdges.some((f) => f.parent_id === B.id && f.child_id === e.child_id)
      );
      if (!sharesChildren) {
        plan.warnings.push("Las exparejas sin hijos en común no se dibujan en el árbol (el vínculo sí queda guardado).");
      }
    }
    return plan;
  }

  // ---------------------------------------------------------------------------
  // Vínculos verticales (padre/madre, hijo/a, hermanos)
  // ---------------------------------------------------------------------------
  let edgesToAdd: { parentId: string; childId: string }[] = [];

  if (relation === "parent" || relation === "child") {
    const parent = relation === "parent" ? A : B;
    const child = relation === "parent" ? B : A;
    edgesToAdd = [{ parentId: parent.id, childId: child.id }];
  } else {
    // Hermanos: quien no tiene los progenitores elegidos los recibe del otro
    const pickParents = (id: string) => {
      const ps = parentsOf(id);
      if (relation === "sibling_maternal") return ps.filter((p) => persons.get(p)?.gender === "female").slice(0, 1);
      if (relation === "sibling_paternal") return ps.filter((p) => persons.get(p)?.gender === "male").slice(0, 1);
      return ps;
    };

    let source = B;
    let target = A;
    if (pickParents(B.id).length === 0 && pickParents(A.id).length > 0) {
      source = A;
      target = B;
    }
    const sourceParents = pickParents(source.id);

    if (sourceParents.length === 0) {
      const which =
        relation === "sibling_maternal" ? "madre" : relation === "sibling_paternal" ? "padre" : "padres";
      plan.errors.push(
        `Ninguno de los dos tiene ${which === "padres" ? "padres registrados" : `${which} registrada(o)`}. Registra primero ${
          which === "padres" ? "a sus padres" : `a su ${which}`
        } y luego vincúlalos como hermanos.`
      );
      return plan;
    }

    edgesToAdd = sourceParents
      .filter((p) => !parentsOf(target.id).includes(p))
      .map((p) => ({ parentId: p, childId: target.id }));

    if (edgesToAdd.length === 0) {
      plan.errors.push(`${first(A)} y ${first(B)} ya comparten esos progenitores.`);
      return plan;
    }
  }

  for (const { parentId, childId } of edgesToAdd) {
    const parent = persons.get(parentId);
    const child = persons.get(childId);
    if (!parent || !child) continue;

    if (child.lockedByOther) {
      plan.errors.push(`${child.name} ya reclamó su ficha; solo esa persona puede cambiar sus progenitores.`);
      continue;
    }
    if (parentsOf(childId).includes(parentId)) {
      plan.errors.push(`${parent.name} ya está registrado como progenitor de ${child.name}.`);
      continue;
    }
    if (wouldCreateParentCycle(parentId, childId, parentEdges)) {
      plan.errors.push(`${first(child)} es ancestro de ${first(parent)}; no puede ser su hijo/a.`);
      continue;
    }
    if (unionBetween(parentId, childId)) {
      plan.errors.push(`${first(parent)} y ${first(child)} están registrados como pareja.`);
      continue;
    }
    const parentParents = parentsOf(parentId);
    if (parentsOf(childId).some((p) => parentParents.includes(p))) {
      plan.errors.push(`${first(parent)} y ${first(child)} están registrados como hermanos.`);
      continue;
    }

    plan.addParentEdges.push({ parentId, childId });
    plan.steps.push(`${parent.name} será ${parent.gender === "female" ? "madre" : parent.gender === "male" ? "padre" : "progenitor/a"} de ${child.name}.`);

    // Progenitores actuales del hijo que podrían sobrar
    const incoming = edgesToAdd.filter((e) => e.childId === childId).map((e) => e.parentId);
    const current = parentsOf(childId)
      .filter((p) => !incoming.includes(p))
      .map((p) => ({ id: p, gender: persons.get(p)?.gender ?? null }));
    const suggested = new Set(parentsToReplace(parent.gender, current).map((p) => p.id));

    current.forEach((p) => {
      const key = `${p.id}:${childId}`;
      if (plan.replaceOptions.some((o) => o.key === key)) return;
      plan.replaceOptions.push({
        key,
        parentId: p.id,
        childId,
        label: `Quitar a ${nameOf(p.id)} como progenitor/a de ${first(child)}`,
        suggested: suggested.has(p.id),
      });
    });

    if (current.length + incoming.length > 2 && suggested.size === 0) {
      plan.warnings.push(`${first(child)} quedaría con más de dos progenitores. Marca abajo a quién quitar si alguno es un error.`);
    }
  }

  return plan;
}
