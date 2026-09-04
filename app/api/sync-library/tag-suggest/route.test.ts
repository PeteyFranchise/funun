import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/admin/gate'
import { logStaffAction } from '@/lib/staff/audit'
import { suggestTrackTags } from '@/lib/tagging/ai-tag'
import { POST } from './route'

// ─── POST /api/sync-library/tag-suggest ─────────────────────────────────
// Mirrors app/api/sync-library/admin/[listingId]/remove/route.test.ts's
// mock-client conventions. Covers: 401/403 staff gate, 404 missing track,
// the graceful non-500 offline path, and the successful write which must
// preserve sibling metadata keys and never touch confirmed descriptors.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/admin/gate', () => ({
  requireStaff: jest.fn(),
}))

jest.mock('@/lib/staff/audit', () => ({
  logStaffAction: jest.fn(),
}))

jest.mock('@/lib/tagging/ai-tag', () => ({
  suggestTrackTags: jest.fn(),
}))

const STAFF_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TRACK_UUID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

function jsonRequest(body: unknown) {
  return new Request('http://t.local/api/sync-library/tag-suggest', {
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
  title: 'Golden Hour',
  metadata: {
    composers: [{ name: 'A. Writer', role: 'composer', pro: 'none', split: 100 }],
    descriptors: { moods: ['driving'], energy: 'high', vocal: 'vocal' },
  },
}

const AI_SUGGESTION = {
  moods: ['chill'],
  energy: 'medium',
  vocal: 'instrumental',
  instruments: ['piano'],
  genres: [],
  suggested_at: '2026-08-13T00:00:00.000Z',
  model: 'claude-sonnet-4-20250514',
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(createApiClient as jest.Mock).mockResolvedValue({
    rpc: jest.fn((name: string) =>
      Promise.resolve(
        name === 'claim_ai_usage'
          ? { data: { allowed: true, claimId: '11111111-1111-4111-8111-111111111111' }, error: null }
          : { data: true, error: null }
      )
    ),
  })
  ;(logStaffAction as jest.Mock).mockResolvedValue({ ok: true })
})

describe('POST /api/sync-library/tag-suggest', () => {
  it('returns 401 for an unauthenticated caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Unauthorized', status: 401 })

    const res = await POST(jsonRequest({ trackId: TRACK_UUID }))

    expect(res.status).toBe(401)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 403 for a non-staff caller', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ error: 'Forbidden', status: 403 })

    const res = await POST(jsonRequest({ trackId: TRACK_UUID }))

    expect(res.status).toBe(403)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 400 when trackId is missing', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: STAFF_UUID }, staffRole: 'ae' })

    const res = await POST(jsonRequest({}))

    expect(res.status).toBe(400)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('returns 404 for an absent track', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: STAFF_UUID }, staffRole: 'ae' })
    const service = mockService({ tracks: [{ data: null, error: null }] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await POST(jsonRequest({ trackId: TRACK_UUID }))

    expect(res.status).toBe(404)
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('degrades gracefully (non-500) when the tagging assistant is offline', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: STAFF_UUID }, staffRole: 'ae' })
    const service = mockService({ tracks: [{ data: TRACK_ROW, error: null }] })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(suggestTrackTags as jest.Mock).mockResolvedValue({
      ok: false,
      error: 'The tagging assistant is offline right now.',
    })

    const res = await POST(jsonRequest({ trackId: TRACK_UUID }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.ok).toBe(false)
    expect(typeof body.data.error).toBe('string')
    expect(logStaffAction).not.toHaveBeenCalled()
  })

  it('writes ai_suggested only — confirmed descriptors and sibling metadata keys are preserved', async () => {
    ;(requireStaff as jest.Mock).mockResolvedValue({ user: { id: STAFF_UUID }, staffRole: 'ae' })
    const service = mockService({
      tracks: [
        { data: TRACK_ROW, error: null },
        { data: null, error: null },
      ],
    })
    ;(createServiceClient as jest.Mock).mockReturnValue(service)
    ;(suggestTrackTags as jest.Mock).mockResolvedValue({ ok: true, suggestion: AI_SUGGESTION })

    const res = await POST(jsonRequest({ trackId: TRACK_UUID }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.descriptors.moods).toEqual(['driving'])
    expect(body.data.descriptors.ai_suggested.moods).toEqual(['chill'])

    const updateBuilder = service.builders.tracks[1]
    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          composers: TRACK_ROW.metadata.composers,
          descriptors: expect.objectContaining({
            moods: ['driving'],
            ai_suggested: expect.objectContaining({ moods: ['chill'] }),
          }),
        }),
      })
    )

    expect(logStaffAction).toHaveBeenCalledWith(
      service,
      expect.objectContaining({
        actorId: STAFF_UUID,
        action: 'sync_library.tag_suggest',
        targetType: 'track',
        targetId: TRACK_UUID,
      })
    )
  })
})
