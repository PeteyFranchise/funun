import { Resend } from 'resend'

/**
 * Thin Resend wrapper. Server-only. No-ops safely (returns ok:false) when
 * RESEND_API_KEY / RESEND_FROM_EMAIL aren't configured, so callers (e.g. the
 * Antenna match notifier) never throw just because email isn't set up yet.
 */
export async function sendEmail(args: {
  to: string
  subject: string
  html: string
  text?: string
  /** Where replies should go (e.g. the artist's own address on a pitch). */
  replyTo?: string
  /**
   * Optional sender override (e.g. PITCH_FROM_EMAIL for the dedicated
   * cold-outreach subdomain, D-22). When provided, the effective from
   * address is this value instead of RESEND_FROM_EMAIL; the no-op-when-
   * unconfigured gate checks THIS value, not RESEND_FROM_EMAIL, so a send
   * fails gracefully until the override's domain is live.
   */
  from?: string
  /**
   * Optional Resend `Idempotency-Key` (27-CODEX-REVIEW.md follow-up #2
   * MEDIUM — ambiguous provider timeouts / lost responses). When provided,
   * a retried send using the SAME key returns Resend's cached result
   * instead of dispatching a second email — the backstop for a caller that
   * retries after a network timeout or process death where the original
   * request may have already been accepted by Resend even though the
   * caller never saw the response. Callers should build this from stable,
   * request-independent identifiers (e.g. a recipient id + a coarse time
   * epoch, or a recipient id + the exact invite token being sent) so a
   * genuine retry of the SAME logical send reuses the key, while content
   * that has legitimately changed (a rotated invite token, a new campaign)
   * gets a fresh one.
   */
  idempotencyKey?: string
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  // Gate on args.from specifically when the caller explicitly passed a
  // `from` key (even if its value is undefined, e.g. an unset env var
  // spread in as `from: process.env.PITCH_FROM_EMAIL`) — that signals a
  // hard override is intended and the send must no-op until THAT value is
  // configured, not silently fall back to RESEND_FROM_EMAIL (which would
  // defeat a dedicated cold-outreach subdomain like PITCH_FROM_EMAIL, D-22).
  // Callers that never mention `from` at all keep falling back to
  // RESEND_FROM_EMAIL as before.
  const usesFromOverride = 'from' in args
  const from = args.from ?? process.env.RESEND_FROM_EMAIL
  const configured = usesFromOverride ? !!args.from : !!process.env.RESEND_FROM_EMAIL
  if (!apiKey || !configured || !from) {
    return { ok: false, error: 'Email not configured' }
  }
  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send(
      {
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        ...(args.replyTo ? { replyTo: args.replyTo } : {}),
      },
      args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : undefined
    )
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Email failed' }
  }
}
