// ─── Staff invite email (Phase 25 — Funūn Team Member provisioning) ───────
// Custom Resend magic-link invite, sent via lib/email sendEmail() instead of
// Supabase's built-in invite template — mirrors lib/email/buyerInvite.ts.
// Sent by createStaffAccount() when leadership provisions a new Team Member.
//
// Branded, light-background HTML with a bulletproof (table-based) button for
// cross-client rendering, plus a plaintext part (multipart mail is less
// spam-prone than HTML-only). Deliverability still depends on RESEND_FROM_EMAIL
// being a VERIFIED funun.studio sender — a well-formed body does not rescue an
// unverified/foreign from-domain.

import { esc } from '@/lib/email/esc'

// HTML-escape values interpolated into the email template. displayName
// originates from the leadership caller's request body, so it is treated as
// untrusted (mirrors buyerInviteEmail's esc() discipline). Shared via
// lib/email/esc.ts — do not re-declare a local copy.

export function staffInviteEmail(args: { displayName: string; actionLink: string }): {
  subject: string
  html: string
  text: string
} {
  const { displayName, actionLink } = args
  const name = esc(displayName)
  const link = esc(actionLink)

  const subject = 'You’re invited to the Funūn team'

  const text = `Hi ${displayName},

You've been added to the Funūn team. Set up your account and sign in here:
${actionLink}

If you weren't expecting this invite, you can safely ignore this email.

— Funūn`

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f2fb;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2fb;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e1f5;border-radius:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding:28px 32px 6px;">
                <div style="font-size:22px;font-weight:800;letter-spacing:.04em;color:#6D5AE0;">FUN&#362;N</div>
                <div style="font-size:10px;font-weight:700;letter-spacing:.3em;color:#8B85AB;margin-top:3px;">THE ARTS</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 4px;color:#241A4D;font-size:19px;font-weight:700;">You’re invited to the team</td>
            </tr>
            <tr>
              <td style="padding:8px 32px 4px;color:#5F5885;font-size:15px;line-height:1.6;">
                Hi ${name}, you’ve been added to the <b>Funūn</b> team. Set up your account and sign in below.
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="border-radius:11px;background:#6D5AE0;">
                      <a href="${link}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:11px;">Sign in to Funūn</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 20px;color:#8B85AB;font-size:12.5px;line-height:1.6;">
                Or paste this link into your browser:<br />
                <a href="${link}" style="color:#6D5AE0;word-break:break-all;">${link}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 28px;border-top:1px solid #ece8fa;color:#a09bbb;font-size:11.5px;line-height:1.6;">
                If you weren’t expecting this invite, you can safely ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}
