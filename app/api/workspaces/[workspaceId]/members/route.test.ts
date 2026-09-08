import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { WORKSPACE_OWNER_FLOOR_MESSAGE } from '@/lib/workspaces/membership'
import { DELETE, GET, PATCH } from './route'

// ─── WSR-07 / WSR-11 — the members route on top of the transactional RPC ───
// Drives the REAL route handlers against in-memory Supabase stubs, so the
// assertions are on actual HTTP status codes and on the exact argument object
// handed to `.rpc()` — not on a re-implementation of the rule.
//
// Two assertions this file exists for, both negative:
//   1. THE ROUTE IS NOT A SECOND WRITER. Every mutating request produces
//      exactly ONE `.rpc()` call and no `.update()` against
//      workspace_members, and every route-side predicate that refuses does so
//      WITHOUT calling the RPC at all — which is what makes those predicates
//      a real first layer rather than decoration.
//   2. NO CALLER-SUPPLIED ROLE REACHES THE RPC AS AUTHORITY. The recorded
//      argument object is inspected directly, so the assertion holds against
//      behaviour rather than against the source text.
//
// No database is touched. The RPCs this route calls are authored but
// UNAPPLIED; the stub below stands in for them.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ACTOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MEMBER_ROW_ID = '11111111-1111-1111-1111-111111111111'
const TARGET_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

type Res = { data: unknown; error: { message: string; code?: string } | null }

const TARGET_DEFAULT = {
  id: MEMBER_ROW_ID,
  workspace_id: WORKSPACE_ID,
  user_id: TARGET_USER_ID,
  role: 'member',
  status: 'active',
}

/** Chainable, awaitable PostgREST stub. */
function thenable(get: () => Res) {
  const q: Record<string, unknown> = {}
  const self = () => q
  q.select = self
  q.eq = self
  q.neq = self
  q.in = self
  q.is = self
  q.order = self
  q.maybeSingle = self
  q.single = self
  q.then = (resolve: (value: Res) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(get()).then(resolve, reject)
  return q
}

function buildSessionClient(opts: { role?: string; status?: string } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: ACTOR_ID, app_metadata: {} } } }) },
    from: jest.fn((table: string) => {
      if (table === 'workspace_members') {
        return thenable(() => ({
          data: { role: opts.role ?? 'owner', status: opts.status ?? 'active', expires_at: null },
          error: null,
        }))
      }
      throw new Error(`unexpected table on the session client: ${table}`)
    }),
  }
}

type RpcCall = { fn: string; args: Record<string, unknown> }

function buildServiceClient(
  opts: {
    accessEnabled?: boolean
    target?: Record<string, unknown> | null
    outcome?: string
    rpcError?: { message: string; code?: string }
  } = {}
) {
  const rpcCalls: RpcCall[] = []
  const updates: Record<string, unknown>[] = []
  const audits: Record<string, unknown>[] = []

  const client = {
    rpcCalls,
    updates,
    audits,
    rpc: jest.fn((fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return thenable(() =>
        opts.rpcError
          ? { data: null, error: opts.rpcError }
          : {
              data: {
                outcome: opts.outcome ?? 'ok',
                member_id: MEMBER_ROW_ID,
                subject_user_id: TARGET_USER_ID,
                audit_id: '99999999-9999-9999-9999-999999999999',
              },
              error: null,
            }
      )
    }),
    from: jest.fn((table: string) => {
      if (table === 'workspace_access_config') {
        return thenable(() => ({ data: { enabled: opts.accessEnabled !== false }, error: null }))
      }

      if (table === 'workspace_members') {
        return {
          select: () =>
            thenable(() => ({
              data: opts.target === undefined ? TARGET_DEFAULT : opts.target,
              error: null,
            })),
          update: (row: Record<string, unknown>) => {
            updates.push(row)
            return thenable(() => ({ data: TARGET_DEFAULT, error: null }))
          },
        }
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

function jsonRequest(body: unknown, method = 'PATCH'): Request {
  return new Request('https://funun.test/api/workspaces/w/members', {
    method,
    body: JSON.stringify(body),
  })
}

async function readError(response: Response): Promise<string> {
  const payload = (await response.json()) as { error?: string }
  return payload.error ?? ''
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── GET ───────────────────────────────────────────────────────────────────
describe('GET /api/workspaces/[workspaceId]/members', () => {
  it('lists the roster and calls no RPC — the read path is unchanged', async () => {
    const service = buildServiceClient()
    install(buildSessionClient({ role: 'member' }), service)

    const response = await GET(new Request('https://funun.test/x'), { params })

    expect(response.status).toBe(200)
    expect(service.rpcCalls).toHaveLength(0)
  })
})

// ─── PATCH ─────────────────────────────────────────────────────────────────
describe('PATCH /api/workspaces/[workspaceId]/members', () => {
  it('calls the RPC exactly once on the success path, and never updates the table itself', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, role: 'admin' }), {
      params,
    })

    expect(response.status).toBe(200)
    expect(service.rpcCalls).toHaveLength(1)
    expect(service.rpcCalls[0].fn).toBe('workspace_change_member_role_or_status')
    // The RPC owns the write AND the audit row (R-06). A route-side update or
    // audit insert beside it would be a second writer.
    expect(service.updates).toHaveLength(0)
    expect(service.audits).toHaveLength(0)
  })

  it('passes the proved actor id and the CAS tokens, and no role for the ACTOR', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, status: 'suspended' }), { params })

    expect(service.rpcCalls[0].args).toEqual({
      p_actor_id: ACTOR_ID,
      p_workspace_id: WORKSPACE_ID,
      p_member_id: MEMBER_ROW_ID,
      p_new_role: null,
      p_new_status: 'suspended',
      p_expected_role: 'member',
      p_expected_status: 'active',
    })
  })

  it('[R-21] forwards no actor-role parameter even when the body tries to supply one', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    // `actorRole` is not in the schema, so `.strict()` refuses the request
    // outright — and the RPC is never reached with it either way.
    const response = await PATCH(
      jsonRequest({ memberId: MEMBER_ROW_ID, status: 'suspended', actorRole: 'owner' }),
      { params }
    )

    expect(response.status).toBe(400)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('[R-21] no RPC argument name can carry the caller’s own authority', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, role: 'admin' }), { params })

    const argNames = Object.keys(service.rpcCalls[0].args)
    expect(argNames).not.toContain('p_actor_role')
    expect(argNames).not.toContain('p_role')
    // The only role-shaped arguments describe the TARGET row, never the actor.
    expect(argNames.filter(name => name.includes('role')).sort()).toEqual([
      'p_expected_role',
      'p_new_role',
    ])
  })

  it('maps promotion_requires_transfer to 409 and points at the ownership route', async () => {
    const service = buildServiceClient({ outcome: 'promotion_requires_transfer' })
    install(buildSessionClient({ role: 'owner' }), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, role: 'owner' }), {
      params,
    })

    expect(response.status).toBe(409)
    expect(await readError(response)).toContain('/ownership')
  })

  it('[T-38.0.2-12-01] refuses an admin asking for role owner with 403, WITHOUT calling the RPC', async () => {
    const service = buildServiceClient()
    install(buildSessionClient({ role: 'admin' }), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, role: 'owner' }), {
      params,
    })

    expect(response.status).toBe(403)
    // The first of three layers bites before the RPC is reached.
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('[R-05] refuses an admin touching an OWNER row with 403, WITHOUT calling the RPC', async () => {
    const service = buildServiceClient({ target: { ...TARGET_DEFAULT, role: 'owner' } })
    install(buildSessionClient({ role: 'admin' }), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, status: 'suspended' }), {
      params,
    })

    expect(response.status).toBe(403)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('lets an OWNER touch an owner row — canManageOwners is beside, not instead of, canManageWorkspaceMembers', async () => {
    const service = buildServiceClient({ target: { ...TARGET_DEFAULT, role: 'owner' } })
    install(buildSessionClient({ role: 'owner' }), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, status: 'suspended' }), {
      params,
    })

    expect(response.status).toBe(200)
    expect(service.rpcCalls).toHaveLength(1)
  })

  it('still lets an ADMIN manage an ordinary member — the predicates disagree only on owner rows', async () => {
    const service = buildServiceClient()
    install(buildSessionClient({ role: 'admin' }), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, status: 'suspended' }), {
      params,
    })

    expect(response.status).toBe(200)
    expect(service.rpcCalls).toHaveLength(1)
  })

  it('[WSR-11] maps the floor outcome to 409 with the SHARED constant, not a copy of the sentence', async () => {
    const service = buildServiceClient({
      target: { ...TARGET_DEFAULT, role: 'owner' },
      outcome: 'floor',
    })
    install(buildSessionClient({ role: 'owner' }), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, role: 'admin' }), {
      params,
    })

    expect(response.status).toBe(409)
    // Byte-locked to lib/workspaces/membership.ts, which is itself byte-locked
    // to migration 182's RAISE. The sentence is imported, never repeated.
    expect(await readError(response)).toBe(WORKSPACE_OWNER_FLOOR_MESSAGE)
  })

  it('sources the floor refusal from the outcome code, never from a database error message', async () => {
    // The database error carries the old English sentence; the outcome code is
    // what the route reads. A message-sniffing route would return 409 here.
    const service = buildServiceClient({
      rpcError: { message: 'A workspace must always have at least one active owner.' },
    })
    install(buildSessionClient(), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, status: 'suspended' }), {
      params,
    })

    expect(response.status).toBe(500)
  })

  it('maps a stale compare-and-set to 409', async () => {
    const service = buildServiceClient({ outcome: 'stale' })
    install(buildSessionClient(), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, status: 'suspended' }), {
      params,
    })

    expect(response.status).toBe(409)
  })

  it('maps illegal_transition to 400 and forbidden_owner_row to 403', async () => {
    const illegal = buildServiceClient({ outcome: 'illegal_transition' })
    install(buildSessionClient(), illegal)
    expect(
      (await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, status: 'suspended' }), { params }))
        .status
    ).toBe(400)

    const ownerRow = buildServiceClient({ outcome: 'forbidden_owner_row' })
    install(buildSessionClient(), ownerRow)
    expect(
      (await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, status: 'suspended' }), { params }))
        .status
    ).toBe(403)
  })

  it('maps no_self_role_change to 403 and not_found to 404', async () => {
    const selfChange = buildServiceClient({ outcome: 'no_self_role_change' })
    install(buildSessionClient(), selfChange)
    expect(
      (await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, role: 'admin' }), { params })).status
    ).toBe(403)

    const missing = buildServiceClient({ outcome: 'not_found' })
    install(buildSessionClient(), missing)
    expect(
      (await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, role: 'admin' }), { params })).status
    ).toBe(404)
  })

  it('degrades an unrecognised outcome code to 400, never a 500', async () => {
    const service = buildServiceClient({ outcome: 'something_the_route_has_never_heard_of' })
    install(buildSessionClient(), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, role: 'admin' }), {
      params,
    })

    expect(response.status).toBe(400)
  })

  it.each(['40P01', '55P03'])('maps the Postgres lock code %s to a retry-safe 409', async code => {
    const service = buildServiceClient({ rpcError: { message: 'lock', code } })
    install(buildSessionClient(), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, role: 'admin' }), {
      params,
    })

    expect(response.status).toBe(409)
    expect(await readError(response)).toContain('try again')
  })

  it('refuses an illegal status edge in words, WITHOUT calling the RPC', async () => {
    const service = buildServiceClient({ target: { ...TARGET_DEFAULT, status: 'removed' } })
    install(buildSessionClient(), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, status: 'active' }), {
      params,
    })

    expect(response.status).toBe(400)
    expect(await readError(response)).toContain('removed')
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('refuses a caller who is neither owner nor admin with 403, WITHOUT calling the RPC', async () => {
    const service = buildServiceClient()
    install(buildSessionClient({ role: 'member' }), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, role: 'admin' }), {
      params,
    })

    expect(response.status).toBe(403)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('returns 404 for a member of another workspace, WITHOUT calling the RPC', async () => {
    const service = buildServiceClient({ target: null })
    install(buildSessionClient(), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, role: 'admin' }), {
      params,
    })

    expect(response.status).toBe(404)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('refuses a no-op change with 400 rather than writing an empty audit row', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, role: 'member' }), {
      params,
    })

    expect(response.status).toBe(400)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('fails closed with 503 when the D-56 kill switch is off, calling no RPC', async () => {
    const service = buildServiceClient({ accessEnabled: false })
    install(buildSessionClient(), service)

    const response = await PATCH(jsonRequest({ memberId: MEMBER_ROW_ID, role: 'admin' }), {
      params,
    })

    expect(response.status).toBe(503)
    expect(service.rpcCalls).toHaveLength(0)
  })
})

// ─── DELETE ────────────────────────────────────────────────────────────────
describe('DELETE /api/workspaces/[workspaceId]/members', () => {
  it('calls the RPC exactly once with p_new_status removed, and never deletes a row (D-14)', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    const response = await DELETE(jsonRequest({ memberId: MEMBER_ROW_ID }, 'DELETE'), { params })

    expect(response.status).toBe(200)
    expect(service.rpcCalls).toHaveLength(1)
    expect(service.rpcCalls[0].args).toMatchObject({
      p_actor_id: ACTOR_ID,
      p_new_role: null,
      p_new_status: 'removed',
    })
    expect(service.updates).toHaveLength(0)
    expect(service.audits).toHaveLength(0)
  })

  it('[WSR-11] maps the floor outcome to 409 with the shared constant when removing the last owner', async () => {
    const service = buildServiceClient({
      target: { ...TARGET_DEFAULT, role: 'owner' },
      outcome: 'floor',
    })
    install(buildSessionClient({ role: 'owner' }), service)

    const response = await DELETE(jsonRequest({ memberId: MEMBER_ROW_ID }, 'DELETE'), { params })

    expect(response.status).toBe(409)
    expect(await readError(response)).toBe(WORKSPACE_OWNER_FLOOR_MESSAGE)
  })

  it('refuses an already-removed member with 400 from the route’s own predicate, before the RPC', async () => {
    const service = buildServiceClient({ target: { ...TARGET_DEFAULT, status: 'removed' } })
    install(buildSessionClient(), service)

    const response = await DELETE(jsonRequest({ memberId: MEMBER_ROW_ID }, 'DELETE'), { params })

    expect(response.status).toBe(400)
    expect(await readError(response)).toContain('already been removed')
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('[R-05] refuses an admin removing an owner with 403, WITHOUT calling the RPC', async () => {
    const service = buildServiceClient({ target: { ...TARGET_DEFAULT, role: 'owner' } })
    install(buildSessionClient({ role: 'admin' }), service)

    const response = await DELETE(jsonRequest({ memberId: MEMBER_ROW_ID }, 'DELETE'), { params })

    expect(response.status).toBe(403)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('maps the Postgres deadlock code 40P01 to a retry-safe 409', async () => {
    const service = buildServiceClient({ rpcError: { message: 'deadlock', code: '40P01' } })
    install(buildSessionClient(), service)

    const response = await DELETE(jsonRequest({ memberId: MEMBER_ROW_ID }, 'DELETE'), { params })

    expect(response.status).toBe(409)
  })

  it('refuses a caller who is neither owner nor admin with 403, WITHOUT calling the RPC', async () => {
    const service = buildServiceClient()
    install(buildSessionClient({ role: 'contractor' }), service)

    const response = await DELETE(jsonRequest({ memberId: MEMBER_ROW_ID }, 'DELETE'), { params })

    expect(response.status).toBe(403)
    expect(service.rpcCalls).toHaveLength(0)
  })
})
