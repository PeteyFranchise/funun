// ─── Attributed acting-on-behalf (D-22, D-30, D-50) — pure, zero-I/O ───────
//
// WHAT THIS MODULE DELIBERATELY DOES NOT CONTAIN, in the strongest available
// terms: there is no view-as, no login-as, no session substitution, no
// impersonation token, and no "act as" cookie anywhere in this phase. A
// read-only "view as member" mode was considered during this phase's design
// and REJECTED as impersonation-shaped (D-22) — reintroducing any form of
// it is a decision for the project owner, not for an executor implementing
// a plan. Nothing in this module ever calls `supabase.auth.setSession`,
// touches a cookie, mints a token, or otherwise substitutes one identity's
// session for another's. `components/auth/AccountContextSwitch.tsx`'s
// sign-out-based account switch is a DIFFERENT mechanism for a DIFFERENT
// problem (switching between a person's own Team and Personal identities)
// and this module must never extend it or generalize its mechanism to
// workspace delegation.
//
// Delegated action is expressed as ATTRIBUTION ONLY: two named identities —
// the actor who is really signed in, and the subject Member the action is
// on behalf of — recorded together on one audit row (`logWorkspaceAction`,
// D-50) and rendered together in one display string ("Alex (Rise
// Management, on behalf of Jordan)"). No function anywhere in this module
// substitutes one identity for the other; both are always present and
// always distinguishable.

export type ActingAttribution = {
  actorName: string
  workspaceName: string
  subjectName: string | null
}

/**
 * Renders the always-attributed display string (D-22). When `subjectName`
 * is non-null the result names the actor, the workspace in parentheses, and
 * "on behalf of" the subject: "Alex (Rise Management, on behalf of
 * Jordan)". When `subjectName` is null the on-behalf clause is omitted
 * entirely — a workspace-administrative action (e.g. inviting a teammate)
 * is not a delegated one and must not read as though it were: "Alex (Rise
 * Management)".
 */
export function formatActingAttribution(args: ActingAttribution): string {
  const { actorName, workspaceName, subjectName } = args

  if (subjectName === null) {
    return `${actorName} (${workspaceName})`
  }

  return `${actorName} (${workspaceName}, on behalf of ${subjectName})`
}

export type ActingContext = {
  actorUserId: string
  workspaceId: string
  subjectMemberId: string
  permissionReliedOn: string | null
}

export type BuildActingContextResult =
  | { ok: true; context: ActingContext }
  | { ok: false; error: string }

/**
 * Builds the `ActingContext` a route passes straight through to
 * `logWorkspaceAction` (`actorId`, `workspaceId`, `subjectMemberId`,
 * `permissionReliedOn` — one-to-one, so a caller never restates field
 * names). Every field is a required, explicitly supplied argument — there
 * is no default that collapses the actor into the subject.
 *
 * Refuses when `actorUserId` and `subjectMemberId` are the same value
 * together with a non-null `permissionReliedOn`: a workspace member acting
 * on behalf of themselves through a workspace grant is a modelling error
 * (the person acting IS the person the action concerns, so there is no
 * delegation to attribute — "No actor may grant more authority than they
 * hold" degenerates into "there is no actor" when both identities collapse
 * to one under a grant-backed action). A null `permissionReliedOn` is not
 * refused even when the two ids match, because a Member's own direct action
 * on their own account is ordinary self-service, not acting-on-behalf.
 */
export function buildActingContext(args: {
  actorUserId: string
  workspaceId: string
  subjectMemberId: string
  permissionReliedOn: string | null
}): BuildActingContextResult {
  const { actorUserId, workspaceId, subjectMemberId, permissionReliedOn } = args

  if (actorUserId === subjectMemberId && permissionReliedOn !== null) {
    return {
      ok: false,
      error:
        'An actor cannot act on behalf of themselves through a workspace grant — actorUserId and subjectMemberId must name two distinct identities whenever a permission is relied on.',
    }
  }

  return {
    ok: true,
    context: { actorUserId, workspaceId, subjectMemberId, permissionReliedOn },
  }
}
