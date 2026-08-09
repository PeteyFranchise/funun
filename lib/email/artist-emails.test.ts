import { artistInviteEmail } from './artistInvite'
import { artistSpotOpenedEmail } from './artistSpotOpened'
import { artistReopenedEmail } from './artistReopened'

describe('artistInviteEmail (template A)', () => {
  it('has the founding-member subject contract', () => {
    const { subject } = artistInviteEmail({ actionLink: 'https://funun.studio/signup?invite=abc' })
    expect(subject).toBe("You're invited to Funūn")
  })

  it('returns non-empty subject, html, and text', () => {
    const email = artistInviteEmail({ actionLink: 'https://funun.studio/signup?invite=abc' })
    expect(email.subject.length).toBeGreaterThan(0)
    expect(email.html.length).toBeGreaterThan(0)
    expect(email.text.length).toBeGreaterThan(0)
  })

  it('includes the inviter name when provided', () => {
    const { html, text } = artistInviteEmail({
      inviterName: 'Jamie Rivera',
      actionLink: 'https://funun.studio/signup?invite=abc',
    })
    expect(html).toContain('Jamie Rivera')
    expect(text).toContain('Jamie Rivera')
  })

  it('omits the invited-by line cleanly when inviterName is absent', () => {
    const { html, text } = artistInviteEmail({ actionLink: 'https://funun.studio/signup?invite=abc' })
    expect(html).not.toContain('Invited by')
    expect(text).not.toContain('Invited by')
  })

  it('escapes HTML in an untrusted inviterName', () => {
    const { html } = artistInviteEmail({
      inviterName: '<script>alert("x")</script>',
      actionLink: 'https://funun.studio/signup?invite=abc',
    })
    expect(html).not.toContain('<script>alert("x")</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('uses the brand gradient CTA background', () => {
    const { html } = artistInviteEmail({ actionLink: 'https://funun.studio/signup?invite=abc' })
    expect(html).toContain('linear-gradient(105deg,#818CF8 0%,#D946EF 100%)')
  })

  it('does not contain an unsubscribe link (transactional, D-19)', () => {
    const { html, text } = artistInviteEmail({ actionLink: 'https://funun.studio/signup?invite=abc' })
    expect(html.toLowerCase()).not.toContain('unsubscribe')
    expect(text.toLowerCase()).not.toContain('unsubscribe')
  })
})

describe('artistSpotOpenedEmail (template B)', () => {
  it('has the waitlist-conversion subject contract', () => {
    const { subject } = artistSpotOpenedEmail({ actionLink: 'https://funun.studio/signup?invite=abc' })
    expect(subject).toBe('Your spot on Funūn just opened')
  })

  it('returns non-empty subject, html, and text', () => {
    const email = artistSpotOpenedEmail({ actionLink: 'https://funun.studio/signup?invite=abc' })
    expect(email.subject.length).toBeGreaterThan(0)
    expect(email.html.length).toBeGreaterThan(0)
    expect(email.text.length).toBeGreaterThan(0)
  })

  it('references the waiting list', () => {
    const { html, text } = artistSpotOpenedEmail({ actionLink: 'https://funun.studio/signup?invite=abc' })
    expect(html.toLowerCase()).toContain('waiting list')
    expect(text.toLowerCase()).toContain('waiting list')
  })

  it('uses the brand gradient CTA background', () => {
    const { html } = artistSpotOpenedEmail({ actionLink: 'https://funun.studio/signup?invite=abc' })
    expect(html).toContain('linear-gradient(105deg,#818CF8 0%,#D946EF 100%)')
  })

  it('does not contain an unsubscribe link (transactional, D-19)', () => {
    const { html, text } = artistSpotOpenedEmail({ actionLink: 'https://funun.studio/signup?invite=abc' })
    expect(html.toLowerCase()).not.toContain('unsubscribe')
    expect(text.toLowerCase()).not.toContain('unsubscribe')
  })
})

describe('artistReopenedEmail (template C)', () => {
  it('has the reopen-broadcast subject contract', () => {
    const { subject } = artistReopenedEmail({
      actionLink: 'https://funun.studio/signup?invite=abc',
      unsubscribeLink: 'https://funun.studio/unsubscribe?token=xyz',
    })
    expect(subject).toBe('Funūn has reopened invites')
  })

  it('returns non-empty subject, html, and text', () => {
    const email = artistReopenedEmail({
      actionLink: 'https://funun.studio/signup?invite=abc',
      unsubscribeLink: 'https://funun.studio/unsubscribe?token=xyz',
    })
    expect(email.subject.length).toBeGreaterThan(0)
    expect(email.html.length).toBeGreaterThan(0)
    expect(email.text.length).toBeGreaterThan(0)
  })

  it('includes the unsubscribe link in both html and text (D-19/CAN-SPAM)', () => {
    const { html, text } = artistReopenedEmail({
      actionLink: 'https://funun.studio/signup?invite=abc',
      unsubscribeLink: 'https://funun.studio/unsubscribe?token=xyz',
    })
    expect(html).toContain('https://funun.studio/unsubscribe?token=xyz')
    expect(html.toLowerCase()).toContain('unsubscribe')
    expect(text).toContain('https://funun.studio/unsubscribe?token=xyz')
    expect(text.toLowerCase()).toContain('unsubscribe')
  })

  it('uses the brand gradient CTA background', () => {
    const { html } = artistReopenedEmail({
      actionLink: 'https://funun.studio/signup?invite=abc',
      unsubscribeLink: 'https://funun.studio/unsubscribe?token=xyz',
    })
    expect(html).toContain('linear-gradient(105deg,#818CF8 0%,#D946EF 100%)')
  })

  it('escapes HTML in the unsubscribe link', () => {
    const { html } = artistReopenedEmail({
      actionLink: 'https://funun.studio/signup?invite=abc',
      unsubscribeLink: 'https://funun.studio/unsubscribe?token="><script>x</script>',
    })
    expect(html).not.toContain('"><script>x</script>')
  })
})
