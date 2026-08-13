import { createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { POST } from './route'

// ─── POST /api/sync-library/tag-propose ─────────────────────────────────
// Mirrors app/api/sync-library/admin/[listingId]/remove/route.test.ts's
// mock-client conventions. Covers: 401/403 staff gate (bd excluded), 400
// validation, 404 missing track, the AE→pending branch (confirmed
// UNCHANGED), the leadership/A&R→auto-confirm branch, and sibling
// metadata-key preservation.

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({
  requireStaff: jest.fn(),
}))

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

const AE_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const LEADERSHIP_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ANR_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const TRACK_UUID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

function jsonRequest(body: unknown) {
  return new Request('http://t.local/api/sync-library/tag-propose', {
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

const TRACK_ROW = {
  id: TRACK_UUID,
  metadata: {
    lyrics: { text: 'la la la' },
    descriptors: { moods: ['driving'], energy: 'high', vocal: 'vocal' },
  },
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
})

describe('POST /api/sync-library/tag-propose', () => {
  it('returns 401 for an unauthenticated caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const res = await POST(jsonRequest({ trackId: TRACK_UUID, descriptors: { moods: ['chill'] } }))

    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 403 for a bd session (not a tag curator)', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await POST(jsonRequest({ trackId: TRACK_UUID, descriptors: { moods: ['chill'] } }))

    expect(res.status).toBe(403)
    expect(requireStaff).toHaveBeenCalledWith(['leadership', 'ae', 'anr'])
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 400 when trackId is missing', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })

    const res = await POST(jsonRequest({ descriptors: { moods: ['chill'] } }))

    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 400 when no valid descriptor fields are provided', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })

    const res = await POST(jsonRequest({ trackId: TRACK_UUID, descriptors: {} }))

    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 404 for an absent track', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({ tracks: [{ data: null, error: null }] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ trackId: TRACK_UUID, descriptors: { moods: ['chill'] } }))

    expect(res.status).toBe(404)
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it("an AE proposal lands pending — confirmed moods UNCHANGED, proposed_by = the AE", async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: AE_UUID }, staffRole: 'ae' })
    const service = mockService({
      tracks: [
        { data: TRACK_ROW, error: null },
        { data: null, error: null },
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ trackId: TRACK_UUID, descriptors: { moods: ['chill'] } }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.pending).toBe(true)
    expect(body.data.descriptors.moods).toEqual(['driving']) // confirmed unchanged
    expect(body.data.descriptors.pending.moods).toEqual(['chill'])
    expect(body.data.descriptors.pending.proposed_by).toBe(AE_UUID)

    const updateBuilder = service.builders.tracks[1]
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          lyrics: TRACK_ROW.metadata.lyrics, // sibling key preserved
          descriptors: expect.objectContaining({
            moods: ['driving'],
            pending: expect.objectContaining({ moods: ['chill'], proposed_by: AE_UUID }),
          }),
        }),
      })
    )

    expect(logStaffAction).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        actorId: AE_UUID,
        action: 'sync_library.tag_propose',
        targetType: 'track',
        targetId: TRACK_UUID,
        changes: expect.objectContaining({ role: 'ae', pending: true }),
      })
    )
  })

  it('a leadership proposal auto-confirms — confirmed updated immediately, no pending left', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: LEADERSHIP_UUID }, staffRole: 'leadership' })
    const service = mockService({
      tracks: [
        { data: TRACK_ROW, error: null },
        { data: null, error: null },
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ trackId: TRACK_UUID, descriptors: { moods: ['chill'] } }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.pending).toBe(false)
    expect(body.data.descriptors.moods).toEqual(['chill'])
    expect(body.data.descriptors.pending).toBeUndefined()
    expect(body.data.descriptors.staff_refined_by).toBe(LEADERSHIP_UUID)
  })

  it("an 'anr' proposal auto-confirms — confirmed updated immediately, no pending left", async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: ANR_UUID }, staffRole: 'anr' })
    const service = mockService({
      tracks: [
        { data: TRACK_ROW, error: null },
        { data: null, error: null },
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ trackId: TRACK_UUID, descriptors: { moods: ['chill'] } }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.pending).toBe(false)
    expect(body.data.descriptors.moods).toEqual(['chill'])
    expect(body.data.descriptors.staff_refined_by).toBe(ANR_UUID)
  })
})
