import { createServiceClient } from '@/lib/supabase/server'
import { GET, SUPABASE_CHECK_TIMEOUT_MS } from './route'

// ─── GET /api/health (32-03 Task 1) ────────────────────────────────────────
// Mirrors app/api/waitlist/route.test.ts's mock-the-client-factory style.
// Covers: healthy (select succeeds), degraded (select errors -> 503, never
// 500), timeout (select hangs past SUPABASE_CHECK_TIMEOUT_MS -> still
// resolves degraded within the bound, never hangs the test), secret-redaction
// (no Supabase URL / service-role key / error message / schema/table names
// leak into the body across all cases), and no-write (only select is ever
// invoked, never insert/update/delete/rpc).

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

const SENSITIVE_SUBSTRINGS = [
  'supabase.co',
  'SUPABASE_SERVICE_ROLE_KEY',
  'service_role',
  'eyJhbGciOi', // JWT header prefix, stand-in for a leaked key/token
  'artist_invites', // table name must not leak into the body
  'connection reset', // stand-in Supabase error message
  'at Object.<anonymous>', // stack-trace-shaped text
]

type SelectResult = { data: { id: string }[] | null; error: { message: string } | null }

function mockService(
  options: {
    selectResult?: SelectResult
    hang?: boolean
  } = {}
) {
  const { selectResult = { data: [{ id: 'row-1' }], error: null }, hang = false } = options

  const insertSpy = jest.fn()
  const updateSpy = jest.fn()
  const deleteSpy = jest.fn()
  const rpcSpy = jest.fn()

  const limitSpy = jest.fn(() => {
    if (hang) {
      // Never resolves on its own — only settles if the route races it
      // against its own AbortController timeout.
      return new Promise(() => {})
    }
    return Promise.resolve(selectResult)
  })

  const abortSignalSpy = jest.fn(() => ({ limit: limitSpy }))
  const selectSpy = jest.fn(() => ({ abortSignal: abortSignalSpy, limit: limitSpy }))

  const fromSpy = jest.fn(() => ({
    select: selectSpy,
    insert: insertSpy,
    update: updateSpy,
    delete: deleteSpy,
  }))

  return { from: fromSpy, rpc: rpcSpy, __spies: { selectSpy, limitSpy, insertSpy, updateSpy, deleteSpy, rpcSpy } }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/health', () => {
  it('returns healthy / 200 when the Supabase check succeeds', async () => {
    const service = mockService({ selectResult: { data: [{ id: 'row-1' }], error: null } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('healthy')
    expect(typeof body.checkedAt).toBe('string')
    expect(typeof body.durationMs).toBe('number')
  })

  it('returns degraded / 503 (never 500) when the Supabase check errors', async () => {
    const service = mockService({
      selectResult: { data: null, error: { message: 'connection reset' } },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET()

    expect(res.status).toBe(503)
    expect(res.status).not.toBe(500)
    const body = await res.json()
    expect(body.status).toBe('degraded')
  })

  it('resolves degraded within the timeout budget when the check hangs (never hangs the route)', async () => {
    const service = mockService({ hang: true })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const startedAt = Date.now()
    const res = await GET()
    const elapsedMs = Date.now() - startedAt

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('degraded')
    // Generous upper bound (2x budget) to absorb test-runner scheduling
    // jitter while still proving the route did not hang indefinitely.
    expect(elapsedMs).toBeLessThan(SUPABASE_CHECK_TIMEOUT_MS * 2)
  }, 10000)

  it.each([
    ['healthy', { data: [{ id: 'row-1' }], error: null }],
    ['degraded', { data: null, error: { message: 'connection reset' } }],
  ])('never leaks secrets/schema/exception text in the %s body', async (_label, selectResult) => {
    const service = mockService({ selectResult: selectResult as SelectResult })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET()
    const raw = JSON.stringify(await res.json())

    for (const needle of SENSITIVE_SUBSTRINGS) {
      expect(raw).not.toContain(needle)
    }
    // Only the documented minimal fields are present.
    const parsed = JSON.parse(raw)
    expect(Object.keys(parsed).sort()).toEqual(['checkedAt', 'durationMs', 'status'])
  })

  it('issues exactly one read-only select per request and never writes', async () => {
    const service = mockService({ selectResult: { data: [{ id: 'row-1' }], error: null } })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await GET()

    expect(service.__spies.selectSpy).toHaveBeenCalledTimes(1)
    expect(service.__spies.limitSpy).toHaveBeenCalledTimes(1)
    expect(service.__spies.insertSpy).not.toHaveBeenCalled()
    expect(service.__spies.updateSpy).not.toHaveBeenCalled()
    expect(service.__spies.deleteSpy).not.toHaveBeenCalled()
    expect(service.__spies.rpcSpy).not.toHaveBeenCalled()
  })
})
