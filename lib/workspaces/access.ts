import type { SupabaseClient } from '@supabase/supabase-js'
import { getStaffRoles } from '@/lib/admin/staff-role'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveWorkspaceAccessDecision } from '@/lib/workspaces/cohort'
import {
  canReachWorkspaceProjects,
  WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE,
} from '@/lib/workspaces/membership'
import type { WorkspaceRole } from '@/lib/workspaces/types'

// ─── Server-side workspace access gate (D-30, D-31, D-33) ──────────────────
// Page redirects and workspace chrome are presentation only — a stale tab or
// a direct request still reaches an API route. This gate re-derives the
// caller's live membership from the DATABASE on every call, mirroring
// lib/accounts/member-api-gate.ts's requireMemberApiAccount doctrine exactly.
//
// The workspace id MUST arrive from the route's own path segment, never from
// a request body or header (D-31) — every call site in this codebase passes
// a path param, and this module never reads a request body itself.
//
// This module is additive and PARALLEL to the existing account-context and
// identity-resolution modules (see lib/accounts/, lib/auth/, components/auth/).
// It must not extend those modules' workspace-shaped union type or their
// sign-out-based context switcher — D-33 requires the opposite mechanism
// (instant, in-session switching) for workspaces, so this gate is a new,
// standalone module rather than a generalization of the staff-only
// sign-out boundary.
//
// D-56/WS-31 KILL SWITCH (F7 hotfix, 2026-09-06): `workspace_access_enabled()`
// (migration 186) originally gated only the RLS branch on vault_projects and
// its four child tables — with the switch OFF, every workspace SERVICE
// route (this gate) still worked, including the F1 custody-transfer chain,
// because this function never consulted the config at all. D-56 requires
// the control to disable ALL workspace-derived access, not just the RLS
// branch. `requireWorkspaceAccess` now consults
// `isWorkspaceAccessEnabled()` FIRST, before any other work — including the
// null-user check — and fails closed (503) the same way
// `workspace_access_enabled()`'s own `COALESCE(..., FALSE)` does on a
// missing or unreadable config row. Because every route under
// `app/api/workspaces/**` funnels through this one function, this single
// change covers the whole route family (see this hotfix's PLAN.md and
// SUMMARY.md for the route-by-route verification, including the two
// deliberate exceptions: `app/api/admin/workspaces/access/route.ts`, which
// must keep working WHILE disabled so an owner can re-enable it, and
// `app/api/vault/custody-transfers/route.ts`, which never carried any
// workspace-derived authority in the first place after the F1 fix).
//
// ─── D-55 / WSR-16 / R-07 — THE PILOT COHORT GATE (plan 13) ────────────────
// The D-56 switch is the stop button; the D-55 cohort is the BOUND. Without
// the cohort, flipping D-56 back on goes from "off" straight to "every
// Member", which is exactly what R-07 forbids. The decision is SERVER-ONLY
// and its two environment variables live in `lib/workspaces/cohort.ts`
// (`WORKSPACE_ACCESS_GENERAL_ENABLED`, `WORKSPACE_COHORT_PILOT_ENABLED`) —
// never NEXT_PUBLIC_*, never read here. THE DEFAULT IS CLOSED: neither
// variable set means cohort membership is REQUIRED, so an unset environment
// admits nobody rather than everybody.
//
// ONE ROUND TRIP, NOT TWO. This gate already made one service-role call per
// request to read the switch. `public.workspace_access_permitted(p_uid,
// p_require_cohort)` (migration 197) folds the switch and the cohort window
// into a single function so the hot path stays at one round trip — the same
// "fold the hops into one function" move migrations 192 and 194 made.
//
// THE ORDER IS SWITCH -> COHORT -> IDENTITY AND MUST NOT BE REORDERED. The
// F7 hotfix paragraph above is why the switch is consulted before the
// null-user check, and that is preserved literally: the decision (both
// halves) is resolved before anything else, and a disabled platform still
// returns 503 to an unauthenticated caller exactly as it did before. The one
// place identity intrudes is the MAPPING: a null user is answered 401 before
// the cohort half is mapped, because an unauthenticated caller has no cohort
// identity to be outside of — answering it 404 would report "no such
// feature" to someone who has simply not signed in. Only an AUTHENTICATED
// caller can be told 404.
//
// THERE ARE THREE KILL-SWITCH CALL SITES, NOT ONE (RESEARCH pitfall 12).
// Missing one reproduces hotfix F7's exact shape — a route carrying
// workspace state that skipped the global control. They are:
//   1. this file, `requireWorkspaceAccess` — every route under
//      `app/api/workspaces/[workspaceId]/**` (plan 13);
//   2. `app/api/workspaces/route.ts` — POST, workspace creation, which has
//      no workspaceId yet and so cannot funnel through this gate (plan 13);
//   3. `app/api/workspaces/invitations/accept/route.ts` — the R-24 acceptor,
//      because otherwise one cohort owner can pull in unlimited non-cohort
//      Members and the pilot bound stops meaning anything (plan 14).
// Check all three together or not at all.

export const WORKSPACE_ACCESS_REQUIRED =
  'Workspaces do not apply to Funūn Team Member identities. Sign in with your personal Member account.'

export const WORKSPACE_ACCESS_DISABLED =
  'Workspace access is temporarily disabled. Please try again shortly.'

/**
 * R-25 — what a Member OUTSIDE the D-55 pilot cohort is told.
 *
 * 403 would be the more honest status, and it is deliberately not used:
 * during a bounded pilot, "you may not" leaks the existence of a capability
 * the caller cannot reach, and 404 is how the rest of this repo hides an
 * unreachable resource. The sentence therefore says nothing about cohorts,
 * pilots or eligibility — it reads as an ordinary not-found.
 *
 * THIS IS A BOUNDED-PILOT DECISION, NOT A PERMANENT POSTURE. When
 * `WORKSPACE_ACCESS_GENERAL_ENABLED=true` ends the pilot, no caller reaches
 * this arm at all. It is also NEVER interchangeable with
 * WORKSPACE_ACCESS_DISABLED: 503 means the platform control is off and
 * everyone is refused; 404 means the platform is on and this caller is
 * outside the bound. `workspace_access_permitted` returns two booleans
 * rather than one precisely so the two stay distinguishable.
 */
export const WORKSPACE_NOT_FOUND = 'Not found.'

type AuthAccount = {
  id: string
  app_metadata?: unknown
}

// The id handed to the decision resolver when there is no authenticated
// caller. The platform half of the decision (`accessEnabled`) does not
// depend on it, and the cohort half cannot match it — `workspace_cohort`
// keys on real auth.users ids and the nil UUID is not one. It exists only so
// the F7 ordering survives: the switch is still consulted for an
// unauthenticated request, and that request is still answered 401 rather
// than 404 (see the header).
const UNAUTHENTICATED_ACTOR_ID = '00000000-0000-0000-0000-000000000000'

export type WorkspaceAccessResult =
  | { ok: true; workspaceId: string; userId: string; role: WorkspaceRole }
  | { ok: false; status: 401 | 403 | 404 | 500 | 503; error: string }

/**
 * Enforces the workspace access boundary for `/api/workspaces/**` routes.
 *
 * Order: the D-56/WS-31 kill switch and the D-55 pilot cohort are resolved
 * FIRST, in ONE service-role round trip, before any other work -> 503 when
 * the platform control is disabled, missing, or unreadable (fail closed).
 * Then, mirroring requireMemberApiAccount: null user -> 401; a caller
 * outside the pilot cohort -> 404 (R-25, never 403); any staff role -> 403
 * (staff identities are never workspace members, D-33, evaluated before any
 * database lookup); missing/non-active/lapsed membership row -> 403; lookup
 * error -> 500, never a permissive fallthrough. On success, `role` came from
 * the database on THIS call — no code path accepts a caller-supplied role or
 * membership object.
 *
 * THE ROLE FLOOR IS NOT HERE. See `requireWorkspaceProjectAccess` below.
 */
export async function requireWorkspaceAccess(
  supabase: SupabaseClient,
  user: AuthAccount | null,
  workspaceId: string,
  options?: { now?: number }
): Promise<WorkspaceAccessResult> {
  // ONE round trip for both halves. `resolveWorkspaceAccessDecision` never
  // throws — a transport failure, an RPC error, a null result and an empty
  // set all resolve to `{ accessEnabled: false, cohortEligible: false }`, so
  // this gate can never mistake a broken read for permission.
  const decision = await resolveWorkspaceAccessDecision(
    createServiceClient(),
    // F7 ORDERING, DELIBERATE — the switch is consulted even when there is
    // no user, so a disabled platform answers an unauthenticated caller 503
    // exactly as it did before this gate learned about cohorts.
    user?.id ?? UNAUTHENTICATED_ACTOR_ID,
    process.env
  )

  if (!decision.accessEnabled) {
    return { ok: false, status: 503, error: WORKSPACE_ACCESS_DISABLED }
  }

  // 401 BEFORE the cohort mapping: an unauthenticated caller has no cohort
  // identity to be outside of, and must not be told the feature does not
  // exist merely because they have not signed in.
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }

  // R-25: 404, not 403 — see WORKSPACE_NOT_FOUND.
  if (!decision.cohortEligible) {
    return { ok: false, status: 404, error: WORKSPACE_NOT_FOUND }
  }

  if (getStaffRoles(user).length > 0) {
    return { ok: false, status: 403, error: WORKSPACE_ACCESS_REQUIRED }
  }

  const { data: membership, error } = await supabase
    .from('workspace_members')
    .select('role, status, expires_at')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return { ok: false, status: 500, error: 'Could not verify workspace membership' }
  }

  if (!membership || membership.status !== 'active') {
    return { ok: false, status: 403, error: 'You are not an active member of this workspace' }
  }

  const now = options?.now ?? Date.now()
  if (membership.expires_at && new Date(membership.expires_at as string).getTime() <= now) {
    return { ok: false, status: 403, error: 'Your seat on this workspace has expired' }
  }

  return {
    ok: true,
    workspaceId,
    userId: user.id,
    role: membership.role as WorkspaceRole,
  }
}

/**
 * Composes a passed WorkspaceAccessResult with a role predicate (e.g.
 * canManageWorkspaceMembers from '@/lib/workspaces/membership'), so a route
 * expresses "gate + role check" without inlining a role literal itself.
 */
export function requireWorkspaceRole(
  access: WorkspaceAccessResult,
  predicate: (role: WorkspaceRole) => boolean,
  error: string
): WorkspaceAccessResult {
  if (!access.ok) return access
  if (!predicate(access.role)) {
    return { ok: false, status: 403, error }
  }
  return access
}

/**
 * R-20 / WSR-29 — the API-layer role floor beneath a Member's PROJECT DATA.
 * A `guest` seat is refused; `owner`, `admin`, `member` and `contractor` pass
 * through untouched. A failed access result passes through with its own
 * status intact, so a 503, a 404 or a 401 is never rewritten as a 403.
 *
 * WHY THIS IS A SEPARATE COMPOSITION AND NOT A BRANCH INSIDE
 * `requireWorkspaceAccess`. R-20 says two things at once: the API gate must
 * carry the same floor as the SQL, AND "guests keep everything that is not
 * project data". `requireWorkspaceAccess` gates EVERY route under
 * `/api/workspaces/**`, including the workspace CHROME routes a guest
 * legitimately reaches — the members list, the roster, the proposal surface
 * R-12 already admits them to. A blanket floor inside that gate would
 * satisfy the first half and violate the second, turning a role floor into a
 * ban. So the floor is applied ONLY where project data is actually reached:
 *
 *   - `app/api/workspaces/[workspaceId]/attachments/route.ts` — GET (the
 *     `loadWorkspaceCatalogue` read), POST (attach) and DELETE (detach);
 *   - `app/api/workspaces/[workspaceId]/projects/route.ts` — POST.
 *
 * THE SAME RULE LIVES IN EXACTLY THREE PLACES AND ALL THREE MOVE TOGETHER:
 *   1. `WORKSPACE_PROJECT_ACCESS_ROLES` / `canReachWorkspaceProjects` in
 *      `lib/workspaces/membership.ts` — the role set itself;
 *   2. this helper — the API layer's application of it;
 *   3. the `AND m.role IN (...)` conjunct on `workspace_project_permission`
 *      hop 2 (migration 197) — the independent SQL layer.
 * Two independent layers agreeing is this repo's doctrine (migrations 078,
 * 136, 187, 190, 196), not duplication to be deduplicated. WSR-17 exists
 * because those two layers once disagreed about `expires_at`; changing one
 * of the three without the others reintroduces that exact class of drift.
 */
export function requireWorkspaceProjectAccess(
  access: WorkspaceAccessResult
): WorkspaceAccessResult {
  return requireWorkspaceRole(
    access,
    canReachWorkspaceProjects,
    WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE
  )
}
