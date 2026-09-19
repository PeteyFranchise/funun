// A limiter outage must not become an unlimited signed-upload-intent faucet.
//
// checkRateLimit() returns `options.failClosed === true` on both of its failure
// branches (returned-RPC-error and thrown). With the flag unset that is `false`
// — i.e. "not rate limited" — which is the correct posture for low-cost
// onboarding checks and the wrong one for abuse-sensitive writes.
//
// These are behavioural assertions against the real helper with a stubbed
// service client: a source-text lock alone cannot tell the two branches apart,
// and either can regress on its own.

const mockRpc = jest.fn()
const mockCreateServiceClient = jest.fn(() => ({ rpc: (...a: unknown[]) => mockRpc(...a) }))
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => mockCreateServiceClient(),
}))

import fs from 'node:fs'
import path from 'node:path'
import { checkRateLimit } from '@/lib/security/rate-limit'

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateServiceClient.mockImplementation(() => ({ rpc: (...a: unknown[]) => mockRpc(...a) }))
})

describe('checkRateLimit failure posture — RPC returns an error (rate-limit.ts:48)', () => {
  beforeEach(() => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'relation "rate_limits" does not exist' } })
  })

  it('reports LIMITED when the caller passes failClosed: true', async () => {
    await expect(checkRateLimit('upload-intent:u1', { failClosed: true })).resolves.toBe(true)
  })

  it('reports NOT limited when the caller omits the flag (documented fail-open default)', async () => {
    await expect(checkRateLimit('signup:u1')).resolves.toBe(false)
    await expect(checkRateLimit('signup:u1', {})).resolves.toBe(false)
    await expect(checkRateLimit('signup:u1', { failClosed: false })).resolves.toBe(false)
  })
})

describe('checkRateLimit failure posture — RPC throws (rate-limit.ts:51)', () => {
  beforeEach(() => {
    mockRpc.mockRejectedValue(new Error('fetch failed'))
  })

  it('reports LIMITED when the caller passes failClosed: true', async () => {
    await expect(checkRateLimit('upload-intent:u1', { failClosed: true })).resolves.toBe(true)
  })

  it('reports NOT limited when the caller omits the flag', async () => {
    await expect(checkRateLimit('signup:u1')).resolves.toBe(false)
  })
})

describe('checkRateLimit failure posture — the service client itself throws', () => {
  beforeEach(() => {
    mockCreateServiceClient.mockImplementation(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
    })
  })

  it('reports LIMITED when the caller passes failClosed: true', async () => {
    await expect(checkRateLimit('upload-intent:u1', { failClosed: true })).resolves.toBe(true)
  })

  it('reports NOT limited when the caller omits the flag', async () => {
    await expect(checkRateLimit('signup:u1')).resolves.toBe(false)
  })
})

describe('checkRateLimit with a healthy limiter — failClosed changes nothing', () => {
  it('honours the RPC verdict either way', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null })
    await expect(checkRateLimit('upload-intent:u1', { failClosed: true })).resolves.toBe(true)
    await expect(checkRateLimit('upload-intent:u1')).resolves.toBe(true)

    mockRpc.mockResolvedValue({ data: false, error: null })
    await expect(checkRateLimit('upload-intent:u1', { failClosed: true })).resolves.toBe(false)
    await expect(checkRateLimit('upload-intent:u1')).resolves.toBe(false)
  })

  it('still rejects an out-of-range key or window before reaching the RPC', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })
    await expect(checkRateLimit('  ', { failClosed: true })).rejects.toBeInstanceOf(RangeError)
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

// Cheap regression lock in the house style (see __tests__/phase-38-1-hardening.test.ts).
// Deliberately secondary to the behavioural route tests in
// __tests__/upload-intent-fail-closed-routes.test.ts — text can be satisfied
// without behaviour changing.
const uploadIntentRoutes = [
  'app/api/ideas/[ideaId]/recordings/upload-intent/route.ts',
  'app/api/works/[workId]/versions/upload-intent/route.ts',
  'app/api/works/[workId]/recording-sessions/[sessionId]/clips/upload-intent/route.ts',
  'app/api/works/[workId]/recording-sessions/[sessionId]/handoffs/upload-intent/route.ts',
  'app/api/admin/playbook/media/upload-intent/route.ts',
]

describe('upload-intent routes keep the fail-closed limiter posture', () => {
  it.each(uploadIntentRoutes)('%s passes failClosed: true', relativePath => {
    const file = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
    expect(file).toContain('checkRateLimit(')
    expect(file).toContain('failClosed: true')
    expect(file).toContain('status: 429')
  })

  it('leaves the admission-gated vault track route alone (no checkRateLimit)', () => {
    const file = fs.readFileSync(
      path.join(process.cwd(), 'app/api/vault/[projectId]/tracks/[trackId]/audio/upload-intent/route.ts'),
      'utf8'
    )
    expect(file).not.toContain('checkRateLimit')
  })
})
