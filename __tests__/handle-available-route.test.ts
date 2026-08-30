// GET /api/handles/available — public, unauthenticated, courtesy-only (D-14).
// Every assertion here is one behavior line from 36-04-PLAN.md's Task 1. The
// service client must never be constructed for a malformed input or a
// rate-limited request — that is checked explicitly below.

const mockCheckRateLimit = jest.fn()
jest.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
  getClientIp: () => '5.5.5.5',
}))

const mockCreateServiceClient = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: (...a: unknown[]) => mockCreateServiceClient(...a),
}))

import { GET } from '@/app/api/handles/available/route'

function req(handle?: string) {
  const url = new URL('http://localhost/api/handles/available')
  if (handle !== undefined) url.searchParams.set('handle', handle)
  return new Request(url)
}

type RpcResult = { data: unknown; error: { message: string } | null }
type ReservedResult = { data: unknown; error: { message: string } | null }

function serviceClient(rpcResult: RpcResult, reservedResult: ReservedResult) {
  const maybeSingle = jest.fn().mockResolvedValue(reservedResult)
  const eq = jest.fn().mockReturnValue({ maybeSingle })
  const select = jest.fn().mockReturnValue({ eq })
  const from = jest.fn().mockReturnValue({ select })
  const rpc = jest.fn().mockResolvedValue(rpcResult)
  return { rpc, from }
}

const NONE: RpcResult = { data: [], error: null }
const NOT_RESERVED: ReservedResult = { data: null, error: null }
const RESERVED: ReservedResult = { data: { handle: 'admin' }, error: null }
const LIVE_MATCH: RpcResult = {
  data: [{ profile_id: 'p1', current_handle: 'maya-reyes', redirected: false }],
  error: null,
}
const RETIRED_MATCH: RpcResult = {
  data: [{ profile_id: 'p1', current_handle: 'maya-reyes-2', redirected: true }],
  error: null,
}
const RPC_ERROR: RpcResult = { data: null, error: { message: 'boom' } }
const RESERVED_ERROR: ReservedResult = { data: null, error: { message: 'boom' } }

beforeEach(() => {
  jest.clearAllMocks()
  mockCheckRateLimit.mockResolvedValue(false)
})

describe('GET /api/handles/available', () => {
  it('returns invalid with no database call when the handle param is missing', async () => {
    const client = serviceClient(NONE, NOT_RESERVED)
    mockCreateServiceClient.mockReturnValue(client)

    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ available: false, reason: 'invalid' })
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('returns invalid with no database call when the handle param is empty', async () => {
    const res = await GET(req(''))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ available: false, reason: 'invalid' })
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('returns invalid with the shared format message for a malformed handle, no database call', async () => {
    const res = await GET(req('ab'))
    const body = (await res.json()) as { available: boolean; reason: string; message?: string }

    expect(res.status).toBe(200)
    expect(body.available).toBe(false)
    expect(body.reason).toBe('invalid')
    expect(typeof body.message).toBe('string')
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('reports unavailable for a handle that resolves to a live profile', async () => {
    const client = serviceClient(LIVE_MATCH, NOT_RESERVED)
    mockCreateServiceClient.mockReturnValue(client)

    const res = await GET(req('maya-reyes'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ available: false, reason: 'unavailable' })
  })

  it('reports unavailable for a handle that resolves only through the retired fallback', async () => {
    const client = serviceClient(RETIRED_MATCH, NOT_RESERVED)
    mockCreateServiceClient.mockReturnValue(client)

    const res = await GET(req('maya-reyes-2'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ available: false, reason: 'unavailable' })
  })

  it('reports unavailable for a handle present in the reserved list', async () => {
    const client = serviceClient(NONE, RESERVED)
    mockCreateServiceClient.mockReturnValue(client)

    const res = await GET(req('admin'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ available: false, reason: 'unavailable' })
  })

  it('reports available for a handle matching none of the three sources', async () => {
    const client = serviceClient(NONE, NOT_RESERVED)
    mockCreateServiceClient.mockReturnValue(client)

    const res = await GET(req('brand-new-name'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ available: true, reason: null })
  })

  it('reports unavailable regardless of the casing of a taken handle', async () => {
    const client = serviceClient(LIVE_MATCH, NOT_RESERVED)
    mockCreateServiceClient.mockReturnValue(client)

    const res = await GET(req('MAYA-REYES'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ available: false, reason: 'unavailable' })
  })

  it('returns 429 before any database call when over the per-IP rate limit', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(true)

    const res = await GET(req('maya-reyes'))

    expect(res.status).toBe(429)
    expect(mockCreateServiceClient).not.toHaveBeenCalled()
  })

  it('reports an unknown verdict (never a false one) on a database error resolving the handle', async () => {
    const client = serviceClient(RPC_ERROR, NOT_RESERVED)
    mockCreateServiceClient.mockReturnValue(client)

    const res = await GET(req('maya-reyes'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ available: null, reason: null })
  })

  it('reports an unknown verdict on a database error reading the reserved list', async () => {
    const client = serviceClient(NONE, RESERVED_ERROR)
    mockCreateServiceClient.mockReturnValue(client)

    const res = await GET(req('maya-reyes'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ available: null, reason: null })
  })

  it('uses its own handle-check rate-limit keyspace, never the invite pre-check ip: prefix', async () => {
    const client = serviceClient(NONE, NOT_RESERVED)
    mockCreateServiceClient.mockReturnValue(client)

    await GET(req('maya-reyes'))

    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1)
    const [key] = mockCheckRateLimit.mock.calls[0]
    expect(key).toBe('handle-check:ip:5.5.5.5')
  })
})
