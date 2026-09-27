import type { Database } from "./database.types";

export type PersonRow = Database["public"]["Tables"]["persons"]["Row"];
export type PersonInsert = Database["public"]["Tables"]["persons"]["Insert"];
export type PersonUpdate = Database["public"]["Tables"]["persons"]["Update"];

export type ParentChildEdgeRow = Database["public"]["Tables"]["parent_child_edges"]["Row"];
export type ParentChildEdgeInsert = Database["public"]["Tables"]["parent_child_edges"]["Insert"];

export type UnionEdgeRow = Database["public"]["Tables"]["union_edges"]["Row"];
export type UnionEdgeInsert = Database["public"]["Tables"]["union_edges"]["Insert"];

export type InvitationTokenRow = Database["public"]["Tables"]["invitation_tokens"]["Row"];
export type InvitationTokenInsert = Database["public"]["Tables"]["invitation_tokens"]["Insert"];

/**
 * Entidad de dominio Persona con metadatos calculados de presentación.
 */
export interface PersonNode extends PersonRow {
  fullName: string;
  isCurrentUser?: boolean;
}

/**
 * Estado de reclamación de un perfil.
 */
export type ClaimStatus = "unclaimed" | "pending_invitation" | "claimed";

export function getPersonClaimStatus(person: PersonRow): ClaimStatus {
  if (person.is_claimed) return "claimed";
  return "unclaimed";
}

/**
 * Resultado de verificación del Health Check de la base de datos.
 */
export interface HealthCheckResult {
  ok: boolean;
  message: string;
  timestamp: string;
  latencyMs: number;
  tableCounts?: {
    persons: number;
    parentChildEdges: number;
    unionEdges: number;
    invitationTokens: number;
  };
  error?: string;
}
