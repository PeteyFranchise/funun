// ─── Staff invite email (Phase 25 — Funūn Team Member provisioning) ───────
// Custom Resend magic-link invite, sent via lib/email sendEmail() instead of
// Supabase's built-in invite template — mirrors lib/email/buyerInvite.ts
// exactly. Sent by createStaffAccount() when leadership provisions a new
// Funūn Team Member (staff) account.

import { esc } from '@/lib/email/esc'

// HTML-escape values interpolated into the email template. displayName
// originates from the leadership caller's request body, so it is treated
// as untrusted (mirrors buyerInviteEmail's esc() discipline). Shared with
// industryInvite.ts (and the 27-05 artist-invite templates) via
// lib/email/esc.ts — do not re-declare a local copy (27-RESEARCH "Don't
// Hand-Roll").

export function staffInviteEmail(args: { displayName: string; actionLink: string }): {
  subject: string
  html: string
} {
  const { displayName, actionLink } = args
  return {
    subject: 'You have been invited to the Funūn team',
    html: `<p>Hi ${esc(displayName)},</p><p>You've been invited to join the Funūn team.</p><p><a href="${esc(actionLink)}">Sign in to Funūn</a></p>`,
  }
}
