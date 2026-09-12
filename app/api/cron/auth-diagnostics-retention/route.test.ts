const mockRpc = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}))

import { GET } from './route'

function request(secret = 'test-secret') {
  return new Request('http://test.local/api/cron/auth-diagnostics-retention', {
    headers: { authorization: `Bearer ${secret}` },
  })
}

describe('GET /api/cron/auth-diagnostics-retention', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
  })

  it('fails closed before creating a database call', async () => {
    const response = await GET(request('wrong'))

    expect(response.status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('runs the service-only retention function', async () => {
    mockRpc.mockResolvedValue({ data: 17, error: null })

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, activated: true, deleted: 17 })
    expect(mockRpc).toHaveBeenCalledWith('prune_auth_diagnostic_events')
  })

  it('stays quiet when the human-gated migration is not active yet', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, activated: false, deleted: 0 })
  })

  it('returns a stable error without exposing provider details', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'sensitive database detail' },
    })

    const response = await GET(request())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Auth diagnostics retention failed' })
  })
})
