import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import { isWorkspaceAccessEnabled } from '@/lib/workspaces/access-kill-switch'
import { issueMemberConsent, revokeMemberConsent } from '@/lib/workspaces/consent-service'
import { assertMemberMayConsent } from '@/lib/workspaces/consent'
import { resolveConsentRootPermissions } from '@/lib/workspaces/grant-lineage-service'
import { loadRelationshipTier } from '@/lib/workspaces/roster-service'
import {
  decidePermissionRequest,
  listRequestsForWorkspace,
  type PermissionRequest,
  type PermissionRequestDecision,
  type PermissionRequestState,
} from '@/lib/workspaces/request-service'
import {
  isBundleExcluded,
  isStructurallyExcludedCapability,
  PERMISSION_TIER,
  WORKSPACE_PERMISSION_VALUES,
  type WorkspacePermission,
} from '@/lib/workspaces/permissions'
import type { RosterRelationshipState } from '@/lib/workspaces/types'

// ─── /api/roster/relationships/[relationshipId]/consent ───────────────────
//     The Member's OWN consent surface (R-01, WSR-01, D-21).
//
// This route sits beside `app/api/roster/relationships/route.ts` and is
// DELIBERATELY OUTSIDE `/api/workspaces/**`. The consent act belongs to the
// Member, who is not a member of the claiming workspace and must be able to
// grant and revoke without ever entering that workspace's context — the same
// reasoning the sibling roster route already records in its own header.
// Placement here is a security decision, not a filing decision.
//
// THE ONLY GATE IS `requireMemberApiAccount` PLUS A `member_user_id ===
// caller` COMPARISON. No workspace membership check and no workspace role
// helper is consulted anywhere in this file, by design: a workspace owner or
// admin has no standing whatsoever on this surface, and giving one a code
// path here — even a permissive-looking one — would recreate exactly the
// forgery surface this endpoint exists to close (T-38.0.1-07-01). The
// identity comparison below is the FIRST of two independent checks; the
// second is `assertMemberMayConsent` re-comparing the same two ids inside
// `lib/workspaces/consent.ts`, reached through `consent-service.ts`. A future
// edit that loses one still cannot write consent under another identity.
//
// `relationshipId` is taken from this route's OWN PATH SEGMENT only, never
// from a request body (D-31). `ConsentBodySchema` is `.strict()` and admits
// exactly two keys — no member id, no relationship id, and no workspace id
// is accepted from any input, so there is nothing in a body that can
// redirect a write to another Member's row (T-38.0.1-07-02).
//
// WHY THIS ENDPOINT EXISTS AT ALL (finding F6). D-21 always said the subject
// Member is the root of grant authority, but only the workspace's side was
// ever built: `assertGrantIsIssuable` asks whether a granter may relay a
// permission it already holds, and with no Member-issued row in existence
// that question had no answer, so the first grant on every relationship was
// refused forever and the whole authorization layer sat inert. This route is
// the seed the grant model never had — the one HTTP surface through which a
// `source = 'member_consent'` root comes into being.
//
// FAILS CLOSED ON THE D-56 CONTROL, BUT ONLY AFTER AUTHENTICATION. This path
// is not under `/api/workspaces/[workspaceId]/**` and therefore inherits no
// kill-switch consultation from anywhere else, so every verb consults
// `isWorkspaceAccessEnabled` and returns 503 — after `requireMemberApiAccount`
// has decided the caller, never before it.
//
// THE ORDER IS DELIBERATE AND THIS COMMENT USED TO ARGUE THE OPPOSITE, WRONGLY.
// It previously read: the check "runs before authentication deliberately: it is
// a platform-wide control whose answer is identical for every caller and
// discloses nothing," and justified that by "copying
// `app/api/workspaces/invitations/accept/route.ts`." That precedent was
// FALSE — that route calls `auth.getUser()` and `requireMemberApiAccount`
// first and consults no switch before either, as do the other three routes
// using this helper. This file was the lone outlier among five while its own
// comment claimed to be following them.
//
// Two things were actually wrong with switch-first, neither of them a hole
// (the switch is still consulted before any workspace work, so nothing
// unauthorised was ever reachable): an unauthenticated caller caused a
// service-role client and a database read before anything had authenticated
// them, and the 503-vs-401 split disclosed one global boolean — whether
// workspace access is enabled at all — to anybody who asked. An unauthenticated
// caller now gets 401 whether the switch is on or off, and learns nothing.
// (38.0.1 orchestrator notes §1, applied 2026-09-08.)
//
// A MISS AND A MISMATCH ARE INDISTINGUISHABLE. A relationship that does not
// exist and a relationship that names somebody else both return the same
// generic 403 with the same message, so this endpoint can never be used to
// enumerate relationships (T-38.0.1-07-03).
//
// ─── THE ASK, AND WHY DECLINE IS NOT REVOKE (R-19 / WSR-28) ───────────────
// `public.workspace_permission_requests` (migration 195) is where a
// workspace's ask lives, and it is the ONLY source this route reads a
// pending request from. It is not a grant and confers nothing — see that
// migration's header — so nothing on this route ever authorizes anything
// against it.
//
// The three acts this route supports are three different things and are
// deliberately not collapsed into one another:
//
//   POST                          — the Member GRANTS. Consent is issued.
//                                   A matching pending ask, if one exists,
//                                   is moved to `approved` as part of the
//                                   same act, so an answered ask never
//                                   lingers on the Member's list.
//   POST { decision: 'declined' } — the Member DECLINES a pending ask.
//                                   NOTHING is issued and NOTHING is
//                                   revoked; `workspace_grants` is not
//                                   touched at all. The only write is the
//                                   `declined` stamp on the ask itself.
//   DELETE                        — the Member REVOKES a consent they
//                                   previously gave. This is a grant-row
//                                   act and has nothing to do with the ask
//                                   table.
//
// Declining is not a small revoke and revoking is not a late decline. A
// decline says "I never said yes"; a revoke says "I am taking back the yes
// I gave." Routing one through the other would either write a revocation
// stamp for consent that never existed, or silently leave a live grant in
// place while telling the Member they had refused.
//
// ORDERING ON APPROVE IS NOT THIS ROUTE'S TO CHOOSE. `decidePermissionRequest`
// (lib/workspaces/request-service.ts) issues the consent FIRST through
// `issueMemberConsent` and stamps the request row only once that write has
// landed, so a failed consent leaves the ask `pending` rather than recording
// an approval whose grant does not exist. This route calls that function and
// does not re-implement the sequence; in particular it never stamps a row
// and then issues.

// The permission values stay `z.string()` deliberately. The
// recognised / structurally-excluded / tier decision belongs to
// `assertMemberMayConsent`, which refuses an unrecognised or excluded value
// BY NAME; a `z.enum` here would collapse all three into one generic Zod
// message and move a security decision into the request schema.
const ConsentBodySchema = z
  .object({
    permissions: z.array(z.string()).min(1),
    projectId: z.string().uuid().nullable().optional(),
  })
  .strict()

// POST additionally admits the Member's answer to a pending ask. `decision`
// is a `z.enum` where `permissions` is not, and the difference is the same
// one the comment above draws: an unrecognised permission is a security
// decision that belongs to `assertMemberMayConsent`, whereas `decision` has
// exactly two legal values and no policy attached to either — the two the
// Member is entitled to make. 'withdrawn' is absent because withdrawing is
// the asking workspace's act, not the Member's (migration 195's
// `..._member_decide` policy draws the same line).
//
// DELETE keeps the narrower `ConsentBodySchema`, so a `decision` key on a
// revoke is a 400 rather than something quietly ignored — the same posture
// DELETE already takes for `projectId`.
const ConsentDecisionBodySchema = ConsentBodySchema.extend({
  decision: z.enum(['approved', 'declined']).optional(),
}).strict()

const RELATIONSHIP_COLUMNS = 'id, workspace_id, member_user_id, state, accepted_at'

const PENDING_ONLY: readonly PermissionRequestState[] = ['pending']

// One generic refusal for both a miss and an identity mismatch.
const NOT_YOURS = 'This roster relationship does not name you.'

const ACCESS_DISABLED = 'Workspace access is temporarily disabled.'

type RelationshipRow = {
  id: string
  workspace_id: string
  member_user_id: string
  state: RosterRelationshipState
  accepted_at: string | null
}

type PermissionRow = {
  permission: WorkspacePermission
  tier: 'operational' | 'authority'
  sensitive: boolean
}

/**
 * Loads the relationship named by this route's own path segment. Mirrors
 * `loadTargetRelationship` in `app/api/workspaces/[workspaceId]/roster/
 * route.ts`, minus its workspace scoping — there is no workspace in this
 * route's path, and there must not be: the Member reaches their own
 * relationship by its id alone, and the authorization that matters is the
 * `member_user_id` comparison every caller performs on the returned row.
 */
async function loadRelationship(
  service: ReturnType<typeof createServiceClient>,
  relationshipId: string
): Promise<{ row: RelationshipRow | null; error?: string }> {
  const { data, error } = await service
    .from('workspace_roster_relationships')
    .select(RELATIONSHIP_COLUMNS)
    .eq('id', relationshipId)
    .maybeSingle()

  if (error) return { row: null, error: error.message }
  return { row: (data as RelationshipRow | null) ?? null }
}

/**
 * Renders a permission set as the rows the WSR-27 surface displays, in the
 * catalogue's own matrix order. Built by walking
 * `WORKSPACE_PERMISSION_VALUES` rather than the input set, so a value that
 * is not a member of the grantable catalogue cannot appear in a response no
 * matter what a row in the database happens to carry. The structural
 * exclusion filter is a second, defensive pass over the same guarantee
 * (T-38.0.1-07-05): a structurally excluded capability is not a
 * `WorkspacePermission` and can never be in this list, and it is filtered
 * anyway.
 */
function toPermissionRows(permissions: ReadonlySet<WorkspacePermission>): PermissionRow[] {
  return WORKSPACE_PERMISSION_VALUES.filter(
    (permission) => permissions.has(permission) && !isStructurallyExcludedCapability(permission)
  ).map((permission) => ({
    permission,
    tier: PERMISSION_TIER[permission],
    sensitive: isBundleExcluded(permission),
  }))
}

/**
 * The workspace's OPEN asks against this relationship, keyed by permission.
 *
 * The one reader of `workspace_permission_requests` in this file — both the
 * GET list and the POST decision path go through it, so there is exactly one
 * definition of "pending" on this surface and no way for the list a Member
 * sees to drift from the set they can act on.
 *
 * SCOPE IS MATCHED EXACTLY, never subsumed. An ask filed against one project
 * is a different question from an ask filed relationship-wide, so a
 * relationship-wide consent does not silently answer a project-scoped ask
 * (and vice versa). The unanswered one stays on the Member's list, which is
 * the honest outcome: nobody has actually answered it.
 *
 * `listRequestsForWorkspace` already drops any row whose permission is not a
 * member of the grantable catalogue or is structurally excluded (D-42), so
 * neither can reach this map even if a row somehow carried one. Migration
 * 195's partial unique index makes at most one pending ask exist per
 * (relationship, permission, scope); the first-wins guard below is the
 * belt-and-braces half of that guarantee.
 */
async function loadPendingAsks(
  service: ReturnType<typeof createServiceClient>,
  args: { workspaceId: string; relationshipId: string; projectId: string | null }
): Promise<
  { ok: true; byPermission: Map<string, PermissionRequest> } | { ok: false; error: string }
> {
  const result = await listRequestsForWorkspace(service, {
    workspaceId: args.workspaceId,
    relationshipId: args.relationshipId,
    states: PENDING_ONLY,
  })
  if (!result.ok) return { ok: false, error: result.error }

  const byPermission = new Map<string, PermissionRequest>()
  for (const request of result.requests) {
    if (request.projectId !== args.projectId) continue
    if (byPermission.has(request.permission)) continue
    byPermission.set(request.permission, request)
  }

  return { ok: true, byPermission }
}

/**
 * What the workspace has asked for and has NOT been granted.
 *
 * READ FROM `public.workspace_permission_requests` (migration 195), which is
 * the only place an ask is recorded. Before that table existed this set was
 * DERIVED from delegated grant rows whose lineage had gone dead — a
 * definition that could only ever populate after a consent-then-revoke, and
 * therefore structurally could not contain a first-time ask, which is
 * precisely the story WSR-27 exists to tell (the gap plan 07 recorded and
 * R-19 closed). Nothing here reads `workspace_grants` any more.
 *
 * Still minus anything currently granted: a pending row for a permission the
 * Member has already consented to is a stale question, and putting it in
 * front of them would invite them to approve what they have already given.
 */
async function resolveOutstandingRequests(
  service: ReturnType<typeof createServiceClient>,
  args: {
    workspaceId: string
    relationshipId: string
    projectId: string | null
    granted: ReadonlySet<WorkspacePermission>
  }
): Promise<ReadonlySet<WorkspacePermission>> {
  const pending = await loadPendingAsks(service, {
    workspaceId: args.workspaceId,
    relationshipId: args.relationshipId,
    projectId: args.projectId,
  })
  if (!pending.ok) return new Set()

  const requested = new Set<WorkspacePermission>()
  for (const request of pending.byPermission.values()) {
    if (args.granted.has(request.permission)) continue
    requested.add(request.permission)
  }

  return requested
}

/**
 * The shared opening of all three verbs: kill switch, Member-only account
 * gate, relationship load, identity comparison. Returns either the proven
 * relationship row and the acting Member's id, or the response to send.
 */
async function openConsentContext(relationshipId: string): Promise<
  | { ok: true; row: RelationshipRow; userId: string; service: ReturnType<typeof createServiceClient> }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const gate = await requireMemberApiAccount(supabase, user)
  if (!gate.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: gate.error }, { status: gate.status }),
    }
  }

  // The switch is consulted here — after the caller is known, before any
  // workspace work — so an unauthenticated request never reaches a service-role
  // client and never learns whether workspace access is enabled. See the
  // ordering note in this file's header.
  const service = createServiceClient()

  if (!(await isWorkspaceAccessEnabled(service))) {
    return {
      ok: false,
      response: NextResponse.json({ error: ACCESS_DISABLED }, { status: 503 }),
    }
  }

  const { row, error } = await loadRelationship(service, relationshipId)
  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error }, { status: 500 }),
    }
  }

  // A miss and a mismatch are one indistinguishable refusal — this endpoint
  // never discloses whether a relationship exists (T-38.0.1-07-03).
  if (!row || row.member_user_id !== gate.user.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: NOT_YOURS }, { status: 403 }),
    }
  }

  return { ok: true, row, userId: gate.user.id, service }
}

async function parseConsentBody(
  request: Request,
  schema: typeof ConsentBodySchema | typeof ConsentDecisionBodySchema
): Promise<
  | {
      ok: true
      permissions: string[]
      projectId: string | null
      projectIdSupplied: boolean
      decision: PermissionRequestDecision | null
    }
  | { ok: false; error: string }
> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request.' }
  }

  const data = parsed.data as z.infer<typeof ConsentDecisionBodySchema>

  return {
    ok: true,
    permissions: data.permissions,
    projectId: data.projectId ?? null,
    projectIdSupplied: Object.prototype.hasOwnProperty.call(body, 'projectId'),
    decision: data.decision ?? null,
  }
}

// ─── GET — what this workspace holds, and what it is still asking for ─────
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  const { relationshipId } = await params

  const context = await openConsentContext(relationshipId)
  if (!context.ok) return context.response

  const { row, service } = context

  const granted = await resolveConsentRootPermissions(service, {
    workspaceId: row.workspace_id,
    relationshipId: row.id,
    projectId: null,
  })

  const requested = await resolveOutstandingRequests(service, {
    workspaceId: row.workspace_id,
    relationshipId: row.id,
    projectId: null,
    granted,
  })

  // The workspaces SELECT policy scopes to active workspace members and the
  // creator only — the named Member is neither, so the display fields come
  // through the service client AFTER the gate above has already proved this
  // Member's identity. Same gate-then-service-client shape
  // `app/api/roster/relationships/route.ts` documents for its own read.
  const { data: workspaceRow } = await service
    .from('workspaces')
    .select('name, workspace_type')
    .eq('id', row.workspace_id)
    .maybeSingle()

  return NextResponse.json({
    data: {
      relationshipId: row.id,
      workspaceId: row.workspace_id,
      workspaceName: (workspaceRow?.name as string | undefined) ?? null,
      workspaceType: (workspaceRow?.workspace_type as string | undefined) ?? null,
      relationshipState: row.state,
      relationshipAcceptedAt: row.accepted_at ?? null,
      granted: toPermissionRows(granted),
      requested: toPermissionRows(requested),
    },
  })
}

/**
 * Refuses a consent set BEFORE anything is written, using the very
 * assertion the writer will use again (`assertMemberMayConsent`, reached
 * through `issueMemberConsent`) rather than a second opinion about the same
 * question.
 *
 * WHY IT IS HERE AT ALL. `issueMemberConsent` is all-or-nothing across the
 * set it is handed — a refusal writes nothing for any permission in the
 * request. Approving now splits a set across two writers (asked permissions
 * go through `decidePermissionRequest`, unasked ones through
 * `issueMemberConsent`), and without this pre-flight a set containing one
 * good and one refusable permission could write the first before the second
 * was refused. This restores the all-or-nothing property to the SET, which
 * is the property the Member is relying on.
 *
 * It can only ever turn a would-be write into a refusal — it approves
 * nothing and authorizes nothing, and both real writers re-run the same
 * assertion on their own inputs regardless (D-49's two enforcement points).
 */
async function preflightConsentSet(
  service: ReturnType<typeof createServiceClient>,
  args: { row: RelationshipRow; userId: string; permissions: readonly string[] }
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const tier = await loadRelationshipTier(service, {
    relationshipId: args.row.id,
    state: args.row.state,
  })
  if (!tier.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Could not resolve the relationship authority tier.' },
        { status: 500 }
      ),
    }
  }

  const consent = assertMemberMayConsent({
    requested: new Set(args.permissions),
    relationshipState: args.row.state,
    relationshipMemberUserId: args.row.member_user_id,
    consentingUserId: args.userId,
    relationshipTier: tier.tier,
  })

  if (!consent.ok) {
    return { ok: false, response: NextResponse.json({ error: consent.reason }, { status: 403 }) }
  }

  return { ok: true }
}

// ─── POST — the Member grants, or answers an ask ──────────────────────────
//
// `decision` omitted is the Member GRANTING, exactly as this verb has always
// meant. `decision: 'approved'` is the Member ANSWERING a pending ask and
// requires one to exist. Both issue consent; the difference is only whether
// a missing ask is a refusal or simply nothing to move.
//
// `decision: 'declined'` writes no grant of any kind.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  const { relationshipId } = await params

  const context = await openConsentContext(relationshipId)
  if (!context.ok) return context.response

  const { row, userId, service } = context

  const parsed = await parseConsentBody(request, ConsentDecisionBodySchema)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const pending = await loadPendingAsks(service, {
    workspaceId: row.workspace_id,
    relationshipId: row.id,
    projectId: parsed.projectId,
  })
  if (!pending.ok) return NextResponse.json({ error: pending.error }, { status: 500 })

  // A named permission with no open ask has nothing to decide. Refused,
  // never treated as a silent success — a Member told "declined" about a
  // question nobody asked, or "approved" about one that was already
  // answered, has been told something untrue.
  if (parsed.decision !== null) {
    const unanswerable = parsed.permissions.filter(
      (permission) => !pending.byPermission.has(permission)
    )
    if (unanswerable.length > 0) {
      return NextResponse.json(
        {
          error: `No pending permission request on this relationship names ${unanswerable.join(', ')}.`,
        },
        { status: 409 }
      )
    }
  }

  if (parsed.decision === 'declined') {
    return declineAsks(service, {
      row,
      userId,
      permissions: parsed.permissions,
      pending: pending.byPermission,
    })
  }

  return approveConsent(service, {
    row,
    userId,
    permissions: parsed.permissions,
    projectId: parsed.projectId,
    pending: pending.byPermission,
  })
}

/**
 * DECLINE — the ask is answered "no" and NOTHING ELSE HAPPENS.
 *
 * No grant is written, no grant is revoked, and `workspace_grants` is not
 * read or touched on this path at all. The only write is the `declined`
 * stamp `decidePermissionRequest` puts on the request row (plus its own
 * audit entry, which is why nothing further is logged here — a second row
 * would say the same thing twice under a different name).
 *
 * Deliberately runs NO consent pre-flight: a Member may decline an ask on a
 * relationship they never accepted, and requiring the relationship to be
 * consent-eligible before they can say no would trap the question open.
 */
async function declineAsks(
  service: ReturnType<typeof createServiceClient>,
  args: {
    row: RelationshipRow
    userId: string
    permissions: readonly string[]
    pending: Map<string, PermissionRequest>
  }
) {
  const declined: WorkspacePermission[] = []

  for (const permission of args.permissions) {
    const ask = args.pending.get(permission)
    if (!ask) continue

    const decided = await decidePermissionRequest(service, {
      requestId: ask.id,
      decidingUserId: args.userId,
      decision: 'declined',
    })

    if (!decided.ok) {
      return NextResponse.json({ error: decided.error }, { status: decided.status })
    }

    declined.push(decided.request.permission)
  }

  return NextResponse.json({ data: { permissions: declined } })
}

/**
 * APPROVE / GRANT — consent is issued, and any ask it answers stops being
 * pending.
 *
 * A permission the workspace actually asked for goes through
 * `decidePermissionRequest`, which owns the ordering (issue, then stamp) and
 * leaves the ask pending if the consent write fails. A permission nobody
 * asked for — the Member granting on their own initiative — goes to
 * `issueMemberConsent` directly, in ONE call, so that group keeps its
 * all-or-nothing behaviour intact.
 *
 * The returned `permissions` are the ones NEWLY written by this call, which
 * is what this verb has always returned: re-consenting to something already
 * live is a no-op success and reports nothing written.
 */
async function approveConsent(
  service: ReturnType<typeof createServiceClient>,
  args: {
    row: RelationshipRow
    userId: string
    permissions: readonly string[]
    projectId: string | null
    pending: Map<string, PermissionRequest>
  }
) {
  const preflight = await preflightConsentSet(service, {
    row: args.row,
    userId: args.userId,
    permissions: args.permissions,
  })
  if (!preflight.ok) return preflight.response

  const issued: WorkspacePermission[] = []
  const unasked: string[] = []

  for (const permission of args.permissions) {
    const ask = args.pending.get(permission)
    if (!ask) {
      unasked.push(permission)
      continue
    }

    const decided = await decidePermissionRequest(service, {
      requestId: ask.id,
      decidingUserId: args.userId,
      decision: 'approved',
    })

    // The service layer's own status and reason travel back unchanged — a
    // refusal is never remapped to a 200 with an empty body, which would
    // read to a client exactly like "you consented to nothing" rather than
    // "you were refused, and here is why."
    if (!decided.ok) {
      return NextResponse.json({ error: decided.error }, { status: decided.status })
    }

    issued.push(...decided.issued)
  }

  if (unasked.length > 0) {
    const result = await issueMemberConsent(service, {
      workspaceId: args.row.workspace_id,
      relationshipId: args.row.id,
      consentingUserId: args.userId,
      requested: unasked,
      projectId: args.projectId,
    })

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    issued.push(...result.permissions)
  }

  // D-22 / D-50: both identities recorded. `changes` carries the permission
  // list and nothing else — no email, no display name, no document
  // reference — because this column is broadly readable and the general
  // redaction layer (WSR-19) is deferred (T-38.0.1-07-04).
  await logWorkspaceAction(service, {
    workspaceId: args.row.workspace_id,
    actorId: args.userId,
    subjectMemberId: args.userId,
    action: 'workspace.consent.granted',
    targetType: 'workspace_roster_relationship',
    targetId: args.row.id,
    changes: { permissions: issued },
  })

  return NextResponse.json({ data: { permissions: issued } })
}

// ─── DELETE — the Member revokes ──────────────────────────────────────────
//
// STILL MEANS EXACTLY WHAT IT ALWAYS MEANT: take back a consent I previously
// gave. It has no relationship to the ask table, reads no request row and
// writes none. A pending ask is declined through POST, not here — see the
// file header on why those two are not the same act.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  const { relationshipId } = await params

  const context = await openConsentContext(relationshipId)
  if (!context.ok) return context.response

  const { row, userId, service } = context

  const parsed = await parseConsentBody(request, ConsentBodySchema)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  // `revokeMemberConsent` clears EVERY live consent row for the named
  // permissions on this relationship, across every project scope. Accepting
  // a `projectId` here and quietly ignoring it would let a caller believe
  // they had narrowed a revocation that in fact went wider, so it is
  // refused outright rather than silently dropped.
  if (parsed.projectIdSupplied) {
    return NextResponse.json(
      {
        error:
          'projectId is not accepted on a revoke — revoking clears the named permissions across the whole relationship.',
      },
      { status: 400 }
    )
  }

  const result = await revokeMemberConsent(service, {
    workspaceId: row.workspace_id,
    relationshipId: row.id,
    consentingUserId: userId,
    permissions: parsed.permissions,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  await logWorkspaceAction(service, {
    workspaceId: row.workspace_id,
    actorId: userId,
    subjectMemberId: userId,
    action: 'workspace.consent.revoked',
    targetType: 'workspace_roster_relationship',
    targetId: row.id,
    changes: { permissions: result.permissions },
  })

  return NextResponse.json({ data: { permissions: result.permissions } })
}
