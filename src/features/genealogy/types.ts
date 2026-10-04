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
  childConnections?: {
    id: string;
    childId: string;
    childName: string;
    relationshipType: string;
  }[];
  unionInfo?: {
    id: string;
    unionType: "married" | "civil_union" | "divorced" | "separated" | "partner";
    partnerId: string;
  } | null;
  isEndorsedByMe?: boolean;
  endorsementsCount?: number;
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

/**
 * Calcula la edad en años a partir de la fecha de nacimiento (YYYY-MM-DD),
 * considerando si la persona ha fallecido (deathDate) o al día de hoy.
 */
export function calculateAge(
  birthDate?: string | null,
  deathDate?: string | null
): number | null {
  if (!birthDate) return null;
  const parts = birthDate.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return null;
  }
  const [bYear, bMonth, bDay] = parts;

  let endYear: number;
  let endMonth: number;
  let endDay: number;

  if (deathDate) {
    const dParts = deathDate.split("-").map(Number);
    if (dParts.length >= 3 && !isNaN(dParts[0]) && !isNaN(dParts[1]) && !isNaN(dParts[2])) {
      [endYear, endMonth, endDay] = dParts;
    } else {
      const now = new Date();
      endYear = now.getFullYear();
      endMonth = now.getMonth() + 1;
      endDay = now.getDate();
    }
  } else {
    const now = new Date();
    endYear = now.getFullYear();
    endMonth = now.getMonth() + 1;
    endDay = now.getDate();
  }

  let age = endYear - bYear;
  if (endMonth < bMonth || (endMonth === bMonth && endDay < bDay)) {
    age--;
  }
  return Math.max(0, age);
}

export type TreePermissionTier = "basic" | "intermediate" | "advanced";
export type TreeAccessStatus = "pending" | "approved" | "rejected" | "revoked";

export interface TreeAccessShareItem {
  id: string;
  granterUserId: string;
  granterPersonId: string;
  granterName: string;
  granterEmail?: string | null;
  requesterUserId: string;
  requesterPersonId?: string | null;
  requesterName: string;
  requesterEmail?: string | null;
  tier: TreePermissionTier;
  status: TreeAccessStatus;
  requestMessage?: string | null;
  requestedAt: string;
  respondedAt?: string | null;
  isOutgoing: boolean; // true si yo solicité, false si yo soy el dueño
}

export interface UserSearchResultItem {
  userId: string;
  personId?: string | null;
  fullName: string;
  email: string;
  alreadyRequested: boolean;
  existingStatus?: TreeAccessStatus | null;
  existingTier?: TreePermissionTier | null;
}

