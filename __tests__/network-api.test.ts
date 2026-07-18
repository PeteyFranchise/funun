import { GET } from '@/app/api/network/route'
import { POST as blockPOST, DELETE as blockDELETE } from '@/app/api/network/blocks/route'
import { createApiClient } from '@/lib/supabase/server'
import { loadNetworkData } from '@/lib/network/query'

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/network/query', () => ({
  loadNetworkData: jest.fn(),
}))

function blockRequest(method: 'POST' | 'DELETE', body: unknown) {
  return new Request('http://test.local/api/network/blocks', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/network', () => {
  it('requires an authenticated session', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: null } })) },
    })

    const res = await GET()
    expect(res.status).toBe(401)
    expect(loadNetworkData).not.toHaveBeenCalled()
  })

  it('loads viewer-scoped network data for an authenticated request', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'viewer-1' } } })) },
    })
    const payload = {
      connections: [],
      following: [],
      followers: [],
      pendingOutgoing: [],
      pendingIncoming: [],
      blocked: [],
    }
    ;(loadNetworkData as jest.Mock).mockResolvedValue(payload)

    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(payload)
    // Called with the viewer's own id only — nothing else could scope it.
    const call = (loadNetworkData as jest.Mock).mock.calls[0]
    expect(call[1]).toBe('viewer-1')
  })

  it('never returns a bidirectional block shape — response has no "blockedBy" style field', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'viewer-1' } } })) },
    })
    ;(loadNetworkData as jest.Mock).mockResolvedValue({
      connections: [],
      following: [],
      followers: [],
      pendingOutgoing: [],
      pendingIncoming: [],
      blocked: [{ blockedProfileId: 'x', createdAt: '2020-01-01T00:00:00Z', profile: { id: 'x' } }],
    })

    const res = await GET()
    const data = await res.json()
    expect(Object.keys(data)).not.toContain('blockedBy')
    expect(data.blocked[0]).not.toHaveProperty('blockerProfileId')
  })

  it('surfaces a 500 with a friendly message if the data layer throws', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'viewer-1' } } })) },
    })
    ;(loadNetworkData as jest.Mock).mockRejectedValue(new Error('boom'))

    const res = await GET()
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'boom' })
  })
})

describe('POST /api/network/blocks', () => {
  it('requires an authenticated session', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: null } })) },
    })

    const res = await blockPOST(blockRequest('POST', { blockedProfileId: 'target-1' }))
    expect(res.status).toBe(401)
  })

  it('rejects a missing blockedProfileId', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'viewer-1' } } })) },
    })

    const res = await blockPOST(blockRequest('POST', {}))
    expect(res.status).toBe(400)
  })

  it('rejects a self-block', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'viewer-1' } } })) },
    })

    const res = await blockPOST(blockRequest('POST', { blockedProfileId: 'viewer-1' }))
    expect(res.status).toBe(400)
  })

  it('inserts a block row scoped to the caller as blocker_id', async () => {
    const insert = jest.fn(async () => ({ error: null }))
    const from = jest.fn((table: string) => {
      if (table === 'blocks') return { insert }
      throw new Error(`Unexpected table: ${table}`)
    })
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'viewer-1' } } })) },
      from,
    })

    const res = await blockPOST(blockRequest('POST', { blockedProfileId: 'target-1' }))
    expect(res.status).toBe(200)
    expect(insert).toHaveBeenCalledWith({ blocker_id: 'viewer-1', blocked_id: 'target-1' })
  })

  it('treats a duplicate block (23505) as idempotent success', async () => {
    const insert = jest.fn(async () => ({ error: { code: '23505', message: 'duplicate key' } }))
    const from = jest.fn(() => ({ insert }))
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'viewer-1' } } })) },
      from,
    })

    const res = await blockPOST(blockRequest('POST', { blockedProfileId: 'target-1' }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ data: { ok: true, blocked: true } })
  })

  it('surfaces a non-duplicate insert error as a 500', async () => {
    const insert = jest.fn(async () => ({ error: { code: '42501', message: 'denied' } }))
    const from = jest.fn(() => ({ insert }))
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'viewer-1' } } })) },
      from,
    })

    const res = await blockPOST(blockRequest('POST', { blockedProfileId: 'target-1' }))
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/network/blocks', () => {
  it('deletes only the caller\'s own block row', async () => {
    const eq2 = jest.fn(async () => ({ error: null }))
    const eq1 = jest.fn(() => ({ eq: eq2 }))
    const del = jest.fn(() => ({ eq: eq1 }))
    const from = jest.fn((table: string) => {
      if (table === 'blocks') return { delete: del }
      throw new Error(`Unexpected table: ${table}`)
    })
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'viewer-1' } } })) },
      from,
    })

    const res = await blockDELETE(blockRequest('DELETE', { blockedProfileId: 'target-1' }))
    expect(res.status).toBe(200)
    expect(eq1).toHaveBeenCalledWith('blocker_id', 'viewer-1')
    expect(eq2).toHaveBeenCalledWith('blocked_id', 'target-1')
  })
})
