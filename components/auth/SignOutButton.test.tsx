import { renderToStaticMarkup } from 'react-dom/server'
import { SignOutButton } from './SignOutButton'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: jest.fn() } }),
}))

describe('SignOutButton', () => {
  it('renders the full member-navigation treatment with a visible label', () => {
    const markup = renderToStaticMarkup(<SignOutButton appearance="nav" />)

    expect(markup).toContain('aria-label="Sign out"')
    expect(markup).toContain('Sign out</span>')
    expect(markup).toContain('<svg')
    expect(markup).toContain('w-full')
  })

  it('keeps the collapsed navigation action compact and accessible', () => {
    const markup = renderToStaticMarkup(<SignOutButton appearance="nav" collapsed />)

    expect(markup).toContain('title="Sign out"')
    expect(markup).toContain('aria-label="Sign out"')
    expect(markup).toContain('w-[42px]')
    expect(markup).not.toContain('Sign out</span>')
  })

  it('preserves the simple text appearance for non-navigation surfaces', () => {
    const markup = renderToStaticMarkup(<SignOutButton />)

    expect(markup).toContain('>Sign out</button>')
    expect(markup).not.toContain('<svg')
  })
})
