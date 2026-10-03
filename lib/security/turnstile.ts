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
// Distinct from verifyTurnstileToken, which stays byte-for-byte unchanged
// above (fail-closed proof: its seven existing tests pass unmodified).
// This reports WHICH half of a half-configured Turnstile is missing, so a
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

export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET
  if (!secret || !token) return false

  const body = new URLSearchParams({ secret, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) return false // fail closed — Cloudflare itself is unhappy

    const data: unknown = await res.json().catch(() => null)
    if (!data || typeof data !== 'object') return false // fail closed — malformed body
    return (data as { success?: unknown }).success === true
  } catch {
    return false // fail closed
  }
}
