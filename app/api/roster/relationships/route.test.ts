import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { GET, PATCH } from './route'

// ─── Route tests for the Member's own roster surface (WSR-12 / F16 / R-23) ──
// Mocks ONLY the two Supabase client factories, then drives the REAL route
// handler and the REAL lib/workspaces modules against a recording in-memory
// backend — the same convention as
// app/api/workspaces/[workspaceId]/roster/route.test.ts and
// app/api/roster/relationships/[relationshipId]/consent/route.test.ts.
//
// The stub RECORDS every method chain (`calls.rpcs`, `calls.updates`,
// `calls.tables`) rather than being asserted against source text, so
// "exactly one rpc, zero updates" is a claim about BEHAVIOUR. A grep on the
// route file would pass the moment somebody moved the write into a helper.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const MEMBER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OTHER_MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const RELATIONSHIP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const AUDIT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

type QueryResult = { data: unknown; error: unknown }

/** Minimal chainable PostgREST stub: every filter returns itself, every
 * terminal resolves to the supplied result. */
function chain(result: QueryResult) {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.in = () => q
  q.order = async () => result
  q.maybeSingle = async () => result
  q.single = async () => result
  return q
}

function storedRelationship(overrides: Record<string, unknown> = {}) {
  return {
    id: RELATIONSHIP_ID,
    workspace_id: WORKSPACE_ID,
    member_user_id: MEMBER_ID,
    state: 'proposed',
    effective_from: null,
    ...overrides,
  }
}

type SessionCalls = { tables: string[]; rpcs: Array<{ name: string; args: unknown }> }

function buildSessionClient(opts: { relationships?: Record<string, unknown>[] } = {}) {
  const calls: SessionCalls = { tables: [], rpcs: [] }
  return {
    calls,
    auth: { getUser: async () => ({ data: { user: { id: MEMBER_ID, app_metadata: {} } } }) },
    rpc: jest.fn((name: string, args: unknown) => {
      calls.rpcs.push({ name, args })
      return chain({ data: [], error: null })
    }),
    from: jest.fn((table: string) => {
      calls.tables.push(table)
      if (table === 'user_profiles') {
        return chain({ data: { id: MEMBER_ID }, error: null })
      }
      if (table === 'workspace_roster_relationships') {
        return chain({ data: opts.relationships ?? [], error: null })
      }
      throw new Error(`unexpected table on the session client: ${table}`)
    }),
  }
}

type ServiceCalls = {
  tables: string[]
  updates: Record<string, unknown>[]
  auditRows: Record<string, unknown>[]
  rpcs: Array<{ name: string; args: Record<string, unknown> }>
}

function buildServiceClient(
  opts: {
    relationshipRow?: Record<string, unknown> | null
    killSwitchEnabled?: boolean
    rpcOutcome?: string
    rpcError?: { message: string; code?: string } | null
  } = {}
) {
  const calls: ServiceCalls = { tables: [], updates: [], auditRows: [], rpcs: [] }

  const client = {
    calls,
    rpc: jest.fn((name: string, args: Record<string, unknown>) => {
      calls.rpcs.push({ name, args })
      if (opts.rpcError) {
        return { single: async () => ({ data: null, error: opts.rpcError }) }
      }
      const outcome = opts.rpcOutcome ?? 'ok'
      return {
        single: async () => ({
          data: {
            outcome,
            relationship_id: RELATIONSHIP_ID,
            new_state: outcome === 'ok' ? null : null,
            audit_id: outcome === 'ok' || outcome === 'forbidden' ? AUDIT_ID : null,
          },
          error: null,
        }),
      }
    }),
    from: jest.fn((table: string) => {
      calls.tables.push(table)

      if (table === 'workspace_access_config') {
        return chain({ data: { enabled: opts.killSwitchEnabled !== false }, error: null })
      }
      if (table === 'workspaces') {
        return chain({ data: { name: 'Test Workspace' }, error: null })
      }
      if (table === 'workspace_agreement_evidence') {
        return chain({ data: [], error: null })
      }
      if (table === 'workspace_roster_relationships') {
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.in = () => q
        q.update = (row: Record<string, unknown>) => {
          calls.updates.push(row)
          return q
        }
        q.maybeSingle = async () => ({ data: opts.relationshipRow ?? null, error: null })
        q.single = async () => ({ data: opts.relationshipRow ?? null, error: null })
        return q
      }
      throw new Error(`unexpected table on the service client: ${table}`)
    }),
  }

  return client
}

function patchRequest(body: unknown) {
  return new Request('http://t.local/api/roster/relationships', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function wire(
  service: ReturnType<typeof buildServiceClient>,
  session: ReturnType<typeof buildSessionClient>
) {
  ;(createApiClient as jest.Mock).mockResolvedValue(session)
  ;(createServiceClient as jest.Mock).mockReturnValue(service)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('PATCH /api/roster/relationships — one compare-and-set RPC (F16 / WSR-12)', () => {
  it('accepts through exactly one workspace_transition_roster_relationship call, passing the loaded state as p_expected_state', async () => {
    const service = buildServiceClient({ relationshipRow: storedRelationship() })
    wire(service, buildSessionClient())

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'accept' }))

    expect(res.status).toBe(200)
    expect(service.calls.rpcs).toHaveLength(1)
    expect(service.calls.rpcs[0].name).toBe('workspace_transition_roster_relationship')
    expect(service.calls.rpcs[0].args).toMatchObject({
      p_actor_id: MEMBER_ID,
      p_relationship_id: RELATIONSHIP_ID,
      p_action: 'accept',
      p_expected_state: 'proposed',
      p_actor_side: 'member',
    })
    expect(service.calls.updates).toHaveLength(0)
  })

  it('writes no audit row of its own — the RPC owns the trail, and a second writer is where drift lives', async () => {
    const service = buildServiceClient({ relationshipRow: storedRelationship() })
    wire(service, buildSessionClient())

    await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'refuse' }))

    expect(service.calls.tables).not.toContain('workspace_audit_log')
    expect(service.calls.auditRows).toHaveLength(0)
  })

  it('blocks with exactly ONE rpc call and never touches workspace_roster_blocks itself (WSR-12 side-effect half)', async () => {
    const service = buildServiceClient({ relationshipRow: storedRelationship() })
    wire(service, buildSessionClient())

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'block' }))

    expect(res.status).toBe(200)
    expect(service.calls.rpcs).toHaveLength(1)
    expect(service.calls.rpcs[0].args).toMatchObject({ p_action: 'block', p_actor_side: 'member' })
    expect(service.calls.updates).toHaveLength(0)
    expect(service.calls.tables).not.toContain('workspace_roster_blocks')
  })

  it('maps the stale outcome to 409 rather than silently overwriting a concurrent terminal state', async () => {
    const service = buildServiceClient({
      relationshipRow: storedRelationship(),
      rpcOutcome: 'stale',
    })
    wire(service, buildSessionClient())

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'accept' }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(String(body.error)).toMatch(/try again/i)
  })

  it('maps not_found to 404, forbidden to 403 and illegal_transition to 400', async () => {
    for (const [outcome, status] of [
      ['not_found', 404],
      ['forbidden', 403],
      ['illegal_transition', 400],
    ] as const) {
      const service = buildServiceClient({ relationshipRow: storedRelationship(), rpcOutcome: outcome })
      wire(service, buildSessionClient())

      const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'accept' }))
      expect(res.status).toBe(status)
    }
  })

  it('degrades an outcome code it does not recognise to a 400 with a sentence, never a 500', async () => {
    const service = buildServiceClient({
      relationshipRow: storedRelationship(),
      rpcOutcome: 'some_future_code',
    })
    wire(service, buildSessionClient())

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'accept' }))

    expect(res.status).toBe(400)
  })

  it('maps a 40P01 deadlock and a 55P03 lock timeout to a retry-safe 409, never a 500', async () => {
    for (const code of ['40P01', '55P03']) {
      const service = buildServiceClient({
        relationshipRow: storedRelationship(),
        rpcError: { message: 'could not obtain lock', code },
      })
      wire(service, buildSessionClient())

      const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'accept' }))
      expect(res.status).toBe(409)
    }
  })

  it('still returns 500 for a Postgres error that is not a bounded lock outcome', async () => {
    const service = buildServiceClient({
      relationshipRow: storedRelationship(),
      rpcError: { message: 'boom', code: '42501' },
    })
    wire(service, buildSessionClient())

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'accept' }))

    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/roster/relationships — pre-refusals still happen BEFORE the RPC', () => {
  it('refuses 403 for a relationship that does not name the caller, without calling the RPC', async () => {
    const service = buildServiceClient({
      relationshipRow: storedRelationship({ member_user_id: OTHER_MEMBER_ID }),
    })
    wire(service, buildSessionClient())

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'accept' }))

    expect(res.status).toBe(403)
    expect(service.calls.rpcs).toHaveLength(0)
  })

  it('refuses 404 when no relationship row exists, without calling the RPC', async () => {
    const service = buildServiceClient({ relationshipRow: null })
    wire(service, buildSessionClient())

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'accept' }))

    expect(res.status).toBe(404)
    expect(service.calls.rpcs).toHaveLength(0)
  })

  it('refuses an illegal edge with assertCanTransition’s friendly sentence before the RPC is reached', async () => {
    const service = buildServiceClient({ relationshipRow: storedRelationship({ state: 'ended' }) })
    wire(service, buildSessionClient())

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'accept' }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Cannot move a roster relationship from ended to accepted.')
    expect(service.calls.rpcs).toHaveLength(0)
  })

  it('refuses an end from a non-accepted state through assertMemberMayEnd, before the RPC', async () => {
    const service = buildServiceClient({ relationshipRow: storedRelationship({ state: 'proposed' }) })
    wire(service, buildSessionClient())

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'end' }))

    expect(res.status).toBe(400)
    expect(service.calls.rpcs).toHaveLength(0)
  })

  it('ends an accepted relationship through the RPC with p_actor_side member', async () => {
    const service = buildServiceClient({ relationshipRow: storedRelationship({ state: 'accepted' }) })
    wire(service, buildSessionClient())

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'end' }))

    expect(res.status).toBe(200)
    expect(service.calls.rpcs).toHaveLength(1)
    expect(service.calls.rpcs[0].args).toMatchObject({
      p_action: 'end',
      p_actor_side: 'member',
      p_expected_state: 'accepted',
    })
    expect(service.calls.updates).toHaveLength(0)
  })
})

// ─── D-18 — the kill-switch asymmetry, locked by name ────────────────────
// A future "consistency" cleanup that gated all four actions on the D-56
// control would trap a Member in exactly the relationship the control exists
// to contain. These cases exist so that cleanup fails loudly.
describe('D-18 — the D-56 kill switch gates accept ONLY; a Member’s escape hatch stays open', () => {
  it('refuses accept with 503 while the control is off, and never calls the RPC', async () => {
    const service = buildServiceClient({
      relationshipRow: storedRelationship(),
      killSwitchEnabled: false,
    })
    wire(service, buildSessionClient())

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'accept' }))

    expect(res.status).toBe(503)
    expect(service.calls.rpcs).toHaveLength(0)
  })

  it.each([
    ['refuse', 'proposed'],
    ['block', 'proposed'],
    ['end', 'accepted'],
  ])('still permits %s while the control is off (D-18: revocation is unconditional)', async (action, state) => {
    const service = buildServiceClient({
      relationshipRow: storedRelationship({ state }),
      killSwitchEnabled: false,
    })
    wire(service, buildSessionClient())

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action }))

    expect(res.status).toBe(200)
    expect(service.calls.rpcs).toHaveLength(1)
    expect(service.calls.rpcs[0].args).toMatchObject({ p_action: action })
  })
})

// ─── R-23 — the Member surface deliberately does NOT collapse ─────────────
// The workspace-facing GET reads public.workspace_roster_page, which shows
// `refused` where the true state is `blocked`. Pointing THIS surface at that
// function would hide a Member's own block from them.
describe('R-23 — the Member’s own GET keeps the TRUE state and does not read workspace_roster_page', () => {
  it('returns state blocked verbatim for a relationship the Member blocked', async () => {
    const session = buildSessionClient({
      relationships: [
        {
          id: RELATIONSHIP_ID,
          workspace_id: WORKSPACE_ID,
          member_user_id: MEMBER_ID,
          state: 'blocked',
        },
      ],
    })
    const service = buildServiceClient()
    wire(service, session)

    const res = await GET(new Request('http://t.local/api/roster/relationships'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].state).toBe('blocked')
  })

  it('reads the RAW workspace_roster_relationships table through the RLS client, never the collapsing reader', async () => {
    const session = buildSessionClient({ relationships: [] })
    const service = buildServiceClient()
    wire(service, session)

    await GET(new Request('http://t.local/api/roster/relationships'))

    expect(session.calls.tables).toContain('workspace_roster_relationships')
    expect(session.calls.rpcs).toHaveLength(0)
    expect(service.calls.rpcs).toHaveLength(0)
  })
})
