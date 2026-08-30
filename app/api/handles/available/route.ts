import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit'
import { handleFormatError, normalizeHandleForCompare } from '@/lib/handles/validate'

// ─── GET /api/handles/available — public, unauthenticated, courtesy-only ──
// (D-14/D-15) Called from two places: the signup form's `allowed` state
// (no session at all) and, later, plan 06's D-09 hard gate for a signed-in
// User Account with no handle yet. Neither caller has a session in the
// signup case, so this lives at /api/handles/available rather than under
// the authenticated /api/profile/ namespace — nesting it there would
// misrepresent its auth posture.
//
// D-14: this is a COURTESY ONLY. The unique index (migration 010) and the
// reserved/retired-handle guard (migration 133) are the sole authority — a
// simultaneous claim is resolved at the INSERT, by migration 133's
// unique_violation/raise_exception catch (D-15), never optimistically by
// anything this route reports. An 'available' verdict here is never a
// claim, and a wrong or missing verdict here can never create or destroy
// one.
//
// Modelled on app/api/signup/check-invite/route.ts's posture: public,
// non-throwing, rate-limited before any database work.

// Own keyspace, own limits (T-36-17/T-36-18). Sharing check-invite's `ip:`
// prefix (5 attempts / 15 minutes — tuned for one deliberate submit) would
// let a debounced handle-typing session exhaust the budget that guards
// signup admission itself; after two typed words the field would be
// unusable. `handle-check:` is a dedicated prefix, sized for keystroke-rate
// traffic: roughly sixty attempts every five minutes.
const HANDLE_CHECK_WINDOW_MS = 5 * 60 * 1000
const HANDLE_CHECK_MAX_ATTEMPTS = 60

type AvailabilityBody = {
  available: boolean | null
  reason: 'invalid' | 'unavailable' | null
  message?: string
}

function json(body: AvailabilityBody, status = 200) {
  return NextResponse.json(body, { status })
}

export async function GET(request: Request) {
  const ip = getClientIp(request)
  if (
    await checkRateLimit(`handle-check:ip:${ip}`, {
      windowMs: HANDLE_CHECK_WINDOW_MS,
      maxAttempts: HANDLE_CHECK_MAX_ATTEMPTS,
    })
  ) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }

  const url = new URL(request.url)
  const raw = (url.searchParams.get('handle') ?? '').trim()

  const formatError = handleFormatError(raw)
  if (formatError) {
    // Missing/empty and malformed both fail the same shared validator — no
    // database call either way, and the message lets the caller render it
    // without re-deriving the rule.
    return json({ available: false, reason: 'invalid', message: formatError })
  }

  const service = createServiceClient()
  const lowered = normalizeHandleForCompare(raw)

  const [resolved, reserved] = await Promise.all([
    // migration 133's resolver, which covers BOTH a live handle and a
    // retired one (D-07/D-08) in a single exact lowered comparison.
    // PostgREST cannot express lower(col) = lower($1), and an underscore is
    // both a legal handle character (D-05) and a single-character pattern
    // wildcard, so a pattern-match filter would produce wrong matches — the
    // RPC is the only correct way to ask this question from here.
    service.rpc('resolve_profile_by_handle', { p_handle: raw }),
    // reserved_handles stores its values already lowercased (migration 037's
    // own header), so a direct equality on the lowered input is exact.
    service.from('reserved_handles').select('handle').eq('handle', lowered).maybeSingle(),
  ])

  if (resolved.error || reserved.error) {
    // An honest "unknown" is correct here — reporting a free handle as
    // taken would be a worse failure than reporting nothing (D-14).
    return json({ available: null, reason: null })
  }

  const taken = Array.isArray(resolved.data) ? resolved.data.length > 0 : Boolean(resolved.data)
  const isReserved = Boolean(reserved.data)

  if (taken || isReserved) {
    // Taken, reserved and retired are deliberately collapsed into one
    // reason (T-36-19) — this endpoint never confirms whether a specific
    // name is merely reserved or actually held by a person, matching the
    // single-message posture of the PATCH /api/profile/handle route.
    return json({ available: false, reason: 'unavailable' })
  }

  return json({ available: true, reason: null })
}
