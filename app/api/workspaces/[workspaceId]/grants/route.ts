import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireWorkspaceAccess, requireWorkspaceRole } from '@/lib/workspaces/access'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import { canManageRoster } from '@/lib/workspaces/membership'
import { assertGrantIssuable } from '@/lib/workspaces/grant-service'
import { buildActingContext } from '@/lib/workspaces/acting'
import { isBundleExcluded, type WorkspacePermission } from '@/lib/workspaces/permissions'

// ─── /api/workspaces/[workspaceId]/grants — issue, list, revoke ────────────
// (D-19, D-20, D-40, D-49, D-50). This route is the GRANT-TIME half of
// D-49's two-clause guarantee: it refuses (never trims) a request exceeding
// what the granter's own resolved access holds, via `assertGrantIssuable`.
// The USE-TIME half — the re-check that makes an already-issued grant stop
// working the moment the granter's access or the underlying relationship is
// reduced — lives entirely in `resolveEffectivePermissions`
// (lib/workspaces/grant-service.ts). Neither half is sufficient on its own;
// a future reviewer who removes this route's issue-time check, or who lets
// some other surface honor a `workspace_grants` row without going back
// through the resolver, has removed the guarantee D-49 describes.
//
// `workspaceId` is taken from the route's own path segment ONLY, matching
// every other `/api/workspaces/[workspaceId]/**` route in this phase. Every
// mutating handler writes through the service client only after
// `requireWorkspaceAccess` + `canManageRoster` has already proved authority,
// and every issued or revoked permission is logged individually via
// `logWorkspaceAction`, carrying the permission relied on (D-50).
//
// DELETE never deletes a `workspace_grants` row — it sets `revoked_at` and
// `revoked_by` so the history of what was held and when remains readable,
// mirroring the members and roster routes' own removal convention.

const GRANT_COLUMNS =
  'id, workspace_id, relationship_id, project_id, permission, source, granted_at, revoked_at, created_at'

type RosterRelationshipRow = { id: string; workspace_id: string; member_user_id: string; state: string }
type BundleRow = { id: string; permissions: unknown }

const IssueGrantsSchema = z
  .object({
    relationshipId: z.string().uuid(),
    projectId: z.string().uuid().nullable().optional(),
    permissions: z.array(z.string()).min(1).optional(),
    bundleKey: z.string().min(1).optional(),
  })
  .strict()
  .refine((data) => (data.permissions !== undefined) !== (data.bundleKey !== undefined), {
    message: 'Provide exactly one of `permissions` or `bundleKey`, never both.',
  })

const RevokeGrantsSchema = z
  .object({
    relationshipId: z.string().uuid(),
    projectId: z.string().uuid().nullable().optional(),
    permissions: z.array(z.string()).min(1),
  })
  .strict()

async function loadRelationship(
  service: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  relationshipId: string
): Promise<{ row: RosterRelationshipRow | null; error?: string }> {
  const { data, error } = await service
    .from('workspace_roster_relationships')
    .select('id, workspace_id, member_user_id, state')
    .eq('id', relationshipId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) return { row: null, error: 'Request could not be completed.' }
  return { row: (data as RosterRelationshipRow | null) ?? null }
}

function parseBundlePermissions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((value): value is string => typeof value === 'string')
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  const gated = requireWorkspaceRole(
    access,
    canManageRoster,
    'Only owners and admins can manage workspace grants.'
  )
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = IssueGrantsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const { relationshipId, permissions, bundleKey } = parsed.data
  const projectId = parsed.data.projectId ?? null

  const service = createServiceClient()
  const { row: relationship, error: relationshipError } = await loadRelationship(
    service,
    workspaceId,
    relationshipId
  )
  if (relationshipError) return NextResponse.json({ error: 'Workspace relationship could not be loaded.' }, { status: 500 })
  if (!relationship) {
    return NextResponse.json({ error: 'Roster relationship not found.' }, { status: 404 })
  }

  let requestedPermissions: string[]
  let source: 'individual' | 'bundle'

  if (bundleKey) {
    // Bundle expansion always reads the bundle row from the database — a
    // client-supplied permission array claiming to BE a bundle is never
    // accepted as the expansion (D-19, D-40). A workspace's own customized
    // bundle takes precedence over the system preset of the same key.
    const { data: workspaceBundle } = await service
      .from('workspace_permission_bundles')
      .select('id, permissions')
      .eq('workspace_id', workspaceId)
      .eq('key', bundleKey)
      .maybeSingle()

    const bundle =
      (workspaceBundle as BundleRow | null) ??
      (
        await service
          .from('workspace_permission_bundles')
          .select('id, permissions')
          .is('workspace_id', null)
          .eq('key', bundleKey)
          .maybeSingle()
      ).data

    if (!bundle) {
      return NextResponse.json({ error: `Unknown permission bundle "${bundleKey}".` }, { status: 404 })
    }

    requestedPermissions = parseBundlePermissions((bundle as BundleRow).permissions)
    source = 'bundle'

    // A sensitive permission may only ever be issued through an explicit
    // `permissions` array, never via a bundle (D-40). This refuses the
    // whole request rather than silently dropping the sensitive entry.
    const sensitive = requestedPermissions.find((value) => isBundleExcluded(value as WorkspacePermission))
    if (sensitive) {
      return NextResponse.json(
        {
          error: `"${sensitive}" is a high-sensitivity permission and cannot be issued through a bundle — request it individually via \`permissions\`.`,
        },
        { status: 400 }
      )
    }
  } else {
    requestedPermissions = permissions as string[]
    source = 'individual'
  }

  const issuance = await assertGrantIssuable(service, {
    workspaceId,
    granterUserId: gated.userId,
    relationshipId,
    subjectMemberId: relationship.member_user_id,
    projectId,
    requested: requestedPermissions,
  })

  // The refusal reason names the specific offending permission and must
  // reach the client verbatim (D-49) — there is no code path that removes
  // just the refused permission and proceeds with the remainder.
  if (!issuance.ok) {
    return NextResponse.json({ error: issuance.reason }, { status: 403 })
  }

  const issued: WorkspacePermission[] = []

  for (const permission of issuance.permissions) {
    const { error: insertError } = await service.from('workspace_grants').insert({
      workspace_id: workspaceId,
      relationship_id: relationshipId,
      project_id: projectId,
      permission,
      source,
      granted_by: gated.userId,
    })

    // The partial unique index (workspace_id, relationship_id, project_id,
    // permission WHERE revoked_at IS NULL) makes a re-issued grant an
    // idempotent no-op rather than a duplicate row: a unique-violation here
    // means the permission is already live, which this route treats as
    // success rather than an error.
    if (insertError && insertError.code !== '23505') {
      return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
    }

    const acting = buildActingContext({
      actorUserId: gated.userId,
      workspaceId,
      subjectMemberId: relationship.member_user_id,
      permissionReliedOn: permission,
    })

    await logWorkspaceAction(service, {
      workspaceId,
      actorId: acting.ok ? acting.context.actorUserId : gated.userId,
      subjectMemberId: relationship.member_user_id,
      action: 'workspace.grant.issued',
      permissionReliedOn: permission,
      targetType: 'workspace_grant',
      targetId: relationshipId,
      changes: { permission, source, projectId },
    })

    issued.push(permission)
  }

  return NextResponse.json({ data: { relationshipId, projectId, source, permissions: issued } }, { status: 201 })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  // RLS-scoped client: migration 184's workspace_grants_select policy is
  // the visibility filter, not application code — it already permits every
  // active workspace member to see grants issued in their own workspace.
  const { data, error } = await supabase
    .from('workspace_grants')
    .select(GRANT_COLUMNS)
    .eq('workspace_id', workspaceId)
    .is('revoked_at', null)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })

  type GrantRow = { relationship_id: string; project_id: string | null }
  const grouped = new Map<string, { relationshipId: string; projectId: string | null; grants: unknown[] }>()

  for (const row of (data ?? []) as GrantRow[]) {
    const groupKey = `${row.relationship_id}:${row.project_id ?? 'workspace-wide'}`
    const existing = grouped.get(groupKey)
    if (existing) {
      existing.grants.push(row)
    } else {
      grouped.set(groupKey, {
        relationshipId: row.relationship_id,
        projectId: row.project_id,
        grants: [row],
      })
    }
  }

  return NextResponse.json({ data: Array.from(grouped.values()) })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = await requireWorkspaceAccess(supabase, user, workspaceId)
  const gated = requireWorkspaceRole(
    access,
    canManageRoster,
    'Only owners and admins can manage workspace grants.'
  )
  if (!gated.ok) return NextResponse.json({ error: gated.error }, { status: gated.status })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const parsed = RevokeGrantsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request.' },
      { status: 400 }
    )
  }

  const { relationshipId, permissions } = parsed.data
  const projectId = parsed.data.projectId ?? null

  const service = createServiceClient()
  const { row: relationship, error: relationshipError } = await loadRelationship(
    service,
    workspaceId,
    relationshipId
  )
  if (relationshipError) return NextResponse.json({ error: 'Workspace relationship could not be loaded.' }, { status: 500 })
  if (!relationship) {
    return NextResponse.json({ error: 'Roster relationship not found.' }, { status: 404 })
  }

  const revoked: string[] = []

  for (const permission of permissions) {
    let query = service
      .from('workspace_grants')
      .update({ revoked_at: new Date().toISOString(), revoked_by: gated.userId })
      .eq('workspace_id', workspaceId)
      .eq('relationship_id', relationshipId)
      .eq('permission', permission)
      .is('revoked_at', null)

    query = projectId === null ? query.is('project_id', null) : query.eq('project_id', projectId)

    const { data: updated, error: updateError } = await query.select('id').maybeSingle()
    if (updateError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
    if (!updated) continue

    await logWorkspaceAction(service, {
      workspaceId,
      actorId: gated.userId,
      subjectMemberId: relationship.member_user_id,
      action: 'workspace.grant.revoked',
      permissionReliedOn: permission as WorkspacePermission,
      targetType: 'workspace_grant',
      targetId: relationshipId,
      changes: { permission, projectId },
    })

    revoked.push(permission)
  }

  return NextResponse.json({ data: { relationshipId, projectId, revoked } })
}
