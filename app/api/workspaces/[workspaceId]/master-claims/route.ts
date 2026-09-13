import { NextResponse } from 'next/server'
import { createNotification } from '@/lib/notifications'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import {
  requireWorkspaceAccess,
  requireWorkspaceMutationAccess,
  requireWorkspaceRole,
} from '@/lib/workspaces/access'
import { canManageRoster } from '@/lib/workspaces/membership'
import { MasterOwnershipClaimSchema } from '@/lib/workspaces/master-ownership'
import { loadMasterOwnershipClaims } from '@/lib/workspaces/master-ownership-service'

async function gate(workspaceId: string, mutation = false) {
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = mutation
    ? await requireWorkspaceMutationAccess(supabase, user, workspaceId)
    : await requireWorkspaceAccess(supabase, user, workspaceId)
  return requireWorkspaceRole(access, canManageRoster, 'Only workspace owners and admins can manage master claims.')
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const access = await gate(workspaceId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const result = await loadMasterOwnershipClaims(createServiceClient(), { workspaceId })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ data: result.data }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const access = await gate(workspaceId, true)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  if (await checkRateLimit(`workspace-master-claim:${workspaceId}:${access.userId}`, {
    windowMs: 60 * 60 * 1000,
    maxAttempts: 10,
    failClosed: true,
  })) return NextResponse.json({ error: 'Too many claims. Please try again later.' }, { status: 429 })
  const parsed = MasterOwnershipClaimSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: workspace } = await service
    .from('workspaces')
    .select('name, workspace_type')
    .eq('id', workspaceId)
    .maybeSingle()
  if (!workspace || workspace.workspace_type !== 'label') {
    return NextResponse.json({ error: 'Master-ownership claims are available to Label workspaces.' }, { status: 403 })
  }

  const { data: claimId, error } = await service.rpc('create_master_ownership_claim', {
    p_workspace_id: workspaceId,
    p_work_version_id: parsed.data.workVersionId,
    p_actor_user_id: access.userId,
    p_note: parsed.data.note ?? null,
  })
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'This workspace already filed a claim on that version.' }, { status: 409 })
    return NextResponse.json({ error: 'Claim could not be created.' }, { status: 500 })
  }
  if (typeof claimId !== 'string') return NextResponse.json({ error: 'Recording version not found.' }, { status: 404 })

  const { data: claim } = await service
    .from('master_ownership_claims')
    .select('holder_user_id')
    .eq('id', claimId)
    .maybeSingle()
  if (claim?.holder_user_id) {
    await createNotification(service, {
      userId: claim.holder_user_id,
      type: 'master_ownership_claim',
      title: `${workspace.name} filed a master-ownership claim`,
      body: 'The claim changes no access until you review it.',
      link: '/settings/master-claims',
      actorId: access.userId,
      actorName: workspace.name,
    })
  }

  const result = await loadMasterOwnershipClaims(service, { workspaceId })
  const created = result.data.find(item => item.id === claimId)
  return NextResponse.json({ data: created ?? null }, { status: 201 })
}
