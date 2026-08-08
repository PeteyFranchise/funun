import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { createNotification } from '@/lib/notifications'
import { POST } from './route'

// ─── POST /api/sync-library/admin/[listingId] — the single admit/reject ───
// curation gate. Mirrors app/api/sync-library/invite/route.test.ts's mock
// shape (requireStaff/logStaffAction/createNotification mocked;
// lib/social/notifications.ts's builders left UNMOCKED and exercised for
// real). Target is always DB-loaded by listingId, never the request body.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({
  requireStaff: jest.fn(),
}))

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(),
}))

const LEADERSHIP_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const BD_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ARTIST_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const LISTING_UUID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const TRACK_UUID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

function jsonRequest(body: unknown) {
  return new Request(`http://t.local/api/sync-library/admin/${LISTING_UUID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function params() {
  return { params: Promise.resolve({ listingId: LISTING_UUID }) }
}

type Resolution = { data?: unknown; error?: unknown }

function chain(resolution: Resolution) {
  const builder: Record<string, unknown> = {}
  builder.select = jest.fn(() => builder)
  builder.eq = jest.fn(() => builder)
  builder.in = jest.fn(() => builder)
  builder.update = jest.fn(() => builder)
  builder.maybeSingle = jest.fn(async () => resolution)
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(resolution).then(resolve, reject)
  return builder
}

function mockService(sequence: Record<string, Resolution[]>) {
  const builders: Record<string, ReturnType<typeof chain>[]> = {}
  const calls: Record<string, number> = {}
  const from = jest.fn((table: string) => {
    const idx = calls[table] ?? 0
    calls[table] = idx + 1
    const seq = sequence[table] ?? []
    const resolution = seq[idx] ?? seq[seq.length - 1] ?? { data: null, error: null }
    const builder = chain(resolution)
    builders[table] = builders[table] ?? []
    builders[table].push(builder)
    return builder
  })
  return { from, builders }
}

const PENDING_ADMIT_ROW = {
  id: LISTING_UUID,
  status: 'pending_admit',
  artist_user_id: ARTIST_UUID,
  track_id: TRACK_UUID,
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
  ;(createNotification as jest.Mock).mockResolvedValue({ ok: true })
})

describe('POST /api/sync-library/admin/[listingId]', () => {
  it('returns 401 for an unauthenticated caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const res = await POST(jsonRequest({ decision: 'admit' }), params())

    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 403 for staff outside leadership/ae', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await POST(jsonRequest({ decision: 'admit' }), params())

    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid decision value', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })

    const res = await POST(jsonRequest({ decision: 'approve' }), params())

    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 404 for an absent listing', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({ sync_listings: [{ data: null, error: null }] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ decision: 'admit' }), params())

    expect(res.status).toBe(404)
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('returns 409 admitting a listing that is not pending_admit', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({
      sync_listings: [{ data: { ...PENDING_ADMIT_ROW, status: 'applied' }, error: null }],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ decision: 'admit' }), params())

    expect(res.status).toBe(409)
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('returns 409 rejecting an already-terminal listing', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({
      sync_listings: [{ data: { ...PENDING_ADMIT_ROW, status: 'rejected' }, error: null }],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ decision: 'reject' }), params())

    expect(res.status).toBe(409)
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('admits a pending_admit listing, fires the highlight notification on the FIRST admission, and audits', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({
      sync_listings: [
        { data: PENDING_ADMIT_ROW, error: null }, // load
        { data: null, error: null }, // update
        { data: [{ id: LISTING_UUID }], error: null }, // admitted-count recheck — exactly 1
      ],
      tracks: [{ data: { title: 'Midnight Run' }, error: null }],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ decision: 'admit' }), params())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ listingId: LISTING_UUID, status: 'admitted' })

    const updateBuilder = service.builders.sync_listings[1]
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'admitted', decided_by: LEADERSHIP_UUID })
    )

    expect(createNotification).toHaveBeenCalledTimes(1)
    const [, payload] = (createNotification as jest.Mock).mock.calls[0]
    expect(payload.userId).toBe(ARTIST_UUID)
    expect(payload.type).toBe('sync_library_admitted')
    expect(payload.title).toBe("'Midnight Run' is now live in the Sync Library — manage your catalogue here")

    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: LEADERSHIP_UUID,
      action: 'sync_library.admit',
      targetType: 'sync_listing',
      targetId: LISTING_UUID,
      changes: { previousStatus: 'pending_admit' },
    })
  })

  it('admits a listing but skips the highlight notification when it is NOT the artist\'s first admission', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({
      sync_listings: [
        { data: PENDING_ADMIT_ROW, error: null },
        { data: null, error: null },
        { data: [{ id: 'other-listing' }, { id: LISTING_UUID }], error: null }, // count === 2
      ],
      tracks: [{ data: { title: 'Midnight Run' }, error: null }],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ decision: 'admit' }), params())

    expect(res.status).toBe(200)
    expect(createNotification).not.toHaveBeenCalled()
    expect(logStaffAction).toHaveBeenCalledTimes(1)
  })

  it('rejects a listing with an optional reason, surfaces it to the artist, and audits', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({
      sync_listings: [
        { data: { ...PENDING_ADMIT_ROW, status: 'applied' }, error: null },
        { data: null, error: null },
      ],
      tracks: [{ data: { title: 'Golden Hour' }, error: null }],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ decision: 'reject', reason: 'Master too quiet' }), params())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ listingId: LISTING_UUID, status: 'rejected' })

    const updateBuilder = service.builders.sync_listings[1]
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'rejected',
        rejection_reason: 'Master too quiet',
        decided_by: LEADERSHIP_UUID,
      })
    )

    const [, payload] = (createNotification as jest.Mock).mock.calls[0]
    expect(payload.type).toBe('sync_library_rejected')
    expect(payload.data).toMatchObject({ reason: 'Master too quiet' })

    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: LEADERSHIP_UUID,
      action: 'sync_library.reject',
      targetType: 'sync_listing',
      targetId: LISTING_UUID,
      changes: { previousStatus: 'applied', reason: 'Master too quiet' },
    })
  })

  it('rejects a listing with no reason — rejection_reason is stored as null', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: BD_UUID }, staffRole: 'ae' })
    const service = mockService({
      sync_listings: [
        { data: { ...PENDING_ADMIT_ROW, status: 'invited' }, error: null },
        { data: null, error: null },
      ],
      tracks: [{ data: { title: 'Golden Hour' }, error: null }],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ decision: 'reject' }), params())

    expect(res.status).toBe(200)
    const updateBuilder = service.builders.sync_listings[1]
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ rejection_reason: null })
    )
  })
})
