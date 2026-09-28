import { createClient } from "@/lib/supabase/server";
import type { FamilyGraphData, TreeNodeData, TreeEdgeData } from "../types/graph.types";

/**
 * Consulta la base de datos y calcula la distribución espacial por generaciones del árbol familiar.
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

  // Todos los IDs involucrados en el subgrafo
  const nodeIds = Array.from(
    new Set([currentPersonId, ...parentIds, ...grandParentIds, ...childIds, ...spouseIds, ...siblingIds])
  );

  // 5. Consultar los datos de todas las personas en el grafo
  const { data: persons } = await supabase
    .from("persons")
    .select("id, first_name, last_name, gender, birth_date, is_living, is_claimed")
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
    }

    const token = tokens?.find((t) => t.person_id === p.id);
    const personValidations = endorsements?.filter((e) => e.endorsed_id === p.id).length ?? 0;

    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      gender: p.gender,
      birthDate: p.birth_date,
      isLiving: p.is_living,
      isClaimed: p.is_claimed,
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

  // 10. Cálculo de Posiciones (Layout generacional en grilla centrada)
  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 130;
  const GAP_X = 50;
  const GAP_Y = 140;

  // Agrupar por generación (-2, -1, 0, 1)
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
