export interface AuthActionState {
  error?: string | null;
  success?: boolean;
  message?: string | null;
}

export interface UserZeroStatus {
  exists: boolean;
  userZeroName?: string | null;
}

export interface InvitationDetails {
  isValid: boolean;
  errorMessage?: string;
  token?: string;
  personId?: string;
  firstName?: string;
  lastName?: string;
  invitedEmail?: string | null;
  proposedRelationship?: string | null;
  inviterName?: string | null;
}
