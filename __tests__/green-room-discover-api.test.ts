import { GET } from '@/app/api/green-room/discover/route'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { loadDiscoverResults } from '@/lib/green-room/discover'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(() => ({})),
}))

jest.mock('@/lib/green-room/discover', () => {
  const actual = jest.requireActual('@/lib/green-room/discover')
  return { ...actual, loadDiscoverResults: jest.fn() }
})

function request(url: string) {
  return new Request(url)
}

beforeEach(() => jest.clearAllMocks())

describe('GET /api/green-room/discover', () => {
  it('requires an authenticated session', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: null } })) },
    })
    const res = await GET(request('http://t.local/api/green-room/discover'))
    expect(res.status).toBe(401)
    expect(loadDiscoverResults).not.toHaveBeenCalled()
  })

  it('rejects a malformed cursor before querying', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'me' } } })) },
    })
    const res = await GET(request('http://t.local/api/green-room/discover?cursor=nope'))
    expect(res.status).toBe(400)
    expect(loadDiscoverResults).not.toHaveBeenCalled()
  })

  it('returns results for an authenticated request', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'me' } } })) },
    })
    ;(loadDiscoverResults as jest.Mock).mockResolvedValue({ results: [{ id: 'x' }], nextCursor: null })
    const res = await GET(request('http://t.local/api/green-room/discover?q=nova&role=producer'))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ results: [{ id: 'x' }], nextCursor: null })
    expect(createServiceClient).toHaveBeenCalled()
    const call = (loadDiscoverResults as jest.Mock).mock.calls[0]
    // filters arg carries the parsed q + role
    expect(call[3]).toMatchObject({ q: 'nova', role: 'producer' })
  })
})
