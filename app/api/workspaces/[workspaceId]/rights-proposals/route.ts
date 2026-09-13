import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import {
  requireWorkspaceAccess,
  requireWorkspaceMutationAccess,
  requireWorkspaceRole,
} from '@/lib/workspaces/access'
import { canManageRoster } from '@/lib/workspaces/membership'
import { assertMayExercise } from '@/lib/workspaces/grant-service'
import { logWorkspaceAction } from '@/lib/workspaces/audit'
import {
  presentRightsProposal,
  WorkspaceRightsProposalSchema,
} from '@/lib/workspaces/rights-proposals'

const PROPOSAL_COLUMNS =
  'id, workspace_id, relationship_id, member_user_id, field, proposed_value, note, status, proposed_by, created_at, decided_at'

async function gate(workspaceId: string, mutation = false) {
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = mutation
    ? await requireWorkspaceMutationAccess(supabase, user, workspaceId)
    : await requireWorkspaceAccess(supabase, user, workspaceId)
  return requireWorkspaceRole(access, canManageRoster, 'Only workspace owners and admins can manage rights proposals.')
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const access = await gate(workspaceId, true)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  if (await checkRateLimit(`workspace-rights-proposal:${workspaceId}:${access.userId}`, {
    windowMs: 60 * 60 * 1000,
    maxAttempts: 20,
    failClosed: true,
  })) return NextResponse.json({ error: 'Too many proposals. Please try again later.' }, { status: 429 })

  const parsed = WorkspaceRightsProposalSchema.safeParse(
    await request.json().catch(() => ({}))
  )
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: relationship, error: relationshipError } = await service
    .from('workspace_roster_relationships')
    .select('id, workspace_id, member_user_id, state')
    .eq('id', parsed.data.relationshipId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (relationshipError) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (!relationship || relationship.state !== 'accepted') {
    return NextResponse.json({ error: 'Rights proposals require an active roster relationship.' }, { status: 409 })
  }

  // D-41 does not weaken D-39/D-49: even creating a proposal requires the
  // authority permission to be live on this request. The proposal itself
  // still changes nothing until the named Member confirms it.
  const permitted = await assertMayExercise(service, {
    workspaceId,
    actorUserId: access.userId,
    subjectMemberId: relationship.member_user_id,
    permission: 'edit_rights_information',
  })
  if (!permitted.ok) return NextResponse.json({ error: permitted.error }, { status: permitted.status })

  const { data, error } = await service
    .from('workspace_rights_proposals')
    .insert({
      workspace_id: workspaceId,
      relationship_id: relationship.id,
      member_user_id: relationship.member_user_id,
      field: parsed.data.field,
      proposed_value: parsed.data.proposedValue,
      note: parsed.data.note ?? null,
      proposed_by: access.userId,
    })
    .select(PROPOSAL_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A pending proposal already exists for this field.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  }

  await logWorkspaceAction(service, {
    workspaceId,
    actorId: access.userId,
    subjectMemberId: relationship.member_user_id,
    action: 'workspace.rights_proposal.created',
    permissionReliedOn: 'edit_rights_information',
    targetType: 'workspace_rights_proposal',
    targetId: data.id,
    // The value is deliberately absent: IPI and SoundExchange identifiers
    // may not enter the general workspace audit JSON (migration 197).
  })

  return NextResponse.json({ data: presentRightsProposal(data) }, { status: 201 })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params
  const access = await gate(workspaceId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { data, error } = await createServiceClient()
    .from('workspace_rights_proposals')
    .select(PROPOSAL_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  return NextResponse.json(
    { data: (data ?? []).map(row => presentRightsProposal(row)).filter(Boolean) },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
