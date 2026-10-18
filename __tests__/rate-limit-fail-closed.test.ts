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
import { COLLABORATOR_INVITE_RATE_LIMITS } from '@/lib/collaborators/invite-quota'

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

// ─── Repo-wide posture lock over app/ and lib/ ─────────────────────────────
// Every checkRateLimit call either passes `failClosed: true` (inline, or via a
// known config constant that sets it) or sits directly under its own
// `// Fail-open on purpose: <reason>` comment AND lives in a file named in
// FAIL_OPEN_ALLOWED. The default in lib/security/rate-limit.ts stays fail-open
// (covered by the behavioural tests above), so a new call that omits the flag
// shows up here instead of silently inheriting that default.

// Files that may keep a fail-open call, with how many such calls they hold.
// Adding to this list is a deliberate decision: say why in the annotation.
const FAIL_OPEN_ALLOWED: Record<string, number> = {
  'app/api/signup/check-invite/route.ts': 2,
  'app/api/signup/invite/[token]/route.ts': 1,
  'app/api/waitlist/unsubscribe/route.ts': 1,
  'app/api/handles/available/route.ts': 1,
  'app/api/works/[workId]/versions/[versionId]/pins/export/route.ts': 1,
  'app/api/works/[workId]/versions/[versionId]/comments/export/route.ts': 1,
}

// Config constants passed as the options argument. Each must set failClosed.
const CONFIG_CONSTANTS: Record<string, { failClosed?: boolean }> = {
  INVITATION_RATE_LIMIT,
  'COLLABORATOR_INVITE_RATE_LIMITS.hourly': COLLABORATOR_INVITE_RATE_LIMITS.hourly,
  'COLLABORATOR_INVITE_RATE_LIMITS.daily': COLLABORATOR_INVITE_RATE_LIMITS.daily,
}

function listSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(full)
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return []
    return [full]
  })
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

type LimiterCall = { text: string; line: number }

// Each non-comment `checkRateLimit(...)` call: its full text and 0-based line.
function rateLimitCalls(source: string): LimiterCall[] {
  const lines = source.split('\n')
  const calls: LimiterCall[] = []
  const needle = 'checkRateLimit('
  let offset = 0
  lines.forEach((line, index) => {
    const lineStart = offset
    offset += line.length + 1
    if (isCommentLine(line)) return
    const at = line.indexOf(needle)
    if (at === -1) return
    if (/function\s+checkRateLimit\(/.test(line)) return // the definition
    let i = lineStart + at + needle.length
    let depth = 1
    while (depth > 0 && i < source.length) {
      const ch = source[i]
      if (ch === '(') depth += 1
      else if (ch === ')') depth -= 1
      i += 1
    }
    calls.push({ text: source.slice(lineStart + at, i), line: index })
  })
  return calls
}

// True when `// Fail-open on purpose:` sits in the comment block directly
// above the call. At most two statement-opener lines (`if (`) may sit between
// the comment and the call line; any other code in between breaks adjacency.
function hasAnnotationDirectlyAbove(lines: string[], callLine: number): boolean {
  let k = callLine - 1
  let skipped = 0
  while (k >= 0 && !isCommentLine(lines[k]) && skipped < 2 && lines[k].trim().endsWith('(')) {
    k -= 1
    skipped += 1
  }
  const block: string[] = []
  while (k >= 0 && isCommentLine(lines[k])) {
    block.unshift(lines[k].trim())
    k -= 1
  }
  return block.some(line => line.startsWith('// Fail-open on purpose:'))
}

// Options argument without string/template contents, to look for an object
// literal or a config constant.
function optionsOf(call: string): string {
  return call
    .replace(/`[^`]*`/g, '``')
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
}

const sourceFiles = [
  ...listSourceFiles(path.join(process.cwd(), 'app')),
  ...listSourceFiles(path.join(process.cwd(), 'lib')),
]
  .map(f => path.relative(process.cwd(), f))
  .filter(f => f !== 'lib/security/rate-limit.ts')
  .filter(f => rateLimitCalls(fs.readFileSync(f, 'utf8')).length > 0)

describe('every limiter call in app/ and lib/ fails closed or documents why it stays open', () => {
  it('finds the files it is meant to check', () => {
    expect(sourceFiles.length).toBeGreaterThan(20)
    expect(sourceFiles).toContain('lib/collaborators/invite-quota.ts')
    expect(sourceFiles.filter(f => f.startsWith('app/api/')).length).toBeGreaterThan(20)
  })

  it.each(sourceFiles)('%s', relativePath => {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
    const lines = source.split('\n')
    let failOpen = 0

    for (const call of rateLimitCalls(source)) {
      const args = optionsOf(call.text)
      if (/failClosed:\s*true/.test(args)) continue

      const constant = Object.keys(CONFIG_CONSTANTS).find(name => args.includes(name))
      if (constant && !args.includes('{')) {
        expect(CONFIG_CONSTANTS[constant].failClosed).toBe(true)
        continue
      }

      failOpen += 1
      expect({ file: relativePath, line: call.line + 1, annotated: hasAnnotationDirectlyAbove(lines, call.line) }).toEqual({
        file: relativePath,
        line: call.line + 1,
        annotated: true,
      })
    }

    expect(failOpen).toBe(FAIL_OPEN_ALLOWED[relativePath] ?? 0)
  })

  it('config constants passed as options all fail closed', () => {
    for (const [name, config] of Object.entries(CONFIG_CONSTANTS)) {
      expect({ name, failClosed: config.failClosed }).toEqual({ name, failClosed: true })
    }
  })

  it('does not change the helper default: omitting the flag still resolves false on an RPC error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc unavailable' } })
    await expect(checkRateLimit('default-posture:u1')).resolves.toBe(false)
  })
})
