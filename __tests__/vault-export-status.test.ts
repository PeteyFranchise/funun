// Audit #10 — the queued-export status poll. Proves the ownership gate (a job
// only reveals to the user + project it belongs to) and that a completed job
// mints a FRESH signed URL from the stored pack path.

let mockUser: { id: string } | null
const mockGetJob = jest.fn()
const mockCreateSignedUrl = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
  createServiceClient: () => ({
    storage: { from: () => ({ createSignedUrl: (...a: unknown[]) => mockCreateSignedUrl(...a) }) },
  }),
}))
jest.mock('@/lib/jobs/queue', () => ({ getJob: (...a: unknown[]) => mockGetJob(...a) }))
jest.mock('@/lib/vault/export-assemble', () => ({ EXPORT_BUCKET: 'track-audio' }))

import { GET } from '@/app/api/vault/[projectId]/export/status/route'

function req(jobId?: string) {
  const q = jobId === undefined ? '' : `?jobId=${encodeURIComponent(jobId)}`
  return { url: `http://x/api/vault/p1/export/status${q}` } as unknown as Request
}
const ctx = (projectId: string) => ({ params: Promise.resolve({ projectId }) })

const completedJob = {
  type: 'vault_export',
  status: 'completed',
  payload: { userId: 'u1', projectId: 'p1' },
  result: { path: 'u1/p1/export-pack.zip', mode: 'share' },
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { id: 'u1' }
  mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/pack' } })
})

describe('GET export status — guards', () => {
  it('400 without a jobId', async () => {
    expect((await GET(req(undefined), ctx('p1'))).status).toBe(400)
  })

  it('401 when not signed in', async () => {
    mockUser = null
    expect((await GET(req('j1'), ctx('p1'))).status).toBe(401)
  })

  it('404 when the job does not exist', async () => {
    mockGetJob.mockResolvedValue(null)
    expect((await GET(req('j1'), ctx('p1'))).status).toBe(404)
  })

  it('404 when the job belongs to another user', async () => {
    mockGetJob.mockResolvedValue({ ...completedJob, payload: { userId: 'other', projectId: 'p1' } })
    const res = await GET(req('j1'), ctx('p1'))
    expect(res.status).toBe(404)
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('404 when the job is for another project', async () => {
    mockGetJob.mockResolvedValue(completedJob)
    expect((await GET(req('j1'), ctx('p2'))).status).toBe(404)
  })

  it('404 when the job is not a vault_export', async () => {
    mockGetJob.mockResolvedValue({ ...completedJob, type: 'watermark_preview' })
    expect((await GET(req('j1'), ctx('p1'))).status).toBe(404)
  })
})

describe('GET export status — outcomes', () => {
  it('reports processing while pending', async () => {
    mockGetJob.mockResolvedValue({ ...completedJob, status: 'processing', result: null })
    const body = await (await GET(req('j1'), ctx('p1'))).json()
    expect(body).toEqual({ status: 'processing' })
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('reports failed when the job failed', async () => {
    mockGetJob.mockResolvedValue({ ...completedJob, status: 'failed', result: { error: 'boom' } })
    const body = await (await GET(req('j1'), ctx('p1'))).json()
    expect(body).toEqual({ status: 'failed' })
  })

  it('reports failed when completed but the path is missing', async () => {
    mockGetJob.mockResolvedValue({ ...completedJob, result: {} })
    const body = await (await GET(req('j1'), ctx('p1'))).json()
    expect(body).toEqual({ status: 'failed' })
  })

  it('mints a fresh signed URL from the pack path when ready (share TTL)', async () => {
    mockGetJob.mockResolvedValue(completedJob)
    const res = await GET(req('j1'), ctx('p1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ready', url: 'https://signed/pack', mode: 'share' })
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('u1/p1/export-pack.zip', 60 * 60 * 24 * 7)
  })
})
