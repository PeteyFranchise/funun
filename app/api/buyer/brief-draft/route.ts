import { NextResponse } from 'next/server'
import { draftBriefFromProse, BRIEF_PROSE_MAX } from '@/lib/buyer/brief-ai'

// POST /api/buyer/brief-draft — turn a buyer's free-text description into a
// structured Brief (Brief Builder v1). Public, like /sync/brief itself: `api`
// is excluded from the middleware matcher, so no session is required and a
// logged-out visitor can draft. No persistence — the caller holds the brief.
//
// NOTE: unauthenticated AND it calls the model, so it is a cost surface. Add
// rate-limiting / an abuse guard before this route is exposed on a live
// domain. Input is length-capped here as a first line of defence.
export async function POST(request: Request) {
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

  const result = await draftBriefFromProse(prose)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json({ data: result.brief })
}
