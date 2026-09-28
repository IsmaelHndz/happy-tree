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
  lastName: string;
  gender: Gender;
  birthDate: string | null;
  isLiving: boolean;
  isClaimed: boolean;
  relationshipLabel: string;
  relationshipCategory: "parent" | "child" | "spouse" | "sibling" | "other";
  invitationStatus?: InvitationStatus | null;
  invitationToken?: string | null;
  invitationExpiresAt?: string | null;
  invitedEmail?: string | null;
}

export interface CreateFamilyMemberInput {
  firstName: string;
  lastName: string;
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
