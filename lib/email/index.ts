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
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) {
    return { ok: false, error: 'Email not configured' }
  }
  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Email failed' }
  }
}
