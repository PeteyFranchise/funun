// ─── Cloudflare Turnstile server-side verification (D-12 waitlist captcha) ─
// Fail-closed: any missing config, network failure, or non-success response
// from Cloudflare returns false, never true (RESEARCH Pitfall 7 — an
// outage on Cloudflare's side must not open the waitlist to abuse). The
// secret is read INSIDE this function, never at module top-level and never
// exposed to the client — mirrors how RESEND_API_KEY is read only inside
// lib/email/index.ts. Only NEXT_PUBLIC_TURNSTILE_SITE_KEY is public; the
// secret key must never carry a NEXT_PUBLIC_ prefix.

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

// ─── Config-state visibility (quick task 261002-wtl) ───────────────────────
// Distinct from verifyTurnstileToken. This reports WHICH half of a half-configured Turnstile is missing, so a
// caller can raise an operator-visible signal for the genuinely invisible
// case — site key set (widget renders, visitor completes a challenge) but
// secret missing (server silently refuses). It returns a status only,
// never either key's value, and reads both vars inside the function body,
// never at module top level, matching this file's existing discipline.
export type TurnstileConfigStatus = 'configured' | 'secret-missing' | 'site-key-missing' | 'unconfigured'

export function turnstileConfigStatus(): TurnstileConfigStatus {
  const hasSecret = Boolean(process.env.TURNSTILE_SECRET)
  const hasSiteKey = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)

  if (hasSecret && hasSiteKey) return 'configured'
  if (!hasSecret && !hasSiteKey) return 'unconfigured'
  if (!hasSecret) return 'secret-missing'
  return 'site-key-missing'
}

export type VerifyTurnstileOptions = {
  /**
   * The action name the widget was rendered with. When set, Cloudflare's
   * reported action must match, so a token minted for one form cannot be
   * replayed against another.
   */
  expectedAction?: string
}

// Cloudflare's published always-pass / always-fail / token-spent test secrets
// (1x/2x/3x followed by zeros and AA) do not echo the widget's real action or
// hostname, so those two checks are skipped for them to keep local dev usable.
const TURNSTILE_TEST_SECRET = /^[123]x0+AA$/

// Verification must finish quickly; a slow Cloudflare response counts as a
// failed verification (fail closed), not a hung request.
const TURNSTILE_VERIFY_TIMEOUT_MS = 5000

/**
 * Optional hostname pin. Set TURNSTILE_EXPECTED_HOSTNAME to one hostname or a
 * comma-separated list to require that Cloudflare reports one of them.
 * Unset (the default, including preview deploys) means no hostname check.
 */
function expectedHostnames(): string[] {
  return (process.env.TURNSTILE_EXPECTED_HOSTNAME ?? '')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean)
}

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
  options: VerifyTurnstileOptions = {}
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET
  if (!secret || !token) return false

  const body = new URLSearchParams({ secret, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TURNSTILE_VERIFY_TIMEOUT_MS),
    })
    if (!res.ok) return false // fail closed — Cloudflare itself is unhappy

    const data: unknown = await res.json().catch(() => null)
    if (!data || typeof data !== 'object') return false // fail closed — malformed body
    const result = data as { success?: unknown; action?: unknown; hostname?: unknown }
    if (result.success !== true) return false

    if (TURNSTILE_TEST_SECRET.test(secret)) return true

    if (options.expectedAction !== undefined && result.action !== options.expectedAction) {
      return false // fail closed: token was minted for a different widget
    }

    const hostnames = expectedHostnames()
    if (hostnames.length > 0) {
      const reported = typeof result.hostname === 'string' ? result.hostname.toLowerCase() : ''
      if (!hostnames.includes(reported)) return false
    }

    return true
  } catch {
    return false // fail closed, includes the timeout abort
  }
}
