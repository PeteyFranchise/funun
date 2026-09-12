import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import { isWorkspaceAccessEnabled } from '@/lib/workspaces/access-kill-switch'
import { resolveConsentRootPermissions } from '@/lib/workspaces/grant-lineage-service'
import { listRequestsForMember } from '@/lib/workspaces/request-service'
import {
  isBundleExcluded,
  isStructurallyExcludedCapability,
  PERMISSION_TIER,
  WORKSPACE_PERMISSION_VALUES,
  type WorkspacePermission,
} from '@/lib/workspaces/permissions'
import type { RosterRelationshipState } from '@/lib/workspaces/types'

// ─── /api/settings/permissions — the Member's aggregate consent view ──────
//     The read half of WSR-27 (R-18). One page, every workspace.
//
// READ-ONLY, AND DELIBERATELY EXPORTS NO MUTATION VERB. Every approve,
// decline and revoke on this surface goes through
// `app/api/roster/relationships/[relationshipId]/consent/route.ts`, which
// owns the Member-identity check — one identity check, in one place, to get
// right. A second mutation surface here would be a second identity check to
// get wrong, and the forgery it would open is exactly what the consent
// route exists to close (T-38.0.1-12-02). If a future change needs a write
// on this page, add it to the consent route, not to this file.
//
// AUTHORIZATION HERE IS "THESE ROWS NAME ME". There is no workspace
// membership gate and no workspace role helper anywhere in this file, by
// design: a workspace owner querying this endpoint sees only rows naming
// themselves, and being an owner of the ASKING workspace confers no standing
// whatsoever over the Member being asked (T-38.0.1-12-01). The relationship
// read runs through the RLS-scoped session client filtered on the
// authenticated user id, with migration 183's own
// `workspace_roster_relationships_select` policy as the independent second
// layer; the permission-request read is keyed on `member_user_id` with the
// same authenticated id, never on anything supplied by the caller. This
// route accepts NO input at all — no query parameter, no body — so there is
// nothing in a request that could redirect it at another Member's rows.
//
// PENDING MEANS `public.workspace_permission_requests` (R-19 / WSR-28,
// migration 195). It does NOT mean the derived stand-in the consent route
// improvised before that table existed: a set derived from dead-lineage
// grant rows only ever populates AFTER a consent-then-revoke, so it
// structurally cannot contain a first-time ask — which is the one story
// this surface exists to tell ("{Workspace name} wants access").
//
// PROJECT-SCOPED ASKS ARE OMITTED, NOT FLATTENED. A request row may carry a
// `project_id`. The group shape below carries no project, so a client
// approving from a flattened row would send a relationship-wide consent and
// grant strictly MORE than the workspace asked for. Until 38.1 carries
// project scope end to end, this minimal surface shows only the
// relationship-wide asks it can represent honestly — the same `projectId:
// null` scope the active list resolves.
//
// FAILS CLOSED ON THE D-56 CONTROL, returning 503, copying
// `app/api/workspaces/invitations/accept/route.ts`. The Member-account gate
// runs FIRST so an unauthenticated caller still gets 401 while the control
// is off — the kill switch is a platform-wide state, not an authentication
// answer, and a 503 to an anonymous caller would disclose more than a 401.

const RELATIONSHIP_COLUMNS = 'id, workspace_id, member_user_id, state, accepted_at'

const ACCESS_DISABLED = 'Workspace access is temporarily disabled.'

type RelationshipRow = {
  id: string
  workspace_id: string
  member_user_id: string
  state: RosterRelationshipState
  accepted_at: string | null
}

export type ConsentPermissionRow = {
  permission: WorkspacePermission
  tier: 'operational' | 'authority'
  sensitive: boolean
}

/**
 * One card on the WSR-27 surface: what a single workspace is asking for, or
 * what it currently holds. Carries workspace DISPLAY fields and permission
 * values only — no email, no member id (not even the caller's own, which
 * they already know), and no document reference (T-38.0.1-12-04).
 * Plain-language copy is resolved on the client from
 * `lib/workspaces/permission-copy.ts`; it is deliberately not embedded here,
 * so the copy table has exactly one home.
 */
export type WorkspaceConsentGroup = {
  workspaceId: string
  workspaceName: string | null
  workspaceType: string | null
  relationshipId: string
  relationshipAcceptedAt: string | null
  permissions: ConsentPermissionRow[]
}

/**
 * Renders a permission set as display rows, in the catalogue's own matrix
 * order. Built by walking `WORKSPACE_PERMISSION_VALUES` rather than the
 * input set — the same construction
 * `app/api/roster/relationships/[relationshipId]/consent/route.ts` uses — so
 * a value that is not a member of the grantable catalogue cannot reach a
 * response no matter what a database row happens to carry. The structural
 * exclusion filter is a third defensive pass over a guarantee the type
 * system and the two service modules already make (T-38.0.1-12-03).
 */
function toPermissionRows(permissions: ReadonlySet<WorkspacePermission>): ConsentPermissionRow[] {
  return WORKSPACE_PERMISSION_VALUES.filter(
    (permission) => permissions.has(permission) && !isStructurallyExcludedCapability(permission)
  ).map((permission) => ({
    permission,
    tier: PERMISSION_TIER[permission],
    sensitive: isBundleExcluded(permission),
  }))
}

// ─── GET — every pending ask and every live grant naming this Member ──────
export async function GET(_request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const gate = await requireMemberApiAccount(supabase, user)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const service = createServiceClient()
  if (!(await isWorkspaceAccessEnabled(service))) {
    return NextResponse.json({ error: ACCESS_DISABLED }, { status: 503 })
  }

  const memberUserId = gate.user.id

  // RLS-scoped session client, exactly as app/api/roster/relationships/
  // route.ts reads the same table. The explicit filter is defense in depth
  // beside migration 183's SELECT policy, not the only gate.
  const { data: relationshipData, error: relationshipError } = await supabase
    .from('workspace_roster_relationships')
    .select(RELATIONSHIP_COLUMNS)
    .eq('member_user_id', memberUserId)
    .order('created_at', { ascending: false })

  if (relationshipError) {
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  }

  // Third pass on the same question: any row that does not name the caller
  // is dropped here even if RLS and the filter above both let it through.
  const relationships = ((relationshipData ?? []) as RelationshipRow[]).filter(
    (row) => row.member_user_id === memberUserId
  )

  const requestList = await listRequestsForMember(service, {
    memberUserId,
    states: ['pending'],
  })
  if (!requestList.ok) {
    return NextResponse.json({ error: requestList.error }, { status: requestList.status })
  }

  // Asked-but-undecided, keyed by relationship. A request whose relationship
  // is not among the caller's own rows is skipped rather than trusted:
  // migration 195's trigger already pins `member_user_id` to the
  // relationship, so this can only fire on drift, and dropping the row is
  // the fail-closed response.
  const pendingByRelationship = new Map<string, Set<WorkspacePermission>>()
  for (const relationship of relationships) {
    pendingByRelationship.set(relationship.id, new Set())
  }
  for (const permissionRequest of requestList.requests) {
    if (permissionRequest.projectId !== null) continue
    const bucket = pendingByRelationship.get(permissionRequest.relationshipId)
    if (!bucket) continue
    bucket.add(permissionRequest.permission)
  }

  // Workspace display fields come through the service client AFTER the gate
  // above has proved this Member's identity: the `workspaces` SELECT policy
  // scopes to active workspace members and the creator, and the named
  // Member is neither (gate-then-service-client, the same RLS gap
  // app/api/roster/relationships/route.ts documents).
  const workspaceCache = new Map<string, { name: string | null; type: string | null }>()
  async function loadWorkspace(workspaceId: string) {
    const cached = workspaceCache.get(workspaceId)
    if (cached) return cached

    const { data } = await service
      .from('workspaces')
      .select('name, workspace_type')
      .eq('id', workspaceId)
      .maybeSingle()

    const display = {
      name: (data?.name as string | undefined) ?? null,
      type: (data?.workspace_type as string | undefined) ?? null,
    }
    workspaceCache.set(workspaceId, display)
    return display
  }

  const pending: WorkspaceConsentGroup[] = []
  const active: WorkspaceConsentGroup[] = []

  for (const relationship of relationships) {
    const pendingRows = toPermissionRows(
      pendingByRelationship.get(relationship.id) ?? new Set<WorkspacePermission>()
    )

    // Live member-consent roots only. `resolveConsentRootPermissions`
    // re-walks the lineage on every call, so a revoked root drops out of
    // this list the moment it is revoked, with no cascade job (D-49).
    const grantedRows = toPermissionRows(
      await resolveConsentRootPermissions(service, {
        workspaceId: relationship.workspace_id,
        relationshipId: relationship.id,
        projectId: null,
      })
    )

    // A group with no permissions is omitted entirely rather than emitted
    // as an empty card — the UI-SPEC never renders an empty section.
    if (pendingRows.length === 0 && grantedRows.length === 0) continue

    const workspace = await loadWorkspace(relationship.workspace_id)
    const base = {
      workspaceId: relationship.workspace_id,
      workspaceName: workspace.name,
      workspaceType: workspace.type,
      relationshipId: relationship.id,
      relationshipAcceptedAt: relationship.accepted_at,
    }

    if (pendingRows.length > 0) pending.push({ ...base, permissions: pendingRows })
    if (grantedRows.length > 0) active.push({ ...base, permissions: grantedRows })
  }

  // Both arrays are always present. An empty `active` is an empty array,
  // never an omitted key — the client distinguishes "granted nothing" from
  // "the shape changed."
  return NextResponse.json({ pending, active })
}
