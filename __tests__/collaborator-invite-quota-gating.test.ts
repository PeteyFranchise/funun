import fs from 'node:fs'
import path from 'node:path'

// ─── Every caller of sendCollaboratorInvite is quota-gated ─────────────────
// Walks app/ and lib/ (non-test sources). Any file that calls
// sendCollaboratorInvite must also call isCollaboratorInviteRateLimited
// earlier in the same file, so a new send path cannot skip the per-sender
// quota.

function listSources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listSources(full)
    if (!/\.(ts|tsx)$/.test(entry.name)) return []
    if (/\.test\.(ts|tsx)$/.test(entry.name)) return []
    return [full]
  })
}

function codeLines(source: string): string[] {
  return source.split('\n').map(line => {
    const trimmed = line.trim()
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') ? '' : line
  })
}

const DEFINITION_FILE = path.join('lib', 'collaborators', 'invite.ts')

const files = [
  ...listSources(path.join(process.cwd(), 'app')),
  ...listSources(path.join(process.cwd(), 'lib')),
].map(f => path.relative(process.cwd(), f))

describe('sendCollaboratorInvite callers', () => {
  const callers = files.filter(f => {
    if (f === DEFINITION_FILE) return false
    return codeLines(fs.readFileSync(f, 'utf8')).some(line => line.includes('sendCollaboratorInvite('))
  })

  it('finds the known callers', () => {
    expect(callers).toEqual(
      expect.arrayContaining([
        'app/api/collaborators/[id]/invite/route.ts',
        'app/api/collaborators/quick-invite/route.ts',
        'app/api/works/[workId]/members/route.ts',
      ])
    )
  })

  it.each(callers)('%s checks isCollaboratorInviteRateLimited before it sends', relativePath => {
    const lines = codeLines(fs.readFileSync(relativePath, 'utf8'))
    const gate = lines.findIndex(line => line.includes('isCollaboratorInviteRateLimited('))
    const send = lines.findIndex(line => line.includes('sendCollaboratorInvite('))
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(send)
    // The gate answers with 429.
    const afterGate = lines.slice(gate, gate + 8).join('\n')
    expect(afterGate).toContain('status: 429')
  })
})

// ─── works/[workId]/members returns 429 before any insert or send ──────────
const WORK_ID = '11111111-1111-4111-8111-111111111111'
const CALLER = '22222222-2222-4222-8222-222222222222'

describe('POST /api/works/[workId]/members invite quota', () => {
  beforeEach(() => jest.resetModules())

  it('returns 429 with no roster lookup, insert, membership write or send', async () => {
    const from = jest.fn()
    const rpc = jest.fn()
    const send = jest.fn()
    const checkRateLimit = jest.fn(async () => true)
    jest.doMock('@/lib/supabase/server', () => ({
      createApiClient: jest.fn().mockResolvedValue({
        auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: CALLER } } }) },
        from,
      }),
      createServiceClient: jest.fn(() => ({ rpc, from })),
    }))
    jest.doMock('@/lib/accounts/member-api-gate', () => ({
      requireMemberApiAccount: jest.fn(async () => ({ ok: true, user: { id: CALLER } })),
    }))
    jest.doMock('@/lib/catalogue/access', () => ({
      createWorkAccessDeps: jest.fn(() => ({})),
      resolveWorkAccess: jest.fn(async () => ({ granted: true, tier: 'administer' })),
    }))
    jest.doMock('@/lib/collaborators/invite', () => ({ sendCollaboratorInvite: send }))
    jest.doMock('@/lib/security/rate-limit', () => ({ checkRateLimit }))

    const { POST } = await import('@/app/api/works/[workId]/members/route')
    const res = await POST(
      new Request('http://test.local/api/works/x/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: 'Jamie', email: 'jamie@example.com', tier: 'contribute', is_writer: false }),
      }),
      { params: Promise.resolve({ workId: WORK_ID }) }
    )

    expect(res.status).toBe(429)
    expect(checkRateLimit).toHaveBeenCalledWith(`collab-invite:hour:${CALLER}`, expect.objectContaining({ failClosed: true }))
    expect(from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })
})
