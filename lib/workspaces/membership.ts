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
// remove. It still GRANTS no project access: reaching a Member's project
// remains a per-relationship grant resolved elsewhere (D-11). As of R-20 /
// WSR-29 it does define the role FLOOR beneath project access — the set of
// roles a grant is even allowed to reach through — which is a refusal, never
// an authorisation. The sentence here used to read "and NEVER project
// access"; that became half false with R-20 and is corrected rather than
// left standing, because migration 139's stale parenthetical is how a wrong
// doctrine comment reached production once already.
// This module must never import from '@/lib/workspaces/permissions'.
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
// These govern the workspace itself. None of them grants project access,
// which comes from separate grants — see '@/lib/workspaces/grants' and
// '@/lib/workspaces/permissions' for that independent axis. The project-access
// role FLOOR (R-20 / WSR-29) lives in its own section further down; it only
// ever subtracts from what a grant may reach.

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

/**
 * True for owner only — the R-05 / WSR-07 owner-management rule: only an
 * owner may promote to owner, admins may not edit or remove owner rows, and
 * nobody may self-promote.
 *
 * This exists BESIDE `canManageWorkspaceMembers`, never replacing or widening
 * it. `canManageWorkspaceMembers` deliberately keeps admins, because ordinary
 * member management is still an admin's job and no decision takes that away;
 * the two predicates are meant to disagree on `admin`, and that disagreement
 * is the whole of WSR-07. A route gates the owner paths on BOTH.
 *
 * Migration 197's `guard_workspace_owner_role_change` trigger (plan 05) is the
 * independent database layer expressing the same rule structurally. Two layers
 * agreeing is this repo's doctrine (migrations 078, 136, 187, 190, 196), not
 * duplication to be collapsed.
 */
export function canManageOwners(role: WorkspaceRole): boolean {
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

// ─── Project-access role floor (R-20 / WSR-29) ──────────────────────────────
// The roles a workspace seat must hold before any grant is allowed to reach a
// Member's project. This is a floor, not a grant: passing it authorises
// nothing on its own, and failing it refuses regardless of what grants exist.
//
// This constant is the TypeScript twin of the conjunct migration 197 adds to
// `workspace_project_permission`'s hop 2 `workspace_members` join (plan 09).
// The two must change together — one exported set here, one conjunct there.
//
// It is deliberately a twin rather than a deduplication. WSR-17 exists because
// those exact two layers once disagreed about `expires_at`: the SQL hop passed
// an expired-but-active contractor seat while the API refused it, and migration
// 192 had to bring them back into line. This repo's answer to that class of bug
// is two independent layers that agree (migrations 078, 136, 187, 190, 196),
// each carrying a comment naming the other, not one layer trusting the other.
export const WORKSPACE_PROJECT_ACCESS_ROLES: readonly WorkspaceRole[] = [
  'owner',
  'admin',
  'member',
  'contractor',
]

const PROJECT_ACCESS_ROLE_SET: ReadonlySet<WorkspaceRole> = new Set(WORKSPACE_PROJECT_ACCESS_ROLES)

/**
 * The single user-facing sentence for a role-floor refusal, exported as a
 * named constant in the same idiom as WORKSPACE_OWNER_FLOOR_MESSAGE so every
 * project-data route refuses a guest in identical words.
 */
export const WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE =
  'A guest seat covers this workspace but not a Member’s project records. Ask an owner or admin to change the seat’s role.'

/**
 * True when `role` clears the project-access role floor. Owner, admin, member
 * and contractor clear it; `guest` does not (R-20, owner decision 2026-09-07):
 * a guest gets workspace chrome and never reaches a Member's project data.
 *
 * This predicate is deliberately NOT applied inside `requireWorkspaceAccess`.
 * That gate covers every route under /api/workspaces/**, including the chrome
 * routes R-20 explicitly keeps guests on — "guests keep everything that is not
 * project data". A branch inside the gate would over-apply the floor and lock
 * guests out of their own workspace. Instead this composes at the project-data
 * routes through `requireWorkspaceRole` (plan 13):
 *
 *   requireWorkspaceRole(access, canReachWorkspaceProjects, WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE)
 *
 * 38.0.1 Part B check B3 is the behavioural evidence that this floor did not
 * previously exist: a guest seat reached an attached project exactly as the
 * owner did, because grants are per-relationship and hop 2 carried no role
 * condition at all.
 */
export function canReachWorkspaceProjects(role: WorkspaceRole): boolean {
  return PROJECT_ACCESS_ROLE_SET.has(role)
}
