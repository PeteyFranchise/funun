import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { completeSignupClaim } from '@/lib/invites/completeSignupClaim'
import { GET } from './route'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/invites/completeSignupClaim', () => ({
  completeSignupClaim: jest.fn(),
}))

jest.mock('@/lib/auth/postSignInPath', () => ({
  postSignInPath: jest.fn(() => '/vault'),
}))

const user = { id: 'user-1', app_metadata: {}, email: 'member@example.test' }
const signOut = jest.fn().mockResolvedValue({ error: null })

beforeEach(() => {
  jest.clearAllMocks()
  signOut.mockResolvedValue({ error: null })
  ;(createServiceClient as jest.Mock).mockReturnValue({})
  ;(completeSignupClaim as jest.Mock).mockResolvedValue({ ok: true, completed: true })
})
describe('GET /auth/callback verified invitation claim', () => {
  it('completes the verified claim after exchanging a signup confirmation code', async () => {
    const exchangeCodeForSession = jest.fn().mockResolvedValue({
      data: { user },
      error: null,
    })
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { exchangeCodeForSession, signOut },
    })

    const response = await GET(new Request('https://funun.test/auth/callback?code=confirmed'))

    expect(completeSignupClaim).toHaveBeenCalledWith({}, 'user-1')
    expect(response.headers.get('location')).toBe('https://funun.test/vault')
  })

  it('does not run invitation claiming during password recovery', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: {
        exchangeCodeForSession: jest.fn().mockResolvedValue({ data: { user }, error: null }),
        signOut,
      },
    })

    await GET(
      new Request('https://funun.test/auth/callback?code=recovery&next=/update-password')
    )

    expect(completeSignupClaim).not.toHaveBeenCalled()
  })

  it('fails closed when verified invitation redemption errors', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: {
        exchangeCodeForSession: jest.fn().mockResolvedValue({ data: { user }, error: null }),
        signOut,
      },
    })
    ;(completeSignupClaim as jest.Mock).mockResolvedValue({ ok: false, error: 'claim_failed' })

    const response = await GET(new Request('https://funun.test/auth/callback?code=confirmed'))

    expect(response.headers.get('location')).toMatch(
      /^https:\/\/funun\.test\/signin\?error=invite-claim&ref=AUTH-[A-F0-9]{12}$/
    )
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('clears a partial session when exchange succeeds without a user', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: {
        exchangeCodeForSession: jest.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
        signOut,
      },
    })

    const response = await GET(new Request('https://funun.test/auth/callback?code=partial'))

    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(response.headers.get('location')).toMatch(
      /^https:\/\/funun\.test\/signin\?error=auth&ref=AUTH-[A-F0-9]{12}$/
    )
  })

  it('returns a stable recovery route when the provider throws', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: {
        exchangeCodeForSession: jest.fn().mockRejectedValue(new Error('provider trace')),
        signOut,
      },
    })

    const response = await GET(
      new Request('https://funun.test/auth/callback?code=bad&next=/update-password')
    )

    expect(response.headers.get('location')).toMatch(
      /^https:\/\/funun\.test\/forgot-password\?error=recovery&ref=AUTH-[A-F0-9]{12}$/
    )
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('does not initialize auth for a callback with no code', async () => {
    const response = await GET(new Request('https://funun.test/auth/callback'))

    expect(createApiClient).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toMatch(
      /^https:\/\/funun\.test\/signin\?error=auth&ref=AUTH-[A-F0-9]{12}$/
    )
  })

  it('returns a stable failure when the callback client cannot initialize', async () => {
    ;(createApiClient as jest.Mock).mockRejectedValue(new Error('cookie infrastructure'))

    const response = await GET(new Request('https://funun.test/auth/callback?code=valid'))

    expect(response.headers.get('location')).toMatch(
      /^https:\/\/funun\.test\/signin\?error=auth&ref=AUTH-[A-F0-9]{12}$/
    )
    expect(completeSignupClaim).not.toHaveBeenCalled()
  })
})
