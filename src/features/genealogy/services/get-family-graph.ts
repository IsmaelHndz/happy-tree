import { createClient } from "@/lib/supabase/server";
import type { FamilyGraphData, TreeNodeData, TreeEdgeData } from "../types/graph.types";
import type { Gender } from "@/types/database.types";

/**
 * Consulta la base de datos y calcula la distribución espacial por generaciones del árbol familiar,
 * centrándolo en focusPersonId (o en el usuario actual si no se especifica).
 * Permite al Usuario Cero navegar y administrar libremente el árbol desde la perspectiva de cualquier familiar.
 */
export async function getFamilyGraph(focusPersonId?: string): Promise<FamilyGraphData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const emptyResult: FamilyGraphData = {
    nodes: [],
    edges: [],
    focusPerson: {
      id: "",
      firstName: "",
      lastName: "",
      gender: "unknown",
      relationshipLabel: "",
      isSelf: true,
    },
    availableMembers: [],
    isUserZero: false,
  };

  if (!user) return emptyResult;

  // 1. Obtener la ficha y rol del usuario actual
  const { data: profile } = await supabase
    .from("profiles")
    .select("person_id, is_user_zero")
    .eq("id", user.id)
    .single();

  if (!profile?.person_id) return emptyResult;
  const userPersonId = profile.person_id;
  const isUserZero = profile.is_user_zero;

  // 2. Determinar el nodo central del árbol (Focus Person)
  let centerPersonId = focusPersonId && focusPersonId.trim().length > 0 ? focusPersonId.trim() : userPersonId;

  let { data: centerPerson } = await supabase
    .from("persons")
    .select("id, first_name, last_name, gender, birth_date, is_living, is_claimed")
    .eq("id", centerPersonId)
    .maybeSingle();

  if (!centerPerson) {
    centerPersonId = userPersonId;
    const { data: fallbackPerson } = await supabase
      .from("persons")
      .select("id, first_name, last_name, gender, birth_date, is_living, is_claimed")
      .eq("id", userPersonId)
      .single();
    centerPerson = fallbackPerson;
  }

  if (!centerPerson) return emptyResult;

  // 3. Consultar la lista global de personas para el selector de perspectiva
  const { data: allPersonsList } = await supabase
    .from("persons")
    .select("id, first_name, last_name, gender")
    .order("first_name", { ascending: true });

  const availableMembers =
    allPersonsList?.map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      gender: p.gender as Gender,
      relationshipLabel: p.id === userPersonId ? "Tú" : p.id === centerPersonId ? "Nodo Activo" : "Familiar",
    })) ?? [];

  // 4. Consultar todas las aristas verticales (padres e hijos)
  const { data: allParentEdges } = await supabase
    .from("parent_child_edges")
    .select("id, parent_id, child_id, relationship_type");

  // 5. Consultar todas las uniones conyugales
  const { data: allUnions } = await supabase
    .from("union_edges")
    .select("id, person_a_id, person_b_id, union_type");

  // Personas creadas por el usuario autenticado
  const { data: createdPersons } = await supabase
    .from("persons")
    .select("id")
    .eq("created_by_user_id", user.id);

  const createdIds = createdPersons?.map((p) => p.id) ?? [];

  // 6. Identificar relaciones directas respecto al nodo central (centerPersonId)
  const parentIds = allParentEdges?.filter((e) => e.child_id === centerPersonId).map((e) => e.parent_id) ?? [];
  const childIds = allParentEdges?.filter((e) => e.parent_id === centerPersonId).map((e) => e.child_id) ?? [];

  const spouseIds = [
    ...(allUnions?.filter((u) => u.person_a_id === centerPersonId).map((u) => u.person_b_id) ?? []),
    ...(allUnions?.filter((u) => u.person_b_id === centerPersonId).map((u) => u.person_a_id) ?? []),
  ];

  // Hermanos (hijos de los padres del nodo central que no sean el nodo central)
  let siblingIds: string[] = [];
  if (parentIds.length > 0) {
    siblingIds = Array.from(
      new Set(
        allParentEdges
          ?.filter((e) => parentIds.includes(e.parent_id) && e.child_id !== centerPersonId)
          .map((e) => e.child_id) ?? []
      )
    );
  }

  // Abuelos (padres de los padres)
  const grandParentIds: string[] = [];
  if (parentIds.length > 0) {
    const gps = allParentEdges?.filter((e) => parentIds.includes(e.child_id)).map((e) => e.parent_id) ?? [];
    grandParentIds.push(...gps);
  }

  // Parejas de hermanos (para permitir visualizarlas u ocultarlas limpiamente)
  const siblingSpouseIds: string[] = [];
  siblingIds.forEach((sibId) => {
    const sSpouses = [
      ...(allUnions?.filter((u) => u.person_a_id === sibId).map((u) => u.person_b_id) ?? []),
      ...(allUnions?.filter((u) => u.person_b_id === sibId).map((u) => u.person_a_id) ?? []),
    ];
    siblingSpouseIds.push(...sSpouses);
  });

  // Todos los IDs involucrados en el subgrafo enfocado
  const nodeIds = Array.from(
    new Set([
      centerPersonId,
      ...parentIds,
      ...grandParentIds,
      ...childIds,
      ...spouseIds,
      ...siblingIds,
      ...siblingSpouseIds,
      ...createdIds,
    ])
  );

  // 7. Consultar los datos de todas las personas en el grafo
  const { data: persons } = await supabase
    .from("persons")
    .select("id, first_name, last_name, maiden_name, gender, birth_date, death_date, is_living, birth_place, bio, is_claimed, created_by_user_id")
    .in("id", nodeIds);

  if (!persons) return emptyResult;

  // 8. Consultar tokens de invitación activos
  const { data: tokens } = await supabase
    .from("invitation_tokens")
    .select("token, person_id, status, expires_at")
    .in("person_id", nodeIds);

  // 9. Consultar endosos / validaciones acumuladas por persona
  const { data: endorsements } = await supabase
    .from("endorsements")
    .select("endorsed_id");

  // Cantidad total de usuarios reclamados en la red
  const { count: activeUsersCount } = await supabase
    .from("persons")
    .select("id", { count: "exact", head: true })
    .eq("is_claimed", true);

  const quorumThreshold = Math.min(3, Math.max(1, activeUsersCount ?? 1));

  // 10. Construir la lista de nodos con su generación correspondiente
  const rawNodes: TreeNodeData[] = persons.map((p) => {
    let generation = 0;
    let relationshipLabel = "Familiar";
    let relationshipCategory: TreeNodeData["relationshipCategory"] = "sibling";

    const matchedUnion = allUnions?.find(
      (u) =>
        (u.person_a_id === centerPersonId && u.person_b_id === p.id) ||
        (u.person_b_id === centerPersonId && u.person_a_id === p.id)
    );

    const unionInfo = matchedUnion
      ? {
          id: matchedUnion.id,
          unionType: matchedUnion.union_type,
          partnerId: centerPersonId,
        }
      : null;

    if (p.id === centerPersonId) {
      generation = 0;
      relationshipLabel = centerPersonId === userPersonId ? "Tú" : "Persona Central (Foco)";
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
      relationshipCategory = "spouse";
      if (matchedUnion?.union_type === "divorced") {
        relationshipLabel = "Ex-pareja (Divorciados)";
      } else if (matchedUnion?.union_type === "separated") {
        relationshipLabel = "Ex-pareja (Separados)";
      } else if (matchedUnion?.union_type === "partner" || matchedUnion?.union_type === "civil_union") {
        relationshipLabel = "Pareja (Unión Libre)";
      } else {
        relationshipLabel = "Cónyuge / Pareja";
      }
    } else if (siblingIds.includes(p.id)) {
      generation = 0;
      relationshipLabel = p.gender === "female" ? "Hermana" : "Hermano";
      relationshipCategory = "sibling";
    } else if (siblingSpouseIds.includes(p.id)) {
      generation = 0;
      relationshipLabel = p.gender === "female" ? "Cuñada" : "Cuñado";
      relationshipCategory = "spouse";
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
      gender: p.gender as Gender,
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
      unionInfo,
      validationsCount: personValidations,
      validationsNeeded: quorumThreshold,
      isReadyForInvite: personValidations >= quorumThreshold || isUserZero,
    };
  });

  // 11. Construir las aristas relevantes
  const edges: TreeEdgeData[] = [];

  // 11.1 Aristas verticales registradas (padre -> hijo)
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

  // 11.2 Aristas horizontales de unión registradas (parejas)
  allUnions?.forEach((u) => {
    if (nodeIds.includes(u.person_a_id) && nodeIds.includes(u.person_b_id)) {
      edges.push({
        id: `union-${u.id}`,
        sourceId: u.person_a_id,
        targetId: u.person_b_id,
        type: "union",
        unionType: u.union_type,
      });
    }
  });

  // 11.3 Deducción de unión entre co-padres si comparten hijos y no tienen unión previa
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
                unionType: "married",
              });
            }
          }
        }
      }
    }
  });

  // 12. Cálculo de Posiciones (Layout generacional centrado)
  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 130;
  const GAP_X = 50;
  const GAP_Y = 150;

  const generations = [-2, -1, 0, 1];
  const positionedNodes: TreeNodeData[] = [];

  generations.forEach((gen) => {
    const genNodes = rawNodes.filter((n) => n.generation === gen);
    const count = genNodes.length;
    if (count === 0) return;

    // Ordenar generación 0: [Persona central, Pareja, Hermanos...]
    if (gen === 0) {
      genNodes.sort((a, b) => {
        if (a.relationshipCategory === "self") return -1;
        if (b.relationshipCategory === "self") return 1;
        if (a.relationshipCategory === "spouse" && spouseIds.includes(a.id)) return -0.5;
        if (b.relationshipCategory === "spouse" && spouseIds.includes(b.id)) return 0.5;
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
    focusPerson: {
      id: centerPerson.id,
      firstName: centerPerson.first_name,
      lastName: centerPerson.last_name,
      gender: centerPerson.gender as Gender,
      relationshipLabel: centerPersonId === userPersonId ? "Tú" : "Familiar Seleccionado",
      isSelf: centerPersonId === userPersonId,
    },
    availableMembers,
    isUserZero,
  };
}
