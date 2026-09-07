import { createServerClient, createServiceClient } from '@/lib/supabase/server'
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
import { PermissionsTab, type PermissionsGroup } from '@/components/settings/PermissionsTab'

export const dynamic = 'force-dynamic'

// ─── /settings/permissions — the Member's consent surface (WSR-27, R-18) ──
//
// The fourth Settings tab, and the ONLY entry point this phase adds. The
// heading container, the tab bar and the form provider all come from
// app/(artist)/settings/layout.tsx — this page adds no layout, no provider
// and no nav entry of its own. It uses none of the form provider's state,
// exactly like its /settings/payouts sibling, which is why
// `buildSaversForTab('permissions')` returns nothing and switching to this
// tab writes nothing.
//
// THE FIRST RENDER IS RESOLVED HERE, NOT FETCHED. This page calls the same
// service functions `app/api/settings/permissions/route.ts` calls rather
// than issuing an HTTP request to the app's own API from the server. The
// route stays the canonical statement of this read and the only thing the
// browser talks to; the assembly below is deliberately kept in the same
// shape so the two cannot say different things. (The obvious next step is to
// lift the shared assembly into lib/workspaces/ — that belongs to 38.1,
// which owns the wider workspace surfaces, not to a remediation phase whose
// point is reducing change surface.)
//
// AUTHORIZATION IS "THESE ROWS NAME ME", the same rule the route enforces.
// There is no workspace membership check and no workspace role helper
// anywhere in this file: owning the ASKING workspace confers no standing
// whatsoever over the Member being asked. Every failure path renders nothing
// rather than a diagnostic — a page that explains why it is empty on a
// surface reached by any signed-in identity is a page that answers questions
// it was never asked.
//
// FAILS CLOSED ON THE D-56 CONTROL. With the kill switch off the page
// short-circuits to empty groups before touching any workspace table at all,
// which is also what keeps it rendering cleanly while migrations 190-195 are
// authored but not yet applied.

const EMPTY_GROUPS: PermissionsGroup[] = []

type RelationshipRow = {
  id: string
  workspace_id: string
  member_user_id: string
  accepted_at: string | null
}

/**
 * Renders a permission set as display rows, walking the catalogue's own
 * matrix order rather than the input set — the same construction the read
 * route and the consent route both use, so a value that is not a member of
 * the grantable catalogue cannot reach the screen no matter what a database
 * row happens to carry. The structural-exclusion filter is a defensive
 * second pass over a guarantee the type system already makes.
 */
function toPermissionRows(permissions: ReadonlySet<WorkspacePermission>) {
  return WORKSPACE_PERMISSION_VALUES.filter(
    permission => permissions.has(permission) && !isStructurallyExcludedCapability(permission)
  ).map(permission => ({
    permission,
    tier: PERMISSION_TIER[permission],
    sensitive: isBundleExcluded(permission),
  }))
}

async function loadConsentGroups(): Promise<{
  pending: PermissionsGroup[]
  active: PermissionsGroup[]
}> {
  const empty = { pending: EMPTY_GROUPS, active: EMPTY_GROUPS }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const gate = await requireMemberApiAccount(supabase, user)
  if (!gate.ok) return empty

  const service = createServiceClient()
  if (!(await isWorkspaceAccessEnabled(service))) return empty

  const memberUserId = gate.user.id

  // RLS-scoped session client, with the explicit filter as defence in depth
  // beside migration 183's own SELECT policy rather than instead of it.
  const { data: relationshipData, error: relationshipError } = await supabase
    .from('workspace_roster_relationships')
    .select('id, workspace_id, member_user_id, accepted_at')
    .eq('member_user_id', memberUserId)
    .order('created_at', { ascending: false })

  if (relationshipError) return empty

  // Third pass on the same question: a row that does not name the caller is
  // dropped here even if RLS and the filter above both let it through.
  const relationships = ((relationshipData ?? []) as RelationshipRow[]).filter(
    row => row.member_user_id === memberUserId
  )

  const requestList = await listRequestsForMember(service, {
    memberUserId,
    states: ['pending'],
  })
  if (!requestList.ok) return empty

  // Asked-but-undecided, keyed by relationship. A project-scoped ask is
  // SKIPPED, never flattened: the group shape carries no project, so
  // approving from a flattened row would send a relationship-wide consent
  // and grant strictly more than the workspace asked for. The read route
  // records the same omission for the same reason.
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

  // Workspace display fields come through the service client only AFTER the
  // gate above has proved this Member's identity: the `workspaces` SELECT
  // policy scopes to active workspace members and the creator, and the named
  // Member is neither.
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

  const pending: PermissionsGroup[] = []
  const active: PermissionsGroup[] = []

  for (const relationship of relationships) {
    const pendingRows = toPermissionRows(
      pendingByRelationship.get(relationship.id) ?? new Set<WorkspacePermission>()
    )

    // Live member-consent roots only. The lineage is re-walked on every
    // call, so a revoked root drops out the moment it is revoked (D-49).
    const grantedRows = toPermissionRows(
      await resolveConsentRootPermissions(service, {
        workspaceId: relationship.workspace_id,
        relationshipId: relationship.id,
        projectId: null,
      })
    )

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

  return { pending, active }
}

export default async function WorkspacePermissionsPage() {
  const { pending, active } = await loadConsentGroups()

  // PLAIN SERIALISABLE DATA ONLY CROSSES THE LINE BELOW. PermissionsTab is a
  // Client Component: passing it a callback, a handler, a Supabase client, a
  // class instance or a Date produces a 500 that appears only in a
  // production build — it type-checks, it passes the suite and it renders
  // fine in dev. This repo has already shipped that exact bug once (the My
  // Client Partners crash). Two arrays of strings and booleans, nothing else
  // (T-38.0.1-13-04).
  return (
    <div>
      <h2 className="text-[22px] font-bold text-white">Workspace permissions</h2>
      <p className="mt-1 text-sm text-white/50">
        See exactly what a workspace is asking to do with your work — and decide, one permission at
        a time.
      </p>

      <div className="mt-8">
        <PermissionsTab pending={pending} active={active} />
      </div>
    </div>
  )
}
