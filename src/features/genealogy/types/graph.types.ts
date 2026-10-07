import type { TreeScope } from "../utils/tree-scope";
import type { Gender } from "@/types/database.types";

export interface TreeNodeData {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  maternalLastName?: string | null;
  maidenName?: string | null;
  gender: Gender;
  birthDate: string | null;
  deathDate?: string | null;
  isLiving: boolean;
  birthPlace?: string | null;
  bio?: string | null;
  isClaimed: boolean;
  createdByUserId?: string | null;
  generation: number; // -1: padres/ancestros, 0: usuario/pareja/hermanos, 1: hijos
  relationshipLabel: string;
  relationshipCategory: "self" | "parent" | "child" | "spouse" | "sibling" | "other";
  relationshipExplanation?: string;
  accountEmail?: string | null;
  parentConnections?: {
    id: string;
    parentId: string;
    parentName: string;
    relationshipType: string;
  }[];
  childConnections?: {
    id: string;
    childId: string;
    childName: string;
    relationshipType: string;
  }[];
  invitationStatus?: string | null;
  invitationToken?: string | null;
  unionInfo?: {
    id: string;
    unionType: "married" | "civil_union" | "divorced" | "separated" | "partner";
    partnerId: string;
  } | null;
  // Métricas de validación/quórum
  validationsCount: number;
  validationsNeeded: number;
  isReadyForInvite: boolean;
  // Posiciones calculadas para el renderizado
  x?: number;
  y?: number;
}

export interface TreeEdgeData {
  id: string;
  sourceId: string;
  targetId: string;
  type: "parent-child" | "union";
  unionType?: "married" | "civil_union" | "divorced" | "separated" | "partner";
}

export interface FocusPersonInfo {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  maternalLastName?: string | null;
  gender: Gender;
  relationshipLabel: string;
  isSelf: boolean;
}

export interface AvailableMemberOption {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  maternalLastName?: string | null;
  gender: Gender;
  relationshipLabel: string;
}

export interface AccessibleTreeOption {
  targetUserId: string;
  targetPersonId: string;
  ownerName: string;
  tier: "profile" | "basic" | "intermediate" | "advanced";
}

export interface FamilyGraphData {
  nodes: TreeNodeData[];
  edges: TreeEdgeData[];
  focusPerson: FocusPersonInfo;
  availableMembers: AvailableMemberOption[];
  isUserZero: boolean;
  viewerTier?: "profile" | "basic" | "intermediate" | "advanced";
  isViewerGuest?: boolean;
  // Alcance elegido por la persona en su propio árbol (ausente para invitados)
  scope?: TreeScope;
  treeOwnerName?: string;
  accessibleTrees?: AccessibleTreeOption[];
}
