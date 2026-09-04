import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { draftBriefFromProse, BRIEF_PROSE_MAX } from '@/lib/buyer/brief-ai'
import { aiAdmissionError, aiProviderSignal, claimAiUsage, finishAiUsage } from '@/lib/ai/admission'

// POST /api/buyer/brief-draft — turn a buyer's free-text description into a
// structured Brief (Brief Builder v1). No persistence — the caller holds it.
//
// AUTH REQUIRED (audit #2): this calls the paid model, so it is a cost surface.
// `api` is outside the middleware matcher, so the gate is enforced in-handler —
// only a signed-in user may draft. Owner decision 2026-08-20: gate to sign-in
// for now; revisit public + Turnstile + spend-cap if traffic grows (see
// .planning/todos/pending/2026-08-20-revisit-public-ai-drafting-access.md).
// Input is also length-capped below as defence-in-depth.
export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to use the AI Brief Builder.' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { prose?: unknown }
  const prose = typeof body.prose === 'string' ? body.prose : ''

  if (!prose.trim()) {
    return NextResponse.json({ error: 'Tell us a bit about your project first.' }, { status: 400 })
  }
  if (prose.length > BRIEF_PROSE_MAX * 2) {
    return NextResponse.json(
      { error: 'That description is a little long — trim it down and try again.' },
      { status: 400 }
    )
  }

  const admission = await claimAiUsage(supabase, request, {
    operation: 'buyer:brief-draft',
    units: 2,
  })
  if (!admission.allowed) {
    const denied = aiAdmissionError(admission)
    return NextResponse.json({ error: denied.error }, { status: denied.status })
  }

  const result = await draftBriefFromProse(prose, aiProviderSignal())
  await finishAiUsage(supabase, admission.claimId, result.ok)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ data: result.brief })
}
