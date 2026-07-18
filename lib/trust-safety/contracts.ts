// ─── Trust & Safety Contracts ────────────────────────────────────────────
// Pure, framework-free type/value contracts for Phase 13 (Network Tab &
// Trust & Safety). Mirrors lib/green-room/feed.ts's pattern: no Supabase or
// Next.js imports so schema/API/UI work in later plans (13-02..13-05) share
// one safety contract. This plan (13-01) defines shapes only — no readers,
// writers, or RLS live here; those land in later Wave 1 plans per the
// Recommended Execution Order in 13-EXECUTION-PACKET.md.

// ─── Network tab relationship categories (DISCOVER-04) ──────────────────
// A member's Network tab groups the *viewer's own* graph into these
// categories. `pending_incoming`/`pending_outgoing` mirror the existing
// connections state machine (migration 035) — this contract does not
// introduce new relationship states, only a viewer-scoped read shape.
export const NETWORK_RELATIONSHIP_VALUES = [
  'following',
  'follower',
  'connection',
  'pending_outgoing',
  'pending_incoming',
] as const

export type NetworkRelationship = (typeof NETWORK_RELATIONSHIP_VALUES)[number]

export type NetworkListItem = {
  profileId: string
  relationship: NetworkRelationship
  // Present only for pending_outgoing/pending_incoming rows — the
  // underlying connections.id, needed to accept/decline/withdraw (Plan
  // 13-02). Null for following/follower/connection rows.
  connectionId: string | null
  since: string
}

// A member's own blocklist row (SAFETY-01). This shape is for the viewer's
// OWN list only — blocks are directional and private to the blocker
// (migration 035's blocks_select_own RLS policy). There is intentionally
// no "who blocked me" shape: that query must never be constructible.
export type BlockedListItem = {
  blockedProfileId: string
  createdAt: string
}

export function isValidNetworkRelationship(value: string): value is NetworkRelationship {
  return (NETWORK_RELATIONSHIP_VALUES as readonly string[]).includes(value)
}

// ─── Report targets & reasons (SAFETY-02) ────────────────────────────────
// Covers every reportable surface named in 13-VALIDATION.md: profile,
// message, and the Green Room post/comment/repost/placement targets.
export const REPORT_TARGET_TYPE_VALUES = [
  'profile',
  'message',
  'green_room_post',
  'green_room_comment',
  'green_room_repost',
  'green_room_placement',
] as const

export type ReportTargetType = (typeof REPORT_TARGET_TYPE_VALUES)[number]

export const REPORT_REASON_VALUES = [
  'harassment',
  'spam',
  'impersonation',
  'inappropriate_content',
  'scam_fraud',
  'other',
] as const

export type ReportReason = (typeof REPORT_REASON_VALUES)[number]

export const REPORT_STATUS_VALUES = [
  'submitted',
  'under_review',
  'actioned',
  'dismissed',
] as const

export type ReportStatus = (typeof REPORT_STATUS_VALUES)[number]

// The reporter-facing status view. Deliberately narrow — never includes
// admin_notes, reviewed_by/reviewed_at, or the reported user's identity.
// A reported user must never be able to read a report about them (SAFETY-02);
// this type is what migration 058's column-level grant makes readable to the
// reporter for their own row.
export type ReportStatusView = {
  id: string
  targetType: ReportTargetType
  status: ReportStatus
  createdAt: string
}

// Full row shape — admin/service-role only. Never returned to a non-admin
// caller under any circumstance.
export type ReportRecord = {
  id: string
  reporterId: string
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  details: string | null
  status: ReportStatus
  adminNotes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export function isValidReportTargetType(value: string): value is ReportTargetType {
  return (REPORT_TARGET_TYPE_VALUES as readonly string[]).includes(value)
}

export function isValidReportReason(value: string): value is ReportReason {
  return (REPORT_REASON_VALUES as readonly string[]).includes(value)
}

export function isValidReportStatus(value: string): value is ReportStatus {
  return (REPORT_STATUS_VALUES as readonly string[]).includes(value)
}

// ─── Profile & open-to visibility (SAFETY-04) ────────────────────────────
export const PROFILE_VISIBILITY_VALUES = ['public', 'connections_only'] as const
export type ProfileVisibility = (typeof PROFILE_VISIBILITY_VALUES)[number]

// `open_to` visibility is independent of overall profile visibility: a
// public profile can still hide its `open_to` status (13-CONTEXT.md locked
// requirement), so this is a three-state value rather than a boolean.
export const OPEN_TO_VISIBILITY_VALUES = ['public', 'connections', 'hidden'] as const
export type OpenToVisibility = (typeof OPEN_TO_VISIBILITY_VALUES)[number]

export function isValidProfileVisibility(value: string): value is ProfileVisibility {
  return (PROFILE_VISIBILITY_VALUES as readonly string[]).includes(value)
}

export function isValidOpenToVisibility(value: string): value is OpenToVisibility {
  return (OPEN_TO_VISIBILITY_VALUES as readonly string[]).includes(value)
}

/**
 * True when a profile is visible to a given viewer under profile-visibility
 * rules ALONE. Callers MUST additionally gate on the bidirectional block
 * check (no_block()) — this helper has no knowledge of blocks and must
 * never be treated as a complete visibility decision by itself.
 */
export function isProfileVisibleTo(
  visibility: ProfileVisibility,
  viewerIsOwner: boolean,
  viewerIsConnection: boolean
): boolean {
  if (viewerIsOwner) return true
  if (visibility === 'public') return true
  return viewerIsConnection
}

/**
 * True when `open_to` should render for a given viewer. Independent of
 * `isProfileVisibleTo` — callers should only consult this once the overall
 * profile is already determined visible to the viewer.
 */
export function isOpenToVisibleTo(
  visibility: OpenToVisibility,
  viewerIsOwner: boolean,
  viewerIsConnection: boolean
): boolean {
  if (viewerIsOwner) return true
  if (visibility === 'hidden') return false
  if (visibility === 'public') return true
  return viewerIsConnection
}

// ─── Verification authority (SAFETY-03) ──────────────────────────────────
// Verified badge grant/revoke is admin-owned only (Pending Todos, STATE.md:
// "verified-badge grant is admin-manual — explicit, not silent deferral").
// Member-owned profile update routes must never accept `verified`.
export const VERIFICATION_ADMIN_ACTION_VALUES = ['grant', 'revoke'] as const
export type VerificationAdminAction = (typeof VERIFICATION_ADMIN_ACTION_VALUES)[number]

export type VerificationAuditEntry = {
  id: string
  profileId: string
  action: VerificationAdminAction
  actorId: string | null
  createdAt: string
}

export function isValidVerificationAdminAction(
  value: string
): value is VerificationAdminAction {
  return (VERIFICATION_ADMIN_ACTION_VALUES as readonly string[]).includes(value)
}
