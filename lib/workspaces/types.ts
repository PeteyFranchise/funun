// ─── Workspace domain vocabulary ────────────────────────────────────────
// Single TypeScript source of truth for the workspace vocabulary that
// migrations 182-186's CHECK constraints mirror byte-identically (Phase 38
// planner decision: nothing else in this phase can be authored correctly
// until this file is green). Pure type/constant module — no Supabase
// client, no I/O, no side effects (style precedent: lib/vault/membership.ts,
// lib/selects/types.ts, lib/accounts/account-context.ts).
//
// `workspace_type` drives defaults and UI. It is NEVER the authorization
// source (D-01) — authorization always flows through role, membership
// state, grants, and relationship tier, never through type.
//
// Professional roles (artist, producer, manager, songwriter, engineer) are
// deliberately absent from every union here (D-34) — a workspace's schema
// and permission model stay neutral. "Artist Team" is a product-facing
// label only (D-34); the schema literal for that type stays `artist_team`.

// ─── Workspace type (D-01, D-02) ────────────────────────────────────────
// Drives defaults and UI only. Roster and catalogue capabilities are
// independent flags (see WorkspaceCapabilityFlags below), never derived
// from workspace_type — a company may be both management and label without
// a second workspace (D-02).
export const WORKSPACE_TYPE_VALUES = ['artist_team', 'management', 'label'] as const
export type WorkspaceType = (typeof WORKSPACE_TYPE_VALUES)[number]

// Product-facing labels only. The schema literal stays neutral (D-34) — do
// not let this label record leak into authorization logic anywhere.
export const WORKSPACE_TYPE_LABELS: Record<WorkspaceType, string> = {
  artist_team: 'Artist Team',
  management: 'Management',
  label: 'Label',
}

// ─── Workspace member role (D-11) ───────────────────────────────────────
// Governs the WORKSPACE itself (invite, configure, roster, remove) — never
// project access, which comes from separate grants (D-20). Contractor is
// time-boxed, which is why WorkspaceMembershipState below needs `expired`.
export const WORKSPACE_ROLE_VALUES = [
  'owner',
  'admin',
  'member',
  'contractor',
  'guest',
] as const
export type WorkspaceRole = (typeof WORKSPACE_ROLE_VALUES)[number]

// ─── Workspace membership state (D-11, D-13, D-14) ──────────────────────
export const WORKSPACE_MEMBERSHIP_STATE_VALUES = [
  'pending',
  'active',
  'suspended',
  'removed',
  'expired',
] as const
export type WorkspaceMembershipState = (typeof WORKSPACE_MEMBERSHIP_STATE_VALUES)[number]

// ─── Workspace verification state (D-04) ────────────────────────────────
// Default is `unverified` — deliberately the opposite of buyer_orgs'
// born-verified default (migration 080 D-14). Unverified never blocks the
// workspace from working; it only limits claims and discovery.
export const WORKSPACE_VERIFICATION_STATE_VALUES = [
  'unverified',
  'in_review',
  'verified',
  'revoked',
] as const
export type WorkspaceVerificationState = (typeof WORKSPACE_VERIFICATION_STATE_VALUES)[number]

// ─── Roster relationship state (D-05, D-15, D-17, D-18) ─────────────────
// Deliberately does NOT include a `document-supported` member. That is a
// derived authority tier resolved on read, not a stored roster state (see
// WorkspaceAuthorityTier below) — plan 38-02 implements the resolver.
export const ROSTER_RELATIONSHIP_STATE_VALUES = [
  'proposed',
  'accepted',
  'refused',
  'blocked',
  'ended',
] as const
export type RosterRelationshipState = (typeof ROSTER_RELATIONSHIP_STATE_VALUES)[number]

// ─── Authority tier (D-21) ───────────────────────────────────────────────
// Exactly two grantable tiers plus `none`. Operational permissions the
// Member grants alone; authority permissions additionally require a
// document-supported relationship (D-16). No third tier exists (D-40
// declines a "sensitive" tier in favor of bundle exclusion).
export const WORKSPACE_AUTHORITY_TIER_VALUES = ['none', 'operational', 'authority'] as const
export type WorkspaceAuthorityTier = (typeof WORKSPACE_AUTHORITY_TIER_VALUES)[number]

// ─── Workspace invitation state (D-12, D-51) ────────────────────────────
export const WORKSPACE_INVITATION_STATE_VALUES = [
  'pending',
  'accepted',
  'refused',
  'expired',
  'revoked',
] as const
export type WorkspaceInvitationState = (typeof WORKSPACE_INVITATION_STATE_VALUES)[number]

// ─── Workspace capability flags (D-02) ──────────────────────────────────
// Independent flags — never derived from workspace_type. A workspace may
// hold roster capability, catalogue capability, both, or neither,
// regardless of its declared type.
export type WorkspaceCapabilityFlags = {
  rosterEnabled: boolean
  catalogueEnabled: boolean
}
