// Signed-upload-intent routes must refuse when the limiter says "limited" —
// including when that verdict comes from a limiter outage (failClosed: true).
//
// Two assertions per route, and the second is the load-bearing one:
//   1. the route asks checkRateLimit with failClosed: true, and
//   2. a limited verdict returns 429 and mints NO signed upload URL.
// Each route also has an under-the-limit case that DOES reach
// createSignedUploadUrl, so the "never called" assertion cannot pass vacuously
// on broken mocks.

const mockCheckRateLimit = jest.fn()
jest.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
  getClientIp: () => '5.5.5.5',
}))

const mockCreateSignedUploadUrl = jest.fn()
const mockSessionRow = jest.fn()
const mockRoomRow = jest.fn()
const mockAssetInsert = jest.fn()

type Chain = {
  select: () => Chain
  eq: () => Chain
  maybeSingle: () => Promise<unknown>
  insert: (row: unknown) => Promise<{ error: unknown }>
  update: () => Chain
}

function chainFor(table: string): Chain {
  const chain: Chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => (table === 'playbook_rooms' ? mockRoomRow() : mockSessionRow()),
    insert: async (row: unknown) => mockAssetInsert(row),
    update: () => chain,
  }
  return chain
}

const storage = {
  from: () => ({
    createSignedUploadUrl: (...a: unknown[]) => mockCreateSignedUploadUrl(...a),
  }),
}

const mockUser = { id: '11111111-1111-4111-8111-111111111111' }

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: (table: string) => chainFor(table),
  }),
  createServiceClient: () => ({
    storage,
    from: (table: string) => chainFor(table),
  }),
}))

const mockResolveWorkAccess = jest.fn()
jest.mock('@/lib/catalogue/access', () => ({
  resolveWorkAccess: (...a: unknown[]) => mockResolveWorkAccess(...a),
  createWorkAccessDeps: () => ({}),
}))

const mockResolveIdeaAccess = jest.fn()
jest.mock('@/lib/ideas/access', () => ({
  resolveIdeaAccess: (...a: unknown[]) => mockResolveIdeaAccess(...a),
}))

const mockRequireRoomAccess = jest.fn()
jest.mock('@/lib/playbook/rooms', () => ({
  requireRoomAccess: (...a: unknown[]) => mockRequireRoomAccess(...a),
}))

import { POST as ideaRecordingIntent } from '@/app/api/ideas/[ideaId]/recordings/upload-intent/route'
import { POST as workVersionIntent } from '@/app/api/works/[workId]/versions/upload-intent/route'
import { POST as clipIntent } from '@/app/api/works/[workId]/recording-sessions/[sessionId]/clips/upload-intent/route'
import { POST as handoffIntent } from '@/app/api/works/[workId]/recording-sessions/[sessionId]/handoffs/upload-intent/route'
import { POST as playbookMediaIntent } from '@/app/api/admin/playbook/media/upload-intent/route'

const WORK_ID = '22222222-2222-4222-8222-222222222222'
const SESSION_ID = '33333333-3333-4333-8333-333333333333'
const IDEA_ID = '44444444-4444-4444-8444-444444444444'

function req(body: unknown): Request {
  return { json: async () => body, headers: { get: () => null } } as unknown as Request
}

type RouteCase = {
  name: string
  call: () => Promise<Response>
}

const cases: RouteCase[] = [
  {
    name: 'POST /api/ideas/[ideaId]/recordings/upload-intent',
    call: () =>
      ideaRecordingIntent(req({ fileName: 'take.wav', mimeType: 'audio/wav', size: 1024 }), {
        params: Promise.resolve({ ideaId: IDEA_ID }),
      }) as Promise<Response>,
  },
  {
    name: 'POST /api/works/[workId]/versions/upload-intent',
    call: () =>
      workVersionIntent(
        req({ fileName: 'demo.wav', mimeType: 'audio/wav', size: 1024, source: 'upload' }),
        { params: Promise.resolve({ workId: WORK_ID }) }
      ) as Promise<Response>,
  },
  {
    name: 'POST /api/works/[workId]/recording-sessions/[sessionId]/clips/upload-intent',
    call: () =>
      clipIntent(req({ fileName: 'vocal.wav', mimeType: 'audio/wav', size: 1024 }), {
        params: Promise.resolve({ workId: WORK_ID, sessionId: SESSION_ID }),
      }) as Promise<Response>,
  },
  {
    name: 'POST /api/works/[workId]/recording-sessions/[sessionId]/handoffs/upload-intent',
    call: () =>
      handoffIntent(req({ size: 1024 }), {
        params: Promise.resolve({ workId: WORK_ID, sessionId: SESSION_ID }),
      }) as Promise<Response>,
  },
  {
    name: 'POST /api/admin/playbook/media/upload-intent',
    call: () =>
      playbookMediaIntent(
        req({ roomKey: 'it-team', title: 'Onboarding', mimeType: 'video/mp4', sizeBytes: 1024 })
      ) as Promise<Response>,
  },
]

beforeEach(() => {
  jest.clearAllMocks()
  mockResolveWorkAccess.mockResolvedValue({ granted: true })
  mockResolveIdeaAccess.mockResolvedValue({ granted: true, permission: 'contribute' })
  mockRequireRoomAccess.mockResolvedValue({ user: mockUser })
  mockSessionRow.mockResolvedValue({ data: { id: SESSION_ID } })
  mockRoomRow.mockResolvedValue({ data: { id: '55555555-5555-4555-8555-555555555555' }, error: null })
  mockAssetInsert.mockResolvedValue({ error: null })
  mockCreateSignedUploadUrl.mockResolvedValue({ data: { token: 'signed-token' }, error: null })
})

describe.each(cases)('$name — fail-closed upload intent', ({ call }) => {
  it('asks the limiter with failClosed: true', async () => {
    mockCheckRateLimit.mockResolvedValue(true)
    await call()
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ failClosed: true })
    )
  })

  it('returns 429 and mints no signed upload URL when the limiter reports limited', async () => {
    mockCheckRateLimit.mockResolvedValue(true)
    const res = await call()
    expect(res.status).toBe(429)
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('reaches the signed URL under the limit (so the refusal above is not vacuous)', async () => {
    mockCheckRateLimit.mockResolvedValue(false)
    const res = await call()
    expect(mockCreateSignedUploadUrl).toHaveBeenCalled()
    expect(res.status).toBe(200)
  })
})
