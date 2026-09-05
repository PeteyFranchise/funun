import { renderToStaticMarkup } from 'react-dom/server'
import { AccountContextSwitch } from '@/components/auth/AccountContextSwitch'

describe('AccountContextSwitch', () => {
  it('offers the Team workspace from a personal Member workspace', () => {
    const markup = renderToStaticMarkup(
      <AccountContextSwitch currentContext="personal" />
    )
    expect(markup).toContain('aria-label="Switch to Funūn Team"')
    expect(markup).toContain('Switch to Funūn Team')
  })

  it('offers the personal workspace from the Team Console', () => {
    const markup = renderToStaticMarkup(
      <AccountContextSwitch currentContext="team" appearance="team" />
    )
    expect(markup).toContain('aria-label="Switch to Personal workspace"')
    expect(markup).toContain('Switch to Personal workspace')
  })

  it('keeps a named control when the sidebar is collapsed', () => {
    const markup = renderToStaticMarkup(
      <AccountContextSwitch currentContext="team" appearance="team" collapsed />
    )
    expect(markup).toContain('title="Switch to Personal workspace"')
    expect(markup).toContain('aria-label="Switch to Personal workspace"')
  })
})
