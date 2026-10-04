import type { Gender, InvitationStatus } from "@/types/database.types";

export type FamilyRelationshipType =
  | "father"
  | "mother"
  | "son"
  | "daughter"
  | "spouse"
  | "partner"
  | "brother"
  | "sister";

export interface FamilyMemberItem {
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
  relationshipLabel: string;
  relationshipCategory: "parent" | "child" | "spouse" | "sibling" | "other" | "self";
  relationshipExplanation?: string;
  invitationStatus?: InvitationStatus | null;
  invitationToken?: string | null;
  invitationExpiresAt?: string | null;
  invitedEmail?: string | null;
  accountEmail?: string | null;
  parentConnections?: {
    id: string;
    parentId: string;
    parentName: string;
    relationshipType: string;
  }[];
  unionInfo?: {
    id: string;
    unionType: "married" | "civil_union" | "divorced" | "separated" | "partner";
    partnerId: string;
  } | null;
}

export interface UpdateUnionInput {
  personAId: string;
  personBId: string;
  unionType: "married" | "civil_union" | "divorced" | "separated" | "partner";
}

export interface UpdateFamilyMemberInput {
  personId: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  maternalLastName?: string | null;
  maidenName?: string | null;
  gender: Gender;
  birthDate?: string | null;
  deathDate?: string | null;
  isLiving: boolean;
  birthPlace?: string | null;
  bio?: string | null;
}

export interface CreateFamilyMemberInput {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  maternalLastName?: string | null;
  gender: Gender;
  birthDate?: string | null;
  isLiving: boolean;
  relationship: FamilyRelationshipType;
  inviteEmail?: string | null;
}

export interface CreateMemberResult {
  success: boolean;
  error?: string | null;
  personId?: string;
  invitationToken?: string | null;
}

/**
 * Formatea el nombre completo respetando la estructura hispana / latina:
 * [Primer Nombre] [Segundo Nombre] [Apellido Paterno] [Apellido Materno]
 */
export function formatFullName(person: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  maternalLastName?: string | null;
}): string {
  return [person.firstName, person.middleName, person.lastName, person.maternalLastName]
    .filter(Boolean)
    .join(" ");
}

