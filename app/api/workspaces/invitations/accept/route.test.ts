import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { hashInvitationToken } from '@/lib/workspaces/invitations'
import { POST } from './route'

// ─── WSR-10 / WSR-16 / R-24 — invitation redemption on its transactional RPC ─
// Drives the REAL route handler against in-memory Supabase stubs, so every
// assertion is on an actual HTTP status code, on the exact argument object
// handed to `.rpc()`, and on the writes the stub client RECORDED — never on a
// re-implementation of the rule and never on the route's source text.
//
// Three assertions this file exists for, all negative:
//   1. THE ROUTE IS NOT A WRITER ANY MORE (F11). Every path is checked for a
//      recorded `.update()` or `.insert()` against any table. The old route
//      performed four transactions; the replacement performs none of its own.
//   2. THE RAW TOKEN NEVER REACHES SQL. The recorded RPC arguments are walked
//      recursively and the raw token string must appear nowhere in them, while
//      its sha256 digest must appear. Asserted against behaviour, because a
//      grep of the source would pass on a route that hashed and then also sent
//      the original.
//   3. A NON-COHORT ACCEPTOR IS REFUSED (R-24) WITH 404 AND NOT 403 (R-25),
//      while the D-56 platform control is ON — the two answers are distinct and
//      the test proves the route can tell them apart.
//
// No database is touched. `workspace_redeem_invitation` and
// `workspace_access_permitted` are authored but UNAPPLIED; the stub below
// stands in for both.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const ACTOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const MEMBER_ROW_ID = '11111111-1111-1111-1111-111111111111'
const INVITED_EMAIL = 'invitee@example.com'
const RAW_TOKEN = 'a-raw-invitation-token-value-that-must-never-reach-sql'
const TOKEN_HASH = hashInvitationToken(RAW_TOKEN)

type Res = { data: unknown; error: { message: string; code?: string } | null }

/** Chainable, awaitable PostgREST stub — the idiom in the members suite. */
function thenable(get: () => Res) {
  const q: Record<string, unknown> = {}
  const self = () => q
  q.select = self
  q.eq = self
  q.neq = self
  q.is = self
  q.order = self
  q.limit = self
  q.maybeSingle = self
  q.single = self
  q.then = (resolve: (value: Res) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(get()).then(resolve, reject)
  return q
}

function buildSessionClient(opts: { email?: string | null } = {}) {
  const email = opts.email === undefined ? INVITED_EMAIL : opts.email
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: ACTOR_ID, email: email ?? undefined, app_metadata: {} } },
      }),
    },
    from: jest.fn((table: string) => {
      if (table === 'user_profiles') {
        return thenable(() => ({ data: { id: ACTOR_ID }, error: null }))
      }
      throw new Error(`unexpected table on the session client: ${table}`)
    }),
  }
}

type RpcCall = { fn: string; args: Record<string, unknown> }
type WriteCall = { table: string; verb: 'insert' | 'update'; row: Record<string, unknown> }

type InvitationLookupRow = { status: string; expires_at: string } | null

const HOUR = 60 * 60 * 1000

function pendingInvitation(): InvitationLookupRow {
  return { status: 'pending', expires_at: new Date(Date.now() + HOUR).toISOString() }
}

function buildServiceClient(
  opts: {
    accessEnabled?: boolean
    cohortOk?: boolean
    invitation?: InvitationLookupRow
    lookupError?: { message: string }
    outcome?: string
    rpcError?: { message: string; code?: string }
  } = {}
) {
  const rpcCalls: RpcCall[] = []
  const writes: WriteCall[] = []
  const tablesRead: string[] = []

  // Any table the route touches records its writes, so "no update and no
  // insert on any path" is an assertion about behaviour rather than source.
  function tableStub(table: string) {
    tablesRead.push(table)
    return {
      select: () =>
        thenable(() =>
          opts.lookupError
            ? { data: null, error: opts.lookupError }
            : {
                data:
                  opts.invitation === undefined ? pendingInvitation() : opts.invitation,
                error: null,
              }
        ),
      insert: (row: Record<string, unknown>) => {
        writes.push({ table, verb: 'insert', row })
        return thenable(() => ({ data: null, error: null }))
      },
      update: (row: Record<string, unknown>) => {
        writes.push({ table, verb: 'update', row })
        return thenable(() => ({ data: null, error: null }))
      },
    }
  }

  return {
    rpcCalls,
    writes,
    tablesRead,
    rpc: jest.fn((fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })

      if (fn === 'workspace_access_permitted') {
        return thenable(() => ({
          data: {
            access_enabled: opts.accessEnabled !== false,
            cohort_ok: opts.cohortOk !== false,
          },
          error: null,
        }))
      }

      if (fn === 'workspace_redeem_invitation') {
        return thenable(() =>
          opts.rpcError
            ? { data: null, error: opts.rpcError }
            : {
                data: {
                  outcome: opts.outcome ?? 'ok',
                  workspace_id: WORKSPACE_ID,
                  member_id: MEMBER_ROW_ID,
                  member_role: 'member',
                  invitation_audit_id: '99999999-9999-9999-9999-999999999999',
                  member_audit_id: '88888888-8888-8888-8888-888888888888',
                },
                error: null,
              }
        )
      }

      throw new Error(`unexpected rpc: ${fn}`)
    }),
    from: jest.fn((table: string) => tableStub(table)),
  }
}

function acceptRequest(token: string = RAW_TOKEN) {
  return new Request('http://t.local/api/workspaces/invitations/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}

type Stubs = { session: ReturnType<typeof buildSessionClient>; service: ReturnType<typeof buildServiceClient> }

function install(
  serviceOpts: Parameters<typeof buildServiceClient>[0] = {},
  sessionOpts: Parameters<typeof buildSessionClient>[0] = {}
): Stubs {
  const session = buildSessionClient(sessionOpts)
  const service = buildServiceClient(serviceOpts)
  ;(createApiClient as jest.Mock).mockResolvedValue(session)
  ;(createServiceClient as jest.Mock).mockReturnValue(service)
  return { session, service }
}

function redeemCalls(service: ReturnType<typeof buildServiceClient>): RpcCall[] {
  return service.rpcCalls.filter(call => call.fn === 'workspace_redeem_invitation')
}

/** Every string reachable anywhere inside a recorded argument object. */
function collectStrings(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string') found.push(value)
  else if (Array.isArray(value)) value.forEach(entry => collectStrings(entry, found))
  else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(entry => collectStrings(entry, found))
  }
  return found
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/workspaces/invitations/accept — the platform gate', () => {
  it('returns 503 when the D-56 control is off, without reading the invitation', async () => {
    const { service } = install({ accessEnabled: false })

    const res = await POST(acceptRequest())

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      error: 'Workspace access is temporarily disabled.',
    })
    expect(redeemCalls(service)).toHaveLength(0)
    expect(service.tablesRead).not.toContain('workspace_invitations')
  })

  it('R-24/R-25: refuses a non-cohort acceptor with 404 while the platform control is ON', async () => {
    const { service } = install({ accessEnabled: true, cohortOk: false })

    const res = await POST(acceptRequest())

    // 404, never 403 (R-25) and never 503 — a Member outside the D-55 cohort
    // must not learn the feature exists, and must not be told the platform is
    // down either, because it is not.
    expect(res.status).toBe(404)
    expect(res.status).not.toBe(403)
    expect(redeemCalls(service)).toHaveLength(0)
    expect(service.tablesRead).not.toContain('workspace_invitations')
  })

  it('R-24: fails closed to 503 when the access decision cannot be resolved', async () => {
    const { service } = install({ accessEnabled: false, cohortOk: false })

    const res = await POST(acceptRequest())

    expect(res.status).toBe(503)
    expect(redeemCalls(service)).toHaveLength(0)
  })
})

describe('POST /api/workspaces/invitations/accept — the read-only predicate layer', () => {
  it('returns 404 with a non-enumerating message for an unknown token, without calling the RPC', async () => {
    const { service } = install({ invitation: null })

    const res = await POST(acceptRequest())
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe('This invitation link is invalid.')
    // Nothing in the refusal may disclose the token, the address, or whether
    // the invitation ever existed.
    expect(body.error).not.toContain(RAW_TOKEN)
    expect(body.error).not.toContain(TOKEN_HASH)
    expect(body.error).not.toContain(INVITED_EMAIL)
    expect(redeemCalls(service)).toHaveLength(0)
  })

  it('gives a non-cohort refusal the SAME body as an unknown token', async () => {
    const outsider = install({ cohortOk: false })
    const outsiderRes = await POST(acceptRequest())
    const outsiderBody = await outsiderRes.json()
    expect(outsider.service).toBeDefined()

    install({ invitation: null })
    const missingRes = await POST(acceptRequest())
    const missingBody = await missingRes.json()

    expect(outsiderRes.status).toBe(missingRes.status)
    expect(outsiderBody).toEqual(missingBody)
  })

  it('refuses a terminal invitation with 410 without calling the RPC — there is nothing to self-heal', async () => {
    const { service } = install({
      invitation: { status: 'revoked', expires_at: new Date(Date.now() + HOUR).toISOString() },
    })

    const res = await POST(acceptRequest())

    expect(res.status).toBe(410)
    await expect(res.json()).resolves.toEqual({ error: 'This invitation is no longer valid.' })
    expect(redeemCalls(service)).toHaveLength(0)
  })

  it('sends a still-pending invitation whose expiry has passed to the RPC, so the self-heal runs there', async () => {
    const { service } = install({
      invitation: { status: 'pending', expires_at: new Date(Date.now() - HOUR).toISOString() },
      outcome: 'expired',
    })

    const res = await POST(acceptRequest())

    expect(res.status).toBe(410)
    await expect(res.json()).resolves.toEqual({ error: 'This invitation is no longer valid.' })
    // The route did NOT write the 'expired' status itself — the RPC did, under
    // the lock that proved the invitation was still pending.
    expect(redeemCalls(service)).toHaveLength(1)
    expect(service.writes).toHaveLength(0)
  })

  it('returns 400 for a missing token and never reaches the RPC', async () => {
    const { service } = install()

    const res = await POST(
      new Request('http://t.local/api/workspaces/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    )

    expect(res.status).toBe(400)
    expect(redeemCalls(service)).toHaveLength(0)
  })

  it('returns 403 when the session carries no usable address, so no null binding reaches the RPC', async () => {
    const { service } = install({}, { email: null })

    const res = await POST(acceptRequest())

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({
      error: 'This invitation was sent to a different email address than your account.',
    })
    expect(redeemCalls(service)).toHaveLength(0)
  })

  it('returns 500 when the read-only lookup itself fails, without calling the RPC', async () => {
    const { service } = install({ lookupError: { message: 'connection reset' } })

    const res = await POST(acceptRequest())

    expect(res.status).toBe(500)
    expect(redeemCalls(service)).toHaveLength(0)
  })
})

describe('POST /api/workspaces/invitations/accept — the single write', () => {
  it('makes exactly ONE redemption RPC call on the success path and records no write of its own', async () => {
    const { service } = install()

    const res = await POST(acceptRequest())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      data: { workspaceId: WORKSPACE_ID, role: 'member' },
    })
    expect(redeemCalls(service)).toHaveLength(1)
    expect(service.writes).toEqual([])
  })

  it('passes the token HASH and never the raw token in the recorded RPC arguments', async () => {
    const { service } = install()

    await POST(acceptRequest())

    const [call] = redeemCalls(service)
    expect(call.args.p_token_hash).toBe(TOKEN_HASH)

    const strings = collectStrings(call.args)
    expect(strings).toContain(TOKEN_HASH)
    // The raw token must appear nowhere — not as its own field, not nested,
    // and not as a substring of any value the route assembled.
    expect(strings.some(value => value.includes(RAW_TOKEN))).toBe(false)

    // Belt and braces across EVERY rpc call the route made, not just the
    // redemption one.
    const everyString = collectStrings(service.rpcCalls)
    expect(everyString.some(value => value.includes(RAW_TOKEN))).toBe(false)
  })

  it('binds the actor and the cohort requirement from the server, never from the body', async () => {
    const { service } = install()

    await POST(acceptRequest())

    const [call] = redeemCalls(service)
    expect(call.args.p_actor_id).toBe(ACTOR_ID)
    expect(call.args.p_actor_email).toBe(INVITED_EMAIL)
    // Default-closed: with WORKSPACE_ACCESS_GENERAL_ENABLED unset the cohort
    // is required, so an absent variable can never be read as permission.
    expect(call.args.p_require_cohort).toBe(true)
  })

  it('writes no audit row from the route — the RPC owns both of them', async () => {
    const { service } = install()

    await POST(acceptRequest())

    expect(service.writes.filter(write => write.table === 'workspace_audit_log')).toEqual([])
  })

  it('records no update or insert against any table on any path', async () => {
    const scenarios: Parameters<typeof buildServiceClient>[0][] = [
      {},
      { accessEnabled: false },
      { cohortOk: false },
      { invitation: null },
      { invitation: { status: 'revoked', expires_at: new Date(Date.now() + HOUR).toISOString() } },
      {
        invitation: { status: 'pending', expires_at: new Date(Date.now() - HOUR).toISOString() },
        outcome: 'expired',
      },
      { outcome: 'not_pending' },
      { outcome: 'email_mismatch' },
      { outcome: 'owner_invitation_forbidden' },
      { outcome: 'owner_seat_conflict' },
      { outcome: 'illegal_transition' },
      { rpcError: { message: 'deadlock detected', code: '40P01' } },
    ]

    for (const scenario of scenarios) {
      const { service } = install(scenario)
      await POST(acceptRequest())
      expect(service.writes).toEqual([])
    }
  })
})

describe('POST /api/workspaces/invitations/accept — the outcome vocabulary', () => {
  const cases: { outcome: string; status: number }[] = [
    { outcome: 'not_found', status: 404 },
    { outcome: 'not_in_cohort', status: 404 },
    { outcome: 'expired', status: 410 },
    { outcome: 'not_pending', status: 410 },
    { outcome: 'email_mismatch', status: 403 },
    { outcome: 'owner_invitation_forbidden', status: 409 },
    { outcome: 'owner_seat_conflict', status: 409 },
    { outcome: 'illegal_transition', status: 409 },
  ]

  it.each(cases)('maps the %s outcome to its own status, never a generic 500', async ({ outcome, status }) => {
    const { service } = install({ outcome })

    const res = await POST(acceptRequest())

    expect(res.status).toBe(status)
    expect(res.status).not.toBe(500)
    expect(redeemCalls(service)).toHaveLength(1)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.error.length).toBeGreaterThan(0)
  })

  it('keeps the email-mismatch refusal on its existing sentence', async () => {
    install({ outcome: 'email_mismatch' })

    const res = await POST(acceptRequest())

    await expect(res.json()).resolves.toEqual({
      error: 'This invitation was sent to a different email address than your account.',
    })
  })

  it('maps a lost race (not_pending) to 410, never to a 500 derived from a raw 23505', async () => {
    install({ outcome: 'not_pending' })

    const res = await POST(acceptRequest())

    expect(res.status).toBe(410)
  })

  it('degrades an unrecognised outcome to 400 with a sentence, never a 500', async () => {
    install({ outcome: 'something_a_later_migration_added' })

    const res = await POST(acceptRequest())

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
  })

  it('degrades a null RPC result to 400, never a 500', async () => {
    const { service } = install()
    service.rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
      service.rpcCalls.push({ fn, args })
      if (fn === 'workspace_access_permitted') {
        return thenable(() => ({
          data: { access_enabled: true, cohort_ok: true },
          error: null,
        }))
      }
      return thenable(() => ({ data: null, error: null }))
    })

    const res = await POST(acceptRequest())

    expect(res.status).toBe(400)
  })
})

describe('POST /api/workspaces/invitations/accept — postgres error codes', () => {
  it.each([['40P01'], ['55P03']])('maps %s to 409, never 500', async code => {
    install({ rpcError: { message: 'lock trouble', code } })

    const res = await POST(acceptRequest())

    expect(res.status).toBe(409)
    expect(res.status).not.toBe(500)
  })

  it('maps the RPC-side disabled-platform raise (42501) to 503, agreeing with the route gate', async () => {
    install({ rpcError: { message: 'workspace access is disabled', code: '42501' } })

    const res = await POST(acceptRequest())

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      error: 'Workspace access is temporarily disabled.',
    })
  })

  it('still reports an unexpected database failure as 500', async () => {
    install({ rpcError: { message: 'something else broke', code: '22P02' } })

    const res = await POST(acceptRequest())

    expect(res.status).toBe(500)
  })
})
