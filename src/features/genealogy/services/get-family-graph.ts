import { createClient } from "@/lib/supabase/server";
import type { FamilyGraphData, TreeNodeData, TreeEdgeData } from "../types/graph.types";
import type { Gender } from "@/types/database.types";
import { inferKinship } from "../utils/kinship-inference";

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

  // 3. Consultar todas las aristas verticales (padres e hijos)
  const { data: allParentEdges } = await supabase
    .from("parent_child_edges")
    .select("id, parent_id, child_id, relationship_type");

  // 4. Consultar todas las uniones conyugales
  const { data: allUnions } = await supabase
    .from("union_edges")
    .select("id, person_a_id, person_b_id, union_type, status");

  // Helper para verificar si dos personas comparten hijos registrados
  const hasSharedChildren = (personA: string, personB: string): boolean => {
    const kidsA = allParentEdges?.filter((e) => e.parent_id === personA).map((e) => e.child_id) ?? [];
    const kidsB = allParentEdges?.filter((e) => e.parent_id === personB).map((e) => e.child_id) ?? [];
    return kidsA.some((id) => kidsB.includes(id));
  };

  // Filtrar uniones que deben mostrarse en el árbol genealógico:
  // - Se ignoran uniones rechazadas/disueltas (status = 'rejected').
  // - Si están 'separated' o 'divorced', SOLO se muestran si tienen hijos en común.
  const isUnionVisibleInTree = (u: {
    person_a_id: string;
    person_b_id: string;
    union_type: string;
    status?: string | null;
  }): boolean => {
    if (u.status === "rejected") return false;
    const isEx = u.union_type === "separated" || u.union_type === "divorced";
    if (isEx) {
      return hasSharedChildren(u.person_a_id, u.person_b_id);
    }
    return true;
  };

  const treeVisibleUnions = allUnions?.filter(isUnionVisibleInTree) ?? [];

  // 5. Identificar relaciones directas respecto al nodo central (centerPersonId)
  const parentIds = allParentEdges?.filter((e) => e.child_id === centerPersonId).map((e) => e.parent_id) ?? [];
  const childIds = allParentEdges?.filter((e) => e.parent_id === centerPersonId).map((e) => e.child_id) ?? [];

  const spouseIds = [
    ...treeVisibleUnions.filter((u) => u.person_a_id === centerPersonId).map((u) => u.person_b_id),
    ...treeVisibleUnions.filter((u) => u.person_b_id === centerPersonId).map((u) => u.person_a_id),
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
      ...treeVisibleUnions.filter((u) => u.person_a_id === sibId).map((u) => u.person_b_id),
      ...treeVisibleUnions.filter((u) => u.person_b_id === sibId).map((u) => u.person_a_id),
    ];
    siblingSpouseIds.push(...sSpouses);
  });

  // Todos los IDs involucrados estrictamente en el subgrafo enfocado
  const nodeIds = Array.from(
    new Set([
      centerPersonId,
      ...parentIds,
      ...grandParentIds,
      ...childIds,
      ...spouseIds,
      ...siblingIds,
      ...siblingSpouseIds,
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
    .select("token, person_id, status, expires_at, invited_email")
    .in("person_id", nodeIds)
    .order("created_at", { ascending: false });

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

  // Mapa de personas para inferencia genealógica inteligente
  const personsMap = new Map<string, { id: string; firstName: string; lastName: string; gender: Gender }>(
    persons.map((p) => [
      p.id,
      {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        gender: p.gender as Gender,
      },
    ])
  );

  // 10. Construir la lista de nodos con su generación correspondiente
  const rawNodes: TreeNodeData[] = persons.map((p) => {
    let generation = 0;

    // Buscar la unión conyugal de esta persona (con la persona central o su pareja respectiva)
    const matchedUnion = allUnions?.find(
      (u) =>
        u.status !== "rejected" &&
        (u.person_a_id === p.id || u.person_b_id === p.id) &&
        (u.person_a_id === centerPersonId || u.person_b_id === centerPersonId || p.id !== centerPersonId)
    );

    const partnerId = matchedUnion
      ? matchedUnion.person_a_id === p.id
        ? matchedUnion.person_b_id
        : matchedUnion.person_a_id
      : null;

    const unionInfo = matchedUnion && partnerId
      ? {
          id: matchedUnion.id,
          unionType: matchedUnion.union_type,
          partnerId,
        }
      : null;

    // Inferencia de parentesco con respecto a la persona central enfocada
    const kinship = inferKinship({
      rootPersonId: centerPersonId,
      targetPersonId: p.id,
      targetGender: p.gender as Gender,
      parentEdges: allParentEdges ?? [],
      unions: allUnions ?? [],
      personsMap,
    });

    let relationshipLabel = kinship.relationshipLabel;
    let relationshipCategory = kinship.relationshipCategory;
    let relationshipExplanation = kinship.explanation;

    if (p.id === centerPersonId) {
      generation = 0;
      relationshipLabel = centerPersonId === userPersonId ? "Tú" : "Persona Central (Foco)";
      relationshipCategory = "self";
      relationshipExplanation = "Foco principal del árbol";
    } else if (grandParentIds.includes(p.id)) {
      generation = -2;
      relationshipCategory = "parent";
    } else if (parentIds.includes(p.id)) {
      generation = -1;
      relationshipCategory = "parent";
    } else if (childIds.includes(p.id)) {
      generation = 1;
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
      relationshipCategory = "sibling";
    } else if (siblingSpouseIds.includes(p.id)) {
      generation = 0;
      relationshipLabel = p.gender === "female" ? "Cuñada" : "Cuñado";
      relationshipCategory = "spouse";
      relationshipExplanation = "Pareja de tu hermano/a";
    } else {
      generation = 0;
    }

    const token = tokens?.find((t) => t.person_id === p.id);
    const personValidations = endorsements?.filter((e) => e.endorsed_id === p.id).length ?? 0;

    // Conexiones de progenitores directos
    const personParents = allParentEdges?.filter((e) => e.child_id === p.id) ?? [];
    const parentConnections = personParents.map((e) => {
      const parentObj = personsMap.get(e.parent_id);
      return {
        id: e.id,
        parentId: e.parent_id,
        parentName: parentObj ? `${parentObj.firstName} ${parentObj.lastName}` : "Progenitor",
        relationshipType: e.relationship_type || "biological",
      };
    });

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
      relationshipExplanation,
      accountEmail: token?.invited_email ?? null,
      parentConnections,
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

  // 11.2 Aristas horizontales de unión registradas (parejas visibles en árbol)
  treeVisibleUnions.forEach((u) => {
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

    // Ordenar generación 0: [Pareja de self, Self, Hermanos, Parejas de hermanos]
    // Esto garantiza que el grupo de hermanos quede contiguo y que la horquilla parental
    // descienda exclusivamente sobre los hermanos sin atravesar tarjetas de parejas.
    if (gen === 0) {
      genNodes.sort((a, b) => {
        const getRank = (n: typeof rawNodes[0]) => {
          if (n.relationshipCategory === "spouse" && spouseIds.includes(n.id)) return 1;
          if (n.relationshipCategory === "self") return 2;
          if (n.relationshipCategory === "sibling") return 3;
          if (n.relationshipCategory === "spouse" && siblingSpouseIds.includes(n.id)) return 4;
          return 5;
        };
        return getRank(a) - getRank(b);
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

  // Miembros para accesos rápidos en el explorador (círculo cercano del árbol activo)
  const availableMembers = Array.from(
    new Map(
      positionedNodes.map((n) => [
        n.id,
        {
          id: n.id,
          firstName: n.firstName,
          lastName: n.lastName,
          gender: n.gender,
          relationshipLabel: n.relationshipLabel || "Familiar",
        },
      ])
    ).values()
  );

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
