import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { createNotification } from '@/lib/notifications'
import { POST } from './route'

// ─── POST /api/sync-library/admin/[listingId]/remove — LEADERSHIP-ONLY ────
// takedown of an already-admitted song. Mirrors the sibling admit/reject
// route test's mock shape; the one behavioral difference under test is the
// tighter requireStaff(['leadership']) role set (26-CONTEXT.md "Staff
// removal / takedown" — NOT ae/bd).

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
const ARTIST_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const LISTING_UUID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const TRACK_UUID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

function jsonRequest(body: unknown) {
  return new Request(`http://t.local/api/sync-library/admin/${LISTING_UUID}/remove`, {
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

const ADMITTED_ROW = {
  id: LISTING_UUID,
  status: 'admitted',
  artist_user_id: ARTIST_UUID,
  track_id: TRACK_UUID,
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
  ;(createNotification as jest.Mock).mockResolvedValue({ ok: true })
})

describe('POST /api/sync-library/admin/[listingId]/remove', () => {
  it('returns 401 for an unauthenticated caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const res = await POST(jsonRequest({}), params())

    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 403 for an ae session (leadership-only, NOT ae)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await POST(jsonRequest({}), params())

    expect(res.status).toBe(403)
    expect(requireStaff).toHaveBeenCalledWith(['leadership'])
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 404 for an absent listing', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({ sync_listings: [{ data: null, error: null }] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({}), params())

    expect(res.status).toBe(404)
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('returns 409 for a listing that is not currently admitted', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({
      sync_listings: [{ data: { ...ADMITTED_ROW, status: 'pending_admit' }, error: null }],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({}), params())

    expect(res.status).toBe(409)
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('removes an admitted listing with an optional reason, notifies the artist, and audits', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({
      sync_listings: [
        { data: ADMITTED_ROW, error: null },
        { data: null, error: null },
      ],
      tracks: [{ data: { title: 'Midnight Run' }, error: null }],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ reason: 'Rights dispute' }), params())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ listingId: LISTING_UUID, status: 'removed' })

    const updateBuilder = service.builders.sync_listings[1]
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'removed',
        removal_reason: 'Rights dispute',
        removed_by: LEADERSHIP_UUID,
      })
    )

    expect(createNotification).toHaveBeenCalledTimes(1)
    const [, payload] = (createNotification as jest.Mock).mock.calls[0]
    expect(payload.userId).toBe(ARTIST_UUID)
    expect(payload.type).toBe('sync_library_removed')

    expect(logStaffAction).toHaveBeenCalledWith(service, {
      actorId: LEADERSHIP_UUID,
      action: 'sync_library.remove',
      targetType: 'sync_listing',
      targetId: LISTING_UUID,
      changes: { reason: 'Rights dispute' },
    })
  })

  it('removes an admitted listing with no reason — removal_reason is stored as null', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({
      sync_listings: [
        { data: ADMITTED_ROW, error: null },
        { data: null, error: null },
      ],
      tracks: [{ data: { title: 'Midnight Run' }, error: null }],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({}), params())

    expect(res.status).toBe(200)
    const updateBuilder = service.builders.sync_listings[1]
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ removal_reason: null })
    )
  })
})
