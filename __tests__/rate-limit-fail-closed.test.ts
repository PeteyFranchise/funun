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
import { INVITATION_RATE_LIMIT } from '@/lib/workspaces/invitations'

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

// ─── Repo-wide posture lock over app/api ───────────────────────────────────
// Every checkRateLimit call in a route file either passes `failClosed: true`
// or is annotated `// Fail-open on purpose: <reason>`. The default in
// lib/security/rate-limit.ts stays fail-open (covered by the behavioural
// tests above), so a new call that omits the flag shows up here instead of
// silently inheriting that default.

const INVITATIONS_ROUTE = 'app/api/workspaces/[workspaceId]/invitations/route.ts'

function listRouteFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listRouteFiles(full)
    return entry.name === 'route.ts' ? [full] : []
  })
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

// Returns the full text of each non-comment `checkRateLimit(...)` call.
function rateLimitCalls(source: string): string[] {
  const lines = source.split('\n')
  const calls: string[] = []
  const needle = 'checkRateLimit('
  let offset = 0
  for (const line of lines) {
    const lineStart = offset
    offset += line.length + 1
    if (isCommentLine(line)) continue
    const at = line.indexOf(needle)
    if (at === -1) continue
    // Imports and re-exports never contain the call form, so this is a call.
    let i = lineStart + at + needle.length
    let depth = 1
    while (depth > 0 && i < source.length) {
      const ch = source[i]
      if (ch === '(') depth += 1
      else if (ch === ')') depth -= 1
      i += 1
    }
    calls.push(source.slice(lineStart + at, i))
  }
  return calls
}

const routeFiles = listRouteFiles(path.join(process.cwd(), 'app/api')).map(f =>
  path.relative(process.cwd(), f)
)

describe('every app/api limiter call fails closed or documents why it stays open', () => {
  it('finds the route files it is meant to check', () => {
    expect(routeFiles.length).toBeGreaterThan(20)
    expect(routeFiles.filter(f => rateLimitCalls(fs.readFileSync(f, 'utf8')).length > 0).length).toBeGreaterThan(20)
  })

  it.each(routeFiles.filter(f => f !== INVITATIONS_ROUTE))('%s', relativePath => {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
    const calls = rateLimitCalls(source)
    if (calls.length === 0) return

    const failOpenCalls = calls.filter(call => !/failClosed:\s*true/.test(call))
    const annotations = source
      .split('\n')
      .filter(line => line.trim().startsWith('// Fail-open on purpose:')).length

    expect(annotations).toBeGreaterThanOrEqual(failOpenCalls.length)
  })

  it('workspace invitations pass a limit config that fails closed', () => {
    const source = fs.readFileSync(path.join(process.cwd(), INVITATIONS_ROUTE), 'utf8')
    expect(rateLimitCalls(source).some(call => call.includes('INVITATION_RATE_LIMIT'))).toBe(true)
    expect(INVITATION_RATE_LIMIT.failClosed).toBe(true)
  })

  it('does not change the helper default: omitting the flag still resolves false on an RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc unavailable' } })
    await expect(checkRateLimit('default-posture:u1')).resolves.toBe(false)
  })
})
