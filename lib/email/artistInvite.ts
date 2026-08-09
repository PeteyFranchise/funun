// ─── Artist founding-member invite email (D-17, template A) ───────────────
// Branded transactional invite sent when a collaborator or Team Member
// invites a person to create their own artist account (D-01/D-08/D-09).
// Deliberately raises the bar above the minimal industryInvite.ts/
// staffInvite.ts style (27-CONTEXT D-17): dual HTML+text body, light
// deliverability-safe background, brand-gradient CTA, founding-member
// positioning (D-16). Final copy is subject to owner sign-off — a launch
// gate tracked in 27-11 (27-UI-SPEC surface 6) — this is the structural
// contract only.

import { esc } from '@/lib/email/esc'

const CTA_GRADIENT = 'linear-gradient(105deg,#818CF8 0%,#D946EF 100%)'

export function artistInviteEmail(args: {
  inviterName?: string | null
  actionLink: string
}): { subject: string; html: string; text: string } {
  const { inviterName, actionLink } = args
  const safeLink = esc(actionLink)
  const invitedByLine = inviterName
    ? `<p style="margin:0 0 16px;color:#4b4b57;font-size:14px">Invited by <strong>${esc(inviterName)}</strong>.</p>`
    : ''

  const html = `
    <div style="background:#FFFFFF;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
      <div style="max-width:480px;margin:0 auto">
        <div style="font-size:18px;font-weight:600;color:#0a0a0f;margin-bottom:24px">Funūn</div>
        <h1 style="font-size:22px;font-weight:700;color:#0a0a0f;margin:0 0 12px">You're invited to Funūn</h1>
        ${invitedByLine}
        <p style="margin:0 0 16px;color:#4b4b57;font-size:14px;line-height:1.5">
          Funūn is invite-only right now — we're building it with a founding cohort of artists.
          You've been invited to be part of that cohort: a home for your rights, your collaborators,
          and your registrations, all in one place.
        </p>
        <p style="margin:0 0 28px;color:#4b4b57;font-size:14px;line-height:1.5">
          Create your account to get started.
        </p>
        <p style="margin:0 0 8px">
          <a href="${safeLink}" style="display:inline-block;padding:12px 24px;background:${CTA_GRADIENT};color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Create your Funūn account</a>
        </p>
        <p style="margin:32px 0 0;color:#9a9aa5;font-size:12px">If you weren't expecting this invite, you can safely ignore this email.</p>
      </div>
    </div>
  `

  const textLines = [
    'Funūn',
    '',
    "You're invited to Funūn",
    '',
  ]
  if (inviterName) {
    textLines.push(`Invited by ${inviterName}.`, '')
  }
  textLines.push(
    "Funūn is invite-only right now — we're building it with a founding cohort of artists. You've been invited to be part of that cohort: a home for your rights, your collaborators, and your registrations, all in one place.",
    '',
    'Create your account to get started:',
    actionLink,
    '',
    "If you weren't expecting this invite, you can safely ignore this email."
  )

  const text = textLines.join('\n')

  return {
    subject: "You're invited to Funūn",
    html,
    text,
  }
}
