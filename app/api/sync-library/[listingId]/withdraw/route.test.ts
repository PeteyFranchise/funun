import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { POST } from './route'

// ─── POST /api/sync-library/[listingId]/withdraw (26-03 Task 2) ────────
// Colocated route test, mirroring app/api/admin/buyer-orgs/[id]/route.test.ts's
// mock-client conventions. Covers: 401 unauthenticated, 404 for an absent
// OR non-owned listing (no existence leak — T-26-09), 409 for an
// already-terminal listing (double-decide guard), and the success path
// flipping an owned active listing to withdrawn with withdrawn_at set.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const USER_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OTHER_USER_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const LISTING_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function postRequest() {
  return new Request(`http://t.local/api/sync-library/${LISTING_UUID}/withdraw`, { method: 'POST' })
}

function callRoute() {
  return POST(postRequest(), { params: Promise.resolve({ listingId: LISTING_UUID }) })
}

function mockApiClient(user: { id: string } | null = { id: USER_UUID }) {
  return { auth: { getUser: jest.fn(async () => ({ data: { user } })) } }
}

function mockServiceClient(
  options: {
    listingRow?: { id: string; status: string; artist_user_id: string } | null
    updateError?: { message: string } | null
  } = {}
) {
  const { listingRow = null, updateError = null } = options
  const selectSpy = jest.fn(() => ({
    eq: jest.fn(() => ({
      maybeSingle: jest.fn(async () => ({ data: listingRow, error: null })),
    })),
  }))
  const updateSpy = jest.fn((update: Record<string, unknown>) => ({
    eq: jest.fn(async () => ({ data: updateError ? null : { id: LISTING_UUID, ...update }, error: updateError })),
  }))
  const from = jest.fn((table: string) => {
    if (table === 'sync_listings') return { select: selectSpy, update: updateSpy }
    throw new Error(`unexpected service table: ${table}`)
  })
  return { from, selectSpy, updateSpy }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/sync-library/[listingId]/withdraw', () => {
  it('returns 401 when unauthenticated', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient(null))
    ;(createServiceClient as jest.Mock).mockReturnValue(mockServiceClient())

    const res = await callRoute()

    expect(res.status).toBe(401)
  })

  it('returns 404 for an absent listing', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient())
    const service = mockServiceClient({ listingRow: null })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await callRoute()

    expect(res.status).toBe(404)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('returns 404 (not 403) for a listing owned by another artist', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient())
    const service = mockServiceClient({
      listingRow: { id: LISTING_UUID, status: 'admitted', artist_user_id: OTHER_USER_UUID },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await callRoute()

    expect(res.status).toBe(404)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('returns 409 for an already-terminal listing', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient())
    const service = mockServiceClient({
      listingRow: { id: LISTING_UUID, status: 'withdrawn', artist_user_id: USER_UUID },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await callRoute()

    expect(res.status).toBe(409)
    expect(service.updateSpy).not.toHaveBeenCalled()
  })

  it('flips an owned active listing to withdrawn and sets withdrawn_at', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient())
    const service = mockServiceClient({
      listingRow: { id: LISTING_UUID, status: 'admitted', artist_user_id: USER_UUID },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await callRoute()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ listingId: LISTING_UUID, status: 'withdrawn' })
    expect(service.updateSpy).toHaveBeenCalledTimes(1)
    const [update] = service.updateSpy.mock.calls[0]
    expect(update.status).toBe('withdrawn')
    expect(typeof update.withdrawn_at).toBe('string')
    expect(typeof update.updated_at).toBe('string')
  })
})
