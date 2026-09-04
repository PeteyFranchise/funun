import { esc } from './esc'

export function existingClientPartnerInviteEmail(input: {
  displayName: string
  organizationName: string
  destination: string
}): { subject: string; html: string } {
  const name = input.displayName.trim() || 'there'
  const organization = input.organizationName.trim() || 'a Client Partner workspace'
  return {
    subject: `You’ve been added to ${organization} on Funūn`,
    html: `
      <p>Hi ${esc(name)},</p>
      <p>You’ve been added to <strong>${esc(organization)}</strong> on Funūn.</p>
      <p>Use your existing Funūn login. Your Member workspace and personal creative catalogue remain separate and unchanged.</p>
      <p><a href="${esc(input.destination)}">Open The Crate</a></p>
    `,
  }
}
