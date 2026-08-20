import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'

// ─── POST /api/waitlist/resubscribe — public, unauthenticated (27-07 Task 2)
// One of D-19's two re-opt-in paths (the other is auto-resubscribe on
// rejoin, handled by POST /api/waitlist's upsert branch). Identifies the
// row by the random `unsubscribe_token` column ONLY — never the row's
// primary key or its email (27-RESEARCH Security Domain, T-27-05 IDOR
// mitigation: a waitlist row id leaked elsewhere, e.g. an admin list view,
// can never be used to toggle a stranger's subscription state). Rate-
// limited by ip via the shared limiter (27-02); mirrors
// app/api/sync/register/route.ts's public-write shape.

export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (await checkRateLimit(`ip:${ip}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }

  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const token = typeof raw.token === 'string' ? raw.token.trim() : ''

  if (!token) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const service = createServiceClient()

  // Only unsubscribe_token is ever used as the filter column — never id or
  // email (IDOR-safe, T-27-05).
  const { data, error } = await service
    .from('artist_waitlist')
    .update({ unsubscribed_at: null, updated_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    // Generic 404 — no enumeration of valid tokens beyond existence.
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
