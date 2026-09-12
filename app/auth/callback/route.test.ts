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

beforeEach(() => {
  jest.clearAllMocks()
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
      auth: { exchangeCodeForSession },
    })

    const response = await GET(new Request('https://funun.test/auth/callback?code=confirmed'))

    expect(completeSignupClaim).toHaveBeenCalledWith({}, 'user-1')
    expect(response.headers.get('location')).toBe('https://funun.test/vault')
  })

  it('does not run invitation claiming during password recovery', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: {
        exchangeCodeForSession: jest.fn().mockResolvedValue({ data: { user }, error: null }),
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
      },
    })
    ;(completeSignupClaim as jest.Mock).mockResolvedValue({ ok: false, error: 'claim_failed' })

    const response = await GET(new Request('https://funun.test/auth/callback?code=confirmed'))

    expect(response.headers.get('location')).toBe(
      'https://funun.test/signin?error=invite-claim'
    )
  })
})
