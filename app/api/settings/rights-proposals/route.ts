import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import {
  MemberRightsDecisionSchema,
  presentRightsProposal,
} from '@/lib/workspaces/rights-proposals'

const COLUMNS =
  'id, workspace_id, relationship_id, member_user_id, field, proposed_value, note, status, proposed_by, created_at, decided_at'

async function memberGate() {
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  return requireMemberApiAccount(supabase, user)
}

export async function GET() {
  const gate = await memberGate()
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const service = createServiceClient()
  const { data, error } = await service
    .from('workspace_rights_proposals')
    .select(COLUMNS)
    .eq('member_user_id', gate.user.id)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })

  const workspaceIds = [...new Set((data ?? []).map(row => row.workspace_id as string))]
  const names = new Map<string, string>()
  if (workspaceIds.length > 0) {
    const { data: workspaces } = await service.from('workspaces').select('id, name').in('id', workspaceIds)
    for (const row of workspaces ?? []) names.set(row.id, row.name)
  }
  return NextResponse.json({
    data: (data ?? []).map(row => presentRightsProposal(row, names.get(row.workspace_id) ?? null)).filter(Boolean),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PATCH(request: Request) {
  const gate = await memberGate()
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  if (await checkRateLimit(`member-rights-proposal-decision:${gate.user.id}`, {
    windowMs: 60 * 60 * 1000,
    maxAttempts: 30,
    failClosed: true,
  })) return NextResponse.json({ error: 'Too many decisions. Please try again later.' }, { status: 429 })
  const parsed = MemberRightsDecisionSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }

  const { data, error } = await createServiceClient().rpc('decide_workspace_rights_proposal', {
    p_proposal_id: parsed.data.proposalId,
    p_member_user_id: gate.user.id,
    p_decision: parsed.data.decision,
  })
  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  if (data === 'not_found') return NextResponse.json({ error: 'Rights proposal not found.' }, { status: 404 })
  if (data === 'already_decided') return NextResponse.json({ error: 'This proposal was already decided.' }, { status: 409 })
  if (data !== 'ok') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
