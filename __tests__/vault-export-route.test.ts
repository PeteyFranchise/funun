// Audit #10 — the export route branches small packs (inline) vs large packs
// (queued to the worker), and gates ownership/master/size before either.

let mockUser: { id: string } | null
const mockLoadPlan = jest.fn()
const mockAssemble = jest.fn()
const mockEnqueue = jest.fn()
const mockCreateSignedUrl = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
  createServiceClient: () => ({
    storage: { from: () => ({ createSignedUrl: (...a: unknown[]) => mockCreateSignedUrl(...a) }) },
  }),
}))
jest.mock('@/lib/jobs/queue', () => ({ enqueueJob: (...a: unknown[]) => mockEnqueue(...a) }))
jest.mock('@/lib/vault/export-assemble', () => ({
  loadExportPlan: (...a: unknown[]) => mockLoadPlan(...a),
  assembleAndUploadPack: (...a: unknown[]) => mockAssemble(...a),
  EXPORT_BUCKET: 'track-audio',
  MAX_PACK_BYTES: 200 * 1024 * 1024,
  INLINE_THRESHOLD_BYTES: 80 * 1024 * 1024,
}))

import { POST } from '@/app/api/vault/[projectId]/export/route'

const MB = 1024 * 1024
function req(mode = 'download') {
  return { json: async () => ({ mode }) } as unknown as Request
}
const ctx = (projectId: string) => ({ params: Promise.resolve({ projectId }) })

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { id: 'u1' }
  mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/pack' } })
})

describe('POST export — guards', () => {
  it('401 when not signed in', async () => {
    mockUser = null
    expect((await POST(req(), ctx('p1'))).status).toBe(401)
  })

  it('404 when the project is missing or not owned (plan is null)', async () => {
    mockLoadPlan.mockResolvedValue(null)
    expect((await POST(req(), ctx('p1'))).status).toBe(404)
  })

  it('400 when there is no master audio', async () => {
    mockLoadPlan.mockResolvedValue({ manifest: { hasMaster: false }, totalBytes: 1 })
    expect((await POST(req(), ctx('p1'))).status).toBe(400)
  })

  it('413 when the pack is over the max', async () => {
    mockLoadPlan.mockResolvedValue({ manifest: { hasMaster: true }, totalBytes: 300 * MB })
    expect((await POST(req(), ctx('p1'))).status).toBe(413)
    expect(mockEnqueue).not.toHaveBeenCalled()
    expect(mockAssemble).not.toHaveBeenCalled()
  })
})

describe('POST export — inline vs queue', () => {
  it('assembles inline and returns a URL for a small pack', async () => {
    mockLoadPlan.mockResolvedValue({ manifest: { hasMaster: true }, totalBytes: 10 * MB })
    mockAssemble.mockResolvedValue(undefined)
    const res = await POST(req('share'), ctx('p1'))
    const body = await res.json()
    expect(mockAssemble).toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
    expect(body.data).toEqual({ url: 'https://signed/pack', path: 'u1/p1/export-pack.zip', mode: 'share' })
  })

  it('queues a large pack to the worker and returns a jobId (no inline assembly)', async () => {
    mockLoadPlan.mockResolvedValue({ manifest: { hasMaster: true }, totalBytes: 120 * MB })
    mockEnqueue.mockResolvedValue({ id: 'job-9' })
    const res = await POST(req('download'), ctx('p1'))
    const body = await res.json()
    expect(mockAssemble).not.toHaveBeenCalled()
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'vault_export',
        dedupKey: 'vault_export:u1:p1:download',
        payload: { projectId: 'p1', userId: 'u1', mode: 'download' },
      })
    )
    expect(body.data).toEqual({ queued: true, jobId: 'job-9', mode: 'download' })
  })

  it('500 when the large-pack enqueue fails', async () => {
    mockLoadPlan.mockResolvedValue({ manifest: { hasMaster: true }, totalBytes: 120 * MB })
    mockEnqueue.mockResolvedValue(null)
    expect((await POST(req(), ctx('p1'))).status).toBe(500)
  })
})
