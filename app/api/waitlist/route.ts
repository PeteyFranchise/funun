import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { createRateLimiter, getClientIp } from '@/lib/security/rate-limit'
import { verifyTurnstileToken } from '@/lib/security/turnstile'
import { sanitizeWaitlistEntry } from '@/lib/invites/schema'

// ─── POST /api/waitlist — public, unauthenticated (27-07 Task 1) ──────────
// D-11's inline denial capture + D-12's protected public waitlist endpoint.
// No session gate — mirrors app/api/sync/register/route.ts's "first
// genuinely public write path" shape. Compensating controls replace auth:
// rate-limit (ip + email dimensions, shared limiter from 27-02), Cloudflare
// Turnstile verification (fail-closed, BEFORE any DB write), and
// sanitizeWaitlistEntry's strict {email,name,note} allowlist (27-01)
// blocking mass-assignment.
//
// Auto-resubscribe upsert (D-19): PostgREST's on_conflict merge only
// accepts a plain-column conflict target, but artist_waitlist's uniqueness
// is a functional UNIQUE INDEX on LOWER(email) (migration 097), not a
// plain-column unique constraint — so a literal single-statement
// `ON CONFLICT (email) DO UPDATE` (as sketched in 27-RESEARCH's
// illustrative SQL) cannot be expressed through the service-role
// PostgREST client. sanitizeWaitlistEntry() always normalizes email to
// lowercase before it reaches this route (and every prior write went
// through the same path), so a manual select-by-email + branch
// (update the existing row, else insert) reaches the identical final
// state, including clearing unsubscribed_at on the update path.

const ipLimiter = createRateLimiter()
const emailLimiter = createRateLimiter()

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (ipLimiter.isRateLimited(`ip:${ip}`)) {
    return errorResponse('Too many requests. Please try again later.', 429)
  }

  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const result = sanitizeWaitlistEntry(raw)
  if (!result.ok) {
    return errorResponse(result.error, 400)
  }
  const entry = result.value

  if (emailLimiter.isRateLimited(`email:${entry.email}`)) {
    return errorResponse('Too many requests. Please try again later.', 429)
  }

  const turnstileToken = typeof raw.turnstileToken === 'string' ? raw.turnstileToken : ''
  const verified = await verifyTurnstileToken(turnstileToken, ip)
  if (!verified) {
    // Fail-closed (RESEARCH Pitfall 7) — no DB call has happened yet.
    return errorResponse('Verification failed. Please try again.', 400)
  }

  const service = createServiceClient()

  const { data: existing } = await service
    .from('artist_waitlist')
    .select('id')
    .eq('email', entry.email)
    .maybeSingle()

  if (existing) {
    await service
      .from('artist_waitlist')
      .update({
        name: entry.name || null,
        note: entry.note || null,
        unsubscribed_at: null, // D-19: rejoining the waitlist auto-resubscribes
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    const { error: insertError } = await service.from('artist_waitlist').insert({
      email: entry.email,
      name: entry.name || null,
      note: entry.note || null,
    })

    // Race guard: a concurrent submit for the same email won the insert
    // between our SELECT and INSERT (unique violation on the LOWER(email)
    // index) — fall back to the update path so this request still
    // auto-resubscribes instead of erroring.
    if (insertError && insertError.code === '23505') {
      const { data: retry } = await service
        .from('artist_waitlist')
        .select('id')
        .eq('email', entry.email)
        .maybeSingle()
      if (retry) {
        await service
          .from('artist_waitlist')
          .update({
            name: entry.name || null,
            note: entry.note || null,
            unsubscribed_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', retry.id)
      }
    }
  }

  // Neutral success — never reveal whether the email was already on the
  // list (mirrors sync/register's account-enumeration-avoidance discipline).
  return NextResponse.json({ ok: true }, { status: 200 })
}
