import { esc } from '@/lib/email/esc'

// ─── Split-sheet initiator notification ───────────────────────────────
// Email sent to a split sheet's initiator when a party approves or proposes a
// counter-split. The party name is artist-entered text, so it is escaped in
// the HTML body and kept to one line in the plain-text subject.

export type InitiatorNotificationInput = {
  partyName: string
  songName: string
  action: 'approved' | 'countered'
  counterSplit: number | null
  appUrl: string
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ')

export function buildInitiatorNotification(input: InitiatorNotificationInput): {
  subject: string
  html: string
} {
  const party = oneLine(input.partyName)
  const song = oneLine(input.songName)
  const subject =
    input.action === 'approved'
      ? `${party} approved the split for "${song}"`
      : `${party} proposed a counter-split for "${song}"`

  const partyHtml = esc(input.partyName)
  const href = esc(`${input.appUrl}/split-sheets`)
  const html =
    input.action === 'approved'
      ? `<h2>${partyHtml} approved the split</h2><p>All parties approving will flip the sheet to Approved. <a href="${href}">View in Funūn →</a></p>`
      : `<h2>${partyHtml} proposed a counter-split</h2><p>They proposed ${esc(String(input.counterSplit))}% for their share. Review and re-send. <a href="${href}">Open split sheet →</a></p>`

  return { subject, html }
}
