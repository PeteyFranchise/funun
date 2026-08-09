// ─── Artist waitlist "we've reopened" broadcast email (D-17, template C) ──
// Branded COMMERCIAL broadcast sent to every waitlister at once when
// Leadership reopens invites (D-13b/D-15). Because this is a bulk broadcast
// (not a personal, transactional send like templates A/B), it MUST carry a
// visible unsubscribe link in both the HTML and plain-text bodies (D-19,
// RESEARCH A4 — CAN-SPAM). Opting out here only suppresses future reopen
// broadcasts; a personal invite from a collaborator or the Funūn team still
// always reaches the recipient (D-19). Structural contract only — final
// copy is subject to owner sign-off, a launch gate tracked in 27-11
// (27-UI-SPEC surface 6).

import { esc } from '@/lib/email/esc'

const CTA_GRADIENT = 'linear-gradient(105deg,#818CF8 0%,#D946EF 100%)'

export function artistReopenedEmail(args: {
  actionLink: string
  unsubscribeLink: string
}): { subject: string; html: string; text: string } {
  const { actionLink, unsubscribeLink } = args
  const safeLink = esc(actionLink)
  const safeUnsubscribeLink = esc(unsubscribeLink)

  const html = `
    <div style="background:#FFFFFF;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="max-width:480px;margin:0 auto">
        <div style="font-size:18px;font-weight:600;color:#0a0a0f;margin-bottom:24px">Funūn</div>
        <h1 style="font-size:22px;font-weight:700;color:#0a0a0f;margin:0 0 12px">Funūn has reopened invites</h1>
        <p style="margin:0 0 16px;color:#4b4b57;font-size:14px;line-height:1.5">
          We've opened a new round of invites to Funūn's founding cohort of artists, and you're on
          our waiting list — so we wanted you to know.
        </p>
        <p style="margin:0 0 28px;color:#4b4b57;font-size:14px;line-height:1.5">
          Create your account to get started.
        </p>
        <p style="margin:0 0 8px">
          <a href="${safeLink}" style="display:inline-block;padding:12px 24px;background:${CTA_GRADIENT};color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Create your Funūn account</a>
        </p>
        <p style="margin:32px 0 0;color:#9a9aa5;font-size:12px">
          You're receiving this because you joined Funūn's waiting list.
          <a href="${safeUnsubscribeLink}" style="color:#9a9aa5;text-decoration:underline">Unsubscribe</a>
          from these announcements.
        </p>
      </div>
    </div>
  `

  const text = [
    'Funūn',
    '',
    'Funūn has reopened invites',
    '',
    "We've opened a new round of invites to Funūn's founding cohort of artists, and you're on our waiting list — so we wanted you to know.",
    '',
    'Create your account to get started:',
    actionLink,
    '',
    "You're receiving this because you joined Funūn's waiting list.",
    `Unsubscribe from these announcements: ${unsubscribeLink}`,
  ].join('\n')

  return {
    subject: "Funūn has reopened invites",
    html,
    text,
  }
}
