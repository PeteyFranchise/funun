import { NextResponse } from 'next/server'
import { coerceBrief, coerceCandidates } from '@/lib/buyer/brief'
import { rerankCandidates } from '@/lib/buyer/brief-ai'

// POST /api/buyer/brief-rerank — order a filtered candidate set by fit to the
// whole brief (Brief Builder v1.1). Public, like the rest of the Brief Builder
// flow (api is outside the middleware matcher). Both `brief` and `candidates`
// arrive from the client and are sanitised (coerced against the known vocab /
// capped) before the model sees them.
//
// NOTE: unauthenticated AND it calls the model — same cost surface as
// /api/buyer/brief-draft. Add rate-limiting before this is live. `candidates`
// is length-capped in coerceCandidates().
export async function POST(request: Request) {
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
