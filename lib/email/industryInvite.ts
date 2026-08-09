// ─── Industry-member invite email (D-03) ──────────────────────────────────
// Custom Resend magic-link invite, sent via lib/email sendEmail() instead of
// Supabase's built-in invite template — this app owns all its own
// transactional email. Plain HTML string, matching the minimal shape used by
// the curator-claim invite (no rich template system in this codebase).

import { esc } from '@/lib/email/esc'

// WR-05: HTML-escape values interpolated into the email template. displayName
// comes from an admin form today but createIndustryMember() is documented as
// reusable by a future self-serve flow, at which point it becomes
// attacker-controlled. Escaping prevents HTML injection (phishing content,
// tracking pixels, layout spoofing around the real sign-in link). Shared
// with staffInvite.ts (and the 27-05 artist-invite templates) via
// lib/email/esc.ts — do not re-declare a local copy (27-RESEARCH "Don't
// Hand-Roll").

export function industryInviteEmail(args: { displayName: string; actionLink: string }): {
  subject: string
  html: string
} {
  const { displayName, actionLink } = args
  return {
    subject: 'You have been invited to Funūn',
    html: `<p>Hi ${esc(displayName)},</p><p>You've been invited to join Funūn as an industry member.</p><p><a href="${esc(actionLink)}">Sign in to Funūn</a></p>`,
  }
}
