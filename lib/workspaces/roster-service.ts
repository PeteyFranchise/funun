import type { SupabaseClient } from '@supabase/supabase-js'
import { canManageRoster } from '@/lib/workspaces/membership'
import { canWorkspaceProposeRoster, isLegalRosterTransition } from '@/lib/workspaces/roster'
import { resolveAuthorityTier, type AgreementEvidenceFacts } from '@/lib/workspaces/evidence'
import type {
  RosterRelationshipState,
  WorkspaceAuthorityTier,
  WorkspaceRole,
} from '@/lib/workspaces/types'

// ─── Roster service — I/O composition over the pure lib/workspaces modules ──
// (D-05, D-15, D-16, D-17, D-18, D-51). This module performs the database
// lookups a roster decision needs and hands the FACTS to the pure modules
// from plan 38-02 (`lib/workspaces/roster.ts`, `lib/workspaces/evidence.ts`)
// — it never re-implements a state rule of its own. Every exported function
// returns a tagged `{ ok: true, ... } | { ok: false, status, error }` union
// and never throws, matching `lib/workspaces/access.ts`'s shape.
//
// A proposal is inert (D-05): `assertCanPropose` reads only what it needs to
// answer "may this pair form a new claim" — a block row and a live-state
// row scoped to the pair — and never widens any read as a side effect of
// creating one. Callers pass a SERVICE-ROLE client here, because migration
// 183's `workspace_roster_blocks` SELECT policy is Member-private by design
// (a workspace must never enumerate who blocked it) — application code has
// already proved caller authority via `requireWorkspaceAccess` before this
// module is ever reached, per this phase's service-role-only doctrine.
//
// A Member's end is unconditional (D-18): `assertMemberMayEnd` has exactly
// two checks — identity and transition legality — with no approval,
// counter-offer, or dispute path, because Funūn is never the venue for the
// contractual argument.

export type RosterServiceResult =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 404 | 409 | 500; error: string }

export type RosterTierResult =
  | { ok: true; tier: WorkspaceAuthorityTier }
  | { ok: false; status: 500; error: string }

// ─── Rate limiting (D-51) ────────────────────────────────────────────────
// Named so the propose route never inlines a magic number. Scoped per
// workspace (key prefix `workspace-roster-propose:` + workspaceId at the
// call site) — a single workspace re-proposing across many Members is the
// abuse shape this bounds, distinct from the per-pair block below.
export const ROSTER_PROPOSAL_RATE_LIMIT = { windowMs: 60 * 60 * 1000, maxAttempts: 30 } as const

// ─── Mass-assignment allowlist ──────────────────────────────────────────
// Deliberately EXCLUDES `state`, `member_user_id`, `workspace_id`,
// `accepted_at`, `ended_at` and `ended_by` — all lifecycle columns written
// only by the transition paths below (accept/refuse/block/end), never by a
// patch body (mirrors lib/client-partners/contacts.ts's CONTACT_EDITABLE_FIELDS
// pre-Zod allowlist convention).
export const ROSTER_EDITABLE_FIELDS = [
  'professional_role',
  'effective_from',
  'terminates_on',
] as const

export type RosterEditableField = (typeof ROSTER_EDITABLE_FIELDS)[number]

/** Pure allowlist filter — only ROSTER_EDITABLE_FIELDS keys ever cross into a DB write. */
export function pickRosterFields(body: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of ROSTER_EDITABLE_FIELDS) {
    if (!(key in body)) continue
    picked[key] = body[key]
  }
  return picked
}

// ─── Proposal eligibility (D-05, D-15, D-51) ────────────────────────────
/**
 * Whether a workspace may propose a new roster relationship with a Member.
 * Refuses when a `workspace_roster_blocks` row exists for the pair, refuses
 * when a live (`proposed` or `accepted`) relationship already exists for
 * the same pair, and permits otherwise — including when the Member holds
 * live relationships with other workspaces, because this query is always
 * scoped to THIS workspace/member pair and Funūn never enforces
 * exclusivity across workspaces (D-15).
 */
export async function assertCanPropose(
  supabase: SupabaseClient,
  args: { workspaceId: string; memberUserId: string }
): Promise<RosterServiceResult> {
  const { data: blockRow, error: blockError } = await supabase
    .from('workspace_roster_blocks')
    .select('id')
    .eq('workspace_id', args.workspaceId)
    .eq('member_user_id', args.memberUserId)
    .maybeSingle()

  if (blockError) {
    return { ok: false, status: 500, error: 'Could not check roster block status.' }
  }

  const { data: liveRelationship, error: relationshipError } = await supabase
    .from('workspace_roster_relationships')
    .select('id')
    .eq('workspace_id', args.workspaceId)
    .eq('member_user_id', args.memberUserId)
    .in('state', ['proposed', 'accepted'])
    .maybeSingle()

  if (relationshipError) {
    return { ok: false, status: 500, error: 'Could not check existing roster relationships.' }
  }

  const permitted = canWorkspaceProposeRoster({
    isBlocked: Boolean(blockRow),
    hasLiveRelationship: Boolean(liveRelationship),
  })

  if (permitted) return { ok: true }

  if (blockRow) {
    return {
      ok: false,
      status: 403,
      error: 'This Member has blocked this workspace from proposing a roster relationship.',
    }
  }

  return {
    ok: false,
    status: 409,
    error: 'A live roster relationship already exists between this workspace and this Member.',
  }
}

// ─── Transition legality ─────────────────────────────────────────────────
/**
 * Refuses any move `isLegalRosterTransition` rejects, naming the from/to
 * pair in the error. Delegates entirely to the pure state machine — this
 * module never re-reads the underlying transition-edge table directly.
 */
export function assertCanTransition(
  from: RosterRelationshipState,
  to: RosterRelationshipState
): RosterServiceResult {
  if (!isLegalRosterTransition(from, to)) {
    return {
      ok: false,
      status: 400,
      error: `Cannot move a roster relationship from ${from} to ${to}.`,
    }
  }
  return { ok: true }
}

// ─── Both-sides ending (D-17, D-18) ──────────────────────────────────────
/**
 * Permits an end initiated by the relationship's own `member_user_id` from
 * `accepted`, with no additional condition — no approval, no counter-offer,
 * no dispute path (D-18). Refuses when the caller is not that Member.
 */
export function assertMemberMayEnd(args: {
  memberUserId: string
  callerUserId: string
  state: RosterRelationshipState
}): RosterServiceResult {
  if (args.callerUserId !== args.memberUserId) {
    return { ok: false, status: 403, error: 'Only the named Member may end this relationship.' }
  }
  return assertCanTransition(args.state, 'ended')
}

/**
 * Permits an end initiated by a workspace owner or admin — ending is
 * available to both sides, but only the Member's path (above) is
 * unconditional. This path additionally requires the caller's DB-derived
 * role to satisfy `canManageRoster`.
 */
export function assertWorkspaceMayEnd(args: {
  callerRole: WorkspaceRole
  state: RosterRelationshipState
}): RosterServiceResult {
  if (!canManageRoster(args.callerRole)) {
    return {
      ok: false,
      status: 403,
      error: 'Only workspace owners and admins can end a roster relationship.',
    }
  }
  return assertCanTransition(args.state, 'ended')
}

// ─── Authority tier resolution (D-16, D-39) ──────────────────────────────
/**
 * Returns `none` for a non-accepted relationship without querying evidence
 * at all, `operational` for an accepted one with no live evidence, and
 * `authority` when live scoped evidence exists — delegating entirely to
 * `resolveAuthorityTier`. Nothing here is stored; every call recomputes
 * from the current rows (D-39: an expiry lapses authority on the next
 * read, not on a cron tick).
 */
export async function loadRelationshipTier(
  supabase: SupabaseClient,
  args: { relationshipId: string; state: RosterRelationshipState; now?: number }
): Promise<RosterTierResult> {
  if (args.state !== 'accepted') {
    return { ok: true, tier: resolveAuthorityTier({ relationshipState: args.state, evidence: [], now: args.now }) }
  }

  const { data, error } = await supabase
    .from('workspace_agreement_evidence')
    .select(
      'declared_scope, effective_from, expires_at, superseded_at, declared_by, uploaded_at, witnessed_by_signature'
    )
    .eq('relationship_id', args.relationshipId)

  if (error) {
    return { ok: false, status: 500, error: 'Could not load agreement evidence for this relationship.' }
  }

  const evidence: AgreementEvidenceFacts[] = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    declaredScope: (row.declared_scope as string | null) ?? null,
    effectiveFrom: (row.effective_from as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    supersededAt: (row.superseded_at as string | null) ?? null,
    uploadedBy: row.declared_by as string,
    uploadedAt: row.uploaded_at as string,
    witnessedBySignature: Boolean(row.witnessed_by_signature),
  }))

  const tier = resolveAuthorityTier({ relationshipState: args.state, evidence, now: args.now })
  return { ok: true, tier }
}
