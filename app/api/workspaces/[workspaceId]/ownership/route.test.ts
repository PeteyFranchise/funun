import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { OWNERSHIP_TRANSFER_EFFECT } from '@/lib/workspaces/ownership-transfer'
import { GET, PATCH, POST } from './route'

// ─── WSR-08 / R-05 / R-22 — the two-sided workspace ownership route ────────
// Drives the REAL route handlers against in-memory Supabase stubs, so the
// assertions are on actual HTTP status codes and on the exact argument object
// handed to `.rpc()`.
//
// The assertion this file exists for is that THE ROUTE-SIDE PREDICATES BITE
// FIRST. The RPC refuses the same things, and migration 197's CHECKs refuse
// them a third time — that is the point of layers — but a layer that never
// runs is not a layer. Every refusal below that comes from
// `assertMayNominate`, `assertMayRespond` or `isLegalOwnershipTransition`
// asserts `rpcCalls` is empty, which is only true if the predicate ran.
//
// No database is touched. Migrations 197 and 198 are authored but UNAPPLIED;
// the stub below stands in for the RPCs they define.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const OWNER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SUCCESSOR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const OUTSIDER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const TRANSFER_ID = '11111111-1111-1111-1111-111111111111'

type Res = { data: unknown; error: { message: string; code?: string } | null }

const OFFERED_TRANSFER = {
  id: TRANSFER_ID,
  workspace_id: WORKSPACE_ID,
  from_user_id: OWNER_ID,
  to_user_id: SUCCESSOR_ID,
  offered_by: OWNER_ID,
  state: 'offered',
  responded_at: null,
  created_at: '2026-09-07T00:00:00.000Z',
}

/** Chainable, awaitable PostgREST stub. */
function thenable(get: () => Res) {
  const q: Record<string, unknown> = {}
  const self = () => q
  q.select = self
  q.eq = self
  q.in = self
  q.is = self
  q.order = self
  q.maybeSingle = self
  q.single = self
  q.then = (resolve: (value: Res) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(get()).then(resolve, reject)
  return q
}

function buildSessionClient(
  opts: { userId?: string; role?: string; transfers?: unknown[] } = {}
) {
  const tables: string[] = []
  return {
    tables,
    auth: {
      getUser: async () => ({ data: { user: { id: opts.userId ?? OWNER_ID, app_metadata: {} } } }),
    },
    from: jest.fn((table: string) => {
      tables.push(table)
      if (table === 'workspace_members') {
        return thenable(() => ({
          data: { role: opts.role ?? 'owner', status: 'active', expires_at: null },
          error: null,
        }))
      }
      // The RLS-scoped read of the diary. Migration 197's SELECT policy is the
      // filter in production; here the stub simply returns what a permitted
      // caller would see.
      if (table === 'workspace_ownership_transfers') {
        return thenable(() => ({ data: opts.transfers ?? [OFFERED_TRANSFER], error: null }))
      }
      throw new Error(`unexpected table on the session client: ${table}`)
    }),
  }
}

type RpcCall = { fn: string; args: Record<string, unknown> }

function buildServiceClient(
  opts: {
    accessEnabled?: boolean
    successorSeat?: Record<string, unknown> | null
    transfer?: Record<string, unknown> | null
    outcome?: string
    rpcError?: { message: string; code?: string }
  } = {}
) {
  const rpcCalls: RpcCall[] = []
  const tables: string[] = []
  const audits: Record<string, unknown>[] = []

  const client = {
    rpcCalls,
    tables,
    audits,
    rpc: jest.fn((fn: string, args: Record<string, unknown>) => {
      // The D-56 switch and D-55 cohort bound are resolved by the GATE, in
      // one service-role call to `workspace_access_permitted` (migration
      // 197). It is answered ABOVE the recorder deliberately: the suite
      // asserts the exact number of RPCs THIS ROUTE makes, and recording the
      // gate's own call would inflate every one of those counts. Threading
      // `accessEnabled` through it keeps the kill-switch cases honest.
      if (fn === 'workspace_access_permitted') {
        return thenable(() => ({
          data: [{ access_enabled: opts.accessEnabled !== false, cohort_ok: true }],
          error: null,
        }))
      }
      rpcCalls.push({ fn, args })
      return thenable(() =>
        opts.rpcError
          ? { data: null, error: opts.rpcError }
          : {
              data: {
                outcome: opts.outcome ?? 'ok',
                transfer_id: TRANSFER_ID,
                workspace_id: WORKSPACE_ID,
                audit_id: '99999999-9999-9999-9999-999999999999',
              },
              error: null,
            }
      )
    }),
    from: jest.fn((table: string) => {
      tables.push(table)

      if (table === 'workspace_access_config') {
        return thenable(() => ({ data: { enabled: opts.accessEnabled !== false }, error: null }))
      }

      if (table === 'workspace_members') {
        return thenable(() => ({
          data:
            opts.successorSeat === undefined
              ? { role: 'admin', status: 'active', expires_at: null }
              : opts.successorSeat,
          error: null,
        }))
      }

      if (table === 'workspace_ownership_transfers') {
        return thenable(() => ({
          data: opts.transfer === undefined ? OFFERED_TRANSFER : opts.transfer,
          error: null,
        }))
      }

      if (table === 'workspaces') {
        return thenable(() => ({ data: { name: 'Nour Studio' }, error: null }))
      }

      if (table === 'user_profiles') {
        return thenable(() => ({ data: { artist_name: 'Yara' }, error: null }))
      }

      if (table === 'workspace_audit_log') {
        return {
          insert: (row: Record<string, unknown>) => {
            audits.push(row)
            return thenable(() => ({ data: null, error: null }))
          },
        }
      }

      throw new Error(`unexpected table on the service client: ${table}`)
    }),
  }

  return client
}

function install(session: unknown, service: unknown) {
  ;(createApiClient as jest.Mock).mockResolvedValue(session)
  ;(createServiceClient as jest.Mock).mockReturnValue(service)
}

const params = Promise.resolve({ workspaceId: WORKSPACE_ID })

function jsonRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://funun.test/api/workspaces/w/ownership', {
    method,
    body: JSON.stringify(body),
  })
}

async function readBody(response: Response): Promise<{ error?: string; effect?: string }> {
  return (await response.json()) as { error?: string; effect?: string }
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── POST — nominate ───────────────────────────────────────────────────────
describe('POST /api/workspaces/[workspaceId]/ownership', () => {
  it('nominates, calls the RPC exactly once, and returns 201 with the effect sentence', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    const response = await POST(jsonRequest({ successorUserId: SUCCESSOR_ID }), { params })

    expect(response.status).toBe(201)
    expect(service.rpcCalls).toHaveLength(1)
    expect(service.rpcCalls[0].fn).toBe('workspace_nominate_owner')

    const body = await readBody(response)
    // Both parties are shown the SAME sentence, from the one exported helper.
    expect(body.effect).toContain(OWNERSHIP_TRANSFER_EFFECT)
    expect(body.effect).toContain('Nour Studio')
    expect(body.effect).toContain('Yara')
  })

  it('[R-21] passes only the proved actor id — no role reaches the RPC arguments', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    await POST(jsonRequest({ successorUserId: SUCCESSOR_ID }), { params })

    expect(service.rpcCalls[0].args).toEqual({
      p_actor_id: OWNER_ID,
      p_workspace_id: WORKSPACE_ID,
      p_successor_user_id: SUCCESSOR_ID,
    })
    expect(Object.keys(service.rpcCalls[0].args).some(name => name.includes('role'))).toBe(false)
  })

  it('[T-38.0.2-12-03] drops a role smuggled in the body via the allowlist, and never forwards it', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    const response = await POST(
      jsonRequest({ successorUserId: SUCCESSOR_ID, role: 'owner', p_actor_role: 'owner' }),
      { params }
    )

    expect(response.status).toBe(201)
    expect(service.rpcCalls[0].args).not.toHaveProperty('role')
    expect(service.rpcCalls[0].args).not.toHaveProperty('p_actor_role')
  })

  it('refuses a non-owner with 403 from canManageOwners, WITHOUT calling the RPC', async () => {
    const service = buildServiceClient()
    install(buildSessionClient({ role: 'admin' }), service)

    const response = await POST(jsonRequest({ successorUserId: SUCCESSOR_ID }), { params })

    expect(response.status).toBe(403)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('[R-05] refuses a self-nomination with 403 from assertMayNominate, WITHOUT calling the RPC', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    const response = await POST(jsonRequest({ successorUserId: OWNER_ID }), { params })

    expect(response.status).toBe(403)
    expect((await readBody(response)).error).toContain('nominate yourself')
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('refuses a successor with no live seat with 409 from assertMayNominate, WITHOUT calling the RPC', async () => {
    const service = buildServiceClient({ successorSeat: null })
    install(buildSessionClient(), service)

    const response = await POST(jsonRequest({ successorUserId: SUCCESSOR_ID }), { params })

    expect(response.status).toBe(409)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('treats an EXPIRED successor seat as not live, refusing before the RPC', async () => {
    const service = buildServiceClient({
      successorSeat: { role: 'contractor', status: 'active', expires_at: '2020-01-01T00:00:00Z' },
    })
    install(buildSessionClient(), service)

    const response = await POST(jsonRequest({ successorUserId: SUCCESSOR_ID }), { params })

    expect(response.status).toBe(409)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('refuses a successor who already owns the workspace with 409, WITHOUT calling the RPC', async () => {
    const service = buildServiceClient({
      successorSeat: { role: 'owner', status: 'active', expires_at: null },
    })
    install(buildSessionClient(), service)

    const response = await POST(jsonRequest({ successorUserId: SUCCESSOR_ID }), { params })

    expect(response.status).toBe(409)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('maps the nomination_open outcome to 409', async () => {
    const service = buildServiceClient({ outcome: 'nomination_open' })
    install(buildSessionClient(), service)

    const response = await POST(jsonRequest({ successorUserId: SUCCESSOR_ID }), { params })

    expect(response.status).toBe(409)
    expect((await readBody(response)).error).toContain('already open')
  })

  it('maps forbidden to 403 and already_owner to 409 from the RPC vocabulary', async () => {
    const forbidden = buildServiceClient({ outcome: 'forbidden' })
    install(buildSessionClient(), forbidden)
    expect((await POST(jsonRequest({ successorUserId: SUCCESSOR_ID }), { params })).status).toBe(403)

    const alreadyOwner = buildServiceClient({ outcome: 'already_owner' })
    install(buildSessionClient(), alreadyOwner)
    expect((await POST(jsonRequest({ successorUserId: SUCCESSOR_ID }), { params })).status).toBe(409)
  })

  it('maps the Postgres deadlock code 40P01 to a retry-safe 409, never 500', async () => {
    const service = buildServiceClient({ rpcError: { message: 'deadlock detected', code: '40P01' } })
    install(buildSessionClient(), service)

    const response = await POST(jsonRequest({ successorUserId: SUCCESSOR_ID }), { params })

    expect(response.status).toBe(409)
    expect((await readBody(response)).error).toContain('try again')
  })

  it('maps the Postgres lock-timeout code 55P03 to a retry-safe 409', async () => {
    const service = buildServiceClient({ rpcError: { message: 'lock not available', code: '55P03' } })
    install(buildSessionClient(), service)

    expect((await POST(jsonRequest({ successorUserId: SUCCESSOR_ID }), { params })).status).toBe(409)
  })

  it('fails closed with 503 when the D-56 kill switch is off, calling no RPC', async () => {
    const service = buildServiceClient({ accessEnabled: false })
    install(buildSessionClient(), service)

    const response = await POST(jsonRequest({ successorUserId: SUCCESSOR_ID }), { params })

    expect(response.status).toBe(503)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('refuses a malformed successorUserId with 400, calling no RPC', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    const response = await POST(jsonRequest({ successorUserId: 'not-a-uuid' }), { params })

    expect(response.status).toBe(400)
    expect(service.rpcCalls).toHaveLength(0)
  })
})

// ─── GET — list ────────────────────────────────────────────────────────────
describe('GET /api/workspaces/[workspaceId]/ownership', () => {
  it('lists nominations through the RLS-scoped session client, never the service client', async () => {
    const service = buildServiceClient()
    const session = buildSessionClient()
    install(session, service)

    const response = await GET(new Request('https://funun.test/x'), { params })

    expect(response.status).toBe(200)
    // The diary read happens on the session client so migration 197's SELECT
    // policy is the filter. The service client only ever saw the kill-switch
    // config row.
    expect(session.tables).toContain('workspace_ownership_transfers')
    expect(service.tables).not.toContain('workspace_ownership_transfers')
  })

  it('is readable by an ordinary member — listing is gated on access, not on canManageOwners', async () => {
    const service = buildServiceClient()
    install(buildSessionClient({ role: 'member' }), service)

    expect((await GET(new Request('https://funun.test/x'), { params })).status).toBe(200)
  })
})

// ─── PATCH — respond ───────────────────────────────────────────────────────
describe('PATCH /api/workspaces/[workspaceId]/ownership', () => {
  it('lets the named successor accept, calling the RPC exactly once', async () => {
    const service = buildServiceClient()
    install(buildSessionClient({ userId: SUCCESSOR_ID, role: 'admin' }), service)

    const response = await PATCH(
      jsonRequest({ transferId: TRANSFER_ID, action: 'accept' }, 'PATCH'),
      { params }
    )

    expect(response.status).toBe(200)
    expect(service.rpcCalls).toHaveLength(1)
    expect(service.rpcCalls[0].fn).toBe('workspace_respond_ownership_nomination')
    expect(service.rpcCalls[0].args).toEqual({
      p_actor_id: SUCCESSOR_ID,
      p_transfer_id: TRANSFER_ID,
      p_action: 'accept',
      p_expected_state: 'offered',
    })
    // The RPC owns the audit rows; a route-side audit write would be a second
    // writer (T-38.0.2-12-06).
    expect(service.audits).toHaveLength(0)
  })

  it('[R-05] refuses the NOMINATOR accepting their own nomination — at the ROUTE, WITHOUT calling the RPC', async () => {
    // The RPC refuses this too, and migration 197's CHECK (offered_by <>
    // to_user_id) refuses it a third time. This test proves the FIRST layer
    // bites: assertMayRespond returns 403 before any RPC call is made.
    const service = buildServiceClient()
    install(buildSessionClient({ userId: OWNER_ID, role: 'owner' }), service)

    const response = await PATCH(
      jsonRequest({ transferId: TRANSFER_ID, action: 'accept' }, 'PATCH'),
      { params }
    )

    expect(response.status).toBe(403)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('refuses a third party accepting with 403, WITHOUT calling the RPC', async () => {
    const service = buildServiceClient()
    install(buildSessionClient({ userId: OUTSIDER_ID, role: 'admin' }), service)

    const response = await PATCH(
      jsonRequest({ transferId: TRANSFER_ID, action: 'accept' }, 'PATCH'),
      { params }
    )

    expect(response.status).toBe(403)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('refuses the successor WITHDRAWING a nomination made to them, WITHOUT calling the RPC', async () => {
    const service = buildServiceClient()
    install(buildSessionClient({ userId: SUCCESSOR_ID, role: 'admin' }), service)

    const response = await PATCH(
      jsonRequest({ transferId: TRANSFER_ID, action: 'withdraw' }, 'PATCH'),
      { params }
    )

    expect(response.status).toBe(403)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('lets the incumbent withdraw their own nomination', async () => {
    const service = buildServiceClient()
    install(buildSessionClient({ userId: OWNER_ID, role: 'owner' }), service)

    const response = await PATCH(
      jsonRequest({ transferId: TRANSFER_ID, action: 'withdraw' }, 'PATCH'),
      { params }
    )

    expect(response.status).toBe(200)
    expect(service.rpcCalls).toHaveLength(1)
  })

  it('refuses a response to an ALREADY-RESOLVED nomination with 409, WITHOUT calling the RPC', async () => {
    const service = buildServiceClient({
      transfer: { ...OFFERED_TRANSFER, state: 'declined' },
    })
    install(buildSessionClient({ userId: SUCCESSOR_ID, role: 'admin' }), service)

    const response = await PATCH(
      jsonRequest({ transferId: TRANSFER_ID, action: 'accept' }, 'PATCH'),
      { params }
    )

    expect(response.status).toBe(409)
    // isLegalOwnershipTransition names the terminal state before the RPC runs.
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('maps the stale outcome to 409 and forwards the caller’s expectedState as the CAS token', async () => {
    const service = buildServiceClient({ outcome: 'stale' })
    install(buildSessionClient({ userId: SUCCESSOR_ID, role: 'admin' }), service)

    const response = await PATCH(
      jsonRequest(
        { transferId: TRANSFER_ID, action: 'accept', expectedState: 'offered' },
        'PATCH'
      ),
      { params }
    )

    expect(response.status).toBe(409)
    expect(service.rpcCalls[0].args).toMatchObject({ p_expected_state: 'offered' })
  })

  it('maps already_resolved to 409 and not_found to 404', async () => {
    const resolved = buildServiceClient({ outcome: 'already_resolved' })
    install(buildSessionClient({ userId: SUCCESSOR_ID, role: 'admin' }), resolved)
    expect(
      (await PATCH(jsonRequest({ transferId: TRANSFER_ID, action: 'accept' }, 'PATCH'), { params }))
        .status
    ).toBe(409)

    const missing = buildServiceClient({ outcome: 'not_found' })
    install(buildSessionClient({ userId: SUCCESSOR_ID, role: 'admin' }), missing)
    expect(
      (await PATCH(jsonRequest({ transferId: TRANSFER_ID, action: 'accept' }, 'PATCH'), { params }))
        .status
    ).toBe(404)
  })

  it('maps nominator_no_longer_owner to 409', async () => {
    const service = buildServiceClient({ outcome: 'nominator_no_longer_owner' })
    install(buildSessionClient({ userId: SUCCESSOR_ID, role: 'admin' }), service)

    const response = await PATCH(
      jsonRequest({ transferId: TRANSFER_ID, action: 'accept' }, 'PATCH'),
      { params }
    )

    expect(response.status).toBe(409)
  })

  it('maps successor_no_longer_a_member to 409, never letting it fall through to a 500', async () => {
    // Migration 198 section (e) added this code beyond the planned vocabulary.
    // It closes the symmetric hole: if the successor's seat lapsed between
    // nomination and accept, the promotion would match zero rows while the
    // demotion matched one — demoting the only owner.
    const service = buildServiceClient({ outcome: 'successor_no_longer_a_member' })
    install(buildSessionClient({ userId: SUCCESSOR_ID, role: 'admin' }), service)

    const response = await PATCH(
      jsonRequest({ transferId: TRANSFER_ID, action: 'accept' }, 'PATCH'),
      { params }
    )

    expect(response.status).toBe(409)
    expect((await readBody(response)).error).toContain('no longer holds an active seat')
  })

  it('degrades an unrecognised outcome code to 400, never a 500', async () => {
    const service = buildServiceClient({ outcome: 'a_code_from_a_future_migration' })
    install(buildSessionClient({ userId: SUCCESSOR_ID, role: 'admin' }), service)

    const response = await PATCH(
      jsonRequest({ transferId: TRANSFER_ID, action: 'accept' }, 'PATCH'),
      { params }
    )

    expect(response.status).toBe(400)
  })

  it.each(['40P01', '55P03'])('maps the Postgres lock code %s to a retry-safe 409', async code => {
    const service = buildServiceClient({ rpcError: { message: 'lock', code } })
    install(buildSessionClient({ userId: SUCCESSOR_ID, role: 'admin' }), service)

    const response = await PATCH(
      jsonRequest({ transferId: TRANSFER_ID, action: 'accept' }, 'PATCH'),
      { params }
    )

    expect(response.status).toBe(409)
  })

  it('returns 404 for a transfer belonging to another workspace, WITHOUT calling the RPC', async () => {
    const service = buildServiceClient({ transfer: null })
    install(buildSessionClient({ userId: SUCCESSOR_ID, role: 'admin' }), service)

    const response = await PATCH(
      jsonRequest({ transferId: TRANSFER_ID, action: 'accept' }, 'PATCH'),
      { params }
    )

    expect(response.status).toBe(404)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('refuses an unknown action with 400, calling no RPC', async () => {
    const service = buildServiceClient()
    install(buildSessionClient({ userId: SUCCESSOR_ID, role: 'admin' }), service)

    const response = await PATCH(
      jsonRequest({ transferId: TRANSFER_ID, action: 'seize' }, 'PATCH'),
      { params }
    )

    expect(response.status).toBe(400)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('does NOT gate on canManageOwners — a non-owner successor can still accept', async () => {
    // The regression this guards: an owner-only gate here would make the
    // two-sided act impossible, because the successor is by definition not yet
    // an owner. A `guest` is the strongest form of that case.
    const service = buildServiceClient()
    install(buildSessionClient({ userId: SUCCESSOR_ID, role: 'guest' }), service)

    const response = await PATCH(
      jsonRequest({ transferId: TRANSFER_ID, action: 'accept' }, 'PATCH'),
      { params }
    )

    expect(response.status).toBe(200)
    expect(service.rpcCalls).toHaveLength(1)
  })

  it('fails closed with 503 when the D-56 kill switch is off, calling no RPC', async () => {
    const service = buildServiceClient({ accessEnabled: false })
    install(buildSessionClient({ userId: SUCCESSOR_ID, role: 'admin' }), service)

    const response = await PATCH(
      jsonRequest({ transferId: TRANSFER_ID, action: 'accept' }, 'PATCH'),
      { params }
    )

    expect(response.status).toBe(503)
    expect(service.rpcCalls).toHaveLength(0)
  })
})
