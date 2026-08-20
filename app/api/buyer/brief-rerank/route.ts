import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'
import { coerceBrief, coerceCandidates } from '@/lib/buyer/brief'
import { rerankCandidates } from '@/lib/buyer/brief-ai'

// POST /api/buyer/brief-rerank — order a filtered candidate set by fit to the
// whole brief (Brief Builder v1.1). Both `brief` and `candidates` arrive from
// the client and are sanitised (coerced against the known vocab / capped)
// before the model sees them.
//
// AUTH REQUIRED (audit #2): same paid-model cost surface as brief-draft. `api`
// is outside the middleware matcher, so the gate is enforced in-handler — only
// a signed-in user may rerank. Owner decision 2026-08-20: gate to sign-in for
// now; revisit public + Turnstile + spend-cap if traffic grows (see
// .planning/todos/pending/2026-08-20-revisit-public-ai-drafting-access.md).
export async function POST(request: Request) {
  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in to use the AI Brief Builder.' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { brief?: unknown; candidates?: unknown }
  const brief = coerceBrief(body.brief)
  const candidates = coerceCandidates(body.candidates)

  if (candidates.length === 0) {
    return NextResponse.json({ data: { ranked: [] } })
  }

  const result = await rerankCandidates(brief, candidates)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ data: { ranked: result.ranked } })
}
