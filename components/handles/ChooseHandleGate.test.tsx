import { renderToStaticMarkup } from 'react-dom/server'
import { ChooseHandleGate } from './ChooseHandleGate'

// No jsdom in this repo (testEnvironment: 'node'), so the screen is asserted
// as static markup — the same treatment as components/vault/SharedProjectBadge.
// The decision logic is not tested here; it lives in lib/handles/gate.ts and
// lib/handles/availability.ts, both of which have their own suites.

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}))

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: jest.fn() } }),
}))

describe('ChooseHandleGate', () => {
  const markup = renderToStaticMarkup(<ChooseHandleGate userId="u1" />)

  it('asks for a handle and shows the public URL shape it produces', () => {
    expect(markup).toContain('Choose your handle')
    expect(markup).toContain('funun.io/u/your-handle')
    expect(markup).toContain('You can change it later')
  })

  // D-09: no skip, no dismiss, no close, no "later" affordance. This is the
  // whole point of the hard gate — a way past it without a handle is the one
  // thing that would stop the handle-less backlog draining, which is what
  // plan 07's NOT NULL constraint depends on.
  it('offers no skip, dismiss, close or "later" affordance', () => {
    const text = markup.toLowerCase()
    expect(text).not.toContain('skip')
    expect(text).not.toContain('not now')
    expect(text).not.toContain('dismiss')
    expect(text).not.toContain('maybe later')
    expect(text).not.toContain('remind me')
  })

  it('offers a sign-out exit — unskippable is the requirement, inescapable is not', () => {
    expect(markup).toContain('Sign out')
  })
})
