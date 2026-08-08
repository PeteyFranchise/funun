import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { POST } from './route'

// ─── POST /api/sync-library/submit (26-03 Task 1) ──────────────────────
// Colocated route test, mirroring app/api/admin/buyer-orgs/[id]/route.test.ts's
// mock-client conventions. Covers: 401 unauthenticated, 404 non-owned
// project, 400 on a foreign trackId / an empty or oversized batch, 200
// success with a fixed allowlisted insert (no body spread, entry_source
// resolved server-side), and the skip-not-error behavior for a track that
// already has an active listing.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const USER_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const PROJECT_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const TRACK_UUID_1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const TRACK_UUID_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const FOREIGN_TRACK_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

function jsonRequest(body: unknown) {
  return new Request('http://t.local/api/sync-library/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

type QueryResult = { data: unknown; error: unknown }

/** A minimal chainable Supabase query-builder stand-in: every chain method
 * returns itself, and awaiting the builder directly (no terminal call)
 * resolves to `result` — covers both the `.maybeSingle()` single-row shape
 * and the plain-array `await builder` shape this route uses. */
function makeQuery(result: QueryResult = { data: null, error: null }) {
  const builder: {
    eq: jest.Mock
    in: jest.Mock
    select: jest.Mock
    maybeSingle: jest.Mock
    then: (resolve: (v: QueryResult) => void) => void
  } = {
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    select: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => result),
    then: resolve => resolve(result),
  }
  return builder
}

function mockApiClient(
  options: {
    user?: { id: string } | null
    projectRow?: { id: string } | null
    trackRows?: { id: string }[]
  } = {}
) {
  const {
    user = { id: USER_UUID },
    projectRow = { id: PROJECT_UUID },
    trackRows = [{ id: TRACK_UUID_1 }, { id: TRACK_UUID_2 }],
  } = options
  const from = jest.fn((table: string) => {
    if (table === 'vault_projects') return makeQuery({ data: projectRow, error: null })
    if (table === 'tracks') return makeQuery({ data: trackRows, error: null })
    throw new Error(`unexpected apiClient table: ${table}`)
  })
  return { auth: { getUser: jest.fn(async () => ({ data: { user } })) }, from }
}

function mockServiceClient(
  options: {
    grant?: { status: string; source: string } | null
    signedAgreement?: { id: string } | null
    existingActive?: { track_id: string }[]
    insertResult?: QueryResult
  } = {}
) {
  const { grant = null, signedAgreement = null, existingActive = [], insertResult = { data: [], error: null } } =
    options
  const insertSpy = jest.fn(() => makeQuery(insertResult))
  const syncListingsSelectSpy = jest.fn(() => makeQuery({ data: existingActive, error: null }))
  const from = jest.fn((table: string) => {
    if (table === 'capability_grants') return makeQuery({ data: grant, error: null })
    if (table === 'vault_documents') return makeQuery({ data: signedAgreement, error: null })
    if (table === 'sync_listings') return { select: syncListingsSelectSpy, insert: insertSpy }
    throw new Error(`unexpected service table: ${table}`)
  })
  return { from, insertSpy, syncListingsSelectSpy }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/sync-library/submit', () => {
  it('returns 401 when unauthenticated', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient({ user: null }))
    ;(createServiceClient as jest.Mock).mockReturnValue(mockServiceClient())

    const res = await POST(jsonRequest({ projectId: PROJECT_UUID, trackIds: [TRACK_UUID_1] }))

    expect(res.status).toBe(401)
  })

  it('returns 400 when trackIds is empty', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient())
    ;(createServiceClient as jest.Mock).mockReturnValue(mockServiceClient())

    const res = await POST(jsonRequest({ projectId: PROJECT_UUID, trackIds: [] }))

    expect(res.status).toBe(400)
  })

  it('returns 400 when trackIds exceeds the batch cap', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient())
    ;(createServiceClient as jest.Mock).mockReturnValue(mockServiceClient())
    const oversized = Array.from({ length: 51 }, (_, i) => `track-${i}`)

    const res = await POST(jsonRequest({ projectId: PROJECT_UUID, trackIds: oversized }))

    expect(res.status).toBe(400)
  })

  it('returns 404 when the project is not owned by the session user', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient({ projectRow: null }))
    const service = mockServiceClient()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ projectId: PROJECT_UUID, trackIds: [TRACK_UUID_1] }))

    expect(res.status).toBe(404)
    expect(service.insertSpy).not.toHaveBeenCalled()
  })

  it('returns 400 when a trackId does not belong to the owned project', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient())
    const service = mockServiceClient()
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest({ projectId: PROJECT_UUID, trackIds: [TRACK_UUID_1, FOREIGN_TRACK_UUID] })
    )

    expect(res.status).toBe(400)
    expect(service.insertSpy).not.toHaveBeenCalled()
  })

  it('inserts a self_applied listing per new track with a fixed allowlisted column set', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient())
    const service = mockServiceClient({
      insertResult: {
        data: [
          { id: 'listing-1', track_id: TRACK_UUID_1 },
          { id: 'listing-2', track_id: TRACK_UUID_2 },
        ],
        error: null,
      },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest({ projectId: PROJECT_UUID, trackIds: [TRACK_UUID_1, TRACK_UUID_2] })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.created).toEqual(['listing-1', 'listing-2'])
    expect(body.data.skipped).toEqual([])
    expect(service.insertSpy).toHaveBeenCalledWith([
      {
        vault_project_id: PROJECT_UUID,
        track_id: TRACK_UUID_1,
        artist_user_id: USER_UUID,
        entry_source: 'self_applied',
        status: 'applied',
      },
      {
        vault_project_id: PROJECT_UUID,
        track_id: TRACK_UUID_2,
        artist_user_id: USER_UUID,
        entry_source: 'self_applied',
        status: 'applied',
      },
    ])
  })

  it('uses entry_source admin_invited and skips straight to pending_admit when already signed', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(
      mockApiClient({ trackRows: [{ id: TRACK_UUID_1 }] })
    )
    const service = mockServiceClient({
      grant: { status: 'approved', source: 'admin_invited' },
      signedAgreement: { id: 'doc-1' },
      insertResult: { data: [{ id: 'listing-1', track_id: TRACK_UUID_1 }], error: null },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ projectId: PROJECT_UUID, trackIds: [TRACK_UUID_1] }))

    expect(res.status).toBe(200)
    expect(service.insertSpy).toHaveBeenCalledWith([
      {
        vault_project_id: PROJECT_UUID,
        track_id: TRACK_UUID_1,
        artist_user_id: USER_UUID,
        entry_source: 'admin_invited',
        status: 'pending_admit',
      },
    ])
  })

  it('skips a track that already has an active listing instead of erroring', async () => {
    ;(createApiClient as jest.Mock).mockResolvedValue(mockApiClient())
    const service = mockServiceClient({
      existingActive: [{ track_id: TRACK_UUID_1 }],
      insertResult: { data: [{ id: 'listing-2', track_id: TRACK_UUID_2 }], error: null },
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(
      jsonRequest({ projectId: PROJECT_UUID, trackIds: [TRACK_UUID_1, TRACK_UUID_2] })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.created).toEqual(['listing-2'])
    expect(body.data.skipped).toEqual([TRACK_UUID_1])
    expect(service.insertSpy).toHaveBeenCalledWith([
      {
        vault_project_id: PROJECT_UUID,
        track_id: TRACK_UUID_2,
        artist_user_id: USER_UUID,
        entry_source: 'self_applied',
        status: 'applied',
      },
    ])
  })
})
