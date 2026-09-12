import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { emailHasExistingAccount, isSignupInviteValid } from '@/lib/invites/allowlist'

// ─── POST /api/signup/check-invite — public, unauthenticated (27-06 Task 1) ─
// Email alone never reveals account or allowlist state. Only someone holding
// the matching invitation capability can receive an admission verdict. The
// database trigger independently enforces the same token + exact-email pair.

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
  const inviteToken = typeof raw.inviteToken === 'string' ? raw.inviteToken.trim() : ''

  if (await checkRateLimit(`email:${email}`)) {
    return tooManyRequests()
  }

  if (!email || !inviteToken) {
    // Malformed/empty body — never throws, and the shape is identical to
    // the denied-email response below (enumeration mitigation).
    return NextResponse.json({ allowed: false, existingAccount: false }, { status: 200 })
  }

  const service = createServiceClient()

  const allowed = await isSignupInviteValid(service, email, inviteToken)
  if (!allowed) {
    return NextResponse.json({ allowed: false, existingAccount: false }, { status: 200 })
  }

  // Account state is disclosed only after possession of the exact invite
  // capability has been proven, not to arbitrary email-address probes.
  const existingAccount = await emailHasExistingAccount(service, email)

  return NextResponse.json({ allowed, existingAccount }, { status: 200 })
}
