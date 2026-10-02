import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { turnstileConfigStatus, verifyTurnstileToken } from '@/lib/security/turnstile'
import { sanitizeWaitlistEntry } from '@/lib/invites/schema'

// ─── POST /api/waitlist — public, unauthenticated (27-07 Task 1) ──────────
// D-11's inline denial capture + D-12's protected public waitlist endpoint.
// No session gate — mirrors app/api/sync/register/route.ts's "first
// genuinely public write path" shape. Compensating controls replace auth:
// rate-limit (ip + email dimensions, shared limiter from 27-02), Cloudflare
// Turnstile verification (fail-closed, BEFORE any DB write), and
// sanitizeWaitlistEntry's strict {email,name,note} allowlist + length caps
// (27-01, L3) blocking mass-assignment.
//
// Auto-resubscribe upsert (D-19, H2 fix 27-CODEX-REVIEW.md): PostgREST's
// supabase-js on_conflict merge only accepts a plain-column conflict
// target, but artist_waitlist's uniqueness is a functional UNIQUE INDEX on
// LOWER(email) (migration 097), not a plain-column unique constraint — so
// a literal single-statement `.upsert(..., { onConflict })` cannot be
// expressed through the service-role PostgREST client. This route
// previously worked around that with a manual select-then-branch
// (update the existing row, else insert, with a 23505-race fallback) that
// ignored most of the individual Supabase errors along the way and always
// returned `{ok:true}` regardless of whether anything was actually
// persisted (H2 — false success). Migration 100's upsert_artist_waitlist()
// RPC does the identical single-statement `INSERT ... ON CONFLICT
// (LOWER(email)) DO UPDATE` atomically server-side (Postgres itself has no
// such conflict-target limitation — only the PostgREST client does), so
// this route now has exactly ONE write to check the error/result of.
//
// Misconfiguration signal (quick task 261002-wtl): a half-configured
// Turnstile (site key set, secret missing) is the genuinely invisible
// case — the widget renders, a visitor completes a challenge, believes
// they succeeded, and this route silently refuses. turnstileConfigStatus()
// distinguishes that from a fully configured Turnstile reporting a
// genuine bot-check failure, and reports ONLY to Sentry (server-side).
// The client-visible response below is byte-identical regardless of
// configuration state, so this cannot become an attacker oracle for
// whether the gate is live. It deliberately does not fire for the
// "neither key set" case — the client gate (waitlist-gate.ts) now
// disables submit entirely in that state, so no request reaches here for
// it; that case is made visible to the human in the UI instead.

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (await checkRateLimit(`ip:${ip}`)) {
    return errorResponse('Too many requests. Please try again later.', 429)
  }

  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const result = sanitizeWaitlistEntry(raw)
  if (!result.ok) {
    return errorResponse(result.error, 400)
  }
  const entry = result.value

  if (await checkRateLimit(`email:${entry.email}`)) {
    return errorResponse('Too many requests. Please try again later.', 429)
  }

  const turnstileToken = typeof raw.turnstileToken === 'string' ? raw.turnstileToken : ''
  const verified = await verifyTurnstileToken(turnstileToken, ip)
  if (!verified) {
    const configStatus = turnstileConfigStatus()
    // Only the HALF-configured states are the invisible case worth paging
    // on. 'unconfigured' (neither key set) never reaches this route at all
    // once the client gate is live (Task 2), and surfacing it here as well
    // would duplicate a signal the UI already makes honest to the visitor.
    if (configStatus === 'secret-missing' || configStatus === 'site-key-missing') {
      Sentry.captureMessage('Waitlist Turnstile verification failed due to misconfiguration', {
        level: 'error',
        tags: { feature: 'waitlist-turnstile', configStatus },
      })
    }
    // Fail-closed (RESEARCH Pitfall 7) — no DB call has happened yet. The
    // response is identical whether Turnstile is misconfigured or a
    // genuine bot check failed — see the misconfiguration-signal note
    // above the imports for why that must not vary.
    return errorResponse('Verification failed. Please try again.', 400)
  }

  const service = createServiceClient()

  const { data: waitlistId, error: upsertError } = await service.rpc('upsert_artist_waitlist', {
    p_email: entry.email,
    p_name: entry.name,
    p_note: entry.note,
  })

  // H2: every write error is checked, and success is never reported unless
  // a row was actually persisted — no path below this returns {ok:true}
  // without waitlistId set.
  if (upsertError || !waitlistId) {
    return errorResponse('Something went wrong. Please try again.', 500)
  }

  // Neutral success — never reveal whether the email was already on the
  // list (mirrors sync/register's account-enumeration-avoidance discipline).
  return NextResponse.json({ ok: true }, { status: 200 })
}
