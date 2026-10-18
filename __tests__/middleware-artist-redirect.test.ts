/** @jest-environment node */
// Runs the real middleware for an anonymous visitor and checks the sign-in
// redirect for artist routes, plus the public carve-outs.
const mockGetUser = jest.fn()
jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: () => mockGetUser() } }),
}))

import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

function visit(path: string) {
  return middleware(new NextRequest(new URL(path, 'https://funun.studio')))
}

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
})

beforeEach(() => {
  mockGetUser.mockResolvedValue({ data: { user: null } })
})

describe('middleware sign-in redirect for anonymous visitors', () => {
  it.each(['/earnings', '/contracts', '/green-room', '/messages', '/tools/pitchplug', '/curators'])(
    'sends %s to /signin with next set',
    async (path) => {
      const res = await visit(path)
      expect([302, 303, 307, 308]).toContain(res.status)
      const location = new URL(res.headers.get('location') ?? '')
      expect(location.pathname).toBe('/signin')
      expect(location.searchParams.get('next')).toBe(path)
    }
  )

  it('keeps the query string in next', async () => {
    const res = await visit('/green-room?view=notes')
    const location = new URL(res.headers.get('location') ?? '')
    expect(location.searchParams.get('next')).toBe('/green-room?view=notes')
  })

  it.each(['/ideas/join/' + 'a'.repeat(64), '/curators/claim/' + 'a'.repeat(64)])(
    'lets %s through without a redirect',
    async (path) => {
      const res = await visit(path)
      const location = res.headers.get('location')
      expect(location === null || new URL(location).pathname !== '/signin').toBe(true)
    }
  )
})
