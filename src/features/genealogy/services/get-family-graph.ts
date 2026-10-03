import { createClient } from "@/lib/supabase/server";
import type { FamilyGraphData, TreeNodeData, TreeEdgeData } from "../types/graph.types";

/**
 * Consulta la base de datos y calcula la distribución espacial por generaciones del árbol familiar,
 * deduciendo automáticamente uniones conyugales entre co-padres que comparten hijos.
 */
export async function getFamilyGraph(): Promise<FamilyGraphData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { nodes: [], edges: [] };

  // 1. Obtener la ficha del usuario actual
  const { data: profile } = await supabase
    .from("profiles")
    .select("person_id, is_user_zero")
    .eq("id", user.id)
    .single();

  if (!profile?.person_id) return { nodes: [], edges: [] };
  const currentPersonId = profile.person_id;

  // 2. Consultar ficha del usuario actual
  const { data: selfPerson } = await supabase
    .from("persons")
    .select("id, first_name, last_name, gender, birth_date, is_living, is_claimed")
    .eq("id", currentPersonId)
    .single();

  if (!selfPerson) return { nodes: [], edges: [] };

  // 3. Consultar todas las aristas verticales (padres e hijos)
  const { data: allParentEdges } = await supabase
    .from("parent_child_edges")
    .select("id, parent_id, child_id, relationship_type");

  // 4. Consultar todas las uniones conyugales
  const { data: allUnions } = await supabase
    .from("union_edges")
    .select("id, person_a_id, person_b_id, union_type");

  // Personas creadas por el usuario
  const { data: createdPersons } = await supabase
    .from("persons")
    .select("id")
    .eq("created_by_user_id", user.id);

  const createdIds = createdPersons?.map((p) => p.id) ?? [];

  // Identificar relaciones directas respecto al usuario actual
  const parentIds = allParentEdges?.filter((e) => e.child_id === currentPersonId).map((e) => e.parent_id) ?? [];
  const childIds = allParentEdges?.filter((e) => e.parent_id === currentPersonId).map((e) => e.child_id) ?? [];
  
  const spouseIds = [
    ...(allUnions?.filter((u) => u.person_a_id === currentPersonId).map((u) => u.person_b_id) ?? []),
    ...(allUnions?.filter((u) => u.person_b_id === currentPersonId).map((u) => u.person_a_id) ?? []),
  ];

  // Hermanos (hijos de mis padres que no sean yo)
  let siblingIds: string[] = [];
  if (parentIds.length > 0) {
    siblingIds = Array.from(
      new Set(
        allParentEdges
          ?.filter((e) => parentIds.includes(e.parent_id) && e.child_id !== currentPersonId)
          .map((e) => e.child_id) ?? []
      )
    );
  }

  // Abuelos (padres de mis padres)
  const grandParentIds: string[] = [];
  if (parentIds.length > 0) {
    const gps = allParentEdges?.filter((e) => parentIds.includes(e.child_id)).map((e) => e.parent_id) ?? [];
    grandParentIds.push(...gps);
  }

  // Todos los IDs involucrados en el subgrafo (incluyendo personas creadas por el usuario)
  const nodeIds = Array.from(
    new Set([
      currentPersonId,
      ...parentIds,
      ...grandParentIds,
      ...childIds,
      ...spouseIds,
      ...siblingIds,
      ...createdIds,
    ])
  );

  // 5. Consultar los datos de todas las personas en el grafo
  const { data: persons } = await supabase
    .from("persons")
    .select("id, first_name, last_name, maiden_name, gender, birth_date, death_date, is_living, birth_place, bio, is_claimed, created_by_user_id")
    .in("id", nodeIds);

  if (!persons) return { nodes: [], edges: [] };

  // 6. Consultar tokens de invitación activos
  const { data: tokens } = await supabase
    .from("invitation_tokens")
    .select("token, person_id, status, expires_at")
    .in("person_id", nodeIds);

  // 7. Consultar endosos / validaciones acumuladas por persona
  const { data: endorsements } = await supabase
    .from("endorsements")
    .select("endorsed_id");

  // Cantidad total de usuarios reclamados en la red (para quorum adaptativo)
  const { count: activeUsersCount } = await supabase
    .from("persons")
    .select("id", { count: "exact", head: true })
    .eq("is_claimed", true);

  const quorumThreshold = Math.min(3, Math.max(1, activeUsersCount ?? 1));

  // 8. Construir la lista de nodos con su generación correspondiente
  const rawNodes: TreeNodeData[] = persons.map((p) => {
    let generation = 0;
    let relationshipLabel = "Familiar";
    let relationshipCategory: TreeNodeData["relationshipCategory"] = "sibling";

    if (p.id === currentPersonId) {
      generation = 0;
      relationshipLabel = "Tú (Usuario Actual)";
      relationshipCategory = "self";
    } else if (grandParentIds.includes(p.id)) {
      generation = -2;
      relationshipLabel = p.gender === "female" ? "Abuela" : "Abuelo";
      relationshipCategory = "parent";
    } else if (parentIds.includes(p.id)) {
      generation = -1;
      relationshipLabel = p.gender === "female" ? "Madre" : "Padre";
      relationshipCategory = "parent";
    } else if (childIds.includes(p.id)) {
      generation = 1;
      relationshipLabel = p.gender === "female" ? "Hija" : "Hijo";
      relationshipCategory = "child";
    } else if (spouseIds.includes(p.id)) {
      generation = 0;
      relationshipLabel = "Cónyuge / Pareja";
      relationshipCategory = "spouse";
    } else if (siblingIds.includes(p.id)) {
      generation = 0;
      relationshipLabel = p.gender === "female" ? "Hermana" : "Hermano";
      relationshipCategory = "sibling";
    } else {
      generation = 0;
      relationshipLabel = p.gender === "female" ? "Familiar (Femenino)" : "Familiar (Masculino)";
      relationshipCategory = "sibling";
    }

    const token = tokens?.find((t) => t.person_id === p.id);
    const personValidations = endorsements?.filter((e) => e.endorsed_id === p.id).length ?? 0;

    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      maidenName: p.maiden_name,
      gender: p.gender,
      birthDate: p.birth_date,
      deathDate: p.death_date,
      isLiving: p.is_living,
      birthPlace: p.birth_place,
      bio: p.bio,
      isClaimed: p.is_claimed,
      createdByUserId: p.created_by_user_id,
      generation,
      relationshipLabel,
      relationshipCategory,
      invitationStatus: token?.status ?? null,
      invitationToken: token?.token ?? null,
      validationsCount: personValidations,
      validationsNeeded: quorumThreshold,
      isReadyForInvite: personValidations >= quorumThreshold || profile.is_user_zero,
    };
  });

  // 9. Filtrar y construir las aristas relevantes
  const edges: TreeEdgeData[] = [];

  // 9.1 Aristas verticales registradas (padre -> hijo)
  allParentEdges?.forEach((e) => {
    if (nodeIds.includes(e.parent_id) && nodeIds.includes(e.child_id)) {
      edges.push({
        id: `pc-${e.id}`,
        sourceId: e.parent_id,
        targetId: e.child_id,
        type: "parent-child",
      });
    }
  });

  // 9.2 Aristas horizontales de unión registradas (parejas)
  allUnions?.forEach((u) => {
    if (nodeIds.includes(u.person_a_id) && nodeIds.includes(u.person_b_id)) {
      edges.push({
        id: `union-${u.id}`,
        sourceId: u.person_a_id,
        targetId: u.person_b_id,
        type: "union",
      });
    }
  });

  // 9.3 DEDUCCIÓN AUTOMÁTICA DE UNIÓN ENTRE CO-PADRES:
  // Si dos personas son progenitores del mismo hijo (ej. Juan y Ana con Lyndsay),
  // y no tienen aún un registro en union_edges, deducimos su unión conyugal en el grafo.
  const childToParents = new Map<string, string[]>();
  allParentEdges?.forEach((e) => {
    const list = childToParents.get(e.child_id) || [];
    if (!list.includes(e.parent_id)) list.push(e.parent_id);
    childToParents.set(e.child_id, list);
  });

  childToParents.forEach((pList) => {
    if (pList.length >= 2) {
      for (let i = 0; i < pList.length; i++) {
        for (let j = i + 1; j < pList.length; j++) {
          const pA = pList[i];
          const pB = pList[j];
          if (nodeIds.includes(pA) && nodeIds.includes(pB)) {
            const alreadyExists = edges.some(
              (ed) =>
                ed.type === "union" &&
                ((ed.sourceId === pA && ed.targetId === pB) ||
                  (ed.sourceId === pB && ed.targetId === pA))
            );
            if (!alreadyExists) {
              edges.push({
                id: `coparent-${pA}-${pB}`,
                sourceId: pA,
                targetId: pB,
                type: "union",
              });
            }
          }
        }
      }
    }
  });

  // 10. Cálculo de Posiciones (Layout generacional en grilla centrada)
  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 130;
  const GAP_X = 50;
  const GAP_Y = 140;

  const generations = [-2, -1, 0, 1];
  const positionedNodes: TreeNodeData[] = [];

  generations.forEach((gen) => {
    const genNodes = rawNodes.filter((n) => n.generation === gen);
    const count = genNodes.length;
    if (count === 0) return;

    // Ordenar generación 0 para que el usuario esté junto a su pareja
    if (gen === 0) {
      genNodes.sort((a, b) => {
        if (a.relationshipCategory === "self") return -1;
        if (b.relationshipCategory === "self") return 1;
        if (a.relationshipCategory === "spouse") return -0.5;
        if (b.relationshipCategory === "spouse") return 0.5;
        return 0;
      });
    }

    const totalWidth = count * NODE_WIDTH + (count - 1) * GAP_X;
    const startX = -totalWidth / 2;
    const y = (gen + 1) * (NODE_HEIGHT + GAP_Y);

    genNodes.forEach((node, index) => {
      const x = startX + index * (NODE_WIDTH + GAP_X);
      positionedNodes.push({
        ...node,
        x,
        y,
      });
    });
  });

  return {
    nodes: positionedNodes,
    edges,
  };
}
