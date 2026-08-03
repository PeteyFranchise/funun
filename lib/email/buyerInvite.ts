// ─── Buyer invite email (D-11/D-12) ────────────────────────────────────────
// Custom Resend magic-link invite, sent via lib/email sendEmail() instead of
// Supabase's built-in invite template — mirrors lib/email/industryInvite.ts
// exactly. Used for both the admin-created first org admin (D-12) and every
// subsequent org-admin-invited employee (D-13).

// WR-05 (mirrored): HTML-escape values interpolated into the email template.
// displayName can originate from either the platform admin (org creation) or
// an org-admin employee invite, so it is treated as untrusted either way.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buyerInviteEmail(args: { displayName: string; actionLink: string }): {
  subject: string
  html: string
} {
  const { displayName, actionLink } = args
  return {
    subject: 'You have been invited to Funūn',
    html: `<p>Hi ${esc(displayName)},</p><p>You've been invited to join Funūn as a buyer.</p><p><a href="${esc(actionLink)}">Sign in to Funūn</a></p>`,
  }
}
