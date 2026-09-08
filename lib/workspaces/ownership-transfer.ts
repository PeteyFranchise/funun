import type { WorkspaceRole } from '@/lib/workspaces/types'

// ─── Two-sided workspace ownership transfer (R-05, R-22, WSR-07, WSR-08) ───
//
// THE R-05 RULE THIS MODULE EXISTS TO ENFORCE: only an owner may promote
// anyone to owner, an admin may never edit or remove an owner row, and
// nobody may promote themselves. Ownership of a workspace is the broadest
// authority the workspace model grants, and it is the one role change with
// no grant required to exploit — an admin who could promote themselves
// could then remove the real owner. R-05 removes that path entirely.
//
// Ownership therefore MOVES only as a TWO-SIDED act (R-05, mirroring D-29
// custody transfer): the incumbent owner NOMINATES, the named successor
// ACCEPTS, and the transfer row itself — moved to its terminal `accepted`
// state in the same transaction that rewrites the two `workspace_members`
// rows — is the permanent record that it happened. Never unilateral.
// `isLegalOwnershipTransition` is the one place legality is decided;
// `assertMayNominate` and `assertMayRespond` are the one place authority is
// decided. None of the three throws — each fails closed to a refusal.
//
// R-22 SETTLES THE SEMANTICS: accepting TRANSFERS ownership. The successor
// is promoted to `owner` and the nominator is demoted to `admin`, in that
// statement order (`guard_workspace_never_zero_owners` sees uncommitted
// writes from earlier statements in the same transaction, so the reverse
// order raises 42501). Accepting does NOT add a second owner. A workspace
// with two founders wanting "add an owner" needs a different RPC
// (`workspace_grant_ownership`) with a different authority rule; that is
// deliberately a later phase's problem and must not be built here. The
// vocabulary in this module — nominate, successor, incumbent, transfer —
// is chosen to match transfer semantics and must not drift toward
// "add owner" wording while the RPC behind it demotes the nominator.
//
// THE ATTACK SHAPE THIS MODULE MAKES IMPOSSIBLE, quoting
// `lib/workspaces/custody-transfer.ts`'s account of the F1 hotfix (Codex
// adversarial review, 2026-09-06): an earlier version of that module let
// one actor offer a transfer AS IF they held the record and then "accept
// their own offer via `assertMayRespond` — one person performing both
// sides of an act this file's own header already documented as two-sided,
// with no grant required to do it." The workspace-ownership layer is where
// that shape is most dangerous, because the prize is the workspace itself.
// `assertMayNominate` refuses a nominator who is not an active owner and
// refuses nominator === successor; `assertMayRespond` refuses the
// nominator as acceptor whatever else is true. Migration 197's CHECK
// constraints and `guard_workspace_owner_role_change` enforce the
// structural half independently at the database layer, so the attack stays
// impossible even if this file regresses (the house doctrine is two layers
// agreeing, never deduplication).
//
// This module is PURE. It decides legality and authority; it does not
// write. It holds no delete semantics, imports no Supabase client, performs
// no I/O, and never reads the process environment. Nothing exported here
// begins `create`, `update`, `delete` or `save`.

// ─── Ownership transfer state machine ───────────────────────────────────
// offered -> accepted, declined, withdrawn   (the only three legal exits)
// accepted, declined, withdrawn are terminal — a renewed nomination is a
// new row, never a revival, mirroring `custody-transfer.ts`'s
// TRANSFER_LEGAL_EDGES and this same phase's roster state machine.
//
// Migration 197's CHECK constraint on `workspace_ownership_transfers.state`
// is authored from this list, byte for byte. The two must change together:
// adding a state here without adding it there (or the reverse) is the drift
// class WSR-17 exists to prevent.
export const OWNERSHIP_TRANSFER_STATE_VALUES = ['offered', 'accepted', 'declined', 'withdrawn'] as const
export type OwnershipTransferState = (typeof OWNERSHIP_TRANSFER_STATE_VALUES)[number]

export const OWNERSHIP_LEGAL_EDGES: Record<OwnershipTransferState, ReadonlySet<OwnershipTransferState>> = {
  offered: new Set<OwnershipTransferState>(['accepted', 'declined', 'withdrawn']),
  accepted: new Set<OwnershipTransferState>(),
  declined: new Set<OwnershipTransferState>(),
  withdrawn: new Set<OwnershipTransferState>(),
}

const KNOWN_OWNERSHIP_STATES: ReadonlySet<string> = new Set(OWNERSHIP_TRANSFER_STATE_VALUES)

function isKnownOwnershipState(value: string): value is OwnershipTransferState {
  return KNOWN_OWNERSHIP_STATES.has(value)
}

/**
 * True only when moving from `from` to `to` is a legal ownership-transfer
 * transition. Fails closed (false) on any unknown state value, on a
 * same-state self-transition, and on any move OUT of a terminal state
 * (`accepted`, `declined`, `withdrawn` each have an empty edge set), so a
 * resolved nomination can never be revived.
 */
export function isLegalOwnershipTransition(from: OwnershipTransferState, to: OwnershipTransferState): boolean {
  if (!isKnownOwnershipState(from) || !isKnownOwnershipState(to)) return false
  if (from === to) return false
  return OWNERSHIP_LEGAL_EDGES[from].has(to)
}

// ─── Nomination authority (R-05, WSR-07, T-38.0.2-01-01) ────────────────
export type AssertMayNominateResult =
  | { ok: true }
  | { ok: false; status: 403 | 409; reason: string }

/**
 * Permits exactly ONE kind of nominator: a current, active `owner` of this
 * workspace, nominating somebody else who already holds an active seat in
 * it. Pure — the caller supplies the roles and the active flag, which the
 * RPC re-derives from the database under a lock (R-21: the route binds the
 * actor's identity, the database re-derives the actor's authority; a role
 * is never accepted as a parameter from a client).
 *
 * Refusals, in order, each failing closed and none throwing:
 *   1. nominator is not `owner` — an admin may not start an ownership
 *      transfer at all (R-05: admins may not touch owner rows).
 *   2. nominator and successor are the same person — no self-promotion,
 *      and the degenerate one-actor form of the F1 attack.
 *   3. successor holds no active seat here — a stranger cannot be
 *      nominated into ownership of a workspace they are not in.
 *   4. successor is already `owner` — there is nothing to transfer, and
 *      under R-22 accepting would demote the nominator for no gain.
 */
export function assertMayNominate(args: {
  nominatorRole: WorkspaceRole
  nominatorUserId: string
  successorUserId: string
  successorRole: WorkspaceRole | null
  successorIsActive: boolean
}): AssertMayNominateResult {
  if (args.nominatorRole !== 'owner') {
    return {
      ok: false,
      status: 403,
      reason:
        'Only a workspace owner can nominate a successor — an admin cannot promote anyone to owner, or change an owner’s seat (R-05).',
    }
  }

  if (args.nominatorUserId === args.successorUserId) {
    return {
      ok: false,
      status: 403,
      reason:
        'You cannot nominate yourself — ownership transfer is two-sided, and nobody may promote themselves to owner (R-05).',
    }
  }

  if (!args.successorIsActive || args.successorRole === null) {
    return {
      ok: false,
      status: 409,
      reason:
        'The person you nominated does not hold an active seat in this workspace. Invite them first, then nominate them.',
    }
  }

  if (args.successorRole === 'owner') {
    return {
      ok: false,
      status: 409,
      reason: 'That person already owns this workspace, so there is nothing to transfer.',
    }
  }

  return { ok: true }
}

// ─── Response authority (R-05, R-22, T-38.0.2-01-02) ────────────────────
export type OwnershipTransferParties = { fromUserId: string; toUserId: string; offeredBy: string }
export type OwnershipResponseAction = 'accept' | 'decline' | 'withdraw'

export type AssertMayRespondResult = { ok: true } | { ok: false; status: 403; reason: string }

/**
 * Pure — no I/O. Predicate structure copied from
 * `lib/workspaces/custody-transfer.ts`'s `assertMayRespond`, including its
 * F1-hardened self-dealing branch. Permits only the nomination's
 * `to_user_id` — the named successor — to accept or decline, and only
 * `offered_by` or `from_user_id` — the incumbent owner who put the
 * nomination forward — to withdraw it. A successor can never withdraw a
 * nomination made TO them (only decline it); the incumbent is the only
 * party who can retract it before the successor acts.
 *
 * DEFENCE IN DEPTH: an accept or decline additionally refuses when the
 * responder IS the nominator, even though `assertMayNominate` already
 * makes nominator === successor impossible and migration 197's
 * `CHECK (from_user_id <> to_user_id)` makes it impossible again at the
 * database layer. This branch exists so that if `assertMayNominate` is
 * ever widened, the same person still cannot both nominate and resolve a
 * single transfer — self-dealing stays structurally impossible at this
 * second layer regardless of what the first layer permits. This is the
 * exact shape R-05 exists to prevent at the workspace-ownership layer.
 */
export function assertMayRespond(args: {
  parties: OwnershipTransferParties
  actorUserId: string
  action: OwnershipResponseAction
}): AssertMayRespondResult {
  const { parties, actorUserId, action } = args

  if (action === 'accept' || action === 'decline') {
    if (actorUserId !== parties.toUserId) {
      return {
        ok: false,
        status: 403,
        reason: `Only the nominated successor may ${action} an ownership transfer.`,
      }
    }
    if (actorUserId === parties.offeredBy) {
      return {
        ok: false,
        status: 403,
        reason: `The owner who nominated a successor cannot also ${action} the nomination — ownership transfer is two-sided, never unilateral (R-05).`,
      }
    }
    return { ok: true }
  }

  // action === 'withdraw'
  if (actorUserId !== parties.offeredBy && actorUserId !== parties.fromUserId) {
    return {
      ok: false,
      status: 403,
      reason: 'Only the owner who nominated this successor may withdraw the nomination.',
    }
  }
  return { ok: true }
}

// ─── The copy shown to both parties before either acts (R-22, D-28) ─────
/**
 * The invariant half of the effect sentence, exported as a named constant
 * so the nomination screen, the acceptance screen and any notification
 * copy all quote one string rather than three paraphrases. Names what
 * changes — who administers this workspace — and, explicitly, what does
 * NOT change. Ownership of a WORKSPACE is not ownership of any Member's
 * record, catalogue or rights: those live separately, on split sheets and
 * version ownership records, and every Member's consent-rooted grants are
 * untouched by who administers the workspace around them (custody D-02,
 * D-28, D-43).
 */
export const OWNERSHIP_TRANSFER_EFFECT =
  'Accepting transfers ownership of the workspace: the successor becomes its owner and the ' +
  'nominating owner becomes an admin. It changes who administers this workspace — its members, ' +
  'its invitations, its roster proposals and its configuration. It does not change ownership of ' +
  'any Member’s record, catalogue or rights. It creates no split-sheet party, no credit, no ' +
  'royalty entitlement, no version-ownership record and no signature authority, and every ' +
  'Member’s consent-rooted grants stay exactly where they were.'

/**
 * The effect sentence with this workspace and this successor named, for
 * the confirmation both parties see before either acts. Never throws;
 * falls back to neutral wording when either name is blank, so a missing
 * display name degrades the copy rather than breaking the gate.
 */
export function describeOwnershipTransferEffect(args: { workspaceName: string; successorName: string }): string {
  const workspaceName = args.workspaceName.trim() || 'this workspace'
  const successorName = args.successorName.trim() || 'the nominated successor'
  return `Ownership of ${workspaceName} transfers to ${successorName}. ${OWNERSHIP_TRANSFER_EFFECT}`
}
