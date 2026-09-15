import { createApiClient } from '@/lib/supabase/server'
import { resolveWorkAccess } from '@/lib/catalogue/access'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { GET, POST } from './route'
import { DELETE } from './[pinId]/route'

// ─── Route contract tests for the private pins collection + delete ────────
// Convention borrowed from app/api/collaborators/route.test.ts: mock the
// Supabase server module and the access decision, build a Request by hand,
// stand up chained spies for the query builder, assert both the status and
// whether a write spy was ever called.
//
// The cross-account invisibility guarantee (does another author's row ever
// come back) is NOT testable here — jest cannot impersonate two
// authenticated Postgres roles. This file covers the route's OWN contract
// (auth, access, strict schema, bounds, ceiling, view shape, neutral 404);
// plan 39-11 carries the RLS boundary smoke against a real database.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
}))

jest.mock('@/lib/catalogue/access', () => ({
  createWorkAccessDeps: jest.fn(() => ({})),
  resolveWorkAccess: jest.fn(),
}))

jest.mock('@/lib/security/rate-limit', () => ({
  ...jest.requireActual('@/lib/security/rate-limit'),
  checkRateLimit: jest.fn(),
}))

const WORK_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const VERSION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const PIN_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

function auth(user: { id: string } | null) {
  return { getUser: jest.fn(async () => ({ data: { user } })) }
}

function getRequest() {
  return new Request(`http://t.local/api/works/${WORK_ID}/versions/${VERSION_ID}/pins`)
}

function postRequest(body: unknown) {
  return new Request(`http://t.local/api/works/${WORK_ID}/versions/${VERSION_ID}/pins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deleteRequest() {
  return new Request(
    `http://t.local/api/works/${WORK_ID}/versions/${VERSION_ID}/pins/${PIN_ID}`,
    { method: 'DELETE' }
  )
}

function routeParams() {
  return { params: Promise.resolve({ workId: WORK_ID, versionId: VERSION_ID }) }
}

function pinRouteParams() {
  return { params: Promise.resolve({ workId: WORK_ID, versionId: VERSION_ID, pinId: PIN_ID }) }
}

function grantedAccess() {
  return { granted: true as const, tier: 'contribute' as const, isOwner: false }
}

function refusedAccess(status: 401 | 403 | 404, reason = 'Not allowed') {
  return { granted: false as const, status, reason }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(checkRateLimit as jest.Mock).mockResolvedValue(false)
})

// ─── GET ────────────────────────────────────────────────────────────────

describe('GET pins', () => {
  it('returns 401 with no authenticated user and never reaches the access gate', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue({ auth: auth(null), from: jest.fn() })

    const response = await GET(getRequest(), routeParams())

    expect(response.status).toBe(401)
    expect(resolveWorkAccess).not.toHaveBeenCalled()
  })

  it('returns the refusal status when resolveWorkAccess refuses, and never selects', async () => {
    const selectSpy = jest.fn()
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: auth({ id: USER_ID }),
      from: jest.fn(() => ({ select: selectSpy })),
    })
    ;(resolveWorkAccess as jest.Mock).mockResolvedValue(refusedAccess(404, 'Work not found.'))

    const response = await GET(getRequest(), routeParams())

    expect(response.status).toBe(404)
    expect(selectSpy).not.toHaveBeenCalled()
  })

  it('returns 200 with pins mapped to the camel-cased view, no raw row shape', async () => {
    const rows = [
      { id: PIN_ID, timestamp_ms: 15000, created_at: '2026-09-01T00:00:00.000Z', author_user_id: USER_ID },
    ]
    const limitSpy = jest.fn(async () => ({ data: rows, error: null }))
    const orderSpy = jest.fn(() => ({ limit: limitSpy }))
    const eqAuthorSpy = jest.fn(() => ({ order: orderSpy }))
    const eqVersionSpy = jest.fn(() => ({ eq: eqAuthorSpy }))
    const eqWorkSpy = jest.fn(() => ({ eq: eqVersionSpy }))
    const selectSpy = jest.fn(() => ({ eq: eqWorkSpy }))
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: auth({ id: USER_ID }),
      from: jest.fn(() => ({ select: selectSpy })),
    })
    ;(resolveWorkAccess as jest.Mock).mockResolvedValue(grantedAccess())

    const response = await GET(getRequest(), routeParams())
    const raw = await response.text()

    expect(response.status).toBe(200)
    expect(raw).toContain('timestampMs')
    expect(raw).not.toContain('timestamp_ms')
    expect(raw).not.toContain('author_user_id')
    expect(JSON.parse(raw)).toEqual({
      data: [{ id: PIN_ID, timestampMs: 15000, createdAt: '2026-09-01T00:00:00.000Z' }],
    })
  })
})

// ─── POST ───────────────────────────────────────────────────────────────

function countChain(count: number) {
  const eqAuthorSpy = jest.fn(async () => ({ count, error: null }))
  const eqVersionSpy = jest.fn(() => ({ eq: eqAuthorSpy }))
  const selectSpy = jest.fn(() => ({ eq: eqVersionSpy }))
  return { selectSpy, eqVersionSpy, eqAuthorSpy }
}

describe('POST pins', () => {
  it('rejects a body with an extra key and never inserts (strict schema)', async () => {
    const insertSpy = jest.fn()
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: auth({ id: USER_ID }),
      from: jest.fn(() => ({ insert: insertSpy })),
    })
    ;(resolveWorkAccess as jest.Mock).mockResolvedValue(grantedAccess())

    const response = await POST(postRequest({ timestampMs: 1000, body: 'nope' }), routeParams())

    expect(response.status).toBe(400)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('rejects a negative timestampMs and never inserts', async () => {
    const insertSpy = jest.fn()
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: auth({ id: USER_ID }),
      from: jest.fn(() => ({ insert: insertSpy })),
    })
    ;(resolveWorkAccess as jest.Mock).mockResolvedValue(grantedAccess())

    const response = await POST(postRequest({ timestampMs: -1 }), routeParams())

    expect(response.status).toBe(400)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('rejects a timestampMs above 86400000 and never inserts', async () => {
    const insertSpy = jest.fn()
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: auth({ id: USER_ID }),
      from: jest.fn(() => ({ insert: insertSpy })),
    })
    ;(resolveWorkAccess as jest.Mock).mockResolvedValue(grantedAccess())

    const response = await POST(postRequest({ timestampMs: 86400001 }), routeParams())

    expect(response.status).toBe(400)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it('inserts with the authenticated caller as author and returns 201 when granted and within the ceiling', async () => {
    const inserted = { id: PIN_ID, timestamp_ms: 5000, created_at: '2026-09-01T00:00:00.000Z' }
    const { selectSpy: countSelectSpy } = countChain(0)
    const singleSpy = jest.fn(async () => ({ data: inserted, error: null }))
    const insertSelectSpy = jest.fn(() => ({ single: singleSpy }))
    const insertSpy = jest.fn(() => ({ select: insertSelectSpy }))
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: auth({ id: USER_ID }),
      from: jest.fn(() => ({ select: countSelectSpy, insert: insertSpy })),
    })
    ;(resolveWorkAccess as jest.Mock).mockResolvedValue(grantedAccess())

    const response = await POST(postRequest({ timestampMs: 5000 }), routeParams())

    expect(response.status).toBe(201)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        work_id: WORK_ID,
        version_id: VERSION_ID,
        author_user_id: USER_ID,
        timestamp_ms: 5000,
      })
    )
  })

  it('returns 409 and never inserts once the caller holds MAX_PINS_PER_VERSION pins', async () => {
    const { selectSpy: countSelectSpy } = countChain(100)
    const insertSpy = jest.fn()
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: auth({ id: USER_ID }),
      from: jest.fn(() => ({ select: countSelectSpy, insert: insertSpy })),
    })
    ;(resolveWorkAccess as jest.Mock).mockResolvedValue(grantedAccess())

    const response = await POST(postRequest({ timestampMs: 5000 }), routeParams())

    expect(response.status).toBe(409)
    expect(insertSpy).not.toHaveBeenCalled()
  })
})

// ─── DELETE ───────────────────────────────────────────────────────────────

describe('DELETE a pin', () => {
  it('returns 404 with a neutral message when no row matches, never implying it belongs to someone else', async () => {
    const deleteSelectSpy = jest.fn(async () => ({ data: [], error: null }))
    const eqVersionSpy = jest.fn(() => ({ select: deleteSelectSpy }))
    const eqIdSpy = jest.fn(() => ({ eq: eqVersionSpy }))
    const deleteSpy = jest.fn(() => ({ eq: eqIdSpy }))
    ;(createApiClient as jest.Mock).mockResolvedValue({
      auth: auth({ id: USER_ID }),
      from: jest.fn(() => ({ delete: deleteSpy })),
    })
    ;(resolveWorkAccess as jest.Mock).mockResolvedValue(grantedAccess())

    const response = await DELETE(deleteRequest(), pinRouteParams())
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(JSON.stringify(body).toLowerCase()).not.toMatch(/belongs to|someone else|not yours/)
  })
})
