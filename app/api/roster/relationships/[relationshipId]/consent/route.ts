import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import { isWorkspaceAccessEnabled } from '@/lib/workspaces/access-kill-switch'
import { issueMemberConsent, revokeMemberConsent } from '@/lib/workspaces/consent-service'
import {
  loadRelationshipGrantChain,
  resolveConsentRootPermissions,
} from '@/lib/workspaces/grant-lineage-service'
import { isGrantChainLive, MEMBER_CONSENT_SOURCE } from '@/lib/workspaces/grant-lineage'
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
// FAILS CLOSED ON THE D-56 CONTROL. This path is not under
// `/api/workspaces/[workspaceId]/**` and therefore inherits no kill-switch
// consultation from anywhere else; every verb consults
// `isWorkspaceAccessEnabled` as its first statement and returns 503,
// copying `app/api/workspaces/invitations/accept/route.ts`. The check runs
// before authentication deliberately: it is a platform-wide control whose
// answer is identical for every caller and discloses nothing.
//
// A MISS AND A MISMATCH ARE INDISTINGUISHABLE. A relationship that does not
// exist and a relationship that names somebody else both return the same
// generic 403 with the same message, so this endpoint can never be used to
// enumerate relationships (T-38.0.1-07-03).

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

const RELATIONSHIP_COLUMNS = 'id, workspace_id, member_user_id, state, accepted_at'

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
 * What the workspace has asked for and has NOT been granted.
 *
 * There is no `workspace_permission_requests` table in this schema, and no
 * plan in this phase authors one — so an "outstanding request" is derived,
 * not stored. Migration 191's
 * `workspace_grants_consent_root_or_lineage_check` requires every
 * non-`member_consent` row to carry a `parent_grant_id`, which means a
 * workspace's own row can only ever exist BENEATH a Member consent root. A
 * delegated row that is not itself revoked but whose chain is no longer live
 * — because the Member revoked the root above it — is therefore exactly "a
 * permission this workspace holds a record of wanting, which currently
 * confers nothing." That is the set returned here, minus anything currently
 * granted. See 38.0.1-07-SUMMARY.md: a workspace cannot record an ask BEFORE
 * a first consent at all under the present schema, which is a real gap in
 * the WSR-27 surface rather than something this route can paper over.
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
  const chain = await loadRelationshipGrantChain(service, {
    workspaceId: args.workspaceId,
    relationshipId: args.relationshipId,
  })
  if (!chain.ok) return new Set()

  const catalogue: ReadonlySet<string> = new Set(WORKSPACE_PERMISSION_VALUES)
  const requested = new Set<WorkspacePermission>()

  for (const row of chain.rows) {
    if (row.source === MEMBER_CONSENT_SOURCE) continue
    if (row.revokedAt !== null) continue
    if (row.projectId !== null && row.projectId !== args.projectId) continue
    if (!catalogue.has(row.permission)) continue

    const permission = row.permission as WorkspacePermission
    if (args.granted.has(permission)) continue
    if (isGrantChainLive({ grantId: row.id, rows: chain.rows }).ok) continue

    requested.add(permission)
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
  const service = createServiceClient()

  if (!(await isWorkspaceAccessEnabled(service))) {
    return {
      ok: false,
      response: NextResponse.json({ error: ACCESS_DISABLED }, { status: 503 }),
    }
  }

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
  request: Request
): Promise<
  | { ok: true; permissions: string[]; projectId: string | null; projectIdSupplied: boolean }
  | { ok: false; error: string }
> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = ConsentBodySchema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request.' }
  }

  return {
    ok: true,
    permissions: parsed.data.permissions,
    projectId: parsed.data.projectId ?? null,
    projectIdSupplied: Object.prototype.hasOwnProperty.call(body, 'projectId'),
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

// ─── POST — the Member grants ─────────────────────────────────────────────
export async function POST(
  request: Request,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  const { relationshipId } = await params

  const context = await openConsentContext(relationshipId)
  if (!context.ok) return context.response

  const { row, userId, service } = context

  const parsed = await parseConsentBody(request)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const result = await issueMemberConsent(service, {
    workspaceId: row.workspace_id,
    relationshipId: row.id,
    consentingUserId: userId,
    requested: parsed.permissions,
    projectId: parsed.projectId,
  })

  // The service layer's own status and reason travel back unchanged — a
  // refusal is never remapped to a 200 with an empty body, which would read
  // to a client exactly like "you consented to nothing" rather than "you
  // were refused, and here is why."
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  // D-22 / D-50: both identities recorded. `changes` carries the permission
  // list and nothing else — no email, no display name, no document
  // reference — because this column is broadly readable and the general
  // redaction layer (WSR-19) is deferred (T-38.0.1-07-04).
  await logWorkspaceAction(service, {
    workspaceId: row.workspace_id,
    actorId: userId,
    subjectMemberId: userId,
    action: 'workspace.consent.granted',
    targetType: 'workspace_roster_relationship',
    targetId: row.id,
    changes: { permissions: result.permissions },
  })

  return NextResponse.json({ data: { permissions: result.permissions } })
}

// ─── DELETE — the Member revokes ──────────────────────────────────────────
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ relationshipId: string }> }
) {
  const { relationshipId } = await params

  const context = await openConsentContext(relationshipId)
  if (!context.ok) return context.response

  const { row, userId, service } = context

  const parsed = await parseConsentBody(request)
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
