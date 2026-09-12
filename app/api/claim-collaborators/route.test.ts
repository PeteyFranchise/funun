import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { completeSignupClaim } from '@/lib/invites/completeSignupClaim'
import { POST } from './route'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/invites/completeSignupClaim', () => ({
  completeSignupClaim: jest.fn(),
}))

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServiceClient as jest.Mock).mockReturnValue({})
})

describe('POST /api/claim-collaborators', () => {
  it('rejects unauthenticated requests before creating a service client', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const response = await POST(new Request('https://funun.test/api/claim-collaborators', { method: 'POST' }))

    expect(response.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('passes only the authenticated user id to verified redemption', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    })
    ;(completeSignupClaim as jest.Mock).mockResolvedValue({ ok: true, completed: true })

    const response = await POST(new Request('https://funun.test/api/claim-collaborators', { method: 'POST' }))

    expect(response.status).toBe(200)
    expect(completeSignupClaim).toHaveBeenCalledWith({}, 'user-1', undefined)
  })

  it('returns 409 when the database refuses an unverified or tokenless claim', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    })
    ;(completeSignupClaim as jest.Mock).mockResolvedValue({ ok: true, completed: false })

    const response = await POST(new Request('https://funun.test/api/claim-collaborators', { method: 'POST' }))

    expect(response.status).toBe(409)
  })

  it('passes a well-formed explicit capability for an existing verified member', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    })
    ;(completeSignupClaim as jest.Mock).mockResolvedValue({ ok: true, completed: true })
    const inviteToken = 'a'.repeat(64)

    const response = await POST(
      new Request('https://funun.test/api/claim-collaborators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken }),
      })
    )

    expect(response.status).toBe(200)
    expect(completeSignupClaim).toHaveBeenCalledWith({}, 'user-1', inviteToken)
  })
})
