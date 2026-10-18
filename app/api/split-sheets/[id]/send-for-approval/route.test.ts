const mockCheckRateLimit = jest.fn()
const mockFrom = jest.fn()
const mockServiceFrom = jest.fn()
const mockSendEmail = jest.fn()
const mockGetUser = jest.fn()

jest.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}))
jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
  createServiceClient: jest.fn(() => ({ from: mockServiceFrom })),
}))
jest.mock('@/lib/email', () => ({ sendEmail: (...args: unknown[]) => mockSendEmail(...args) }))

import { POST } from './route'

const ctx = { params: Promise.resolve({ id: 'sheet-1' }) }

beforeEach(() => {
  jest.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
})

describe('POST /api/split-sheets/[id]/send-for-approval sender limit', () => {
  it('returns 429 before any lookup, token or email when the sender is over the limit', async () => {
    mockCheckRateLimit.mockResolvedValue(true)

    const res = await POST(new Request('http://test.local', { method: 'POST' }), ctx)

    expect(res.status).toBe(429)
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      'split-approval-send:user-1',
      expect.objectContaining({ maxAttempts: 20, failClosed: true })
    )
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockServiceFrom).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('does not consume the limit for an unauthenticated caller', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await POST(new Request('http://test.local', { method: 'POST' }), ctx)

    expect(res.status).toBe(401)
    expect(mockCheckRateLimit).not.toHaveBeenCalled()
  })
})
