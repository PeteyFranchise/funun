// ─── Cloudflare Turnstile server-side verification (D-12 waitlist captcha) ─
// Fail-closed: any missing config, network failure, or non-success response
// from Cloudflare returns false, never true (RESEARCH Pitfall 7 — an
// outage on Cloudflare's side must not open the waitlist to abuse). The
// secret is read INSIDE this function, never at module top-level and never
// exposed to the client — mirrors how RESEND_API_KEY is read only inside
// lib/email/index.ts. Only NEXT_PUBLIC_TURNSTILE_SITE_KEY is public; the
// secret key must never carry a NEXT_PUBLIC_ prefix.

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret || !token) return false

  const body = new URLSearchParams({ secret, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)

  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const data = (await res.json()) as { success: boolean }
    return data.success === true
  } catch {
    return false // fail closed
  }
}
