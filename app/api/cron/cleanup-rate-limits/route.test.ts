const mockRpc = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}))

import { GET } from './route'

function request(secret = 'test-secret') {
  return new Request('http://test.local/api/cron/cleanup-rate-limits', {
    headers: { authorization: `Bearer ${secret}` },
  })
}

describe('GET /api/cron/cleanup-rate-limits', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
  })

  it('rejects unauthenticated cleanup requests before calling the database', async () => {
    const response = await GET(request('wrong'))

    expect(response.status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('deletes expired rows in bounded batches', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: 10_000, error: null })
      .mockResolvedValueOnce({ data: 42, error: null })

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, deleted: 10_042, batches: 2 })
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  it('returns 500 when cleanup persistence fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'database unavailable' } })

    const response = await GET(request())

    expect(response.status).toBe(500)
  })
})
