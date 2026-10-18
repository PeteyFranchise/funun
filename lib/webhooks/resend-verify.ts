import { Webhook } from 'svix'

/**
 * Minimal shape for the Resend webhook events this app reads, taken from
 * Resend's documented payloads:
 *   https://resend.com/docs/webhooks/emails/bounced
 *   https://resend.com/docs/webhooks/emails/complained
 * `data.to` is the array of impacted recipients (an address may carry a
 * display name). `data.bounce.type` is Resend's bounce class (e.g.
 * "Permanent"); the webhook route decides which classes count as a hard
 * bounce. The earlier flat `data.bounce_type` / `data.email` fields were
 * guesses made before the docs were checked and do not exist in the payload.
 */
export type ResendWebhookEvent = {
  type: string
  created_at?: string
  data: {
    email_id?: string
    from?: string
    to?: string[]
    subject?: string
    bounce?: { message?: string; subType?: string; type?: string }
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
