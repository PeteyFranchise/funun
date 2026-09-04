// Audit #5/#10 — the durable-job worker route. Proves the fail-closed
// CRON_SECRET guard and type-dispatch: known type → handler + completeJob,
// unknown type → failJob, throwing handler → failJob (retry path).

const mockClaim = jest.fn()
const mockComplete = jest.fn()
const mockFail = jest.fn()
jest.mock('@/lib/jobs/queue', () => ({
  claimNextJob: (...a: unknown[]) => mockClaim(...a),
  completeJob: (...a: unknown[]) => mockComplete(...a),
  failJob: (...a: unknown[]) => mockFail(...a),
}))

jest.mock('@/lib/jobs/handlers', () => ({ JOB_HANDLERS: {} }))

import { GET } from '@/app/api/cron/process-jobs/route'
import { JOB_HANDLERS } from '@/lib/jobs/handlers'

const OLD_ENV = process.env

function req(headers: Record<string, string> = {}) {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as Request
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...OLD_ENV, CRON_SECRET: 'test-secret' }
  for (const k of Object.keys(JOB_HANDLERS)) delete JOB_HANDLERS[k]
  mockClaim.mockResolvedValue(null) // empty queue by default
})

afterAll(() => {
  process.env = OLD_ENV
})

const auth = { authorization: 'Bearer test-secret' }

describe('GET /api/cron/process-jobs — auth guard', () => {
  it('401s when the bearer token is wrong', async () => {
    const res = await GET(req({ authorization: 'Bearer nope' }))
    expect(res.status).toBe(401)
    expect(mockClaim).not.toHaveBeenCalled()
  })

  it('401s when no CRON_SECRET is configured (fail closed)', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(req(auth))
    expect(res.status).toBe(401)
    expect(mockClaim).not.toHaveBeenCalled()
  })
})

describe('GET /api/cron/process-jobs — dispatch', () => {
  it('runs a registered handler and completes the job', async () => {
    const handler = jest.fn().mockResolvedValue({ url: 'https://x' })
    JOB_HANDLERS['vault_export'] = handler
    mockClaim
      .mockResolvedValueOnce({ id: 'j1', type: 'vault_export', payload: { a: 1 }, claim_token: 'c1' })
      .mockResolvedValue(null)

    const res = await GET(req(auth))
    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledWith({ a: 1 })
    expect(mockComplete).toHaveBeenCalledWith('j1', 'c1', { url: 'https://x' })
    expect(mockFail).not.toHaveBeenCalled()
  })

  it('fails a job whose type has no registered handler', async () => {
    mockClaim
      .mockResolvedValueOnce({ id: 'j2', type: 'mystery', payload: {}, claim_token: 'c2' })
      .mockResolvedValue(null)

    await GET(req(auth))
    expect(mockFail).toHaveBeenCalledWith('j2', 'c2', expect.stringContaining('No handler'))
    expect(mockComplete).not.toHaveBeenCalled()
  })

  it('fails (for retry) a job whose handler throws', async () => {
    JOB_HANDLERS['vault_export'] = jest.fn().mockRejectedValue(new Error('render blew up'))
    mockClaim
      .mockResolvedValueOnce({ id: 'j3', type: 'vault_export', payload: {}, claim_token: 'c3' })
      .mockResolvedValue(null)

    await GET(req(auth))
    expect(mockFail).toHaveBeenCalledWith('j3', 'c3', 'render blew up')
    expect(mockComplete).not.toHaveBeenCalled()
  })

  it('claims only one job per run so long audio work stays inside the function window', async () => {
    JOB_HANDLERS['vault_export'] = jest.fn().mockResolvedValue({})
    mockClaim.mockResolvedValue({ id: 'jN', type: 'vault_export', payload: {}, claim_token: 'cN' })

    const res = await GET(req(auth))
    const body = await res.json()
    expect(body.processed).toHaveLength(1)
    expect(mockClaim).toHaveBeenCalledTimes(1)
  })
})
