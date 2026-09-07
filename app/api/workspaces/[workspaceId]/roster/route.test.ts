import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { PATCH, POST } from './route'

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

function buildSessionClient(opts: { role?: string } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: ADMIN_ID, app_metadata: {} } } }) },
    from: jest.fn((table: string) => {
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
}

/**
 * `relationshipRow` serves both verbs: POST reads it as
 * `assertCanPropose`'s "is there already a live relationship?" probe (null
 * means free to propose), PATCH reads it as the target row.
 */
function buildServiceClient(opts: { relationshipRow?: Record<string, unknown> | null } = {}) {
  const calls: ServiceCalls = { tables: [], insertedRow: null, updates: [], auditRows: [] }

  const client = {
    calls,
    from: jest.fn((table: string) => {
      calls.tables.push(table)

      if (table === 'workspace_access_config') {
        return chain({ data: { enabled: true }, error: null })
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

  it('leaves the end action untouched — it writes no date bound of its own', async () => {
    const service = buildServiceClient({ relationshipRow: storedRelationship() })
    wire(service)

    const res = await PATCH(patchRequest({ relationshipId: RELATIONSHIP_ID, action: 'end' }), {
      params: params(),
    })

    expect(res.status).toBe(200)
    expect(service.calls.updates[0]).toMatchObject({ state: 'ended' })
  })
})
