import type { Gender } from "@/types/database.types";

export interface KinshipPersonMeta {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender;
}

export interface ParentChildEdgeMeta {
  parent_id: string;
  child_id: string;
  relationship_type?: string;
}

export interface UnionEdgeMeta {
  id?: string;
  person_a_id: string;
  person_b_id: string;
  union_type: string;
  status?: string | null;
}

export interface InferredKinship {
  relationshipLabel: string;
  relationshipCategory: "self" | "parent" | "child" | "sibling" | "spouse" | "other";
  explanation?: string;
  degree?: number;
  isSuggestion?: boolean;
}

/**
 * Motor de Inferencia Inteligente de Parentescos (Kinship Inference Engine)
 * Deduce las relaciones genealógicas y familiares entre una persona raíz y cualquier otra persona en la red.
 */
export function inferKinship({
  rootPersonId,
  targetPersonId,
  targetGender,
  parentEdges,
  unions,
  personsMap,
}: {
  rootPersonId: string;
  targetPersonId: string;
  targetGender: Gender;
  parentEdges: ParentChildEdgeMeta[];
  unions: UnionEdgeMeta[];
  personsMap?: Map<string, KinshipPersonMeta>;
}): InferredKinship {
  const isFemale = targetGender === "female";
  const isMale = targetGender === "male";

  // 1. Identidad propia
  if (rootPersonId === targetPersonId) {
    return {
      relationshipLabel: "Tú",
      relationshipCategory: "self",
      explanation: "Nodo personal activo",
      degree: 0,
    };
  }

  // 2. Padres e Hijos directos
  const isParent = parentEdges.some(
    (e) => e.parent_id === targetPersonId && e.child_id === rootPersonId
  );
  if (isParent) {
    return {
      relationshipLabel: isFemale ? "Madre" : isMale ? "Padre" : "Progenitor",
      relationshipCategory: "parent",
      explanation: "Progenitor directo",
      degree: 1,
    };
  }

  const isChild = parentEdges.some(
    (e) => e.parent_id === rootPersonId && e.child_id === targetPersonId
  );
  if (isChild) {
    return {
      relationshipLabel: isFemale ? "Hija" : isMale ? "Hijo" : "Descendiente",
      relationshipCategory: "child",
      explanation: "Hijo/a directo",
      degree: 1,
    };
  }

  // 3. Cónyuge o Pareja directa
  const directUnion = unions.find(
    (u) =>
      u.status !== "rejected" &&
      ((u.person_a_id === rootPersonId && u.person_b_id === targetPersonId) ||
        (u.person_b_id === rootPersonId && u.person_a_id === targetPersonId))
  );

  if (directUnion) {
    let label = "Cónyuge / Pareja";
    if (directUnion.union_type === "divorced") label = "Ex-pareja (Divorciados)";
    else if (directUnion.union_type === "separated") label = "Ex-pareja (Separados)";
    else if (directUnion.union_type === "partner" || directUnion.union_type === "civil_union")
      label = "Pareja (Unión Libre)";
    else if (directUnion.union_type === "married")
      label = isFemale ? "Esposa" : isMale ? "Esposo" : "Cónyuge";

    return {
      relationshipLabel: label,
      relationshipCategory: "spouse",
      explanation: "Vínculo conyugal registrado",
      degree: 1,
    };
  }

  // Progenitores de la raíz y del objetivo
  const rootParentIds = parentEdges
    .filter((e) => e.child_id === rootPersonId)
    .map((e) => e.parent_id);

  const targetParentIds = parentEdges
    .filter((e) => e.child_id === targetPersonId)
    .map((e) => e.parent_id);

  const sharedParentIds = rootParentIds.filter((pId) => targetParentIds.includes(pId));

  // 4. Hermanos o Medios Hermanos
  if (sharedParentIds.length > 0) {
    const isFullSibling =
      sharedParentIds.length >= 2 ||
      (rootParentIds.length === 1 && targetParentIds.length === 1);

    if (isFullSibling) {
      return {
        relationshipLabel: isFemale ? "Hermana" : isMale ? "Hermano" : "Hermano/a",
        relationshipCategory: "sibling",
        explanation: "Comparte tus mismos progenitores",
        degree: 2,
      };
    } else {
      const commonParent = personsMap?.get(sharedParentIds[0]);
      const parentName = commonParent ? `por parte de ${commonParent.firstName}` : "";
      return {
        relationshipLabel: isFemale ? "Media hermana" : isMale ? "Medio hermano" : "Medio hermano/a",
        relationshipCategory: "sibling",
        explanation: `Hermano/a ${parentName}`.trim(),
        degree: 2,
      };
    }
  }

  // 5. Abuelos (padres de los progenitores)
  if (rootParentIds.length > 0) {
    const connectingParentId = rootParentIds.find((pId) =>
      parentEdges.some((e) => e.parent_id === targetPersonId && e.child_id === pId)
    );

    if (connectingParentId) {
      const parentObj = personsMap?.get(connectingParentId);
      const isMaternal = parentObj?.gender === "female";
      const parentName = parentObj ? `madre/padre de tu ${parentObj.gender === "female" ? "madre" : "padre"} ${parentObj.firstName}` : "";

      return {
        relationshipLabel: isFemale
          ? `Abuela ${isMaternal ? "materna" : "paterna"}`
          : isMale
          ? `Abuelo ${isMaternal ? "materno" : "paterno"}`
          : "Abuelo/a",
        relationshipCategory: "parent",
        explanation: `Progenitor/a ${parentName}`,
        degree: 2,
      };
    }
  }

  // 6. Nietos (hijos de los hijos)
  const rootChildIds = parentEdges
    .filter((e) => e.parent_id === rootPersonId)
    .map((e) => e.child_id);

  if (rootChildIds.length > 0) {
    const connectingChildId = rootChildIds.find((cId) =>
      parentEdges.some((e) => e.parent_id === cId && e.child_id === targetPersonId)
    );

    if (connectingChildId) {
      const childObj = personsMap?.get(connectingChildId);
      const childName = childObj ? `hijo/a de tu ${childObj.gender === "female" ? "hija" : "hijo"} ${childObj.firstName}` : "";

      return {
        relationshipLabel: isFemale ? "Nieta" : isMale ? "Nieto" : "Nieto/a",
        relationshipCategory: "child",
        explanation: `Descendiente directo: ${childName}`,
        degree: 2,
      };
    }
  }

  // 7. Tíos / Tías (hermanos de los progenitores de la raíz)
  if (rootParentIds.length > 0) {
    for (const parentId of rootParentIds) {
      const grandParentIdsOfParent = parentEdges
        .filter((e) => e.child_id === parentId)
        .map((e) => e.parent_id);

      // Si target comparte padres con este parentId
      const targetIsSiblingOfParent =
        grandParentIdsOfParent.length > 0 &&
        targetParentIds.some((tpId) => grandParentIdsOfParent.includes(tpId)) &&
        targetPersonId !== parentId;

      if (targetIsSiblingOfParent) {
        const parentObj = personsMap?.get(parentId);
        const isMaternal = parentObj?.gender === "female";
        return {
          relationshipLabel: isFemale
            ? isMaternal
              ? "Tía materna"
              : "Tía paterna"
            : isMale
            ? isMaternal
              ? "Tío materno"
              : "Tío paterno"
            : "Tío/a",
          relationshipCategory: "other",
          explanation: `Hermano/a de tu ${isMaternal ? "madre" : "padre"} ${parentObj ? parentObj.firstName : ""}`.trim(),
          degree: 3,
          isSuggestion: true,
        };
      }
    }
  }

  // 8. Sobrinos / Sobrinas (hijos de los hermanos de la raíz)
  if (rootParentIds.length > 0 && targetParentIds.length > 0) {
    // Buscar si alguno de los padres de target es hermano de la raíz
    for (const tpId of targetParentIds) {
      const tpParentIds = parentEdges
        .filter((e) => e.child_id === tpId)
        .map((e) => e.parent_id);

      const isSiblingOfRoot =
        tpParentIds.some((pId) => rootParentIds.includes(pId)) && tpId !== rootPersonId;

      if (isSiblingOfRoot) {
        const siblingObj = personsMap?.get(tpId);
        return {
          relationshipLabel: isFemale ? "Sobrina" : isMale ? "Sobrino" : "Sobrino/a",
          relationshipCategory: "other",
          explanation: `Hijo/a de tu ${siblingObj?.gender === "female" ? "hermana" : "hermano"} ${siblingObj ? siblingObj.firstName : ""}`.trim(),
          degree: 3,
          isSuggestion: true,
        };
      }
    }
  }

  // 9. Primos Hermanos (hijos de los tíos)
  if (rootParentIds.length > 0 && targetParentIds.length > 0) {
    // Abuelos de la raíz
    const grandParentIdsOfRoot = parentEdges
      .filter((e) => rootParentIds.includes(e.child_id))
      .map((e) => e.parent_id);

    // Abuelos del target
    const grandParentIdsOfTarget = parentEdges
      .filter((e) => targetParentIds.includes(e.child_id))
      .map((e) => e.parent_id);

    const shareGrandparents = grandParentIdsOfRoot.some((gpId) =>
      grandParentIdsOfTarget.includes(gpId)
    );

    if (shareGrandparents) {
      return {
        relationshipLabel: isFemale ? "Prima hermana" : isMale ? "Primo hermano" : "Primo/a hermano/a",
        relationshipCategory: "other",
        explanation: "Comparte abuelos en común con tu familia",
        degree: 4,
        isSuggestion: true,
      };
    }
  }

  // 10. Familia Política (Familiares por Unión Conyugal)
  // Cuñado/a (hermano de cónyuge o cónyuge de hermano)
  const rootSpouses = unions
    .filter((u) => u.status !== "rejected")
    .map((u) => (u.person_a_id === rootPersonId ? u.person_b_id : u.person_b_id === rootPersonId ? u.person_a_id : null))
    .filter(Boolean) as string[];

  // 10.1 Hermano de tu cónyuge -> Cuñado/a
  for (const spId of rootSpouses) {
    const spParentIds = parentEdges.filter((e) => e.child_id === spId).map((e) => e.parent_id);
    if (spParentIds.length > 0 && targetParentIds.some((tpId) => spParentIds.includes(tpId)) && targetPersonId !== spId) {
      return {
        relationshipLabel: isFemale ? "Cuñada" : isMale ? "Cuñado" : "Cuñado/a",
        relationshipCategory: "spouse",
        explanation: "Hermano/a de tu cónyuge",
        degree: 2,
      };
    }

    // 10.2 Progenitor de tu cónyuge -> Suegro/a
    if (spParentIds.includes(targetPersonId)) {
      return {
        relationshipLabel: isFemale ? "Suegra" : isMale ? "Suegro" : "Suegro/a",
        relationshipCategory: "parent",
        explanation: "Progenitor/a de tu cónyuge",
        degree: 2,
      };
    }
  }

  // Fallback por defecto
  return {
    relationshipLabel: isFemale ? "Familiar (Femenino)" : isMale ? "Familiar (Masculino)" : "Familiar",
    relationshipCategory: "other",
    explanation: "Familiar de la red genealógica",
  };
}
