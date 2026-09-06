import {
  WORKSPACE_MEMBERSHIP_STATE_VALUES,
  type WorkspaceMembershipState,
  type WorkspaceRole,
} from '@/lib/workspaces/types'

// ─── Workspace membership state machine + never-zero-owners (D-11, D-13, D-14) ───
// Pure, zero-I/O module — no Supabase client, no side effects (style
// precedent: lib/selects/stage-machine.ts's LEGAL_EDGES + isLegalXTransition
// shape, and lib/vault/membership.ts's canX role-predicate naming).
//
// This module governs the WORKSPACE itself — invite, configure, roster,
// remove — and NEVER project access, which comes from separate grants
// (D-11). This module must never import from '@/lib/workspaces/permissions'.
//
// Removal ends future access only. Contributions, approvals, signatures,
// diary entries, and audit rows persist attributed (D-14). This module
// holds no delete semantics of any kind — nothing here ever deletes a row.

// ─── Legal transition table ────────────────────────────────────────────────
// pending    -> active                       (accepted the invite)
// active     -> suspended, removed, expired  (contractor time-box lapses)
// suspended  -> active, removed
// expired    -> active                       (renewed contractor seat)
// removed    is terminal — no outbound edge, ever
export const LEGAL_MEMBERSHIP_EDGES: Record<
  WorkspaceMembershipState,
  ReadonlySet<WorkspaceMembershipState>
> = {
  pending: new Set<WorkspaceMembershipState>(['active']),
  active: new Set<WorkspaceMembershipState>(['suspended', 'removed', 'expired']),
  suspended: new Set<WorkspaceMembershipState>(['active', 'removed']),
  expired: new Set<WorkspaceMembershipState>(['active']),
  removed: new Set<WorkspaceMembershipState>(),
}

const KNOWN_MEMBERSHIP_STATES: ReadonlySet<string> = new Set(WORKSPACE_MEMBERSHIP_STATE_VALUES)

function isKnownMembershipState(value: string): value is WorkspaceMembershipState {
  return KNOWN_MEMBERSHIP_STATES.has(value)
}

/**
 * True only when moving from `from` to `to` is a legal workspace membership
 * transition. Fails closed (false) on any unknown state value and on a
 * same-state self-transition.
 */
export function isLegalMembershipTransition(
  from: WorkspaceMembershipState,
  to: WorkspaceMembershipState
): boolean {
  if (!isKnownMembershipState(from) || !isKnownMembershipState(to)) return false
  if (from === to) return false
  return LEGAL_MEMBERSHIP_EDGES[from].has(to)
}

// ─── Role capability predicates (D-11) ─────────────────────────────────────
// These govern the workspace itself and never project access, which comes
// from separate grants — see '@/lib/workspaces/grants' and
// '@/lib/workspaces/permissions' for that independent axis.

/** True for owner and admin only. */
export function canManageWorkspaceMembers(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin'
}

/** True for owner and admin only. */
export function canManageRoster(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin'
}

/** True for owner only. */
export function canConfigureWorkspace(role: WorkspaceRole): boolean {
  return role === 'owner'
}

/** True for contractor only — the one role whose seat requires expires_at. */
export function isTimeBoxedRole(role: WorkspaceRole): boolean {
  return role === 'contractor'
}

// ─── Never-zero-owners (D-13) ───────────────────────────────────────────────
// The same sentence migration 182's trigger raises, exported as a named
// constant so plan 38-03's migration test can assert the SQL RAISE
// EXCEPTION text matches this API-side message word for word.
export const WORKSPACE_OWNER_FLOOR_MESSAGE =
  'A workspace must always have at least one active owner.'

/**
 * Fails when removing/demoting an owner would leave zero active owners.
 * This is the single predicate the service layer and the DB trigger both
 * express (D-13) — enforced at the DB/service layer, never only the UI.
 */
export function assertOwnerFloorHolds(args: {
  remainingActiveOwners: number
}): { ok: true } | { ok: false; reason: string } {
  if (args.remainingActiveOwners < 1) {
    return { ok: false, reason: WORKSPACE_OWNER_FLOOR_MESSAGE }
  }
  return { ok: true }
}

/**
 * Whether `actorRole` may remove `targetRole` from the workspace. Checks
 * the owner floor BEFORE the actor's role, so the floor is provably not
 * bypassable by privilege — an owner cannot remove the last active owner
 * any more than a member can.
 */
export function canRemoveMember(args: {
  actorRole: WorkspaceRole
  targetRole: WorkspaceRole
  remainingActiveOwnersAfterRemoval: number
}): { ok: true } | { ok: false; reason: string } {
  const floor = assertOwnerFloorHolds({
    remainingActiveOwners: args.remainingActiveOwnersAfterRemoval,
  })
  if (!floor.ok) return floor

  if (!canManageWorkspaceMembers(args.actorRole)) {
    return { ok: false, reason: 'Only owners and admins can remove workspace members.' }
  }

  return { ok: true }
}
