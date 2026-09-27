export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Gender = "male" | "female" | "other" | "unknown";
export type ParentChildRelationshipType = "biological" | "adopted" | "foster" | "step";
export type UnionType = "married" | "civil_union" | "divorced" | "separated" | "partner";
export type EdgeStatus = "pending_confirmation" | "confirmed" | "rejected";
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export interface Database {
  public: {
    Tables: {
      persons: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          maiden_name: string | null;
          gender: Gender;
          birth_date: string | null;
          death_date: string | null;
          is_living: boolean;
          birth_place: string | null;
          avatar_url: string | null;
          bio: string | null;
          is_claimed: boolean;
          claimed_by_user_id: string | null;
          claimed_at: string | null;
          created_by_user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          first_name: string;
          last_name: string;
          maiden_name?: string | null;
          gender?: Gender;
          birth_date?: string | null;
          death_date?: string | null;
          is_living?: boolean;
          birth_place?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          is_claimed?: boolean;
          claimed_by_user_id?: string | null;
          claimed_at?: string | null;
          created_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          first_name?: string;
          last_name?: string;
          maiden_name?: string | null;
          gender?: Gender;
          birth_date?: string | null;
          death_date?: string | null;
          is_living?: boolean;
          birth_place?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          is_claimed?: boolean;
          claimed_by_user_id?: string | null;
          claimed_at?: string | null;
          created_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      parent_child_edges: {
        Row: {
          id: string;
          parent_id: string;
          child_id: string;
          relationship_type: ParentChildRelationshipType;
          status: EdgeStatus;
          created_by_user_id: string | null;
          confirmed_by_user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          parent_id: string;
          child_id: string;
          relationship_type?: ParentChildRelationshipType;
          status?: EdgeStatus;
          created_by_user_id?: string | null;
          confirmed_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          parent_id?: string;
          child_id?: string;
          relationship_type?: ParentChildRelationshipType;
          status?: EdgeStatus;
          created_by_user_id?: string | null;
          confirmed_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      union_edges: {
        Row: {
          id: string;
          person_a_id: string;
          person_b_id: string;
          union_type: UnionType;
          start_date: string | null;
          end_date: string | null;
          status: EdgeStatus;
          created_by_user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          person_a_id: string;
          person_b_id: string;
          union_type?: UnionType;
          start_date?: string | null;
          end_date?: string | null;
          status?: EdgeStatus;
          created_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          person_a_id?: string;
          person_b_id?: string;
          union_type?: UnionType;
          start_date?: string | null;
          end_date?: string | null;
          status?: EdgeStatus;
          created_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      invitation_tokens: {
        Row: {
          id: string;
          token: string;
          person_id: string;
          invited_by_user_id: string;
          invited_email: string;
          proposed_relationship: string | null;
          status: InvitationStatus;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          token: string;
          person_id: string;
          invited_by_user_id: string;
          invited_email: string;
          proposed_relationship?: string | null;
          status?: InvitationStatus;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          token?: string;
          person_id?: string;
          invited_by_user_id?: string;
          invited_email?: string;
          proposed_relationship?: string | null;
          status?: InvitationStatus;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      gender_enum: Gender;
      parent_child_relationship_enum: ParentChildRelationshipType;
      union_type_enum: UnionType;
      edge_status_enum: EdgeStatus;
      invitation_status_enum: InvitationStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
