// ─── Shared in-memory rate limiter (Phase 27, 27-02) ───────────────────────
// Extracted verbatim from app/api/sync/register/route.ts's in-route,
// sliding-window limiter (27-PATTERNS exact analog) so every later public
// route (check-invite, waitlist, waitlist/resubscribe) shares identical
// behavior instead of copy-pasting a 4th/5th limiter (RESEARCH "Don't
// Hand-Roll"). Each createRateLimiter() call owns its own Map, so
// independent routes get independent buckets — a caller can layer two
// dimensions (e.g. ip + email) by instantiating two limiters, matching
// sync/register's existing pattern.
//
// Acceptable for beta per sync/register's own directive: a warm serverless
// instance shares this Map across requests it serves, degrading gracefully
// (not failing open or closed) across cold starts/multiple instances.

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
export const RATE_LIMIT_MAX_ATTEMPTS = 5

export type RateLimiter = {
  isRateLimited: (key: string) => boolean
}

export function createRateLimiter(
  options: { windowMs?: number; maxAttempts?: number } = {}
): RateLimiter {
  const windowMs = options.windowMs ?? RATE_LIMIT_WINDOW_MS
  const maxAttempts = options.maxAttempts ?? RATE_LIMIT_MAX_ATTEMPTS
  const store = new Map<string, number[]>()

  return {
    isRateLimited(key: string): boolean {
      const now = Date.now()
      const recent = (store.get(key) ?? []).filter(ts => now - ts < windowMs)
      if (recent.length >= maxAttempts) {
        store.set(key, recent)
        return true
      }
      recent.push(now)
      store.set(key, recent)
      return false
    },
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return request.headers.get('x-real-ip') ?? 'unknown'
}
