import { PATCH } from '@/app/api/profile/handle/route'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/security/rate-limit'

// ─── PATCH /api/profile/handle (36-03 Task 1) ──────────────────────────────
// Styled after __tests__/profile-privacy-api.test.ts: mocked client
// factories, a jsonRequest() helper, a fixed owner UUID. Every negative case
// proves the relevant mock was NOT called — 401/malformed-format never touch
// the service client; every non-success case never inserts into
// handle_history.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: jest.fn(),
}))

const OWNER_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function jsonRequest(body: unknown) {
  return new Request('http://t.local/api/profile/handle', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockAuthedUser() {
  ;(createApiClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: OWNER_UUID } } })) },
  })
}

function mockUnauthed() {
  ;(createApiClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn(async () => ({ data: { user: null } })) },
  })
}

function makeServiceClient(opts: {
  currentHandle?: string | null
  updateData?: { id: string; handle: string } | null
  updateError?: { code?: string; message: string } | null
  historyInsert?: jest.Mock
}) {
  const maybeSingle = jest.fn(async () => ({
    data: opts.currentHandle === undefined ? null : { handle: opts.currentHandle },
    error: null,
  }))
  const selectEq = jest.fn(() => ({ maybeSingle }))
  const select = jest.fn(() => ({ eq: selectEq }))

  const single = jest.fn(async () => ({
    data: opts.updateData ?? null,
    error: opts.updateError ?? null,
  }))
  const updateSelect = jest.fn(() => ({ single }))
  const updateEq = jest.fn(() => ({ select: updateSelect }))
  const update = jest.fn(() => ({ eq: updateEq }))

  const historyInsert = opts.historyInsert ?? jest.fn(async () => ({ data: null, error: null }))

  const from = jest.fn((table: string) => {
    if (table === 'user_profiles') return { select, update }
    if (table === 'handle_history') return { insert: historyInsert }
    throw new Error(`unexpected table: ${table}`)
  })

  return { from, update, historyInsert }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(checkRateLimit as jest.Mock).mockResolvedValue(false)
})

describe('PATCH /api/profile/handle', () => {
  it('requires authentication — 401, no database call', async () => {
    mockUnauthed()
    const res = await PATCH(jsonRequest({ handle: 'maya-reyes' }))
    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('rejects a malformed handle — 400 with the shared format message, no update attempted', async () => {
    mockAuthedUser()
    const res = await PATCH(jsonRequest({ handle: 'ab' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Handle must be 3-30 characters')
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('a casing-only change persists the new casing and writes no history row', async () => {
    mockAuthedUser()
    const service = makeServiceClient({
      currentHandle: 'maya-reyes',
      updateData: { id: OWNER_UUID, handle: 'Maya-Reyes' },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(jsonRequest({ handle: 'Maya-Reyes' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ handle: 'Maya-Reyes' })
    expect(service.update).toHaveBeenCalledWith({ handle: 'Maya-Reyes' })
    expect(service.historyInsert).not.toHaveBeenCalled()
  })

  it('a genuinely new handle updates and writes exactly one history row for the old handle', async () => {
    mockAuthedUser()
    const service = makeServiceClient({
      currentHandle: 'old-name',
      updateData: { id: OWNER_UUID, handle: 'new-name' },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(jsonRequest({ handle: 'new-name' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ handle: 'new-name' })
    expect(service.historyInsert).toHaveBeenCalledTimes(1)
    expect(service.historyInsert).toHaveBeenCalledWith({
      profile_id: OWNER_UUID,
      old_handle: 'old-name',
    })
  })

  it('no prior handle at all — 200, no history row (nothing to retire)', async () => {
    mockAuthedUser()
    const service = makeServiceClient({
      currentHandle: null,
      updateData: { id: OWNER_UUID, handle: 'first-handle' },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(jsonRequest({ handle: 'first-handle' }))
    expect(res.status).toBe(200)
    expect(service.historyInsert).not.toHaveBeenCalled()
  })

  it('unique-violation from the update — 409, no history row', async () => {
    mockAuthedUser()
    const service = makeServiceClient({
      currentHandle: 'old-name',
      updateError: { code: '23505', message: 'duplicate key value' },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(jsonRequest({ handle: 'taken-name' }))
    expect(res.status).toBe(409)
    expect(service.historyInsert).not.toHaveBeenCalled()
  })

  it("the guard's reserved/retired raise — 400, no history row", async () => {
    mockAuthedUser()
    const service = makeServiceClient({
      currentHandle: 'old-name',
      updateError: { message: 'handle is reserved' },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(jsonRequest({ handle: 'admin' }))
    expect(res.status).toBe(400)
    expect(service.historyInsert).not.toHaveBeenCalled()
  })

  it('a rejecting history insert still returns 200 — the handle change is not rolled back', async () => {
    mockAuthedUser()
    const historyInsert = jest.fn(async () => {
      throw new Error('history insert failed')
    })
    const service = makeServiceClient({
      currentHandle: 'old-name',
      updateData: { id: OWNER_UUID, handle: 'new-name' },
      historyInsert,
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await PATCH(jsonRequest({ handle: 'new-name' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ handle: 'new-name' })
    expect(historyInsert).toHaveBeenCalledTimes(1)
  })

  it('exceeding the per-user rate limit — 429 before any database write', async () => {
    mockAuthedUser()
    ;(checkRateLimit as jest.Mock).mockResolvedValue(true)

    const res = await PATCH(jsonRequest({ handle: 'new-name' }))
    expect(res.status).toBe(429)
    expect(createServiceClient).not.toHaveBeenCalled()
  })
})
