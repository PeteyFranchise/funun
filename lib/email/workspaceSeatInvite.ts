// ─── Workspace seat invitation email (Phase 38 — D-12) ────────────────────
// Sent by the invitation issuance route (app/api/workspaces/[workspaceId]/
// invitations/route.ts) when an owner or admin invites a colleague by
// email. Written in the style of lib/email/staffInvite.ts — same shared
// sendEmail() helper (lib/email/index.ts), same esc() escaping of every
// interpolated value (lib/email/esc.ts) — rather than instantiating a new
// Resend client here.
//
// The accept link carries the RAW invitation token as a query param. The
// raw token exists only in memory at issuance time and in this email; only
// its sha256 digest is ever persisted (lib/workspaces/invitations.ts).
// Accepting the link binds the seat to whichever Funūn account the
// recipient is (or becomes) signed into — this email never provisions an
// account itself (D-12, Phase 27 invite-only gate).

import { esc } from '@/lib/email/esc'

export function workspaceSeatInviteEmail(args: {
  workspaceName: string
  inviterName: string
  role: string
  actionLink: string
}): { subject: string; html: string; text: string } {
  const { workspaceName, inviterName, role, actionLink } = args
  const workspace = esc(workspaceName)
  const inviter = esc(inviterName)
  const roleLabel = esc(role)
  const link = esc(actionLink)

  const subject = `${inviterName} invited you to ${workspaceName} on Funūn`

  const text = `Hi,

${inviterName} invited you to join ${workspaceName} on Funūn as a ${role}.

Accept the invitation here:
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
              <td style="padding:16px 32px 4px;color:#241A4D;font-size:19px;font-weight:700;">You're invited to ${workspace}</td>
            </tr>
            <tr>
              <td style="padding:8px 32px 4px;color:#5F5885;font-size:15px;line-height:1.6;">
                ${inviter} invited you to join <b>${workspace}</b> on <b>Funūn</b> as a ${roleLabel}.
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="border-radius:11px;background:#6D5AE0;">
                      <a href="${link}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:11px;">Accept invitation</a>
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
                If you weren't expecting this invite, you can safely ignore this email.
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
