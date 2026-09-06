import {
  ROSTER_RELATIONSHIP_STATE_VALUES,
  type RosterRelationshipState,
} from '@/lib/workspaces/types'

// ─── Roster relationship state machine (D-05, D-07, D-15, D-17, D-18) ─────
// Pure, zero-I/O module — no Supabase client, no side effects (style
// precedent: lib/selects/stage-machine.ts's LEGAL_EDGES + isLegalXTransition
// shape).
//
// `document-supported` is deliberately absent from the stored state union
// above (RosterRelationshipState has exactly five members). It is a derived
// authority tier resolved on read by '@/lib/workspaces/evidence', never a
// stored roster state (38-RESEARCH.md Open Question 2 — mirroring this
// repo's established computeHealth()/D-06 doctrine: "config save recomputes
// nothing; the next render just reads"). A computed value can never go
// stale between a cron tick and a request; a stored state would require a
// scheduled job this phase does not otherwise need.
//
// Funūn never enforces roster exclusivity because that is a contract term
// between the parties, not something Funūn adjudicates (D-15, custody D-02
// "records, does not adjudicate"). A Member may hold any number of roster
// relationships across any number of workspaces.
//
// A Member may end a relationship unilaterally and immediately with no
// approval path (D-18) — there is deliberately no `pending_termination`
// state anywhere in this module.

// ─── Legal transition table ────────────────────────────────────────────────
// proposed -> accepted, refused, blocked   (D-05: inert until affirmed)
// accepted -> ended                        (D-17/D-18: termination or revocation)
// refused, blocked, ended are terminal — a renewed relationship is a new
// row, never a revival (mirrors D-25's never-move-never-copy posture).
export const LEGAL_ROSTER_EDGES: Record<
  RosterRelationshipState,
  ReadonlySet<RosterRelationshipState>
> = {
  proposed: new Set<RosterRelationshipState>(['accepted', 'refused', 'blocked']),
  accepted: new Set<RosterRelationshipState>(['ended']),
  refused: new Set<RosterRelationshipState>(),
  blocked: new Set<RosterRelationshipState>(),
  ended: new Set<RosterRelationshipState>(),
}

const KNOWN_ROSTER_STATES: ReadonlySet<string> = new Set(ROSTER_RELATIONSHIP_STATE_VALUES)

function isKnownRosterState(value: string): value is RosterRelationshipState {
  return KNOWN_ROSTER_STATES.has(value)
}

/**
 * True only when moving from `from` to `to` is a legal roster relationship
 * transition. Fails closed (false) on any unknown state value and on a
 * same-state self-transition.
 */
export function isLegalRosterTransition(
  from: RosterRelationshipState,
  to: RosterRelationshipState
): boolean {
  if (!isKnownRosterState(from) || !isKnownRosterState(to)) return false
  if (from === to) return false
  return LEGAL_ROSTER_EDGES[from].has(to)
}

// ─── Inertness (D-05) ────────────────────────────────────────────────────
/** True only for `proposed` — an inert relationship exposes nothing. */
export function isInertState(state: RosterRelationshipState): boolean {
  return state === 'proposed'
}

// ─── Proposal eligibility (D-15, D-51) ─────────────────────────────────────
/**
 * Whether a workspace may propose a new roster relationship with a Member.
 * Refuses when the Member has blocked this workspace after a prior refusal
 * (D-51), or when a live relationship already exists between this workspace
 * and this Member. Deliberately does NOT consider how many OTHER workspaces
 * already hold a relationship with the Member — Funūn never enforces
 * exclusivity across workspaces (D-15).
 */
export function canWorkspaceProposeRoster(args: {
  hasLiveRelationship: boolean
  isBlocked: boolean
}): boolean {
  if (args.isBlocked) return false
  if (args.hasLiveRelationship) return false
  return true
}

// ─── Effective end date (D-17, D-18) ───────────────────────────────────────
/**
 * Resolves the effective end of a relationship's access window as the
 * earlier of a scheduled termination date and a unilateral revocation
 * timestamp. A unilateral revocation always wins over a future termination
 * date, because access must stop immediately once the Member revokes,
 * regardless of what date was previously scheduled (D-17, D-18).
 */
export function resolveEffectiveEnd(args: {
  terminatesOn: string | null
  revokedAt: string | null
}): string | null {
  const { terminatesOn, revokedAt } = args
  if (terminatesOn && revokedAt) {
    const terminatesOnMs = new Date(terminatesOn).getTime()
    const revokedAtMs = new Date(revokedAt).getTime()
    return revokedAtMs <= terminatesOnMs ? revokedAt : terminatesOn
  }
  return terminatesOn ?? revokedAt ?? null
}

// ─── Live access window ─────────────────────────────────────────────────
/**
 * Whether workspace-derived access is currently live for this relationship.
 * False for any state other than `accepted`, false before `effectiveFrom`,
 * false at or after `effectiveEnd`. Accepts an injectable `now` (defaulting
 * to Date.now()), exactly as lib/client-partners/health.ts's HealthSignals
 * does, so time-dependent behavior is testable without fake timers.
 */
export function isWorkspaceAccessLive(args: {
  state: RosterRelationshipState
  effectiveFrom: string | null
  effectiveEnd: string | null
  now?: number
}): boolean {
  if (args.state !== 'accepted') return false

  const now = args.now ?? Date.now()

  if (args.effectiveFrom) {
    const from = new Date(args.effectiveFrom).getTime()
    if (now < from) return false
  }

  if (args.effectiveEnd) {
    const end = new Date(args.effectiveEnd).getTime()
    if (now >= end) return false
  }

  return true
}
