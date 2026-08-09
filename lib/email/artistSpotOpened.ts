// ─── Artist waitlist "your spot opened" email (D-17, template B) ──────────
// Branded transactional notice sent when a Team Member converts a single
// waitlist entry into an invite (D-13a — per-person conversion). This is a
// personal, transactional send tied to that one conversion — it does NOT
// carry an unsubscribe link (D-19 scopes unsubscribe to the bulk reopen
// broadcast only, template C). Structural contract only — final copy is
// subject to owner sign-off, a launch gate tracked in 27-11 (27-UI-SPEC
// surface 6).

import { esc } from '@/lib/email/esc'

const CTA_GRADIENT = 'linear-gradient(105deg,#818CF8 0%,#D946EF 100%)'

export function artistSpotOpenedEmail(args: { actionLink: string }): {
  subject: string
  html: string
  text: string
} {
  const { actionLink } = args
  const safeLink = esc(actionLink)

  const html = `
    <div style="background:#FFFFFF;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="max-width:480px;margin:0 auto">
        <div style="font-size:18px;font-weight:600;color:#0a0a0f;margin-bottom:24px">Funūn</div>
        <h1 style="font-size:22px;font-weight:700;color:#0a0a0f;margin:0 0 12px">Your spot on Funūn just opened</h1>
        <p style="margin:0 0 16px;color:#4b4b57;font-size:14px;line-height:1.5">
          You joined our waiting list for Funūn's founding cohort of artists — and a spot has just
          opened up for you.
        </p>
        <p style="margin:0 0 28px;color:#4b4b57;font-size:14px;line-height:1.5">
          Create your account to get started.
        </p>
        <p style="margin:0 0 8px">
          <a href="${safeLink}" style="display:inline-block;padding:12px 24px;background:${CTA_GRADIENT};color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Create your Funūn account</a>
        </p>
        <p style="margin:32px 0 0;color:#9a9aa5;font-size:12px">If you weren't expecting this email, you can safely ignore it.</p>
      </div>
    </div>
  `

  const text = [
    'Funūn',
    '',
    'Your spot on Funūn just opened',
    '',
    "You joined our waiting list for Funūn's founding cohort of artists — and a spot has just opened up for you.",
    '',
    'Create your account to get started:',
    actionLink,
    '',
    "If you weren't expecting this email, you can safely ignore it.",
  ].join('\n')

  return {
    subject: 'Your spot on Funūn just opened',
    html,
    text,
  }
}
