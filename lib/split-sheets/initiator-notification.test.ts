import { buildInitiatorNotification } from './initiator-notification'

const base = {
  songName: 'Ocean Drive',
  counterSplit: null,
  appUrl: 'https://funun.studio',
} as const

describe('buildInitiatorNotification', () => {
  it('escapes the party name in the approved email HTML', () => {
    const { html } = buildInitiatorNotification({
      ...base,
      action: 'approved',
      partyName: '<a href="https://evil.example">Log in</a> & "Co"',
    })
    expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;Log in&lt;/a&gt; &amp; &quot;Co&quot;')
    expect(html).not.toContain('<a href="https://evil.example">')
  })

  it('escapes the party name and the split in the counter email HTML', () => {
    const { html } = buildInitiatorNotification({
      ...base,
      action: 'countered',
      counterSplit: 25,
      partyName: '<b>Jane</b>',
    })
    expect(html).toContain('&lt;b&gt;Jane&lt;/b&gt; proposed a counter-split')
    expect(html).toContain('They proposed 25% for their share')
  })

  it('escapes the link href', () => {
    const { html } = buildInitiatorNotification({
      ...base,
      action: 'approved',
      partyName: 'Jane',
      appUrl: 'https://x.test/?a=1&b="2"',
    })
    expect(html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;/split-sheets"')
  })

  it('keeps the subject on one line without HTML-escaping it', () => {
    const { subject } = buildInitiatorNotification({
      ...base,
      action: 'approved',
      partyName: 'Jane\r\nBcc: x@example.com',
      songName: 'A & B',
    })
    expect(subject).not.toMatch(/[\r\n]/)
    expect(subject).toBe('Jane Bcc: x@example.com approved the split for "A & B"')
  })
})
