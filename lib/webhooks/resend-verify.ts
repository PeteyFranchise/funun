import { Webhook } from 'svix'

/**
 * Minimal, defensive shape for a Resend webhook event. The exact nesting of
 * the bounce-type field is unconfirmed against Resend's live docs at
 * implementation time (RESEARCH.md Assumptions Log A5 / Open Question 1),
 * so both a nested `data.bounce.type` and a flat `data.bounce_type` are
 * supported — callers should check both.
 */
export type ResendWebhookEvent = {
  type: string
  data: {
    to?: string[]
    email?: string
    bounce?: { type?: string }
    bounce_type?: string
  }
}

export type VerifyResendWebhookResult =
  | { ok: true; event: ResendWebhookEvent }
  | { ok: false; status: number }

/**
 * Verifies a Resend webhook payload's Svix signature against
 * RESEND_WEBHOOK_SECRET. The caller MUST pass the raw request body (never a
 * re-serialized/parsed body — signature verification requires the exact
 * bytes Resend signed) and the three svix-* headers.
 *
 * Returns { ok:false, status:503 } when the secret isn't configured yet
 * (D-22 — the webhook degrades gracefully until Resend is set up), and
 * { ok:false, status:400 } when the signature doesn't verify. Never writes
 * to the DB itself — that's the caller's responsibility, only after ok:true.
 */
export function verifyResendWebhook(
  rawBody: string,
  headers: { 'svix-id': string; 'svix-timestamp': string; 'svix-signature': string }
): VerifyResendWebhookResult {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return { ok: false, status: 503 }

  try {
    const wh = new Webhook(secret)
    const event = wh.verify(rawBody, headers) as ResendWebhookEvent
    return { ok: true, event }
  } catch {
    return { ok: false, status: 400 }
  }
}
