import type { Gender } from "@/types/database.types";

export interface TreeNodeData {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  birthDate: string | null;
  isLiving: boolean;
  isClaimed: boolean;
  generation: number; // -1: padres/ancestros, 0: usuario/pareja/hermanos, 1: hijos
  relationshipLabel: string;
  relationshipCategory: "self" | "parent" | "child" | "spouse" | "sibling";
  invitationStatus?: string | null;
  invitationToken?: string | null;
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
}

export interface FamilyGraphData {
  nodes: TreeNodeData[];
  edges: TreeEdgeData[];
}
