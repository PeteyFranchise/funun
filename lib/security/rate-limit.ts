// ─── Durable, shared rate limiter (audit #7) ──────────────────────────────
// Backed by a Postgres table + the atomic check_rate_limit RPC (migration 116),
// so the count is shared across every serverless instance and survives cold
// starts. The previous in-memory Map limiter was per-instance and trivially
// bypassed by spreading requests across instances — it was removed.
//
// checkRateLimit() creates its own service client (the RPC is service-role-only
// EXECUTE), so call sites just `await checkRateLimit('ip:'+ip)` with no plumbing.
// Namespacing dimensions is done by key prefix ('ip:' / 'email:').
//
// FAIL-OPEN: on any limiter-backend error (including the RPC not yet existing
// before migration 116 is pushed) it returns false — a rare backend blip must
// not lock legitimate users out of signup/waitlist. These surfaces are
// abuse-annoyance, not catastrophic if briefly unlimited; failing closed would
// break onboarding on a transient DB hiccup.

import { createServiceClient } from '@/lib/supabase/server'

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
export const RATE_LIMIT_MAX_ATTEMPTS = 5

export async function checkRateLimit(
  key: string,
  options: { windowMs?: number; maxAttempts?: number } = {}
): Promise<boolean> {
  const windowMs = options.windowMs ?? RATE_LIMIT_WINDOW_MS
  const maxAttempts = options.maxAttempts ?? RATE_LIMIT_MAX_ATTEMPTS

  try {
    const service = createServiceClient()
    const { data, error } = await service.rpc('check_rate_limit', {
      p_key: key,
      p_window_seconds: Math.ceil(windowMs / 1000),
      p_max: maxAttempts,
    })
    if (error) return false // fail-open (see header)
    return data === true
  } catch {
    return false // fail-open
  }
}

// Resolve the client IP for rate-limit keys. On Vercel, `x-real-ip` is set by
// the platform to the true client IP and is NOT client-controllable at the app
// layer — prefer it. Fall back to the LAST `x-forwarded-for` entry (the hop the
// trusted proxy appended), never the leftmost value (which a client can spoof
// to rotate keys and bypass the limit — the audit #7 finding). 'unknown' groups
// header-less callers into a single bucket rather than letting them slip past.
export function getClientIp(request: Request): string {
  const real = request.headers.get('x-real-ip')?.trim()
  if (real) return real

  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  }

  return 'unknown'
}
