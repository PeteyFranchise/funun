import { renderToStaticMarkup } from 'react-dom/server'
import { SharedProjectBadge } from './SharedProjectBadge'

describe('SharedProjectBadge', () => {
  it('renders "Shared · {ownerName}\'s project" and "You\'re a {roleLabel}"', () => {
    const markup = renderToStaticMarkup(
      <SharedProjectBadge ownerName="Maya Reyes" role="viewer" />
    )
    expect(markup).toContain('Shared · Maya Reyes&#x27;s project')
    expect(markup).toContain('You&#x27;re a viewer')
  })

  it('degrades to "Shared project" without throwing when ownerName is null', () => {
    expect(() => renderToStaticMarkup(<SharedProjectBadge ownerName={null} role="editor" />)).not.toThrow()
    const markup = renderToStaticMarkup(<SharedProjectBadge ownerName={null} role="editor" />)
    expect(markup).toContain('Shared project')
    expect(markup).not.toContain("'s project")
  })

  it('maps role to its label via PROJECT_ROLE_LABELS (e.g. co-owner → "co-owner")', () => {
    const markup = renderToStaticMarkup(
      <SharedProjectBadge ownerName="Jordan" role="co-owner" />
    )
    expect(markup).toContain('You&#x27;re a co-owner')
  })
})
