import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { POST } from './route'

// ─── POST /api/sync-library/admin/[listingId]/quality — the manual ───────
// quality-bar write. Mirrors app/api/sync-library/admin/[listingId]/
// route.test.ts's mock shape (requireStaff/logStaffAction mocked; target
// always DB-loaded by listingId, never the request body). No test file
// existed for this route before the 2026-10-04 owner decision widened its
// allowlist — added alongside that change rather than left uncovered.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({
  requireStaff: jest.fn(),
}))

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

const LEADERSHIP_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const ANR_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const LISTING_UUID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

function jsonRequest(body: unknown) {
  return new Request(`http://t.local/api/sync-library/admin/${LISTING_UUID}/quality`, {
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

const LISTING_ROW = { id: LISTING_UUID, status: 'pending_admit' }

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
})

describe('POST /api/sync-library/admin/[listingId]/quality', () => {
  it('returns 401 for an unauthenticated caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const res = await POST(jsonRequest({ quality_ok: true }), params())

    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 403 for staff outside leadership+anr (e.g. ae)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await POST(jsonRequest({ quality_ok: true }), params())

    expect(res.status).toBe(403)
    expect(requireStaff).toHaveBeenCalledWith(['leadership', 'anr'])
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  // OWNER DECISION 2026-10-04 ("Quality review is part of A&R's job.").
  // Pinned here with a real anr actor exercising the full write path, not
  // just a mocked requireStaff return, so a future accidental narrowing
  // back to leadership-only fails this test for the right reason.
  it('records a quality_ok verdict when the actor is anr, not just leadership', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: ANR_UUID }, staffRole: 'anr' })
    const service = mockService({
      sync_listings: [
        { data: LISTING_ROW, error: null },
        { data: null, error: null },
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ quality_ok: true }), params())

    expect(res.status).toBe(200)
    expect(requireStaff).toHaveBeenCalledWith(['leadership', 'anr'])
    const updateBuilder = service.builders.sync_listings[1]
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ quality_ok: true, quality_reviewed_by: ANR_UUID })
    )
    expect(logStaffAction).toHaveBeenCalledWith(
      service,
      expect.objectContaining({ actorId: ANR_UUID, action: 'sync_library.quality_review' })
    )
  })

  it('still works for a leadership actor (the pre-existing behaviour)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({
      sync_listings: [
        { data: LISTING_ROW, error: null },
        { data: null, error: null },
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ staff_notes: 'Needs a cleaner master' }), params())

    expect(res.status).toBe(200)
    const updateBuilder = service.builders.sync_listings[1]
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({ staff_notes: 'Needs a cleaner master' })
    )
  })

  it('returns 400 when no recognized field is present', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })

    const res = await POST(jsonRequest({}), params())

    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 404 for an absent listing', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({
      sync_listings: [{ data: null, error: null }],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ quality_ok: false }), params())

    expect(res.status).toBe(404)
  })
})
