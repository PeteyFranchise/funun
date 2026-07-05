// ─── Industry-member invite email (D-03) ──────────────────────────────────
// Custom Resend magic-link invite, sent via lib/email sendEmail() instead of
// Supabase's built-in invite template — this app owns all its own
// transactional email. Plain HTML string, matching the minimal shape used by
// the curator-claim invite (no rich template system in this codebase).
export function industryInviteEmail(args: { displayName: string; actionLink: string }): {
  subject: string
  html: string
} {
  const { displayName, actionLink } = args
  return {
    subject: 'You have been invited to Funūn',
    html: `<p>Hi ${displayName},</p><p>You've been invited to join Funūn as an industry member.</p><p><a href="${actionLink}">Sign in to Funūn</a></p>`,
  }
}
