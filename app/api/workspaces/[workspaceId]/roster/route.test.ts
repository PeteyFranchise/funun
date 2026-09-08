import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { GET, PATCH, POST } from './route'

// ─── R-14 / WSR-22 (finding F19) ─────────────────────────────────────────
// `effective_from` and `terminates_on` are the roster relationship's live
// access window — `isWorkspaceAccessLive` and migration 183's
// `workspace_roster_relationship_is_live()` both read them, so a malformed
// bound is an authorization defect, not a display one. Everything asserted
// here is about what can and cannot reach those two columns through either
// verb.
//
// Deliberately drives the REAL route handlers against in-memory Supabase
// stubs, in the style of ./evidence/route.test.ts, so the assertions land on
// actual HTTP status codes and on the exact row handed to `.insert()` /
// `.update()` — never on a re-implementation of the rule.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

// The rate limiter builds its own service client and calls an RPC; it is not
// what these cases are about. Stubbed permissive so the POST path runs. The
// route's own `checkRateLimit` call is untouched by this plan (P0 hotfix).
jest.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => false),
}))

jest.mock('@/lib/notifications', () => ({
  createNotification: jest.fn(async () => ({ ok: true })),
}))

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ADMIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const RELATIONSHIP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

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

type SessionCalls = { tables: string[]; rpcs: Array<{ name: string; args: Record<string, unknown> }> }

function buildSessionClient(
  opts: { role?: string; pageRows?: Record<string, unknown>[]; pageError?: { message: string } } = {}
) {
  const calls: SessionCalls = { tables: [], rpcs: [] }
  return {
    calls,
    auth: { getUser: async () => ({ data: { user: { id: ADMIN_ID, app_metadata: {} } } }) },
    // `public.workspace_roster_page` is a SECURITY DEFINER reader granted to
    // `authenticated`, so it is invoked on the SESSION client — its own
    // `p_uid = (SELECT auth.uid())` clause returns zero rows otherwise.
    rpc: jest.fn((name: string, args: Record<string, unknown>) => {
      calls.rpcs.push({ name, args })
      return Promise.resolve({ data: opts.pageRows ?? [], error: opts.pageError ?? null })
    }),
    from: jest.fn((table: string) => {
      calls.tables.push(table)
      if (table === 'workspace_members') {
        return chain({
          data: { role: opts.role ?? 'admin', status: 'active', expires_at: null },
          error: null,
        })
      }
      throw new Error(`unexpected table on the session client: ${table}`)
    }),
  }
}

type ServiceCalls = {
  tables: string[]
  insertedRow: Record<string, unknown> | null
  updates: Record<string, unknown>[]
  auditRows: Record<string, unknown>[]
  rpcs: Array<{ name: string; args: Record<string, unknown> }>
}

/**
 * `relationshipRow` serves both verbs: POST reads it as
 * `assertCanPropose`'s "is there already a live relationship?" probe (null
 * means free to propose), PATCH reads it as the target row.
 */
function buildServiceClient(
  opts: {
    relationshipRow?: Record<string, unknown> | null
    rpcOutcome?: string
    rpcError?: { message: string; code?: string } | null
  } = {}
) {
  const calls: ServiceCalls = { tables: [], insertedRow: null, updates: [], auditRows: [], rpcs: [] }

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
            new_state: outcome === 'ok' ? 'ended' : null,
            audit_id: null,
          },
          error: null,
        }),
      }
    }),
    from: jest.fn((table: string) => {
      calls.tables.push(table)

      if (table === 'workspace_access_config') {
        return chain({ data: { enabled: true }, error: null })
      }
      if (table === 'workspace_agreement_evidence') {
        return chain({ data: [], error: null })
      }
      if (table === 'workspace_roster_blocks') {
        return chain({ data: null, error: null })
      }
      if (table === 'workspaces') {
        return chain({ data: { name: 'Test Workspace' }, error: null })
      }
      if (table === 'user_profiles') {
        return chain({ data: { artist_name: 'Test Member', handle: 'testmember' }, error: null })
      }
      if (table === 'workspace_audit_log') {
        return {
          insert: async (row: Record<string, unknown>) => {
            calls.auditRows.push(row)
            return { error: null }
          },
        }
      }
      if (table === 'workspace_roster_relationships') {
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.in = () => q
        q.insert = (row: Record<string, unknown>) => {
          calls.insertedRow = row
          return q
        }
        q.update = (row: Record<string, unknown>) => {
          calls.updates.push(row)
          return q
        }
        q.maybeSingle = async () => ({ data: opts.relationshipRow ?? null, error: null })
        q.single = async () => {
          if (calls.updates.length > 0) {
            return {
              data: {
                id: RELATIONSHIP_ID,
                ...(opts.relationshipRow ?? {}),
                ...calls.updates[calls.updates.length - 1],
              },
              error: null,
            }
          }
          return { data: { id: RELATIONSHIP_ID, ...(calls.insertedRow ?? {}) }, error: null }
        }
        return q
      }
      throw new Error(`unexpected table on the service client: ${table}`)
    }),
  }

  return client
}

function postRequest(body: unknown) {
  return new Request(`http://t.local/api/workspaces/${WORKSPACE_ID}/roster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function patchRequest(body: unknown) {
  return new Request(`http://t.local/api/workspaces/${WORKSPACE_ID}/roster`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function getRequest(query = '') {
  return new Request(`http://t.local/api/workspaces/${WORKSPACE_ID}/roster${query}`)
}

const params = () => Promise.resolve({ workspaceId: WORKSPACE_ID })

function proposeBody(overrides: Record<string, unknown> = {}) {
  return { memberUserId: MEMBER_ID, ...overrides }
}

/** An accepted relationship whose window opens in June and never ends. */
function storedRelationship(overrides: Record<string, unknown> = {}) {
  return {
    id: RELATIONSHIP_ID,
    workspace_id: WORKSPACE_ID,
    member_user_id: MEMBER_ID,
    state: 'accepted',
    effective_from: '2026-06-01',
    terminates_on: null,
    ...overrides,
  }
}

function wire(service: ReturnType<typeof buildServiceClient>, role?: string) {
  ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient({ role }))
  ;(createServiceClient as jest.Mock).mockReturnValue(service)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('POST /api/workspaces/[workspaceId]/roster — strict ISO access window (WSR-22)', () => {
  it('stores a well-formed YYYY-MM-DD window unchanged', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(
      postRequest(proposeBody({ effectiveFrom: '2026-01-01', terminatesOn: '2026-12-31' })),
      { params: params() }
    )

    expect(res.status).toBe(201)
    expect(service.calls.insertedRow).toMatchObject({
      workspace_id: WORKSPACE_ID,
      member_user_id: MEMBER_ID,
      effective_from: '2026-01-01',
      terminates_on: '2026-12-31',
    })
  })

  it('refuses 400 for a calendar-impossible effectiveFrom before any write', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(postRequest(proposeBody({ effectiveFrom: '2026-02-30' })), {
      params: params(),
    })

    expect(res.status).toBe(400)
    expect(service.calls.insertedRow).toBeNull()
    // The only service-client table touched is the kill-switch config that
    // requireWorkspaceAccess consults before anything else.
    expect(service.calls.tables).not.toContain('workspace_roster_relationships')
  })

  it('refuses 400 for a malformed terminatesOn before any write', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(postRequest(proposeBody({ terminatesOn: 'next spring' })), {
      params: params(),
    })

    expect(res.status).toBe(400)
    expect(service.calls.insertedRow).toBeNull()
  })

  it('refuses 400 naming both fields when terminatesOn is before effectiveFrom', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(
      postRequest(proposeBody({ effectiveFrom: '2026-12-31', terminatesOn: '2026-01-01' })),
      { params: params() }
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('effectiveFrom')
    expect(body.error).toContain('terminatesOn')
    expect(service.calls.insertedRow).toBeNull()
  })

  it('refuses 400 when terminatesOn equals effectiveFrom, matching migration 183 CHECK of strictly greater', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(
      postRequest(proposeBody({ effectiveFrom: '2026-05-05', terminatesOn: '2026-05-05' })),
      { params: params() }
    )

    expect(res.status).toBe(400)
    expect(service.calls.insertedRow).toBeNull()
  })

  it('still accepts an open-ended window with neither bound supplied', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(postRequest(proposeBody()), { params: params() })

    expect(res.status).toBe(201)
    expect(service.calls.insertedRow).toMatchObject({
      effective_from: null,
      terminates_on: null,
    })
  })

  it('leaves the existing role gate in place', async () => {
    const service = buildServiceClient()
    wire(service, 'member')

    const res = await POST(postRequest(proposeBody()), { params: params() })

    expect(res.status).toBe(403)
    expect(service.calls.insertedRow).toBeNull()
  })
})

describe('PATCH /api/workspaces/[workspaceId]/roster — strict ISO access window (WSR-22)', () => {
  it('refuses 400 for a malformed effective_from before any write', async () => {
    const service = buildServiceClient({ relationshipRow: storedRelationship() })
    wire(service)

    const res = await PATCH(
      patchRequest({ relationshipId: RELATIONSHIP_ID, effective_from: '2026-13-01' }),
      { params: params() }
    )

    expect(res.status).toBe(400)
    expect(service.calls.updates).toHaveLength(0)
  })

  it('accepts an explicit null, because clearing a bound is legitimate', async () => {
    const service = buildServiceClient({ relationshipRow: storedRelationship() })
    wire(service)

    const res = await PATCH(
      patchRequest({ relationshipId: RELATIONSHIP_ID, effective_from: null }),
      { params: params() }
    )

    expect(res.status).toBe(200)
    expect(service.calls.updates[0]).toMatchObject({ effective_from: null })
  })

  it('refuses a SINGLE-FIELD edit that would leave the stored window inverted', async () => {
    // Stored: effective_from 2026-06-01, terminates_on null. The request
    // names only terminates_on, so the pair is only invalid once merged
    // with what is already on the row.
    const service = buildServiceClient({ relationshipRow: storedRelationship() })
    wire(service)

    const res = await PATCH(
      patchRequest({ relationshipId: RELATIONSHIP_ID, terminates_on: '2026-01-01' }),
      { params: params() }
    )

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('effective_from')
    expect(body.error).toContain('terminates_on')
    expect(service.calls.updates).toHaveLength(0)
  })

  it('refuses a single-field effective_from edit that would overrun the stored terminates_on', async () => {
    const service = buildServiceClient({
      relationshipRow: storedRelationship({ effective_from: null, terminates_on: '2026-03-01' }),
    })
    wire(service)

    const res = await PATCH(
      patchRequest({ relationshipId: RELATIONSHIP_ID, effective_from: '2026-09-01' }),
      { params: params() }
    )

    expect(res.status).toBe(400)
    expect(service.calls.updates).toHaveLength(0)
  })

  it('permits a single-field edit that leaves the merged window valid', async () => {
    const service = buildServiceClient({ relationshipRow: storedRelationship() })
    wire(service)

    const res = await PATCH(
      patchRequest({ relationshipId: RELATIONSHIP_ID, terminates_on: '2026-12-31' }),
      { params: params() }
    )

    expect(res.status).toBe(200)
    expect(service.calls.updates[0]).toMatchObject({ terminates_on: '2026-12-31' })
  })

  // AMENDED BY PLAN 38.0.2-15, NOT WEAKENED. This case asserted
  // `updates[0]` matched `{ state: 'ended' }` because the end path used to
  // issue its own `.update(...)`. That write moved into
  // `workspace_transition_roster_relationship` (WSR-12 / F16), so the route
  // now issues NO update at all — which satisfies this case's original
  // claim, "the end action writes no date bound of its own", more strongly
  // than the old assertion did. The claim is re-expressed against the RPC
  // arguments rather than deleted.
  it('leaves the end action untouched — it writes no date bound of its own', async () => {
    const service = buildServiceClient({ relationshipRow: storedRelationship() })
    wire(service)

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'end' }), {
      params: params(),
    })

    expect(res.status).toBe(200)
    expect(service.calls.updates).toHaveLength(0)
    expect(service.calls.rpcs).toHaveLength(1)
    expect(Object.keys(service.calls.rpcs[0].args)).not.toContain('p_effective_from')
    expect(Object.keys(service.calls.rpcs[0].args)).not.toContain('p_terminates_on')
  })
})

// ─── R-23 / T-38-04-05 — the collapsing read ─────────────────────────────
// Migration 197 REMOVED the workspace's access to the raw
// workspace_roster_relationships table: the surviving policy admits only
// `member_user_id = auth.uid()` and settled accepted/ended rows. The
// owner/admin proposal-management surface R-12 requires is served ONLY by
// public.workspace_roster_page, whose owner and admin branches are
// deliberately NOT state-gated.
//
// THE FIRST CASE BELOW IS THE REPOINT GUARD. `buildSessionClient`'s `from`
// throws for any table but workspace_members, so a GET that went back to
// reading the raw table through the RLS client fails this suite loudly
// instead of silently returning an empty proposal surface in production.
describe('GET /api/workspaces/[workspaceId]/roster — R-23 collapsing reader', () => {
  it('reads through workspace_roster_page and NEVER through the raw workspace_roster_relationships table', async () => {
    const session = buildSessionClient({ pageRows: [] })
    const service = buildServiceClient()
    ;(createApiClient as jest.Mock).mockResolvedValue(session)
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET(getRequest(), { params: params() })

    expect(res.status).toBe(200)
    expect(session.calls.rpcs).toHaveLength(1)
    expect(session.calls.rpcs[0].name).toBe('workspace_roster_page')
    expect(session.calls.rpcs[0].args).toMatchObject({
      p_workspace_id: WORKSPACE_ID,
      p_uid: ADMIN_ID,
    })
    expect(session.calls.tables).not.toContain('workspace_roster_relationships')
    expect(service.calls.tables).not.toContain('workspace_roster_relationships')
  })

  it('R-23: surfaces refused for a row the reader collapsed, and no response field carries the true blocked state', async () => {
    // The fixture is what `workspace_roster_page` RETURNS for a relationship
    // whose stored state is `blocked`: the CASE expression has already
    // rewritten the state column, and refused_at is passed through unchanged
    // because the block path stamps it — a `refused` row with no refusal
    // timestamp would itself be a fingerprint of the collapse.
    const session = buildSessionClient({
      pageRows: [
        {
          id: RELATIONSHIP_ID,
          workspace_id: WORKSPACE_ID,
          member_user_id: MEMBER_ID,
          state: 'refused',
          refused_at: '2026-09-07T00:00:00.000Z',
          created_at: '2026-09-01T00:00:00.000Z',
        },
      ],
    })
    const service = buildServiceClient()
    ;(createApiClient as jest.Mock).mockResolvedValue(session)
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET(getRequest(), { params: params() })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].state).toBe('refused')
    expect(JSON.stringify(body)).not.toContain('blocked')
  })

  it('R-23: still returns proposed rows, because the function’s owner and admin branches are deliberately not state-gated (R-12)', async () => {
    const session = buildSessionClient({
      pageRows: [
        { id: RELATIONSHIP_ID, workspace_id: WORKSPACE_ID, member_user_id: MEMBER_ID, state: 'proposed' },
      ],
    })
    const service = buildServiceClient()
    ;(createApiClient as jest.Mock).mockResolvedValue(session)
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET(getRequest(), { params: params() })
    const body = await res.json()

    expect(body.data[0].state).toBe('proposed')
  })

  it('still attaches authorityTier from loadRelationshipTier', async () => {
    const session = buildSessionClient({
      pageRows: [
        { id: RELATIONSHIP_ID, workspace_id: WORKSPACE_ID, member_user_id: MEMBER_ID, state: 'accepted' },
      ],
    })
    const service = buildServiceClient()
    ;(createApiClient as jest.Mock).mockResolvedValue(session)
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET(getRequest(), { params: params() })
    const body = await res.json()

    expect(body.data[0].authorityTier).toBe('operational')
  })

  it('clamps the page limit to 200 and forwards a default when none is supplied', async () => {
    const session = buildSessionClient({ pageRows: [] })
    const service = buildServiceClient()
    ;(createApiClient as jest.Mock).mockResolvedValue(session)
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    await GET(getRequest('?limit=5000&offset=-4'), { params: params() })
    expect(session.calls.rpcs[0].args).toMatchObject({ p_limit: 200, p_offset: 0 })

    await GET(getRequest(), { params: params() })
    expect(session.calls.rpcs[1].args).toMatchObject({ p_limit: 50, p_offset: 0 })

    await GET(getRequest('?limit=10&offset=20'), { params: params() })
    expect(session.calls.rpcs[2].args).toMatchObject({ p_limit: 10, p_offset: 20 })
  })

  it('returns 500 with the reader’s message when the definer function errors', async () => {
    const session = buildSessionClient({ pageError: { message: 'reader exploded' } })
    const service = buildServiceClient()
    ;(createApiClient as jest.Mock).mockResolvedValue(session)
    ;(createServiceClient as jest.Mock).mockReturnValue(service)

    const res = await GET(getRequest(), { params: params() })

    expect(res.status).toBe(500)
  })
})

// ─── The workspace write path (WSR-12 / F16 / D-05) ──────────────────────
describe('PATCH /api/workspaces/[workspaceId]/roster — the end action goes through the RPC', () => {
  it('ends through exactly one RPC call carrying p_actor_side workspace and the loaded state as the CAS token', async () => {
    const service = buildServiceClient({ relationshipRow: storedRelationship() })
    wire(service)

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'end' }), {
      params: params(),
    })

    expect(res.status).toBe(200)
    expect(service.calls.rpcs).toHaveLength(1)
    expect(service.calls.rpcs[0].name).toBe('workspace_transition_roster_relationship')
    expect(service.calls.rpcs[0].args).toMatchObject({
      p_actor_id: ADMIN_ID,
      p_relationship_id: RELATIONSHIP_ID,
      p_action: 'end',
      p_expected_state: 'accepted',
      p_actor_side: 'workspace',
    })
    expect(service.calls.updates).toHaveLength(0)
  })

  it('writes no audit row of its own on the end path — the RPC owns that trail', async () => {
    const service = buildServiceClient({ relationshipRow: storedRelationship() })
    wire(service)

    await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'end' }), {
      params: params(),
    })

    expect(service.calls.auditRows).toHaveLength(0)
  })

  it('D-05: refuses accept with a 4xx and NEVER calls the RPC — a workspace may not consent on a Member’s behalf', async () => {
    for (const action of ['accept', 'refuse', 'block']) {
      const service = buildServiceClient({ relationshipRow: storedRelationship() })
      wire(service)

      const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action }), {
        params: params(),
      })

      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThan(500)
      expect(service.calls.rpcs).toHaveLength(0)
      expect(service.calls.updates).toHaveLength(0)
    }
  })

  it('refuses an end from a non-accepted state through assertWorkspaceMayEnd, before the RPC', async () => {
    const service = buildServiceClient({ relationshipRow: storedRelationship({ state: 'proposed' }) })
    wire(service)

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'end' }), {
      params: params(),
    })

    expect(res.status).toBe(400)
    expect(service.calls.rpcs).toHaveLength(0)
  })

  it('maps the stale outcome to 409 and an unrecognised outcome to 400', async () => {
    for (const [outcome, status] of [
      ['stale', 409],
      ['not_found', 404],
      ['forbidden', 403],
      ['illegal_transition', 400],
      ['some_future_code', 400],
    ] as const) {
      const service = buildServiceClient({ relationshipRow: storedRelationship(), rpcOutcome: outcome })
      wire(service)

      const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'end' }), {
        params: params(),
      })
      expect(res.status).toBe(status)
    }
  })

  it('maps a 40P01 deadlock and a 55P03 lock timeout to a retry-safe 409, never a 500', async () => {
    for (const code of ['40P01', '55P03']) {
      const service = buildServiceClient({
        relationshipRow: storedRelationship(),
        rpcError: { message: 'could not obtain lock', code },
      })
      wire(service)

      const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'end' }), {
        params: params(),
      })
      expect(res.status).toBe(409)
    }
  })
})

// ─── POST is deliberately NOT on the RPC ─────────────────────────────────
describe('POST /api/workspaces/[workspaceId]/roster — proposal issuance keeps logWorkspaceAction', () => {
  it('still writes its audit row through the shared helper, because a proposal is not a consequential state change', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(postRequest(proposeBody()), { params: params() })

    expect(res.status).toBe(201)
    expect(service.calls.auditRows).toHaveLength(1)
    expect(service.calls.auditRows[0]).toMatchObject({
      action: 'workspace.roster.proposed',
      target_type: 'workspace_roster_relationship',
    })
    expect(service.calls.rpcs).toHaveLength(0)
  })
})
