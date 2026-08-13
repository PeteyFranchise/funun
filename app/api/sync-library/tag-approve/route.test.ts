import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { POST } from './route'

// ─── POST /api/sync-library/tag-approve ─────────────────────────────────
// Mirrors app/api/sync-library/admin/[listingId]/remove/route.test.ts's
// mock-client conventions. Covers: 401/403 staff gate (AE excluded even as
// proposer), 400 validation, 404 missing track, 409 no pending proposal,
// approve (promotes + clears pending), reject (clears pending, confirmed
// untouched), and sibling metadata-key preservation.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({
  requireStaff: jest.fn(),
}))

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

const LEADERSHIP_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ANR_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const TRACK_UUID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const AE_PROPOSER_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function jsonRequest(body: unknown) {
  return new Request('http://t.local/api/sync-library/tag-approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
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

const PENDING_TRACK_ROW = {
  id: TRACK_UUID,
  metadata: {
    lyrics: { text: 'la la la' },
    descriptors: {
      moods: ['driving'],
      energy: 'high',
      vocal: 'vocal',
      pending: {
        moods: ['chill'],
        energy: null,
        vocal: null,
        instruments: [],
        proposed_by: AE_PROPOSER_UUID,
        proposed_at: '2026-08-13T00:00:00.000Z',
      },
    },
  },
}

const NO_PENDING_TRACK_ROW = {
  id: TRACK_UUID,
  metadata: { descriptors: { moods: ['driving'], energy: 'high', vocal: 'vocal' } },
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
})

describe('POST /api/sync-library/tag-approve', () => {
  it('returns 401 for an unauthenticated caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const res = await POST(jsonRequest({ trackId: TRACK_UUID, decision: 'approve' }))

    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 403 for an ae session, even the proposer (leadership+anr ONLY)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await POST(jsonRequest({ trackId: TRACK_UUID, decision: 'approve' }))

    expect(res.status).toBe(403)
    expect(requireStaff).toHaveBeenCalledWith(['leadership', 'anr'])
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 400 when trackId is missing', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })

    const res = await POST(jsonRequest({ decision: 'approve' }))

    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid decision value', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })

    const res = await POST(jsonRequest({ trackId: TRACK_UUID, decision: 'maybe' }))

    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 404 for an absent track', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({ tracks: [{ data: null, error: null }] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ trackId: TRACK_UUID, decision: 'approve' }))

    expect(res.status).toBe(404)
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('returns 409 when the track has no pending proposal', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({ tracks: [{ data: NO_PENDING_TRACK_ROW, error: null }] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ trackId: TRACK_UUID, decision: 'approve' }))

    expect(res.status).toBe(409)
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('leadership approve promotes pending to confirmed, clears pending, stamps staff_refined_by', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({
      tracks: [
        { data: PENDING_TRACK_ROW, error: null },
        { data: null, error: null },
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ trackId: TRACK_UUID, decision: 'approve' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.descriptors.moods).toEqual(['chill'])
    expect(body.data.descriptors.pending).toBeUndefined()
    expect(body.data.descriptors.staff_refined_by).toBe(LEADERSHIP_UUID)

    const updateBuilder = service.builders.tracks[1]
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          lyrics: PENDING_TRACK_ROW.metadata.lyrics, // sibling key preserved
        }),
      })
    )

    expect(logStaffAction).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        actorId: LEADERSHIP_UUID,
        action: 'sync_library.tag_approve',
        targetType: 'track',
        targetId: TRACK_UUID,
      })
    )
  })

  it('A&R reject clears pending without touching confirmed tags', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: ANR_UUID }, staffRole: 'anr' })
    const service = mockService({
      tracks: [
        { data: PENDING_TRACK_ROW, error: null },
        { data: null, error: null },
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ trackId: TRACK_UUID, decision: 'reject' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.descriptors.moods).toEqual(['driving']) // confirmed untouched
    expect(body.data.descriptors.pending).toBeUndefined()

    expect(logStaffAction).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        actorId: ANR_UUID,
        action: 'sync_library.tag_reject',
        targetType: 'track',
        targetId: TRACK_UUID,
      })
    )
  })
})
