import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { PATCH, POST } from './route'

// ─── /api/vault/custody-transfers — the route's first suite (WSR-09 / F9) ──
//
// WHAT THIS SUITE PROVES. The route's branching, the precedence of its
// predicates over the RPC, and the outcome → HTTP mapping. Every assertion
// below inspects BEHAVIOUR — the method chains and `.rpc()` names and
// argument objects the route actually issued against a recording stub —
// rather than the route's source text, so a refactor that preserves the
// behaviour keeps passing and one that reintroduces a second transaction
// does not.
//
// WHAT THIS SUITE CANNOT PROVE, STATED PLAINLY. It cannot prove that
// `workspace_accept_custody_transfer` works. Migration 198 is authored and
// UNAPPLIED; no test in this file opens a database connection. The
// precedent for why that distinction matters is exact and recent:
// migration 190's suite was green, its `transfer_vault_project_custody`
// function existed, and this very route called it correctly — and custody
// transfer was still broken in production, raising 42501, because
// `guard_owner_immutable` (migration 139) fired first under a different
// name and refused the write. It took migration 196 to fix, and
// 38.0.1-VERIFICATION.md Part B row 7 flipped from ERROR to PASS only then.
// The nested UPDATE inside `transfer_vault_project_custody` fires BOTH
// guards and BOTH must admit it. Plan 17's owner-run harness, which
// performs a real custody accept against a live database, is the
// behavioural proof. This file is not, and no green run here should be
// read as one.
//
// WSR-09 has been DEFERRED TWICE. The `it(...)` cases naming it are the
// route-side assertions that the three-transaction accept path is gone.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(async () => ({ ok: true })),
}))

const PROJECT_ID = '11111111-1111-1111-1111-111111111111'
const TRANSFER_ID = '22222222-2222-2222-2222-222222222222'
const CUSTODIAN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const RECIPIENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const STRANGER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

// Byte-for-byte copies of the two sentences the route returns. A client may
// be matching on either, so they are pinned here as literals: if a future
// edit rewords the route's constants, these cases go red rather than the
// change shipping quietly. (They are deliberately NOT imported from
// `./route` — a Next.js route module may only export its HTTP handlers and
// the route-segment config fields, so the route cannot export them.)
const ALREADY_RESOLVED_MESSAGE = 'This transfer was already resolved by someone else.'
const STALE_CUSTODIAN_MESSAGE =
  "This record's custodian changed after this transfer was offered — it can no longer be accepted."
const NOT_OPEN_MESSAGE =
  'This transfer is no longer open — it has already been resolved or withdrawn.'

type Res = { data: unknown; error: { message: string; code?: string } | null }

/** Chainable, awaitable PostgREST stub — `select`/`eq`/`single`/etc. return self. */
function thenable(get: () => Res) {
  const q: Record<string, unknown> = {}
  const self = () => q
  q.select = self
  q.eq = self
  q.order = self
  q.maybeSingle = self
  q.single = self
  q.then = (resolve: (value: Res) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(get()).then(resolve, reject)
  return q
}

type TransferRowFixture = {
  id: string
  project_id: string
  from_user_id: string
  to_user_id: string
  offered_by: string
  workspace_id: string | null
  state: string
  responded_at: string | null
}

function offeredRow(overrides: Partial<TransferRowFixture> = {}): TransferRowFixture {
  return {
    id: TRANSFER_ID,
    project_id: PROJECT_ID,
    from_user_id: CUSTODIAN_ID,
    to_user_id: RECIPIENT_ID,
    offered_by: CUSTODIAN_ID,
    workspace_id: null,
    state: 'offered',
    responded_at: null,
    ...overrides,
  }
}

function buildSessionClient(userId: string) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: userId, app_metadata: {} } } }) },
    from: jest.fn((table: string) => {
      if (table === 'user_profiles') {
        return thenable(() => ({ data: { id: userId }, error: null }))
      }
      if (table === 'workspace_custody_transfers') {
        return thenable(() => ({ data: [], error: null }))
      }
      throw new Error(`unexpected table on the session client: ${table}`)
    }),
  }
}

type RpcCall = { fn: string; args: Record<string, unknown> }

type ServiceOpts = {
  /** Successive results for the transfer read. The last one repeats. */
  reads?: Array<TransferRowFixture | null>
  readError?: { message: string } | null
  rpcOutcome?: string
  rpcError?: { message: string; code?: string }
  /** `vault_projects` row backing `assertMayOffer` on the POST path. */
  project?: { id: string; user_id: string } | null
}

function buildServiceClient(opts: ServiceOpts = {}) {
  const rpcCalls: RpcCall[] = []
  const inserts: Record<string, unknown>[] = []
  const updates: Record<string, unknown>[] = []
  const reads = [...(opts.reads ?? [offeredRow()])]

  function nextRead(): TransferRowFixture | null {
    return reads.length > 1 ? (reads.shift() as TransferRowFixture | null) : (reads[0] ?? null)
  }

  const client = {
    rpcCalls,
    inserts,
    updates,
    rpc: jest.fn((fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })

      // The low-level custody function must NEVER be reached from this route
      // again — after this change its only caller is
      // `workspace_accept_custody_transfer`. Recorded rather than thrown so
      // the dedicated assertion below can name it.
      if (fn === 'workspace_accept_custody_transfer') {
        return thenable(() =>
          opts.rpcError
            ? { data: null, error: opts.rpcError }
            : {
                data: {
                  outcome: opts.rpcOutcome ?? 'ok',
                  transfer_id: TRANSFER_ID,
                  project_id: PROJECT_ID,
                  audit_id: null,
                },
                error: null,
              }
        )
      }
      return thenable(() => ({ data: null, error: null }))
    }),
    from: jest.fn((table: string) => {
      if (table === 'workspace_custody_transfers') {
        return {
          select: () =>
            thenable(() => ({ data: nextRead(), error: opts.readError ?? null })),
          insert: (values: Record<string, unknown>) => {
            inserts.push(values)
            return thenable(() => ({ data: offeredRow(), error: null }))
          },
          // A ROUTE-SIDE DIARY UPDATE IS THE DEFECT ITSELF. Each PostgREST
          // call is its own transaction, so a state write issued from here
          // can never share a transaction with the custody move — which is
          // precisely F9's split-brain window. The stub refuses it loudly
          // rather than absorbing it, so a future edit that reintroduces one
          // fails here instead of passing quietly.
          update: (values: Record<string, unknown>) => {
            updates.push(values)
            throw new Error(
              'route-side update on workspace_custody_transfers: the diary write belongs ' +
                'inside workspace_accept_custody_transfer, in one transaction with the custody move (F9/WSR-09)'
            )
          },
        }
      }
      if (table === 'vault_projects') {
        return thenable(() => ({
          data: opts.project === undefined ? { id: PROJECT_ID, user_id: CUSTODIAN_ID } : opts.project,
          error: null,
        }))
      }
      throw new Error(`unexpected table on the service client: ${table}`)
    }),
  }

  return client
}

function patchRequest(body: Record<string, unknown>) {
  return new Request('http://t.local/api/vault/custody-transfers', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function postRequest(body: Record<string, unknown>) {
  return new Request('http://t.local/api/vault/custody-transfers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function wire(actorId: string, opts: ServiceOpts = {}) {
  const service = buildServiceClient(opts)
  ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient(actorId))
  ;(createServiceClient as jest.Mock).mockReturnValue(service)
  return service
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── WSR-09 — the three-transaction accept path is gone ───────────────────
describe('PATCH /api/vault/custody-transfers — WSR-09: one transaction, one RPC', () => {
  it('WSR-09: a successful accept makes exactly ONE rpc call and issues no route-side update', async () => {
    const service = wire(RECIPIENT_ID, {
      reads: [offeredRow(), offeredRow({ state: 'accepted', responded_at: '2026-09-07T00:00:00Z' })],
    })

    const res = await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'accept' }))

    expect(res.status).toBe(200)
    expect(service.rpcCalls).toHaveLength(1)
    expect(service.rpcCalls[0].fn).toBe('workspace_accept_custody_transfer')
    expect(service.updates).toHaveLength(0)
  })

  it('WSR-09: transfer_vault_project_custody appears in no recorded call — one sanctioned path, one caller', async () => {
    const service = wire(RECIPIENT_ID, {
      reads: [offeredRow(), offeredRow({ state: 'accepted' })],
    })

    await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'accept' }))

    const names = service.rpcCalls.map(call => call.fn)
    expect(names).not.toContain('transfer_vault_project_custody')
    expect(names).toEqual(['workspace_accept_custody_transfer'])
  })

  it('passes the actor, the transfer id, the raw action and the loaded state as the CAS token', async () => {
    const service = wire(RECIPIENT_ID, {
      reads: [offeredRow(), offeredRow({ state: 'accepted' })],
    })

    await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'accept' }))

    expect(service.rpcCalls[0].args).toEqual({
      p_actor_id: RECIPIENT_ID,
      p_transfer_id: TRANSFER_ID,
      p_action: 'accept',
      p_expected_state: 'offered',
    })
  })

  it('WSR-09: a decline also runs through the same single RPC, so the diary write is atomic on every path', async () => {
    const service = wire(RECIPIENT_ID, {
      reads: [offeredRow(), offeredRow({ state: 'declined' })],
    })

    const res = await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'decline' }))

    expect(res.status).toBe(200)
    expect(service.rpcCalls).toHaveLength(1)
    expect(service.rpcCalls[0].args.p_action).toBe('decline')
    expect(service.updates).toHaveLength(0)
  })

  it('returns the re-read transfer row under `data`, preserving the existing response shape', async () => {
    const resolved = offeredRow({ state: 'accepted', responded_at: '2026-09-07T00:00:00Z' })
    wire(RECIPIENT_ID, { reads: [offeredRow(), resolved] })

    const res = await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'accept' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual(resolved)
  })
})

// ─── The predicates bite BEFORE the RPC (the second enforcement point) ─────
describe('PATCH /api/vault/custody-transfers — route predicates refuse first', () => {
  it('F1 self-dealing refusal: the offerer cannot accept their own offer, and the RPC is never called', async () => {
    // The F1 attack shape: one person performing both sides of an act D-29
    // requires to be two-sided. `assertMayRespond` must refuse it at the
    // route, independently of migration 198 section (h)'s post-lock check.
    const service = wire(CUSTODIAN_ID, {
      reads: [offeredRow({ to_user_id: CUSTODIAN_ID, offered_by: CUSTODIAN_ID })],
    })

    const res = await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'accept' }))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toMatch(/cannot also accept it/)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('refuses an accept by anyone other than to_user_id with 403, before the RPC', async () => {
    const service = wire(STRANGER_ID, { reads: [offeredRow()] })

    const res = await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'accept' }))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toMatch(/Only the offer's recipient/)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('refuses a withdraw by anyone other than the offerer or the current custodian, before the RPC', async () => {
    const service = wire(STRANGER_ID, { reads: [offeredRow()] })

    const res = await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'withdraw' }))

    expect(res.status).toBe(403)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('refuses a response to an already-terminal transfer with 409 and the existing message, before the RPC', async () => {
    const service = wire(RECIPIENT_ID, { reads: [offeredRow({ state: 'accepted' })] })

    const res = await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'accept' }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toBe(NOT_OPEN_MESSAGE)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('returns 404 when the transfer does not exist, before the RPC', async () => {
    const service = wire(RECIPIENT_ID, { reads: [null] })

    const res = await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'accept' }))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe('Custody transfer not found.')
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('rejects an unknown action at the Zod enum, before any read or RPC', async () => {
    const service = wire(RECIPIENT_ID)

    const res = await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'revoke' }))

    expect(res.status).toBe(400)
    expect(service.rpcCalls).toHaveLength(0)
  })
})

// ─── Outcome → HTTP, including the two byte-identical messages ─────────────
describe('PATCH /api/vault/custody-transfers — outcome mapping', () => {
  it('maps `stale_custodian` to 409 with a message byte-identical to the one the route returns today', async () => {
    wire(RECIPIENT_ID, { reads: [offeredRow()], rpcOutcome: 'stale_custodian' })

    const res = await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'accept' }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toBe(STALE_CUSTODIAN_MESSAGE)
  })

  it('maps `already_resolved` to 409 with the existing "already resolved by someone else" message', async () => {
    wire(RECIPIENT_ID, { reads: [offeredRow()], rpcOutcome: 'already_resolved' })

    const res = await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'accept' }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toBe(ALREADY_RESOLVED_MESSAGE)
  })

  it('maps `not_found` to 404, `stale` to 409 and `forbidden` to 403', async () => {
    const cases: Array<[string, number]> = [
      ['not_found', 404],
      ['stale', 409],
      ['forbidden', 403],
    ]

    for (const [outcome, status] of cases) {
      wire(RECIPIENT_ID, { reads: [offeredRow()], rpcOutcome: outcome })
      const res = await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'accept' }))
      expect(res.status).toBe(status)
    }
  })

  it('degrades an outcome code it does not recognise to a 400 with a sentence, never a 500', async () => {
    wire(RECIPIENT_ID, { reads: [offeredRow()], rpcOutcome: 'some_future_code' })

    const res = await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'accept' }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(typeof body.error).toBe('string')
  })

  it('maps a 40P01 deadlock and a 55P03 lock timeout to a retry-safe 409, never a 500', async () => {
    for (const code of ['40P01', '55P03']) {
      wire(RECIPIENT_ID, {
        reads: [offeredRow()],
        rpcError: { message: 'lock contention', code },
      })
      const res = await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'accept' }))
      expect(res.status).toBe(409)
    }
  })

  it('still surfaces a non-lock database error as a 500', async () => {
    wire(RECIPIENT_ID, {
      reads: [offeredRow()],
      rpcError: { message: 'boom', code: '42601' },
    })

    const res = await PATCH(patchRequest({ transferId: TRANSFER_ID, action: 'accept' }))

    expect(res.status).toBe(500)
  })
})

// ─── POST is unchanged ────────────────────────────────────────────────────
describe('POST /api/vault/custody-transfers — unchanged, still gated by assertMayOffer', () => {
  it('refuses an offer from anyone but the project’s current custodian, inserting nothing', async () => {
    const service = wire(STRANGER_ID, { project: { id: PROJECT_ID, user_id: CUSTODIAN_ID } })

    const res = await POST(postRequest({ projectId: PROJECT_ID, toUserId: RECIPIENT_ID }))

    expect(res.status).toBe(403)
    expect(service.inserts).toHaveLength(0)
    expect(service.rpcCalls).toHaveLength(0)
  })

  it('still inserts directly (no RPC): the offer is one insert guarded by migration 187’s BEFORE INSERT trigger', async () => {
    const service = wire(CUSTODIAN_ID, { project: { id: PROJECT_ID, user_id: CUSTODIAN_ID } })

    const res = await POST(postRequest({ projectId: PROJECT_ID, toUserId: RECIPIENT_ID }))

    expect(res.status).toBe(201)
    expect(service.inserts).toHaveLength(1)
    expect(service.rpcCalls).toHaveLength(0)
  })
})
