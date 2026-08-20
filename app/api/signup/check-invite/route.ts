import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { isArtistEmailAllowed, emailHasExistingAccount } from '@/lib/invites/allowlist'

// ─── POST /api/signup/check-invite — public, unauthenticated (27-06 Task 1) ─
// Powers the signup page's D-10 "Have an invite? Enter your email" pre-check
// state. This is UX ONLY — the real, unbypassable admission boundary is
// migration 098's handle_new_user() gate (D-02); this route lets an invited
// visitor skip straight to the signup form instead of submitting blind, and
// routes an already-registered email to sign-in instead. No session gate —
// mirrors app/api/sync/register/route.ts's "first genuinely public write
// path" shape (read-only here, but the same compensating controls): two-
// dimension rate limiting (ip then email, shared limiter from 27-02), and an
// enumeration-mitigated response (T-27-02, D-10's owner-accepted residual
// risk) — the response shape is IDENTICAL whether the email is mistyped,
// unknown, or genuinely uninvited; only the boolean values differ, never the
// shape or an error message that would reveal which case occurred.

function tooManyRequests() {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429 }
  )
}

export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (await checkRateLimit(`ip:${ip}`)) {
    return tooManyRequests()
  }

  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : ''

  if (await checkRateLimit(`email:${email}`)) {
    return tooManyRequests()
  }

  if (!email) {
    // Malformed/empty body — never throws, and the shape is identical to
    // the denied-email response below (enumeration mitigation).
    return NextResponse.json({ allowed: false, existingAccount: false }, { status: 200 })
  }

  const service = createServiceClient()

  const [allowed, existingAccount] = await Promise.all([
    isArtistEmailAllowed(service, email),
    emailHasExistingAccount(service, email),
  ])

  return NextResponse.json({ allowed, existingAccount }, { status: 200 })
}
