// ─── Party lifecycle phase resolution ────────────────────────────────
// Replaces the single `isExpired` boolean that used to power
// app/approve/[token]/page.tsx (RESEARCH Pitfall 1). That boolean treated
// ANY approval_status !== 'pending' as an expired link, so the instant a
// party approved, revisiting their OWN durable /approve/[token] link
// rendered "This link has expired" instead of the signing step.
//
// resolvePartyPhase() splits the gating into two independent questions:
//   1. Is the token itself invalid/expired? (missing party/sheet row, or
//      token_expires_at < now) — the only genuine "expired link" case.
//   2. Given a valid token, what lifecycle phase is this party in? — which
//      drives which UI branch renders (approve/counter vs sign vs waiting
//      vs countered vs done).
//
// This is what makes reusing the same durable token for the post-approval
// signing step possible (P17-01, gap fix 1) — no second /sign route/link
// to explain to studio collaborators.

export type PartyApprovalStatus = 'pending' | 'approved' | 'countered'

export type SplitSheetStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'countered'
  | 'esign_pending'
  | 'executed'

export type PartyPhase =
  | 'token_invalid'
  | 'preview'
  | 'approve'
  | 'sign'
  | 'waiting'
  | 'countered'
  | 'done'

export type ResolvePartyPhaseInput = {
  party: {
    approval_status: PartyApprovalStatus
    token_expires_at: string | null
  } | null
  sheet: {
    status: SplitSheetStatus
  } | null
  nowIso: string
}

/**
 * Resolves which lifecycle branch a party is in for a given /approve/[token]
 * visit. Order of checks matters: token validity is always decided first
 * (an expired token is invalid no matter how far the sheet has progressed);
 * next, a DRAFT sheet always resolves to 'preview' (P18-08) regardless of
 * the party's own approval_status — a draft's party has by definition
 * approved nothing, and must never see an approve/counter control, only a
 * read-only proposal; then the sheet reaching 'executed' is a terminal
 * state that overrides whatever the individual party's own approval_status
 * says, then the party's own approval_status drives the remaining branches.
 */
export function resolvePartyPhase({ party, sheet, nowIso }: ResolvePartyPhaseInput): PartyPhase {
  // Question 1: is the token itself invalid/expired?
  if (!party || !sheet) return 'token_invalid'
  if (party.token_expires_at && party.token_expires_at < nowIso) return 'token_invalid'

  // Question 2: what phase is this party in, given a valid token?
  // A draft sheet is a read-only preview share (P18-08) — this check must
  // come before every other lifecycle branch below, since a draft's party
  // approval_status is meaningless (nothing has been asked of them yet).
  if (sheet.status === 'draft') return 'preview'
  if (sheet.status === 'executed') return 'done'
  if (party.approval_status === 'countered') return 'countered'
  if (party.approval_status === 'pending') return 'approve'

  // party.approval_status === 'approved' from here on.
  if (sheet.status === 'esign_pending') return 'sign'
  return 'waiting'
}

// ─── Nudge eligibility (page-visit tracking, not email-open — P17-04) ──
// A party is nudge-eligible when they've opened their /approve/[token]
// link (first_viewed_at stamped by page.tsx) but have not yet acted (still
// 'pending') after a ~3-day window. A party who never opened the link is
// NOT nudged — this is deliberately page-visit tracking, not an
// email-open pixel.

/** ~3 days — the viewed-but-no-action nudge window (P17-04). */
export const NUDGE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

export type NudgeEligibilityInput = {
  firstViewedAt: string | null
  approvalStatus: PartyApprovalStatus
  nowIso: string
}

export function isNudgeEligible({
  firstViewedAt,
  approvalStatus,
  nowIso,
}: NudgeEligibilityInput): boolean {
  if (!firstViewedAt) return false
  if (approvalStatus !== 'pending') return false

  const elapsedMs = new Date(nowIso).getTime() - new Date(firstViewedAt).getTime()
  return elapsedMs > NUDGE_WINDOW_MS
}
