import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { createRateLimiter, getClientIp } from '@/lib/security/rate-limit'

// ─── GET /api/signup/invite/[token] — public deep-link resolver ──────────
// (27-06 Task 2) Resolves D-09's tokened deep-link into pre-fill data for
// the signup page: the invited email + "invited by [name]" framing +
// whether the token has expired (re-request state). Checks BOTH invite
// sources — artist_invites (staff/waitlist-conversion/owner-seed invites)
// first, then falls back to collaborator_invites (D-09: "reuse the
// collaborator_invites token machinery" for the collaborator-invite
// deep-link) — since either table can carry a signup token.
//
// This route NEVER admits by token (RESEARCH Open Question 2) — the real,
// unbypassable gate is migration 098's handle_new_user() trigger, which
// always re-derives admission from the email actually submitted at signup
// (via POST /api/signup/check-invite + the trigger itself). A forwarded
// link only pre-fills a different visitor's form with someone else's
// email; it cannot itself grant that email access, and Supabase's own
// signup email-confirmation flow guarantees inbox control before the
// account is usable (T-27-03). A light ip rate limit blunts token
// brute-forcing (T-27-04).

const ipLimiter = createRateLimiter()

type InviteResolution = { email: string; inviterName: string | null; expired: boolean }

function tooManyRequests() {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429 }
  )
}

function notFound() {
  // Generic — mirrors check-invite's enumeration discipline; a token that
  // matches neither table reads identically to any other lookup failure.
  return NextResponse.json({ error: 'Invite not found.' }, { status: 404 })
}

function isExpired(tokenExpiresAt: string | null): boolean {
  if (!tokenExpiresAt) return false
  return new Date(tokenExpiresAt).getTime() < Date.now()
}

// Best-effort display-name resolve — null (not a thrown error) when the
// inviter id is absent or the profile row can't be read, since this is
// pre-fill framing only, never a security-relevant value.
async function resolveInviterName(
  service: SupabaseClient,
  userId: string | null
): Promise<string | null> {
  if (!userId) return null
  try {
    const { data } = await service
      .from('user_profiles')
      .select('artist_name')
      .eq('id', userId)
      .maybeSingle()
    const name = (data as { artist_name: string | null } | null)?.artist_name ?? null
    return name && name.trim() ? name.trim() : null
  } catch {
    return null
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(request)
  if (ipLimiter.isRateLimited(`ip:${ip}`)) {
    return tooManyRequests()
  }

  const { token } = await params
  if (!token) return notFound()

  const service = createServiceClient()

  const { data: artistInvite } = await service
    .from('artist_invites')
    .select('email, token_expires_at, invited_by_user_id')
    .eq('invite_token', token)
    .maybeSingle()

  if (artistInvite) {
    const row = artistInvite as {
      email: string
      token_expires_at: string | null
      invited_by_user_id: string | null
    }
    const resolution: InviteResolution = {
      email: row.email,
      inviterName: await resolveInviterName(service, row.invited_by_user_id),
      expired: isExpired(row.token_expires_at),
    }
    return NextResponse.json(resolution, { status: 200 })
  }

  const { data: collaboratorInvite } = await service
    .from('collaborator_invites')
    .select('invited_email, token_expires_at, inviting_user_id')
    .eq('invite_token', token)
    .maybeSingle()

  if (collaboratorInvite) {
    const row = collaboratorInvite as {
      invited_email: string
      token_expires_at: string | null
      inviting_user_id: string | null
    }
    const resolution: InviteResolution = {
      email: row.invited_email,
      inviterName: await resolveInviterName(service, row.inviting_user_id),
      expired: isExpired(row.token_expires_at),
    }
    return NextResponse.json(resolution, { status: 200 })
  }

  return notFound()
}
