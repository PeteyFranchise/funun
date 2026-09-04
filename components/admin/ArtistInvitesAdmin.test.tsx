import { renderToStaticMarkup } from 'react-dom/server'
import { ArtistInvitesAdmin } from './ArtistInvitesAdmin'

describe('ArtistInvitesAdmin', () => {
  it('gives every Team Member a one-person artist invite form', () => {
    const markup = renderToStaticMarkup(
      <ArtistInvitesAdmin initialWaitlist={[]} isLeadership={false} />
    )

    expect(markup).toContain('Invite one artist')
    expect(markup).toContain('Artist name')
    expect(markup).toContain('type="email"')
    expect(markup).toContain('Send invite')
    expect(markup).not.toContain('Reopen &amp; notify waitlist')
  })

  it('keeps the direct invite form separate from the leadership-only broadcast', () => {
    const markup = renderToStaticMarkup(
      <ArtistInvitesAdmin initialWaitlist={[]} isLeadership />
    )

    expect(markup).toContain('Invite one artist')
    expect(markup).toContain('Reopen &amp; notify waitlist')
  })
})
