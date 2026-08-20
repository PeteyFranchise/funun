import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'

// ─── POST /api/waitlist/unsubscribe — public, unauthenticated ─────────────
// Fix for Codex review Blocker B2 (27-CODEX-REVIEW.md): the unsubscribe
// page rendered "You've unsubscribed" on load, but no route ever set
// `unsubscribed_at` — a false opt-out (compliance risk) that also left the
// reopen broadcast's opt-out filter with nothing to exclude. This is the
// missing mutation, symmetrical with resubscribe/route.ts: identifies the
// row by the random `unsubscribe_token` column ONLY — never the row's
// primary key or its email (27-RESEARCH Security Domain, T-27-05 IDOR
// mitigation — a waitlist row id leaked elsewhere, e.g. an admin list
// view, can never be used to toggle a stranger's subscription state).
// Rate-limited by ip via the shared limiter (27-02).

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
  // email (IDOR-safe, T-27-05), mirrors resubscribe/route.ts. Looked up
  // first (rather than blind-updating) so an already-unsubscribed row is a
  // true no-op — the second call in "idempotent" doesn't overwrite the
  // original opt-out timestamp.
  const { data: existing, error: lookupError } = await service
    .from('artist_waitlist')
    .select('id, unsubscribed_at')
    .eq('unsubscribe_token', token)
    .maybeSingle()

  if (lookupError || !existing) {
    // Generic 404 — no enumeration of valid tokens beyond existence.
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  // Idempotent: already-unsubscribed is a success no-op.
  if (existing.unsubscribed_at) {
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  const { error: updateError } = await service
    .from('artist_waitlist')
    .update({ unsubscribed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)

  if (updateError) {
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 200 })
}
