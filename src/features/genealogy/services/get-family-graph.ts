import { createClient } from "@/lib/supabase/server";
import type { FamilyGraphData, TreeNodeData, TreeEdgeData, AccessibleTreeOption } from "../types/graph.types";
import type { Gender } from "@/types/database.types";
import type { TreePermissionTier } from "../types";
import { inferKinship } from "../utils/kinship-inference";

/**
 * Consulta la base de datos y calcula la distribución espacial por generaciones del árbol familiar,
 * centrándolo en focusPersonId (o en el usuario actual si no se especifica).
 *
 * Si se especifica `targetUserId` y es distinto al usuario actual:
 * - Se comprueba si el usuario actual tiene acceso concedido mediante `tree_access_shares`.
 * - Se activa el modo visitante / guest (`isViewerGuest: true`).
 * - Se aplica el filtro estricto según el nivel de permisos concedido:
 *   - 'basic': solo familia de casa (padres, hijos, hermanos, pareja).
 *   - 'intermediate': familia de casa + extendida (abuelos, tíos, primos, sobrinos, nietos).
 *   - 'advanced': árbol genealógico completo a libertad.
 */
export async function getFamilyGraph(
  focusPersonId?: string,
  targetUserId?: string
): Promise<FamilyGraphData> {
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
    accessibleTrees: [],
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

  // 2. Consultar árboles de amigos autorizados para el selector rápido
  let accessibleTrees: AccessibleTreeOption[] = [];
  try {
    const { data: shares } = await supabase
      .from("tree_access_shares")
      .select("granter_user_id, granter_person_id, tier")
      .eq("requester_user_id", user.id)
      .eq("status", "approved");

    if (shares && shares.length > 0) {
      const gPersonIds = shares.map((s) => s.granter_person_id);
      const { data: gPersons } = await supabase
        .from("persons")
        .select("id, first_name, middle_name, last_name, maternal_last_name")
        .in("id", gPersonIds);

      const nameMap = new Map<string, string>();
      gPersons?.forEach((gp) => {
        nameMap.set(
          gp.id,
          [gp.first_name, gp.middle_name, gp.last_name, gp.maternal_last_name]
            .filter(Boolean)
            .join(" ")
        );
      });

      accessibleTrees = shares.map((s) => ({
        targetUserId: s.granter_user_id,
        targetPersonId: s.granter_person_id,
        ownerName: nameMap.get(s.granter_person_id) || "Amigo / Familiar",
        tier: s.tier as TreePermissionTier,
      }));
    }
  } catch {
    // Si la tabla aún no se crea en la base de datos remota
    accessibleTrees = [];
  }

  // 3. Determinar si estamos en Modo Visitante (viendo el árbol de un amigo externo)
  let isViewerGuest = false;
  let viewerTier: TreePermissionTier = "advanced";
  let treeOwnerName: string | undefined = undefined;
  let defaultFriendPersonId: string | null = null;

  if (targetUserId && targetUserId !== user.id) {
    // Validar autorización de acceso
    const { data: shareData } = await supabase
      .from("tree_access_shares")
      .select("tier, status, granter_person_id")
      .eq("granter_user_id", targetUserId)
      .eq("requester_user_id", user.id)
      .eq("status", "approved")
      .maybeSingle();

    if (!shareData && !isUserZero) {
      // Sin autorización para ver este árbol
      return {
        ...emptyResult,
        accessibleTrees,
      };
    }

    isViewerGuest = true;
    viewerTier = (shareData?.tier as TreePermissionTier) || (isUserZero ? "advanced" : "basic");
    defaultFriendPersonId = shareData?.granter_person_id || null;

    // Obtener nombre del titular
    if (defaultFriendPersonId) {
      const { data: ownerPerson } = await supabase
        .from("persons")
        .select("first_name, middle_name, last_name, maternal_last_name")
        .eq("id", defaultFriendPersonId)
        .maybeSingle();

      if (ownerPerson) {
        treeOwnerName = [
          ownerPerson.first_name,
          ownerPerson.middle_name,
          ownerPerson.last_name,
          ownerPerson.maternal_last_name,
        ]
          .filter(Boolean)
          .join(" ");
      }
    }
  }

  // 4. Determinar el nodo central del árbol (Focus Person)
  let centerPersonId =
    focusPersonId && focusPersonId.trim().length > 0
      ? focusPersonId.trim()
      : isViewerGuest && defaultFriendPersonId
      ? defaultFriendPersonId
      : userPersonId;

  let { data: centerPerson } = await supabase
    .from("persons")
    .select("id, first_name, last_name, gender, birth_date, is_living, is_claimed")
    .eq("id", centerPersonId)
    .maybeSingle();

  if (!centerPerson) {
    centerPersonId = isViewerGuest && defaultFriendPersonId ? defaultFriendPersonId : userPersonId;
    const { data: fallbackPerson } = await supabase
      .from("persons")
      .select("id, first_name, last_name, gender, birth_date, is_living, is_claimed")
      .eq("id", centerPersonId)
      .single();
    centerPerson = fallbackPerson;
  }

  if (!centerPerson) {
    return {
      ...emptyResult,
      accessibleTrees,
    };
  }

  // 5. Consultar todas las aristas verticales (padres e hijos)
  const { data: allParentEdges } = await supabase
    .from("parent_child_edges")
    .select("id, parent_id, child_id, relationship_type");

  // 6. Consultar todas las uniones conyugales
  const { data: allUnions } = await supabase
    .from("union_edges")
    .select("id, person_a_id, person_b_id, union_type, status");

  // Helper para verificar si dos personas comparten hijos registrados
  const hasSharedChildren = (personA: string, personB: string): boolean => {
    const kidsA = allParentEdges?.filter((e) => e.parent_id === personA).map((e) => e.child_id) ?? [];
    const kidsB = allParentEdges?.filter((e) => e.parent_id === personB).map((e) => e.child_id) ?? [];
    return kidsA.some((id) => kidsB.includes(id));
  };

  // Filtrar uniones que deben mostrarse en el árbol genealógico
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

  // 7. Identificar relaciones directas respecto al nodo central (centerPersonId)
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

  // Parejas de hermanos
  const siblingSpouseIds: string[] = [];
  siblingIds.forEach((sibId) => {
    const sSpouses = [
      ...treeVisibleUnions.filter((u) => u.person_a_id === sibId).map((u) => u.person_b_id),
      ...treeVisibleUnions.filter((u) => u.person_b_id === sibId).map((u) => u.person_a_id),
    ];
    siblingSpouseIds.push(...sSpouses);
  });

  // Nietos (hijos de los hijos)
  let grandChildIds: string[] = [];
  if (childIds.length > 0) {
    grandChildIds = allParentEdges?.filter((e) => childIds.includes(e.parent_id)).map((e) => e.child_id) ?? [];
  }

  // Tíos (hermanos de los padres)
  let uncleAuntIds: string[] = [];
  if (grandParentIds.length > 0) {
    uncleAuntIds = Array.from(
      new Set(
        allParentEdges
          ?.filter((e) => grandParentIds.includes(e.parent_id) && !parentIds.includes(e.child_id))
          .map((e) => e.child_id) ?? []
      )
    );
  }

  // Primos hermanos (hijos de tíos)
  let cousinIds: string[] = [];
  if (uncleAuntIds.length > 0) {
    cousinIds = Array.from(
      new Set(
        allParentEdges
          ?.filter((e) => uncleAuntIds.includes(e.parent_id))
          .map((e) => e.child_id) ?? []
      )
    );
  }

  // Sobrinos (hijos de los hermanos)
  let nephewNieceIds: string[] = [];
  if (siblingIds.length > 0) {
    nephewNieceIds = Array.from(
      new Set(
        allParentEdges
          ?.filter((e) => siblingIds.includes(e.parent_id))
          .map((e) => e.child_id) ?? []
      )
    );
  }

  // 8. FILTRADO POR NIVELES DE PERMISOS:
  let allowedNodeIds: string[] = [];

  if (isViewerGuest && viewerTier === "basic") {
    // Nivel Básico: Únicamente familia de casa (Padres, Hermanos, Cónyuge, Hijos)
    allowedNodeIds = [
      centerPersonId,
      ...parentIds,
      ...childIds,
      ...spouseIds,
      ...siblingIds,
    ];
  } else if (isViewerGuest && viewerTier === "intermediate") {
    // Nivel Intermedio: Familia de casa + extendida (Abuelos, Tíos, Primos, Sobrinos, Nietos)
    allowedNodeIds = [
      centerPersonId,
      ...parentIds,
      ...childIds,
      ...spouseIds,
      ...siblingIds,
      ...grandParentIds,
      ...siblingSpouseIds,
      ...grandChildIds,
      ...uncleAuntIds,
      ...cousinIds,
      ...nephewNieceIds,
    ];
  } else {
    // Nivel Avanzado o visualización de árbol propio: Grafo completo
    allowedNodeIds = [
      centerPersonId,
      ...parentIds,
      ...grandParentIds,
      ...childIds,
      ...spouseIds,
      ...siblingIds,
      ...siblingSpouseIds,
      ...grandChildIds,
      ...uncleAuntIds,
      ...cousinIds,
      ...nephewNieceIds,
    ];
  }

  const nodeIds = Array.from(new Set(allowedNodeIds));

  // 9. Consultar los datos de todas las personas autorizadas en el grafo
  type PersonQueryResult = {
    id: string;
    first_name: string;
    middle_name?: string | null;
    last_name: string;
    maternal_last_name?: string | null;
    maiden_name: string | null;
    gender: Gender;
    birth_date: string | null;
    death_date: string | null;
    is_living: boolean;
    birth_place: string | null;
    bio: string | null;
    is_claimed: boolean;
    created_by_user_id: string | null;
  };

  let persons: PersonQueryResult[] | null = null;

  const { data: personsWithNewCols, error: personsError } = await supabase
    .from("persons")
    .select("id, first_name, middle_name, last_name, maternal_last_name, maiden_name, gender, birth_date, death_date, is_living, birth_place, bio, is_claimed, created_by_user_id")
    .in("id", nodeIds);

  if (personsError || !personsWithNewCols) {
    const { data: fallbackPersons } = await supabase
      .from("persons")
      .select("id, first_name, last_name, maiden_name, gender, birth_date, death_date, is_living, birth_place, bio, is_claimed, created_by_user_id")
      .in("id", nodeIds);

    persons = (fallbackPersons || []).map((p) => ({
      ...p,
      middle_name: null,
      maternal_last_name: null,
      gender: p.gender as Gender,
    }));
  } else {
    persons = (personsWithNewCols || []).map((p) => ({
      ...p,
      gender: p.gender as Gender,
    }));
  }

  if (!persons || persons.length === 0) {
    return {
      ...emptyResult,
      accessibleTrees,
    };
  }

  // 10. Consultar tokens de invitación (solo si es el dueño del árbol)
  let tokens: { token: string; person_id: string; status: string; expires_at: string; invited_email: string | null }[] | null = null;
  if (!isViewerGuest) {
    const { data: dbTokens } = await supabase
      .from("invitation_tokens")
      .select("token, person_id, status, expires_at, invited_email")
      .in("person_id", nodeIds)
      .order("created_at", { ascending: false });
    tokens = dbTokens;
  }

  // 11. Consultar validaciones acumuladas por persona
  const { data: endorsements } = await supabase
    .from("endorsements")
    .select("endorsed_id");

  const { count: activeUsersCount } = await supabase
    .from("persons")
    .select("id", { count: "exact", head: true })
    .eq("is_claimed", true);

  const quorumThreshold = Math.min(3, Math.max(1, activeUsersCount ?? 1));

  // Mapa de personas para inferencia de parentesco
  const personsMap = new Map<string, { id: string; firstName: string; middleName?: string | null; lastName: string; maternalLastName?: string | null; gender: Gender }>(
    persons.map((p) => [
      p.id,
      {
        id: p.id,
        firstName: p.first_name,
        middleName: p.middle_name,
        lastName: p.last_name,
        maternalLastName: p.maternal_last_name,
        gender: p.gender as Gender,
      },
    ])
  );

  // 12. Construir nodos con cálculo generacional
  const rawNodes: TreeNodeData[] = persons.map((p) => {
    let generation = 0;

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
      relationshipLabel = isViewerGuest ? "Persona Foco" : (centerPersonId === userPersonId ? "Tú" : "Persona Central");
      relationshipCategory = "self";
      relationshipExplanation = isViewerGuest ? `Árbol de ${treeOwnerName || "Amigo"}` : "Foco principal del árbol";
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
      relationshipExplanation = "Pareja de hermano/a";
    } else {
      generation = 0;
    }

    const token = tokens?.find((t) => t.person_id === p.id);
    const personValidations = endorsements?.filter((e) => e.endorsed_id === p.id).length ?? 0;

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
      middleName: p.middle_name,
      lastName: p.last_name,
      maternalLastName: p.maternal_last_name,
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
      accountEmail: isViewerGuest ? null : ((token?.invited_email && token.invited_email.trim() !== "") ? token.invited_email.trim() : null),
      parentConnections,
      invitationStatus: isViewerGuest ? null : (token?.status ?? null),
      invitationToken: isViewerGuest ? null : (token?.token ?? null),
      unionInfo,
      validationsCount: personValidations,
      validationsNeeded: quorumThreshold,
      isReadyForInvite: !isViewerGuest && (personValidations >= quorumThreshold || isUserZero),
    };
  });

  // 13. Construir las aristas relevantes
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

  // Copadres si comparten hijos y no tienen unión explícita previa
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

  // 14. Cálculo de Posiciones (Layout generacional centrado)
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
      relationshipLabel: isViewerGuest
        ? `Titular (${treeOwnerName || "Amigo"})`
        : centerPersonId === userPersonId
        ? "Tú"
        : "Familiar Seleccionado",
      isSelf: !isViewerGuest && centerPersonId === userPersonId,
    },
    availableMembers,
    isUserZero,
    viewerTier,
    isViewerGuest,
    treeOwnerName,
    accessibleTrees,
  };
}
