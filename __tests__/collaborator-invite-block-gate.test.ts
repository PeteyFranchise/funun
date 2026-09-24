// Quick task 260922-quick-invite-block-bypass.
//
// The defect: migration 179's `BEFORE INSERT OR UPDATE OF email` trigger
// resolves a collaborator row's email to a confirmed Member and writes
// `claimed_by` with NO block predicate. Every collaborator write path that
// takes a caller-supplied email then hands that fact back — explicitly via
// `alreadyMember: true` (quick-invite, works members `admission`) or
// implicitly via `.select()` returning the row (POST /api/collaborators,
// PATCH /api/collaborators/[id]). So a person you blocked could confirm
// your Funūn membership by typing your email, which ROADMAP.md forbids.
//
// The fix is a pre-write gate, so the assertions below are deliberately
// about ABSENCE OF A WRITE, not merely about an error status: if the insert
// ran, the trigger already fired and the disclosure already happened,
// whatever the HTTP response then said.
//
// SCOPE PIN: this suite covers the BLOCKED case only. The hidden-member
// question (D-01a — whether an unblocked but hidden member's membership may
// be confirmed) is an open owner decision and is deliberately NOT settled
// here; the "still returns alreadyMember" cases below exist to pin that
// today's behaviour is unchanged for unblocked members.

import {
  mustBlockActionForEmail,
  BLOCKED_ACTION_ERROR,
  BLOCKED_ACTION_STATUS,
} from '@/lib/trust-safety/block-check'

const CALLER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TARGET = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const TARGET_EMAIL = 'blocked@example.com'
const WORK_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ROW_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

type BlockRow = { blocker_id: string; blocked_id: string }

// Chainable, thenable PostgREST builder spy — same shape as
// __tests__/block-enforcement.test.ts uses.
function tableBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'or', 'order', 'limit', 'in', 'is', 'ilike']) {
    builder[m] = jest.fn(() => builder)
  }
  builder.maybeSingle = jest.fn(async () => ({ data: rows[0] ?? null, error: null }))
  builder.single = jest.fn(async () => ({ data: rows[0] ?? null, error: null }))
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
  return builder
}

/**
 * A `collaborators` table stub that mirrors the exact chains these routes
 * use, and — critically — one that WOULD SUCCEED if the gate were removed.
 *
 * That is the point. A stub that blows up the moment the route proceeds
 * past the gate proves only "something changed"; this one proves the real
 * defect, because with the gate deleted the route inserts `inserted` (the
 * row the migration-179 trigger would have stamped with `claimed_by`) and
 * hands the blocked member's account straight back in a 200.
 */
function rosterTable(opts: { existing?: unknown; inserted?: unknown; updated?: unknown } = {}) {
  const lookupChain: Record<string, unknown> = {}
  for (const m of ['eq', 'ilike', 'is', 'order', 'limit']) {
    lookupChain[m] = jest.fn(() => lookupChain)
  }
  lookupChain.maybeSingle = jest.fn(async () => ({ data: opts.existing ?? null, error: null }))
  const select = jest.fn(() => lookupChain)

  const single = jest.fn(async () => ({ data: opts.inserted ?? null, error: null }))
  const insert = jest.fn(() => ({ select: jest.fn(() => ({ single })) }))

  const updateChain: Record<string, unknown> = {}
  updateChain.eq = jest.fn(() => updateChain)
  updateChain.select = jest.fn(() => ({
    single: jest.fn(async () => ({ data: opts.updated ?? null, error: null })),
  }))
  const update = jest.fn(() => updateChain)

  return { table: { select, insert, update }, select, insert, update }
}

/**
 * A service-role client standing in for the two things the gate touches:
 * the find_auth_user_id_by_email RPC (migration 177) and the `blocks` table
 * (via loadBlockedIds). Any other table/RPC throws, so a test that claims
 * "nothing else was touched" is actually enforced rather than assumed.
 */
function serviceClient(opts: {
  accountId?: string | null
  rpcError?: { message: string } | null
  blocks?: BlockRow[]
  extraRpc?: (fn: string, args: unknown) => Promise<unknown>
}) {
  const rpc = jest.fn(async (fn: string, args: unknown) => {
    if (fn === 'find_auth_user_id_by_email') {
      return { data: opts.accountId ?? null, error: opts.rpcError ?? null }
    }
    if (opts.extraRpc) return opts.extraRpc(fn, args)
    throw new Error(`Unexpected service rpc: ${fn}`)
  })
  const from = jest.fn((table: string) => {
    if (table === 'blocks') return tableBuilder(opts.blocks ?? [])
    throw new Error(`Unexpected service table: ${table}`)
  })
  return { rpc, from }
}

// ─────────────────────────────────────────────────────────────────────────
// 1. The gate itself
// ─────────────────────────────────────────────────────────────────────────
describe('lib/trust-safety/block-check — mustBlockActionForEmail', () => {
  it('does not resolve an identity at all for a blank email', async () => {
    const service = serviceClient({})
    expect(await mustBlockActionForEmail(service as never, CALLER, '   ')).toBe(false)
    expect(await mustBlockActionForEmail(service as never, CALLER, null)).toBe(false)
    expect(service.rpc).not.toHaveBeenCalled()
  })

  it('resolves the email normalized — trimmed and lowercased — and never echoes it', async () => {
    const service = serviceClient({ accountId: null })
    const result = await mustBlockActionForEmail(service as never, CALLER, '  Blocked@Example.COM ')
    expect(service.rpc).toHaveBeenCalledWith('find_auth_user_id_by_email', {
      p_email: TARGET_EMAIL,
    })
    // The return type is a bare boolean — there is no channel through which
    // the resolved account id or the email could reach a caller.
    expect(typeof result).toBe('boolean')
  })

  it('returns false, without reading blocks, when the email matches no account', async () => {
    const service = serviceClient({ accountId: null })
    expect(await mustBlockActionForEmail(service as never, CALLER, TARGET_EMAIL)).toBe(false)
    expect(service.from).not.toHaveBeenCalled()
  })

  it('returns true when the CALLER placed the block', async () => {
    const service = serviceClient({
      accountId: TARGET,
      blocks: [{ blocker_id: CALLER, blocked_id: TARGET }],
    })
    expect(await mustBlockActionForEmail(service as never, CALLER, TARGET_EMAIL)).toBe(true)
  })

  it('returns true when the TARGET placed the block — the direction the caller can never see', async () => {
    const service = serviceClient({
      accountId: TARGET,
      blocks: [{ blocker_id: TARGET, blocked_id: CALLER }],
    })
    expect(await mustBlockActionForEmail(service as never, CALLER, TARGET_EMAIL)).toBe(true)
  })

  it('returns false when an account exists but no block row does', async () => {
    const service = serviceClient({ accountId: TARGET, blocks: [] })
    expect(await mustBlockActionForEmail(service as never, CALLER, TARGET_EMAIL)).toBe(false)
  })

  it('returns false for a self-invite — the caller’s own email is not a block', async () => {
    const service = serviceClient({ accountId: CALLER, blocks: [] })
    expect(await mustBlockActionForEmail(service as never, CALLER, 'me@example.com')).toBe(false)
    // mustBlockActionBetween short-circuits on viewerId === otherId, so the
    // blocks table is never consulted for a self-invite.
    expect(service.from).not.toHaveBeenCalled()
  })

  it('fails CLOSED when the identity lookup errors — an unknown state is not a safe state', async () => {
    const service = serviceClient({ accountId: null, rpcError: { message: 'rpc unavailable' } })
    expect(await mustBlockActionForEmail(service as never, CALLER, TARGET_EMAIL)).toBe(true)
  })

  it('shares the generic, block-state-agnostic error used by every other gated route', () => {
    expect(BLOCKED_ACTION_ERROR.toLowerCase()).not.toContain('block')
    expect(BLOCKED_ACTION_STATUS).toBe(400)
  })
})


// The row the migration-179 trigger stamps: `claimed_by` set to the blocked
// member's account. Handing this back in ANY shape is the disclosure.
const CLAIMED_ROW = {
  id: ROW_ID,
  user_id: CALLER,
  name: 'Jamie',
  first_name: 'Jamie',
  email: TARGET_EMAIL,
  claimed_by: TARGET,
  status: 'confirmed',
  archived_at: null,
}

const BLOCK_DIRECTIONS: [string, BlockRow][] = [
  ['the caller placed the block', { blocker_id: CALLER, blocked_id: TARGET }],
  ['the target placed the block', { blocker_id: TARGET, blocked_id: CALLER }],
]

function mockAuth(service: ReturnType<typeof serviceClient>, collaborators: unknown) {
  jest.doMock('@/lib/supabase/server', () => ({
    createApiClient: jest.fn().mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: CALLER } } }) },
      from: jest.fn((table: string) => {
        if (table === 'collaborators') return collaborators
        throw new Error(`Unexpected table: ${table}`)
      }),
    }),
    createServiceClient: jest.fn(() => service),
  }))
  jest.doMock('@/lib/accounts/member-api-gate', () => ({
    requireMemberApiAccount: jest.fn(async () => ({ ok: true, user: { id: CALLER } })),
  }))
}

// ─────────────────────────────────────────────────────────────────────────
// 2. POST /api/collaborators/quick-invite — the EXPLICIT disclosure
//    (`alreadyMember: true`)
// ─────────────────────────────────────────────────────────────────────────
describe('POST /api/collaborators/quick-invite — pre-insert block gate', () => {
  beforeEach(() => jest.resetModules())

  function req(body: unknown) {
    return new Request('http://test.local/api/collaborators/quick-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it.each(BLOCK_DIRECTIONS)('creates NO row and sends no invite when %s', async (_label, block) => {
    const roster = rosterTable({ existing: null, inserted: CLAIMED_ROW })
    const sendCollaboratorInvite = jest.fn()
    mockAuth(serviceClient({ accountId: TARGET, blocks: [block] }), roster.table)
    jest.doMock('@/lib/collaborators/invite', () => ({ sendCollaboratorInvite }))

    const { POST } = await import('@/app/api/collaborators/quick-invite/route')
    const res = await POST(req({ first_name: 'Jamie', email: TARGET_EMAIL }))

    expect(res.status).toBe(BLOCKED_ACTION_STATUS)
    // The load-bearing assertion: NO ROW. If the insert ran, the trigger has
    // already stamped claimed_by and the disclosure already happened,
    // whatever the response then said.
    expect(roster.insert).not.toHaveBeenCalled()
    // Nor is the roster even read — nothing about it leaks either.
    expect(roster.select).not.toHaveBeenCalled()
    expect(sendCollaboratorInvite).not.toHaveBeenCalled()
  })

  it('returns the generic failure body verbatim — no alreadyMember, no row, no email, no account id', async () => {
    const roster = rosterTable({ existing: null, inserted: CLAIMED_ROW })
    mockAuth(
      serviceClient({ accountId: TARGET, blocks: [{ blocker_id: TARGET, blocked_id: CALLER }] }),
      roster.table
    )
    jest.doMock('@/lib/collaborators/invite', () => ({ sendCollaboratorInvite: jest.fn() }))

    const { POST } = await import('@/app/api/collaborators/quick-invite/route')
    const res = await POST(req({ first_name: 'Jamie', email: TARGET_EMAIL }))
    const raw = await res.text()

    // Byte-identical to the generic failure shape every other gated route
    // returns — no extra key to distinguish "blocked" from anything else.
    expect(raw).toBe(JSON.stringify({ error: BLOCKED_ACTION_ERROR }))
    expect(raw).not.toContain(TARGET_EMAIL)
    expect(raw).not.toContain(TARGET)
    expect(raw).not.toContain('alreadyMember')
    expect(raw).not.toContain('claimed_by')
  })

  it('still links an UNBLOCKED existing member and still returns alreadyMember (D-01a, unchanged)', async () => {
    const roster = rosterTable({ existing: CLAIMED_ROW })
    const sendCollaboratorInvite = jest.fn()
    mockAuth(serviceClient({ accountId: TARGET, blocks: [] }), roster.table)
    jest.doMock('@/lib/collaborators/invite', () => ({ sendCollaboratorInvite }))

    const { POST } = await import('@/app/api/collaborators/quick-invite/route')
    const res = await POST(req({ first_name: 'Jamie', email: TARGET_EMAIL }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.alreadyMember).toBe(true)
    expect(body.data.collaborator).toEqual(CLAIMED_ROW)
    expect(sendCollaboratorInvite).not.toHaveBeenCalled()
  })

  it('still invites an UNBLOCKED non-member exactly as before', async () => {
    const insertedRow = { id: ROW_ID, user_id: CALLER, name: 'Jamie', email: 'new@example.com' }
    const roster = rosterTable({ existing: null, inserted: insertedRow })
    const sendCollaboratorInvite = jest.fn(async () => ({
      ok: true,
      skipped: false,
      emailSent: true,
      inviteLink: 'https://funun.studio/signup?invite=tok',
    }))
    mockAuth(serviceClient({ accountId: null }), roster.table)
    jest.doMock('@/lib/collaborators/invite', () => ({ sendCollaboratorInvite }))

    const { POST } = await import('@/app/api/collaborators/quick-invite/route')
    const res = await POST(req({ first_name: 'Jamie', email: 'new@example.com' }))

    expect(res.status).toBe(200)
    expect(roster.insert).toHaveBeenCalled()
    expect(sendCollaboratorInvite).toHaveBeenCalled()
  })

  it('is unaffected by a self-invite — the caller may still add their own email', async () => {
    const insertedRow = { id: ROW_ID, user_id: CALLER, name: 'Me', email: 'me@example.com' }
    const roster = rosterTable({ existing: null, inserted: insertedRow })
    mockAuth(serviceClient({ accountId: CALLER, blocks: [] }), roster.table)
    jest.doMock('@/lib/collaborators/invite', () => ({
      sendCollaboratorInvite: jest.fn(async () => ({
        ok: true, skipped: false, emailSent: true, inviteLink: 'https://funun.studio/signup?invite=tok',
      })),
    }))

    const { POST } = await import('@/app/api/collaborators/quick-invite/route')
    const res = await POST(req({ first_name: 'Me', email: 'me@example.com' }))

    expect(res.status).toBe(200)
    expect(roster.insert).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 3. POST /api/collaborators — the IMPLICIT disclosure. No flag to notice:
//    the insert's own `.select()` returns the trigger-stamped row.
// ─────────────────────────────────────────────────────────────────────────
describe('POST /api/collaborators — pre-insert block gate', () => {
  beforeEach(() => jest.resetModules())

  function req(body: unknown) {
    return new Request('http://test.local/api/collaborators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it.each(BLOCK_DIRECTIONS)(
    'creates NO row when %s, so .select() has nothing to disclose',
    async (_label, block) => {
      const roster = rosterTable({ existing: null, inserted: CLAIMED_ROW })
      mockAuth(serviceClient({ accountId: TARGET, blocks: [block] }), roster.table)

      const { POST } = await import('@/app/api/collaborators/route')
      const res = await POST(req({ name: 'Jamie', email: TARGET_EMAIL }))
      const raw = await res.text()

      expect(res.status).toBe(BLOCKED_ACTION_STATUS)
      expect(raw).toBe(JSON.stringify({ error: BLOCKED_ACTION_ERROR }))
      expect(raw).not.toContain(TARGET)
      expect(raw).not.toContain('claimed_by')
      expect(roster.insert).not.toHaveBeenCalled()
      expect(roster.select).not.toHaveBeenCalled()
    }
  )

  it('still creates the row for an UNBLOCKED email', async () => {
    const inserted = { id: ROW_ID, user_id: CALLER, name: 'Jamie', email: 'new@example.com' }
    const roster = rosterTable({ existing: null, inserted })
    mockAuth(serviceClient({ accountId: null }), roster.table)

    const { POST } = await import('@/app/api/collaborators/route')
    const res = await POST(req({ name: 'Jamie', email: 'new@example.com' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: inserted, reused: false })
  })

  it('does not resolve an identity when the body carries no email', async () => {
    const inserted = { id: ROW_ID, user_id: CALLER, name: 'Jamie' }
    const roster = rosterTable({ inserted })
    const service = serviceClient({ accountId: null })
    mockAuth(service, roster.table)

    const { POST } = await import('@/app/api/collaborators/route')
    const res = await POST(req({ name: 'Jamie' }))

    expect(res.status).toBe(200)
    expect(service.rpc).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 4. PATCH /api/collaborators/[id] — same trigger, different verb. Migration
//    179 fires on `BEFORE INSERT OR UPDATE OF email`, so editing a card's
//    email discloses exactly what inserting one does.
// ─────────────────────────────────────────────────────────────────────────
describe('PATCH /api/collaborators/[id] — pre-update block gate', () => {
  beforeEach(() => jest.resetModules())

  function req(body: unknown) {
    return new Request(`http://test.local/api/collaborators/${ROW_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it.each(BLOCK_DIRECTIONS)('performs NO update when %s, so the trigger never fires', async (_label, block) => {
    const roster = rosterTable({ updated: CLAIMED_ROW })
    mockAuth(serviceClient({ accountId: TARGET, blocks: [block] }), roster.table)

    const { PATCH } = await import('@/app/api/collaborators/[id]/route')
    const res = await PATCH(req({ email: TARGET_EMAIL }), { params: Promise.resolve({ id: ROW_ID }) })
    const raw = await res.text()

    expect(res.status).toBe(BLOCKED_ACTION_STATUS)
    expect(raw).toBe(JSON.stringify({ error: BLOCKED_ACTION_ERROR }))
    expect(raw).not.toContain(TARGET)
    expect(raw).not.toContain('claimed_by')
    expect(roster.update).not.toHaveBeenCalled()
  })

  it('still updates an UNBLOCKED email', async () => {
    const row = { id: ROW_ID, user_id: CALLER, name: 'Jamie', email: 'new@example.com' }
    const roster = rosterTable({ updated: row })
    mockAuth(serviceClient({ accountId: null }), roster.table)

    const { PATCH } = await import('@/app/api/collaborators/[id]/route')
    const res = await PATCH(req({ email: 'new@example.com' }), {
      params: Promise.resolve({ id: ROW_ID }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: row })
    expect(roster.update).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@example.com' }))
  })

  it('does not resolve an identity for a patch that does not touch email', async () => {
    const row = { id: ROW_ID, user_id: CALLER, name: 'Jamie Rivera' }
    const roster = rosterTable({ updated: row })
    const service = serviceClient({ accountId: null })
    mockAuth(service, roster.table)

    const { PATCH } = await import('@/app/api/collaborators/[id]/route')
    const res = await PATCH(req({ name: 'Jamie Rivera' }), {
      params: Promise.resolve({ id: ROW_ID }),
    })

    expect(res.status).toBe(200)
    expect(service.rpc).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 5. POST /api/works/[workId]/members — the third insert path the audit
//    found. Same caller-supplied email, same trigger, and `admission`
//    ('direct-link' vs 'invite-required') discloses the same fact.
// ─────────────────────────────────────────────────────────────────────────
describe('POST /api/works/[workId]/members — pre-insert block gate', () => {
  beforeEach(() => jest.resetModules())

  function req(body: unknown) {
    return new Request(`http://test.local/api/works/${WORK_ID}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  // Lets the route complete a membership write if it ever gets there, so a
  // removed gate fails on the disclosure itself rather than on a stub.
  const addMember = async (fn: string) => {
    if (fn === 'add_work_member_transactional') return { data: { id: 'member-1' }, error: null }
    throw new Error(`Unexpected service rpc: ${fn}`)
  }

  function mockWorkDeps(service: ReturnType<typeof serviceClient>, collaborators: unknown) {
    mockAuth(service, collaborators)
    jest.doMock('@/lib/catalogue/access', () => ({
      createWorkAccessDeps: jest.fn(() => ({})),
      resolveWorkAccess: jest.fn(async () => ({ granted: true, tier: 'administer' })),
    }))
    jest.doMock('@/lib/collaborators/invite', () => ({ sendCollaboratorInvite: jest.fn() }))
  }

  it.each(BLOCK_DIRECTIONS)('creates NO collaborator row and no membership when %s', async (_label, block) => {
    const roster = rosterTable({ existing: null, inserted: CLAIMED_ROW })
    mockWorkDeps(
      serviceClient({ accountId: TARGET, blocks: [block], extraRpc: addMember }),
      roster.table
    )

    const { POST } = await import('@/app/api/works/[workId]/members/route')
    const res = await POST(
      req({ first_name: 'Jamie', email: TARGET_EMAIL, tier: 'contribute', is_writer: false }),
      { params: Promise.resolve({ workId: WORK_ID }) }
    )
    const raw = await res.text()

    expect(res.status).toBe(BLOCKED_ACTION_STATUS)
    expect(raw).toBe(JSON.stringify({ error: BLOCKED_ACTION_ERROR }))
    expect(raw).not.toContain('admission')
    expect(raw).not.toContain(TARGET)
    expect(roster.insert).not.toHaveBeenCalled()
    expect(roster.select).not.toHaveBeenCalled()
  })

  it('still adds an UNBLOCKED collaborator by email', async () => {
    const inserted = { id: ROW_ID, name: 'Jamie', email: 'new@example.com', claimed_by: null }
    const roster = rosterTable({ existing: null, inserted })
    mockWorkDeps(serviceClient({ accountId: null, extraRpc: addMember }), roster.table)

    const { POST } = await import('@/app/api/works/[workId]/members/route')
    const res = await POST(
      req({ first_name: 'Jamie', email: 'new@example.com', tier: 'contribute', is_writer: false }),
      { params: Promise.resolve({ workId: WORK_ID }) }
    )

    expect(res.status).toBe(200)
    expect(roster.insert).toHaveBeenCalled()
  })

  it('does not resolve an identity for the existing-collaborator_id branch (no email is supplied)', async () => {
    const existing = { id: ROW_ID, name: 'Jamie', email: 'known@example.com', claimed_by: null }
    const roster = rosterTable({ existing })
    const service = serviceClient({ accountId: null, extraRpc: addMember })
    mockWorkDeps(service, roster.table)

    const { POST } = await import('@/app/api/works/[workId]/members/route')
    const res = await POST(req({ collaborator_id: ROW_ID, tier: 'contribute', is_writer: false }), {
      params: Promise.resolve({ workId: WORK_ID }),
    })

    expect(res.status).toBe(200)
    expect(service.rpc).not.toHaveBeenCalledWith('find_auth_user_id_by_email', expect.anything())
  })
})
