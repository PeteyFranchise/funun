import { NextResponse } from 'next/server'
import { requireMemberApiAccount } from '@/lib/accounts/member-api-gate'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { MasterOwnershipDecisionSchema } from '@/lib/workspaces/master-ownership'
import { loadMasterOwnershipClaims } from '@/lib/workspaces/master-ownership-service'

async function memberGate() {
  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  return requireMemberApiAccount(supabase, user)
}

export async function GET() {
  const gate = await memberGate()
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const result = await loadMasterOwnershipClaims(createServiceClient(), { holderUserId: gate.user.id })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ data: result.data }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PATCH(request: Request) {
  const gate = await memberGate()
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })
  if (await checkRateLimit(`member-master-claim-decision:${gate.user.id}`, {
    windowMs: 60 * 60 * 1000,
    maxAttempts: 20,
    failClosed: true,
  })) return NextResponse.json({ error: 'Too many decisions. Please try again later.' }, { status: 429 })
  const parsed = MasterOwnershipDecisionSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  }
  const payload = parsed.data
  const { data, error } = await createServiceClient().rpc('decide_master_ownership_claim', {
    p_claim_id: payload.claimId,
    p_holder_user_id: gate.user.id,
    p_action: payload.action,
    p_document_id: payload.action === 'support' ? payload.documentId : null,
    p_note: payload.action === 'dispute' ? payload.note : null,
  })
  if (error) return NextResponse.json({ error: 'Claim could not be updated.' }, { status: 500 })
  const statusMap: Record<string, { status: number; error: string }> = {
    not_found: { status: 404, error: 'Claim not found.' },
    invalid_state: { status: 409, error: 'That action is no longer available for this claim.' },
    document_not_bound: { status: 409, error: 'Choose a signed or verified document from this recording’s project.' },
  }
  if (data !== 'ok') {
    const mapped = statusMap[String(data)] ?? { status: 400, error: 'Invalid request.' }
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }
  return NextResponse.json({ ok: true })
}
