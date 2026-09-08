// ─── D-55 / WSR-16 / R-07 — the workspace cohort gate ─────────────────────
// Server-only rollout boundary. NEVER expose either of these variables as
// NEXT_PUBLIC_*, and never import this module from a client component: the
// whole value of the gate is that a browser cannot see, cache or influence
// the answer, and the default must remain closed.
//
// Mirrors lib/song-passport/feature.ts in shape — pure decision function, an
// injected structurally-typed client, and `process.env` as a DEFAULT
// PARAMETER so the decision is unit-testable without mutating global state.
// It sits beside lib/workspaces/access-kill-switch.ts and shares that
// module's service-role-only posture.
//
// ─── Two deliberate departures from the Song Passport template ────────────
//
// 1. TWO environment variables, not three. Song Passport uses
//    `*_ENABLED`, `*_PILOT_ENABLED` and `*_KILL_SWITCH`. Workspaces already
//    HAVE a kill switch — D-56, in the database, in
//    `public.workspace_access_config` (migration 186) — and an env-based
//    second one would give the platform two stop buttons that can disagree.
//    This repo has already shipped a bug of exactly that shape: WSR-17
//    exists because the RLS helper and the API gate disagreed about
//    `expires_at`. So D-56 stays the single kill switch and this module
//    reads only `WORKSPACE_ACCESS_GENERAL_ENABLED` and
//    `WORKSPACE_COHORT_PILOT_ENABLED`.
//
// 2. THE DEFAULT IS CLOSED, which inverts Song Passport's third rung. There,
//    "pilot not enabled" means "feature off". Here, "neither variable set"
//    means COHORT MEMBERSHIP IS REQUIRED — not "workspaces are off", which
//    D-56 already expresses. That is the reading R-07 demands: the gate's
//    entire purpose is that flipping D-56 back on must not go from "off"
//    straight to "every Member". Going generally available is therefore one
//    explicit act (`WORKSPACE_ACCESS_GENERAL_ENABLED=true`), never an
//    omission.
//
// R-25 decided that a non-cohort Member receives 404, not 403 — during a
// bounded pilot someone outside the cohort should not learn the feature
// exists. That mapping is deliberately NOT here: this module returns a
// decision, and the gate in lib/workspaces/access.ts (plan 13) turns the
// decision into an HTTP status.

// ─── Environment ──────────────────────────────────────────────────────────

/**
 * Set to `true` ONLY to end the D-55 pilot and admit every Member. Leaving
 * it unset keeps the cohort requirement. Exported so the tests and
 * `.env.example` cannot drift from the reader.
 */
export const WORKSPACE_ACCESS_GENERAL_ENABLED_VAR = 'WORKSPACE_ACCESS_GENERAL_ENABLED'

/**
 * Set to `true` while the D-55 pilot is running. Informational today,
 * because the default is already closed — it exists so the intended state
 * is legible in the environment rather than inferred from an absence.
 */
export const WORKSPACE_COHORT_PILOT_ENABLED_VAR = 'WORKSPACE_COHORT_PILOT_ENABLED'

export type WorkspaceCohortEnvironment = Readonly<Record<string, string | undefined>>

/**
 * True when the caller must be in the D-55 cohort to reach workspaces.
 *
 * Deliberately the INVERSE of Song Passport's third rung: an absent variable
 * is never readable as permission (R-07). Only the exact string `'true'`
 * counts, matching `isSongPassportEnabled`'s strictness — `'TRUE'`, `'1'`
 * and `''` are all treated as unset.
 */
export function isWorkspaceCohortRequired(
  environment: WorkspaceCohortEnvironment = process.env
): boolean {
  return environment[WORKSPACE_ACCESS_GENERAL_ENABLED_VAR] !== 'true'
}

// ─── The decision ─────────────────────────────────────────────────────────

export type WorkspaceAccessDecision = {
  /** The D-56 kill switch, as the database reports it. */
  accessEnabled: boolean
  /** Whether this caller clears the D-55 cohort bound. */
  cohortEligible: boolean
}

type WorkspaceAccessPermittedRow = {
  access_enabled: boolean
  cohort_ok: boolean
}

/**
 * Structural — deliberately NOT `SupabaseClient` — so the suite can inject a
 * stub, the same affordance `SongPassportCohortClient` gives. The client is
 * always injected and must be a SERVICE-ROLE client: migration 186 revokes
 * `workspace_access_config` from `authenticated`/`anon`, so a session client
 * cannot reach the underlying state at all.
 */
export interface WorkspaceCohortClient {
  rpc(
    fn: 'workspace_access_permitted',
    args: { p_uid: string; p_require_cohort: boolean }
  ): PromiseLike<{
    data: WorkspaceAccessPermittedRow[] | WorkspaceAccessPermittedRow | null
    error: unknown
  }>
}

const CLOSED_DECISION: WorkspaceAccessDecision = { accessEnabled: false, cohortEligible: false }

function closedDecision(): WorkspaceAccessDecision {
  return { ...CLOSED_DECISION }
}

/**
 * Resolves the D-56 kill switch and the D-55 cohort window in ONE
 * service-role round trip.
 *
 * `public.workspace_access_permitted(p_uid, p_require_cohort)` (migration
 * 197, plan 09) folds both reads into a single function specifically so
 * `requireWorkspaceAccess` does not grow from one round trip to two on every
 * gated request — the same "fold the hops into one function" move migrations
 * 192 and 194 already made.
 *
 * FAILS CLOSED ON EVERY PATH: an RPC error, a null result, an empty set, a
 * synchronous throw and a rejected promise all resolve to
 * `{ accessEnabled: false, cohortEligible: false }`. This never throws, so a
 * gate can never mistake a transport failure for permission.
 */
export async function resolveWorkspaceAccessDecision(
  client: WorkspaceCohortClient,
  userId: string,
  environment: WorkspaceCohortEnvironment = process.env
): Promise<WorkspaceAccessDecision> {
  const requireCohort = isWorkspaceCohortRequired(environment)

  try {
    const { data, error } = await client.rpc('workspace_access_permitted', {
      p_uid: userId,
      p_require_cohort: requireCohort,
    })

    if (error) return closedDecision()

    // PostgREST returns a SET for a `RETURNS TABLE` function, but a single
    // object for a scalar one. Normalise both identically so the module does
    // not become sensitive to that choice on the SQL side.
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return closedDecision()

    return {
      accessEnabled: row.access_enabled === true,
      // When general availability is on, eligibility is settled here rather
      // than deferred to `cohort_ok`. Two independent layers agreeing is this
      // repo's doctrine (migrations 078, 136, 187, 190, 196) — the app layer
      // restates the decision it made instead of trusting the SQL to have
      // honoured the parameter it was handed. `accessEnabled` still comes
      // from the database, so D-56 keeps the last word either way.
      cohortEligible: requireCohort ? row.cohort_ok === true : true,
    }
  } catch {
    return closedDecision()
  }
}

// ─── Predicates for the three call sites ──────────────────────────────────

/**
 * A caller reaches workspaces only when the D-56 switch is on AND they clear
 * the D-55 cohort bound. Pure, so workspace creation and
 * `requireWorkspaceAccess` can reuse the same reading of a decision they
 * already hold rather than each inventing one.
 */
export function isWorkspaceAccessPermitted(decision: WorkspaceAccessDecision): boolean {
  return decision.accessEnabled && decision.cohortEligible
}

/**
 * R-24: the cohort gate applies to the ACCEPTOR of an invitation, not only
 * to workspace creation. Without this, one cohort owner can pull in
 * unlimited non-cohort Members and the pilot bound stops meaning anything.
 *
 * This is the third call site — research flagged that
 * `app/api/workspaces/invitations/accept/route.ts` calls
 * `isWorkspaceAccessEnabled` directly rather than going through the gate,
 * which is the exact shape of the F7 hotfix (a route carrying workspace
 * state that skipped the global control). Makes ONE round trip, and fails
 * closed for the same reasons `resolveWorkspaceAccessDecision` does.
 */
export async function canAcceptWorkspaceInvitation(
  client: WorkspaceCohortClient,
  userId: string,
  environment: WorkspaceCohortEnvironment = process.env
): Promise<boolean> {
  return isWorkspaceAccessPermitted(
    await resolveWorkspaceAccessDecision(client, userId, environment)
  )
}
