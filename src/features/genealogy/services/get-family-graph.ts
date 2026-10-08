import { createClient } from "@/lib/supabase/server";
import type { FamilyGraphData, TreeNodeData, TreeEdgeData, AccessibleTreeOption } from "../types/graph.types";
import type { Gender } from "@/types/database.types";
import type { TreePermissionTier } from "../types";
import { inferKinship, getConnectedFamilyIds } from "../utils/kinship-inference";
import { partitionUnionsByIntegrity } from "../utils/graph-integrity";
import { computeTreeLayout } from "../utils/tree-layout";
import { parseLayoutRules } from "../utils/layout-crossings";
import { assignGenerations, selectVisibleNodeIds } from "../utils/visible-nodes";
import { isMissingColumnError, MISSING_NAME_COLUMNS_MESSAGE } from "../utils/db-errors";
import { formatFullName } from "../types";
import { DEFAULT_TREE_SCOPE, tierForScope, type TreeScope } from "../utils/tree-scope";

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
  targetUserId?: string,
  // Alcance que la persona eligió para su propio árbol (los invitados usan el nivel compartido)
  scope: TreeScope = DEFAULT_TREE_SCOPE
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
  // Dueño del acomodo que se aplica: el propio, o el del titular cuando se ve como invitado
  let layoutOwnerUserId = user.id;

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
    layoutOwnerUserId = targetUserId;
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

  // 4. Consultar todas las aristas verticales (padres e hijos) y uniones conyugales
  const { data: allParentEdges } = await supabase
    .from("parent_child_edges")
    .select("id, parent_id, child_id, relationship_type").neq("status", "rejected");

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

  const rawTreeVisibleUnions = allUnions?.filter(isUnionVisibleInTree) ?? [];

  // Saneamiento biológico: filtrar uniones imposibles (p. ej. madre-hijo o entre hermanos)
  const biologicalParentEdges = (allParentEdges ?? [])
    .filter((e) => e.relationship_type !== "step")
    .map((e) => ({
      parent_id: e.parent_id,
      child_id: e.child_id,
    }));

  const { validUnions: saneUnions } = partitionUnionsByIntegrity(
    rawTreeVisibleUnions,
    biologicalParentEdges
  );

  const treeVisibleUnions = saneUnions;

  // Red familiar propia del usuario activo (componente conectado)
  const userFamilyIds = getConnectedFamilyIds(
    userPersonId,
    allParentEdges ?? [],
    treeVisibleUnions
  );

  // 5. Determinar el nodo central del árbol (Focus Person) y validar autorización estricta
  let centerPersonId = userPersonId;

  // Personas que un invitado puede ver: lo que su nivel permite a partir del titular del árbol.
  // Impide centrar el árbol en alguien fuera de ese alcance (p. ej. ?friendId=…&focus=<cualquier id>)
  // y recorta lo que se carga cuando navega a otro familiar dentro del alcance.
  let grantedNodeIds: Set<string> | null = null;
  const grantFor = (rootPersonId: string, tier: TreePermissionTier) =>
    new Set(
      selectVisibleNodeIds({
        centerPersonId: rootPersonId,
        parentEdges: allParentEdges ?? [],
        unions: treeVisibleUnions,
        tier,
      }).nodeIds
    );

  if (isViewerGuest && defaultFriendPersonId) {
    const requested = focusPersonId?.trim();
    if (isUserZero) {
      centerPersonId = requested || defaultFriendPersonId;
    } else {
      grantedNodeIds = grantFor(defaultFriendPersonId, viewerTier);
      centerPersonId = requested && grantedNodeIds.has(requested) ? requested : defaultFriendPersonId;
    }
  } else if (focusPersonId && focusPersonId.trim().length > 0) {
    const reqFocus = focusPersonId.trim();

    if (isUserZero) {
      // Usuario Cero (Administrador) puede auditar cualquier persona de la plataforma
      centerPersonId = reqFocus;
    } else if (userFamilyIds.has(reqFocus)) {
      // Usuario regular navegando por un familiar dentro de su propio árbol
      centerPersonId = reqFocus;
    } else {
      // Si la persona solicitada pertenece a un árbol de amigos compartido aprobado
      const matchingShare = accessibleTrees.find(
        (t) => t.targetPersonId === reqFocus || t.targetUserId === reqFocus
      );

      if (matchingShare) {
        isViewerGuest = true;
        layoutOwnerUserId = matchingShare.targetUserId;
        viewerTier = matchingShare.tier;
        treeOwnerName = matchingShare.ownerName;
        grantedNodeIds = grantFor(matchingShare.targetPersonId, viewerTier);
        centerPersonId = grantedNodeIds.has(reqFocus) ? reqFocus : matchingShare.targetPersonId;
      } else {
        // ACCESO DENEGADO A ÁRBOL AJENO SIN PERMISO:
        // Evitar que usuarios externos vean árboles a los que no tienen autorización concedida
        centerPersonId = userPersonId;
      }
    }
  }

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

  // 7-8. Personas visibles según el nodo central y el nivel de permisos (lógica pura en utils/visible-nodes.ts)
  const {
    nodeIds: tierNodeIds,
    parentIds,
    childIds,
    spouseIds,
    siblingIds,
    grandParentIds,
    siblingSpouseIds,
    uncleAuntIds,
    uncleSpouseIds,
    nephewNieceIds,
  } = selectVisibleNodeIds({
    centerPersonId,
    parentEdges: allParentEdges ?? [],
    unions: treeVisibleUnions,
    tier: isViewerGuest ? viewerTier ?? "basic" : tierForScope(scope),
  });
  const nodeIds = grantedNodeIds ? tierNodeIds.filter((id) => grantedNodeIds.has(id)) : tierNodeIds;


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
    if (isMissingColumnError(personsError)) console.error(MISSING_NAME_COLUMNS_MESSAGE);
    else console.error("getFamilyGraph: error consultando persons", personsError);
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

  // 12. Motor Topológico de Generaciones por BFS a partir del nodo central (centerPersonId = 0)
  const genMap = assignGenerations({
    centerPersonId,
    parentEdges: allParentEdges ?? [],
    unions: treeVisibleUnions,
  });

  // 13. Construir nodos con cálculo generacional exacto y afinidades
  const rawNodes: TreeNodeData[] = persons.map((p) => {
    const generation = genMap.get(p.id) ?? 0;

    const matchedUnion = saneUnions.find(
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
      unions: treeVisibleUnions,
      personsMap,
    });

    let relationshipLabel = kinship.relationshipLabel;
    let relationshipCategory = kinship.relationshipCategory;
    let relationshipExplanation = kinship.explanation;

    if (p.id === centerPersonId) {
      relationshipLabel = isViewerGuest ? "Persona Foco" : (centerPersonId === userPersonId ? "Tú" : "Persona Central");
      relationshipCategory = "self";
      relationshipExplanation = isViewerGuest ? `Árbol de ${treeOwnerName || "Amigo"}` : "Foco principal del árbol";
    } else if (parentIds.includes(p.id)) {
      relationshipCategory = "parent";
    } else if (grandParentIds.includes(p.id)) {
      // Abuelos no deben ser considerados 'parent' inmediato para no contaminar filtros de padres del usuario
      relationshipCategory = "other";
    } else if (childIds.includes(p.id)) {
      relationshipCategory = "child";
    } else if (spouseIds.includes(p.id)) {
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
      relationshipCategory = "sibling";
    } else if (siblingSpouseIds.includes(p.id)) {
      relationshipLabel = p.gender === "female" ? "Cuñada" : "Cuñado";
      relationshipCategory = "spouse";
      relationshipExplanation = "Pareja de hermano/a";
    } else if (uncleAuntIds.includes(p.id)) {
      relationshipCategory = "other";
    } else if (uncleSpouseIds.includes(p.id)) {
      relationshipLabel = p.gender === "female" ? "Tía política" : "Tío político";
      relationshipCategory = "other";
      relationshipExplanation = "Pareja de tío/a";
    } else if (nephewNieceIds.includes(p.id)) {
      relationshipCategory = "other";
    }

    const token = tokens?.find((t) => t.person_id === p.id);
    const personValidations = endorsements?.filter((e) => e.endorsed_id === p.id).length ?? 0;

    const personParents = allParentEdges?.filter((e) => e.child_id === p.id) ?? [];
    const parentConnections = personParents.map((e) => {
      const parentObj = personsMap.get(e.parent_id);
      return {
        id: e.id,
        parentId: e.parent_id,
        parentName: parentObj ? formatFullName(parentObj) : "Progenitor",
        relationshipType: e.relationship_type || "biological",
      };
    });

    const personChildren = allParentEdges?.filter((e) => e.parent_id === p.id) ?? [];
    const childConnections = personChildren.map((e) => {
      const childObj = personsMap.get(e.child_id);
      return {
        id: e.id,
        childId: e.child_id,
        childName: childObj ? formatFullName(childObj) : "Descendiente",
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
      childConnections,
      invitationStatus: isViewerGuest ? null : (token?.status ?? null),
      invitationToken: isViewerGuest ? null : (token?.token ?? null),
      unionInfo,
      validationsCount: personValidations,
      validationsNeeded: quorumThreshold,
      isReadyForInvite: !isViewerGuest && (personValidations >= quorumThreshold || isUserZero),
    };
  });

  // 14. Construir las aristas relevantes
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

  // Únicamente uniones conyugales explícitas registradas en base de datos
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

  // 15. Cálculo de Posiciones Dinámicas mediante TreeLayout (Baricéntrico + Bilateral Simétrico + Multi-Pareja)
  const layoutInputNodes = rawNodes.map((n) => ({
    id: n.id,
    generation: n.generation,
    gender: n.gender,
    birthDate: n.birthDate,
    firstName: n.firstName,
  }));

  const layoutInputEdges = edges
    .filter((e) => e.type === "parent-child" || e.type === "union")
    .map((e) => ({
      sourceId: e.sourceId,
      targetId: e.targetId,
      type: e.type as "parent-child" | "union",
    }));

  // Acomodo manual guardado (si la migración 20261008000000 aún no está aplicada, no hay reglas)
  const { data: layoutPreference } = await supabase
    .from("layout_preferences")
    .select("rules")
    .eq("user_id", layoutOwnerUserId)
    .maybeSingle();
  const layoutRules = parseLayoutRules(layoutPreference?.rules);

  const positions = computeTreeLayout({
    nodes: layoutInputNodes,
    edges: layoutInputEdges,
    focusId: centerPersonId,
    rules: layoutRules,
  });

  const positionedNodes: TreeNodeData[] = rawNodes.map((node) => {
    const pos = positions.get(node.id);
    return {
      ...node,
      x: pos ? pos.x : 0,
      y: pos ? pos.y : (node.generation ?? 0) * (130 + 150),
    };
  });

  const availableMembers = Array.from(
    new Map(
      positionedNodes.map((n) => [
        n.id,
        {
          id: n.id,
          firstName: n.firstName,
          middleName: n.middleName,
          lastName: n.lastName,
          maternalLastName: n.maternalLastName,
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
      middleName: personsMap.get(centerPerson.id)?.middleName ?? null,
      lastName: centerPerson.last_name,
      maternalLastName: personsMap.get(centerPerson.id)?.maternalLastName ?? null,
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
    scope: isViewerGuest ? undefined : scope,
    layoutRules,
    layoutOwnerUserId,
    treeOwnerName,
    accessibleTrees,
  };
}
