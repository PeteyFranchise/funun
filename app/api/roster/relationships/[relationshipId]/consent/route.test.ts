import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { PERMISSION_TIER } from '@/lib/workspaces/permissions'
import { GET, POST, DELETE } from './route'

// ─── Route tests for the Member's own consent surface (R-01, WSR-01) ───────
// Convention borrowed from app/api/workspaces/[workspaceId]/invitations/
// route.test.ts: mock ONLY the two Supabase client factories, then drive the
// REAL route handler and the REAL lib/workspaces modules (consent.ts,
// consent-service.ts, grant-lineage.ts, grant-lineage-service.ts,
// permissions.ts, roster-service.ts, member-api-gate.ts) against an
// in-memory backend that mirrors the tables' actual shapes. Nothing about
// the authorization decision is mocked — a test that mocked
// `assertMemberMayConsent` would assert nothing about the forgery surface
// this endpoint creates (T-38.0.1-07-01).

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const RELATIONSHIP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const MEMBER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OWNER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const MISSING_RELATIONSHIP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

// The two names D-42 excludes structurally. They live here (a test file, not
// scanned by __tests__/workspace-structural-exclusions.test.ts, which walks
// non-test source only) precisely so the route can be probed with them
// without either literal ever appearing in application source.
const EXCLUDED_CAPABILITIES = ['manage_payouts', 'view_tax_information']

// ─── In-memory Supabase stand-in ──────────────────────────────────────────

type Row = Record<string, unknown>
type Store = Record<string, Row[]>

class FakeQuery {
  private filters: Array<{ column: string; value: unknown }> = []
  private inFilters: Array<{ column: string; values: readonly unknown[] }> = []
  private ordering: { column: string; ascending: boolean } | null = null
  private mode: 'select' | 'insert' | 'update' = 'select'
  private payload: Row | null = null

  constructor(
    private store: Store,
    private table: string,
    private insertFails = false
  ) {}

  private matching(): Row[] {
    const rows = this.store[this.table] ?? []
    const matched = rows.filter(
      (row) =>
        this.filters.every((filter) => (row[filter.column] ?? null) === filter.value) &&
        this.inFilters.every((filter) => filter.values.includes(row[filter.column] ?? null))
    )

    if (!this.ordering) return matched

    const { column, ascending } = this.ordering
    return [...matched].sort((left, right) => {
      const a = String(left[column] ?? '')
      const b = String(right[column] ?? '')
      if (a === b) return 0
      return (a < b ? -1 : 1) * (ascending ? 1 : -1)
    })
  }

  select(_columns?: string): this {
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value })
    return this
  }

  is(column: string, value: unknown): this {
    this.filters.push({ column, value })
    return this
  }

  in(column: string, values: readonly unknown[]): this {
    this.inFilters.push({ column, values })
    return this
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.ordering = { column, ascending: options?.ascending !== false }
    return this
  }

  insert(payload: Row): this {
    this.mode = 'insert'
    this.payload = payload
    return this
  }

  update(payload: Row): this {
    this.mode = 'update'
    this.payload = payload
    return this
  }

  private exec(): { data: Row[] | null; error: { message: string; code?: string } | null } {
    if (this.mode === 'insert') {
      // Injected write failure — used to prove that a consent write which
      // does not land leaves the ask pending.
      if (this.insertFails) {
        return { data: null, error: { message: `insert into ${this.table} refused` } }
      }
      const table = (this.store[this.table] ??= [])
      table.push({ ...(this.payload ?? {}) })
      return { data: null, error: null }
    }

    if (this.mode === 'update') {
      const matched = this.matching()
      for (const row of matched) Object.assign(row, this.payload ?? {})
      return { data: matched, error: null }
    }

    return { data: this.matching(), error: null }
  }

  async maybeSingle(): Promise<{ data: Row | null; error: { message: string } | null }> {
    const result = this.exec()
    return { data: (result.data ?? [])[0] ?? null, error: result.error }
  }

  async single(): Promise<{ data: Row | null; error: { message: string } | null }> {
    const result = this.exec()
    const row = (result.data ?? [])[0] ?? null
    return { data: row, error: row ? result.error : { message: 'No rows found' } }
  }

  then<TResult>(
    onFulfilled: (value: {
      data: Row[] | null
      error: { message: string; code?: string } | null
    }) => TResult
  ): Promise<TResult> {
    return Promise.resolve(this.exec()).then(onFulfilled)
  }
}

function buildStore(overrides: Partial<Store> = {}): Store {
  return {
    workspace_access_config: [{ id: true, enabled: true }],
    user_profiles: [{ id: MEMBER_ID }, { id: OWNER_ID }],
    workspaces: [{ id: WORKSPACE_ID, name: 'Neon Row Label', workspace_type: 'label' }],
    workspace_roster_relationships: [
      {
        id: RELATIONSHIP_ID,
        workspace_id: WORKSPACE_ID,
        member_user_id: MEMBER_ID,
        state: 'accepted',
        accepted_at: '2026-08-01T00:00:00.000Z',
      },
    ],
    workspace_agreement_evidence: [],
    workspace_grants: [],
    workspace_permission_requests: [],
    workspace_audit_log: [],
    ...overrides,
  }
}

function installClients(
  store: Store,
  user: Row | null,
  options: { failInsertOn?: string } = {}
) {
  const from = (table: string) => new FakeQuery(store, table, options.failInsertOn === table)
  ;(createApiClient as jest.Mock).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user } }) },
    from,
  })
  ;(createServiceClient as jest.Mock).mockReturnValue({ from })
}

// ─── Permission requests (migration 195) ──────────────────────────────────
// A pending ask needs NO pre-existing grant row of any kind — that is the
// bootstrap case the old derived definition structurally could not express.

const REQUEST_ID = 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1'

function pendingAsk(overrides: Row = {}): Row {
  return {
    id: REQUEST_ID,
    workspace_id: WORKSPACE_ID,
    relationship_id: RELATIONSHIP_ID,
    member_user_id: MEMBER_ID,
    permission: 'view_metadata',
    project_id: null,
    requested_by: OWNER_ID,
    requested_at: '2026-09-01T00:00:00.000Z',
    state: 'pending',
    decided_at: null,
    decided_by: null,
    note: null,
    ...overrides,
  }
}

function requestRows(store: Store): Row[] {
  return store.workspace_permission_requests ?? []
}

function memberUser() {
  return { id: MEMBER_ID, app_metadata: {} }
}

function workspaceOwnerUser() {
  return { id: OWNER_ID, app_metadata: {} }
}

function staffUser() {
  return { id: OWNER_ID, app_metadata: { staff_roles: ['leadership'] } }
}

function params(relationshipId = RELATIONSHIP_ID) {
  return { params: Promise.resolve({ relationshipId }) }
}

function url(relationshipId = RELATIONSHIP_ID) {
  return `http://t.local/api/roster/relationships/${relationshipId}/consent`
}

function getRequest(relationshipId = RELATIONSHIP_ID) {
  return new Request(url(relationshipId))
}

function bodyRequest(method: 'POST' | 'DELETE', body: unknown, relationshipId = RELATIONSHIP_ID) {
  return new Request(url(relationshipId), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function liveGrants(store: Store) {
  return (store.workspace_grants ?? []).filter((row) => (row.revoked_at ?? null) === null)
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── GET ──────────────────────────────────────────────────────────────────

describe('GET /api/roster/relationships/[relationshipId]/consent', () => {
  it('returns the workspace display fields, granted permissions and outstanding requests for the named Member', async () => {
    const store = buildStore({
      workspace_grants: [
        // A live consent root — currently granted.
        {
          id: 'grant-live-root',
          workspace_id: WORKSPACE_ID,
          relationship_id: RELATIONSHIP_ID,
          project_id: null,
          permission: 'view_metadata',
          source: 'member_consent',
          parent_grant_id: null,
          revoked_at: null,
        },
      ],
      // The workspace is asking for edit_metadata and the Member has not
      // answered — a row in workspace_permission_requests, which is the
      // only place an ask is recorded (migration 195).
      workspace_permission_requests: [pendingAsk({ permission: 'edit_metadata' })],
    })
    installClients(store, memberUser())

    const response = await GET(getRequest(), params())
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.data.workspaceName).toBe('Neon Row Label')
    expect(body.data.workspaceType).toBe('label')
    expect(body.data.relationshipState).toBe('accepted')
    expect(body.data.relationshipAcceptedAt).toBe('2026-08-01T00:00:00.000Z')
    expect(body.data.granted).toEqual([
      { permission: 'view_metadata', tier: PERMISSION_TIER.view_metadata, sensitive: false },
    ])
    expect(body.data.requested).toEqual([
      { permission: 'edit_metadata', tier: PERMISSION_TIER.edit_metadata, sensitive: false },
    ])
  })

  it('flags a D-40 bundle-excluded permission as sensitive', async () => {
    const store = buildStore({
      workspace_grants: [
        {
          id: 'grant-sensitive',
          workspace_id: WORKSPACE_ID,
          relationship_id: RELATIONSHIP_ID,
          project_id: null,
          permission: 'view_earnings',
          source: 'member_consent',
          parent_grant_id: null,
          revoked_at: null,
        },
      ],
    })
    installClients(store, memberUser())

    const body = await (await GET(getRequest(), params())).json()
    expect(body.data.granted).toEqual([
      { permission: 'view_earnings', tier: 'operational', sensitive: true },
    ])
  })

  it.each(EXCLUDED_CAPABILITIES)(
    'never returns %s in any list, even when a row somehow carries it',
    async (excluded) => {
      const store = buildStore({
        workspace_grants: [
          {
            id: 'grant-excluded-root',
            workspace_id: WORKSPACE_ID,
            relationship_id: RELATIONSHIP_ID,
            project_id: null,
            permission: excluded,
            source: 'member_consent',
            parent_grant_id: null,
            revoked_at: null,
          },
        ],
        // Unstorable in the real schema (migration 195's own structural
        // exclusion constraint); seeded here anyway, because the reader must
        // not depend on that constraint to keep the name off the surface.
        workspace_permission_requests: [pendingAsk({ permission: excluded })],
      })
      installClients(store, memberUser())

      const response = await GET(getRequest(), params())
      const raw = await response.text()

      expect(raw).not.toContain(excluded)
      const body = JSON.parse(raw)
      expect(body.data.granted).toEqual([])
      expect(body.data.requested).toEqual([])
    }
  )

  it('refuses a workspace owner who is not the named Member with a generic 403', async () => {
    const store = buildStore()
    installClients(store, workspaceOwnerUser())

    const response = await GET(getRequest(), params())
    expect(response.status).toBe(403)

    const body = await response.json()
    expect(body.data).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('Neon Row Label')
  })

  it('returns the same 403 body for a relationship that does not exist (no enumeration)', async () => {
    const store = buildStore()
    installClients(store, memberUser())

    const missing = await GET(getRequest(MISSING_RELATIONSHIP_ID), params(MISSING_RELATIONSHIP_ID))
    installClients(buildStore(), workspaceOwnerUser())
    const mismatched = await GET(getRequest(), params())

    expect(missing.status).toBe(403)
    expect(mismatched.status).toBe(403)
    expect(await missing.json()).toEqual(await mismatched.json())
  })

  it('returns 401 for an unauthenticated caller', async () => {
    installClients(buildStore(), null)
    const response = await GET(getRequest(), params())
    expect(response.status).toBe(401)
  })

  it('refuses a Funun Team Member identity with the Member-only account gate', async () => {
    installClients(buildStore(), staffUser())
    const response = await GET(getRequest(), params())
    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(/Member account/)
  })

  // THE CASE THE OLD DERIVATION COULD NOT REPRESENT. Pending used to be
  // inferred from delegated grant rows whose lineage had gone dead, which
  // only ever populated after a consent-then-revoke. A workspace asking for
  // the very first time — zero grant rows in existence — was invisible.
  it('shows a first-time ask with zero pre-existing grant rows of any kind', async () => {
    const store = buildStore({
      workspace_permission_requests: [pendingAsk({ permission: 'view_metadata' })],
    })
    expect(store.workspace_grants).toHaveLength(0)
    installClients(store, memberUser())

    const body = await (await GET(getRequest(), params())).json()

    expect(body.data.granted).toEqual([])
    expect(body.data.requested).toEqual([
      { permission: 'view_metadata', tier: PERMISSION_TIER.view_metadata, sensitive: false },
    ])
  })

  it.each(['approved', 'declined', 'withdrawn'])(
    'does not show a %s request — only pending asks are outstanding',
    async (state) => {
      const store = buildStore({
        workspace_permission_requests: [
          pendingAsk({
            state,
            decided_at: '2026-09-02T00:00:00.000Z',
            decided_by: state === 'withdrawn' ? OWNER_ID : MEMBER_ID,
          }),
        ],
      })
      installClients(store, memberUser())

      const body = await (await GET(getRequest(), params())).json()
      expect(body.data.requested).toEqual([])
    }
  )

  it('does not show a pending ask filed against another relationship', async () => {
    const store = buildStore({
      workspace_permission_requests: [
        pendingAsk({ relationship_id: MISSING_RELATIONSHIP_ID, permission: 'edit_metadata' }),
      ],
    })
    installClients(store, memberUser())

    const body = await (await GET(getRequest(), params())).json()
    expect(body.data.requested).toEqual([])
  })

  it('does not re-ask for a permission the Member has already granted', async () => {
    const store = buildStore({
      workspace_grants: [
        {
          id: 'grant-live-root',
          workspace_id: WORKSPACE_ID,
          relationship_id: RELATIONSHIP_ID,
          project_id: null,
          permission: 'view_metadata',
          source: 'member_consent',
          parent_grant_id: null,
          revoked_at: null,
        },
      ],
      workspace_permission_requests: [pendingAsk({ permission: 'view_metadata' })],
    })
    installClients(store, memberUser())

    const body = await (await GET(getRequest(), params())).json()
    expect(body.data.granted).toEqual([
      { permission: 'view_metadata', tier: PERMISSION_TIER.view_metadata, sensitive: false },
    ])
    expect(body.data.requested).toEqual([])
  })
})

// ─── POST ─────────────────────────────────────────────────────────────────

describe('POST /api/roster/relationships/[relationshipId]/consent', () => {
  it('writes consent roots for the named Member and returns the written permissions', async () => {
    const store = buildStore()
    installClients(store, memberUser())

    const response = await POST(
      bodyRequest('POST', { permissions: ['view_metadata', 'view_split_sheets'] }),
      params()
    )
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.data.permissions).toEqual(['view_metadata', 'view_split_sheets'])

    const written = liveGrants(store)
    expect(written).toHaveLength(2)
    expect(written.every((row) => row.source === 'member_consent')).toBe(true)
    expect(written.every((row) => row.parent_grant_id === null)).toBe(true)
    expect(written.every((row) => row.granted_by === MEMBER_ID)).toBe(true)
  })

  it('writes an audit row naming the consenting Member as both actor and subject, carrying only the permission list', async () => {
    const store = buildStore()
    installClients(store, memberUser())

    await POST(bodyRequest('POST', { permissions: ['view_metadata'] }), params())

    expect(store.workspace_audit_log).toHaveLength(1)
    const entry = store.workspace_audit_log[0]
    expect(entry.actor_user_id).toBe(MEMBER_ID)
    expect(entry.subject_member_id).toBe(MEMBER_ID)
    expect(entry.action).toBe('workspace.consent.granted')
    expect(entry.target_type).toBe('workspace_roster_relationship')
    expect(entry.target_id).toBe(RELATIONSHIP_ID)
    expect(entry.changes).toEqual({ permissions: ['view_metadata'] })
  })

  it('refuses a workspace owner who is not the named Member with 403 and writes nothing', async () => {
    const store = buildStore()
    installClients(store, workspaceOwnerUser())

    const response = await POST(bodyRequest('POST', { permissions: ['view_metadata'] }), params())
    expect(response.status).toBe(403)
    expect(store.workspace_grants).toHaveLength(0)
    expect(store.workspace_audit_log).toHaveLength(0)
  })

  it.each(EXCLUDED_CAPABILITIES)('refuses %s by name and writes nothing', async (excluded) => {
    const store = buildStore()
    installClients(store, memberUser())

    const response = await POST(bodyRequest('POST', { permissions: [excluded] }), params())
    expect([400, 403]).toContain(response.status)
    expect((await response.json()).error).toMatch(/structurally excluded/)
    expect(store.workspace_grants).toHaveLength(0)
  })

  it('refuses an authority-tier permission on an operational relationship and writes nothing at all (all-or-nothing)', async () => {
    const store = buildStore()
    installClients(store, memberUser())

    const response = await POST(
      bodyRequest('POST', { permissions: ['view_metadata', 'approve_releases'] }),
      params()
    )

    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(/authority-tier permission/)
    expect(store.workspace_grants).toHaveLength(0)
  })

  it('rejects an unrecognised permission by name', async () => {
    const store = buildStore()
    installClients(store, memberUser())

    const response = await POST(bodyRequest('POST', { permissions: ['run_the_label'] }), params())
    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(/run_the_label/)
    expect(store.workspace_grants).toHaveLength(0)
  })

  it('rejects an unknown body key (strict schema, D-31)', async () => {
    const store = buildStore()
    installClients(store, memberUser())

    const response = await POST(
      bodyRequest('POST', {
        permissions: ['view_metadata'],
        relationshipId: MISSING_RELATIONSHIP_ID,
        memberUserId: OWNER_ID,
      }),
      params()
    )

    expect(response.status).toBe(400)
    expect(store.workspace_grants).toHaveLength(0)
  })

  it('rejects an empty permission list', async () => {
    const store = buildStore()
    installClients(store, memberUser())

    const response = await POST(bodyRequest('POST', { permissions: [] }), params())
    expect(response.status).toBe(400)
    expect(store.workspace_grants).toHaveLength(0)
  })
})

// ─── POST as an ANSWER to a pending ask (R-19 / WSR-28) ───────────────────

describe('POST approves a pending permission request', () => {
  function auditActions(store: Store): unknown[] {
    return (store.workspace_audit_log ?? []).map((entry) => entry.action)
  }

  it('issues the consent AND moves the request row out of pending', async () => {
    const store = buildStore({ workspace_permission_requests: [pendingAsk()] })
    installClients(store, memberUser())

    const response = await POST(
      bodyRequest('POST', { permissions: ['view_metadata'], decision: 'approved' }),
      params()
    )

    expect(response.status).toBe(200)
    expect((await response.json()).data.permissions).toEqual(['view_metadata'])

    const written = liveGrants(store)
    expect(written).toHaveLength(1)
    expect(written[0].source).toBe('member_consent')
    expect(written[0].granted_by).toBe(MEMBER_ID)

    const [ask] = requestRows(store)
    expect(ask.state).toBe('approved')
    expect(ask.decided_by).toBe(MEMBER_ID)
    expect(ask.decided_at).not.toBeNull()

    expect(auditActions(store)).toEqual(
      expect.arrayContaining([
        'workspace.permission_request.approved',
        'workspace.consent.granted',
      ])
    )
  })

  it('leaves the ask pending when the consent write does not land', async () => {
    const store = buildStore({ workspace_permission_requests: [pendingAsk()] })
    installClients(store, memberUser(), { failInsertOn: 'workspace_grants' })

    const response = await POST(
      bodyRequest('POST', { permissions: ['view_metadata'], decision: 'approved' }),
      params()
    )

    expect(response.status).toBe(500)
    expect(store.workspace_grants).toHaveLength(0)

    const [ask] = requestRows(store)
    expect(ask.state).toBe('pending')
    expect(ask.decided_at).toBeNull()
    expect(ask.decided_by).toBeNull()

    // Nothing is recorded at all — no approval and no consent.
    expect(store.workspace_audit_log).toHaveLength(0)
  })

  it('clears a matching ask even when the Member simply grants, with no decision key', async () => {
    const store = buildStore({ workspace_permission_requests: [pendingAsk()] })
    installClients(store, memberUser())

    const response = await POST(bodyRequest('POST', { permissions: ['view_metadata'] }), params())

    expect(response.status).toBe(200)
    expect(liveGrants(store)).toHaveLength(1)
    expect(requestRows(store)[0].state).toBe('approved')
  })

  it('refuses an explicit approval naming a permission nobody asked for, and writes nothing', async () => {
    const store = buildStore()
    installClients(store, memberUser())

    const response = await POST(
      bodyRequest('POST', { permissions: ['view_metadata'], decision: 'approved' }),
      params()
    )

    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/view_metadata/)
    expect(store.workspace_grants).toHaveLength(0)
    expect(store.workspace_audit_log).toHaveLength(0)
  })

  it('refuses an approval of an ask that is no longer pending, and leaves it as it was', async () => {
    const store = buildStore({
      workspace_permission_requests: [
        pendingAsk({
          state: 'declined',
          decided_at: '2026-09-02T00:00:00.000Z',
          decided_by: MEMBER_ID,
        }),
      ],
    })
    installClients(store, memberUser())

    const response = await POST(
      bodyRequest('POST', { permissions: ['view_metadata'], decision: 'approved' }),
      params()
    )

    expect(response.status).toBe(409)
    expect(store.workspace_grants).toHaveLength(0)
    expect(requestRows(store)[0].state).toBe('declined')
  })

  // The denormalised member_user_id cannot drift in the real schema
  // (migration 195's own trigger), so this probes the SECOND enforcement
  // point: decidePermissionRequest re-compares the two ids itself.
  it('refuses an ask whose member_user_id names somebody else, and writes nothing', async () => {
    const store = buildStore({
      workspace_permission_requests: [pendingAsk({ member_user_id: OWNER_ID })],
    })
    installClients(store, memberUser())

    const response = await POST(
      bodyRequest('POST', { permissions: ['view_metadata'], decision: 'approved' }),
      params()
    )

    expect(response.status).toBe(403)
    expect(store.workspace_grants).toHaveLength(0)
    expect(requestRows(store)[0].state).toBe('pending')
  })

  // All-or-nothing survives the split between the two writers: one asked
  // permission, one unasked and refusable, nothing written for either.
  it('writes nothing at all when one permission in a mixed set is refusable', async () => {
    const store = buildStore({ workspace_permission_requests: [pendingAsk()] })
    installClients(store, memberUser())

    const response = await POST(
      bodyRequest('POST', { permissions: ['view_metadata', 'approve_releases'] }),
      params()
    )

    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(/authority-tier permission/)
    expect(store.workspace_grants).toHaveLength(0)
    expect(requestRows(store)[0].state).toBe('pending')
    expect(store.workspace_audit_log).toHaveLength(0)
  })
})

// ─── POST as a DECLINE — issues nothing, revokes nothing ──────────────────

describe('POST declines a pending permission request', () => {
  function declineBody(permissions: string[]) {
    return bodyRequest('POST', { permissions, decision: 'declined' })
  }

  it('records the decline and writes no grant row of any kind', async () => {
    const store = buildStore({ workspace_permission_requests: [pendingAsk()] })
    installClients(store, memberUser())

    const result = await POST(declineBody(['view_metadata']), params())

    expect(result.status).toBe(200)
    expect((await result.json()).data.permissions).toEqual(['view_metadata'])

    expect(store.workspace_grants).toHaveLength(0)

    const [ask] = requestRows(store)
    expect(ask.state).toBe('declined')
    expect(ask.decided_by).toBe(MEMBER_ID)
    expect(ask.decided_at).not.toBeNull()

    const actions = (store.workspace_audit_log ?? []).map((entry) => entry.action)
    expect(actions).toEqual(['workspace.permission_request.declined'])
  })

  // DECLINE IS NOT REVOKE. A live consent for the same permission is a
  // different fact from a pending ask about it, and saying no to the ask
  // must not take away what was already given.
  it('leaves a live consent for the same permission untouched', async () => {
    const store = buildStore({
      workspace_grants: [
        {
          id: 'grant-live-root',
          workspace_id: WORKSPACE_ID,
          relationship_id: RELATIONSHIP_ID,
          project_id: null,
          permission: 'view_metadata',
          source: 'member_consent',
          parent_grant_id: null,
          revoked_at: null,
          revoked_by: null,
        },
      ],
      workspace_permission_requests: [pendingAsk({ permission: 'view_metadata' })],
    })
    installClients(store, memberUser())

    const result = await POST(declineBody(['view_metadata']), params())

    expect(result.status).toBe(200)
    expect(store.workspace_grants).toHaveLength(1)
    expect(store.workspace_grants[0].revoked_at).toBeNull()
    expect(store.workspace_grants[0].revoked_by).toBeNull()
    expect(requestRows(store)[0].state).toBe('declined')
  })

  it('refuses a decline of an already-decided request and leaves it as it was', async () => {
    const store = buildStore({
      workspace_permission_requests: [
        pendingAsk({
          state: 'approved',
          decided_at: '2026-09-02T00:00:00.000Z',
          decided_by: MEMBER_ID,
        }),
      ],
    })
    installClients(store, memberUser())

    const result = await POST(declineBody(['view_metadata']), params())

    expect(result.status).toBe(409)
    expect(requestRows(store)[0].state).toBe('approved')
    expect(requestRows(store)[0].decided_at).toBe('2026-09-02T00:00:00.000Z')
  })

  it('refuses a decline naming a permission nobody asked for, rather than no-opping', async () => {
    const store = buildStore()
    installClients(store, memberUser())

    const result = await POST(declineBody(['view_metadata']), params())

    expect(result.status).toBe(409)
    expect((await result.json()).error).toMatch(/view_metadata/)
    expect(store.workspace_grants).toHaveLength(0)
    expect(store.workspace_audit_log).toHaveLength(0)
  })

  it('refuses an ask whose member_user_id names somebody else', async () => {
    const store = buildStore({
      workspace_permission_requests: [pendingAsk({ member_user_id: OWNER_ID })],
    })
    installClients(store, memberUser())

    const result = await POST(declineBody(['view_metadata']), params())

    expect(result.status).toBe(403)
    expect(requestRows(store)[0].state).toBe('pending')
  })

  // Consent requires an accepted relationship; saying NO does not. A Member
  // who never accepted must still be able to close the question.
  it('lets the Member decline an ask on a relationship they never accepted', async () => {
    const store = buildStore({
      workspace_roster_relationships: [
        {
          id: RELATIONSHIP_ID,
          workspace_id: WORKSPACE_ID,
          member_user_id: MEMBER_ID,
          state: 'proposed',
          accepted_at: null,
        },
      ],
      workspace_permission_requests: [pendingAsk()],
    })
    installClients(store, memberUser())

    const result = await POST(declineBody(['view_metadata']), params())

    expect(result.status).toBe(200)
    expect(store.workspace_grants).toHaveLength(0)
    expect(requestRows(store)[0].state).toBe('declined')
  })

  it('refuses a workspace owner who is not the named Member and leaves the ask pending', async () => {
    const store = buildStore({ workspace_permission_requests: [pendingAsk()] })
    installClients(store, workspaceOwnerUser())

    const result = await POST(declineBody(['view_metadata']), params())

    expect(result.status).toBe(403)
    expect(requestRows(store)[0].state).toBe('pending')
  })

  it('rejects an unrecognised decision value', async () => {
    const store = buildStore({ workspace_permission_requests: [pendingAsk()] })
    installClients(store, memberUser())

    const result = await POST(
      bodyRequest('POST', { permissions: ['view_metadata'], decision: 'withdrawn' }),
      params()
    )

    expect(result.status).toBe(400)
    expect(requestRows(store)[0].state).toBe('pending')
  })
})

// ─── DELETE ───────────────────────────────────────────────────────────────

describe('DELETE /api/roster/relationships/[relationshipId]/consent', () => {
  function storeWithLiveConsent(): Store {
    return buildStore({
      workspace_grants: [
        {
          id: 'grant-live-root',
          workspace_id: WORKSPACE_ID,
          relationship_id: RELATIONSHIP_ID,
          project_id: null,
          permission: 'view_metadata',
          source: 'member_consent',
          parent_grant_id: null,
          revoked_at: null,
          revoked_by: null,
        },
      ],
    })
  }

  it('revokes the named permissions on the Member own consent roots and returns them', async () => {
    const store = storeWithLiveConsent()
    installClients(store, memberUser())

    const response = await DELETE(
      bodyRequest('DELETE', { permissions: ['view_metadata'] }),
      params()
    )
    expect(response.status).toBe(200)
    expect((await response.json()).data.permissions).toEqual(['view_metadata'])

    // Never deleted — the row persists carrying its revocation stamp.
    expect(store.workspace_grants).toHaveLength(1)
    expect(store.workspace_grants[0].revoked_at).not.toBeNull()
    expect(store.workspace_grants[0].revoked_by).toBe(MEMBER_ID)
  })

  it('writes a revocation audit row carrying only the permission list', async () => {
    const store = storeWithLiveConsent()
    installClients(store, memberUser())

    await DELETE(bodyRequest('DELETE', { permissions: ['view_metadata'] }), params())

    expect(store.workspace_audit_log).toHaveLength(1)
    const entry = store.workspace_audit_log[0]
    expect(entry.action).toBe('workspace.consent.revoked')
    expect(entry.actor_user_id).toBe(MEMBER_ID)
    expect(entry.subject_member_id).toBe(MEMBER_ID)
    expect(entry.changes).toEqual({ permissions: ['view_metadata'] })
  })

  it('refuses a workspace owner who is not the named Member and leaves the grant live', async () => {
    const store = storeWithLiveConsent()
    installClients(store, workspaceOwnerUser())

    const response = await DELETE(
      bodyRequest('DELETE', { permissions: ['view_metadata'] }),
      params()
    )

    expect(response.status).toBe(403)
    expect(store.workspace_grants[0].revoked_at).toBeNull()
  })

  it('rejects a projectId on a revoke rather than silently ignoring it', async () => {
    const store = storeWithLiveConsent()
    installClients(store, memberUser())

    const response = await DELETE(
      bodyRequest('DELETE', {
        permissions: ['view_metadata'],
        projectId: '11111111-1111-1111-1111-111111111111',
      }),
      params()
    )

    expect(response.status).toBe(400)
    expect(store.workspace_grants[0].revoked_at).toBeNull()
  })

  it('rejects a decision key on a revoke — declining is not done here', async () => {
    const store = storeWithLiveConsent()
    installClients(store, memberUser())

    const response = await DELETE(
      bodyRequest('DELETE', { permissions: ['view_metadata'], decision: 'declined' }),
      params()
    )

    expect(response.status).toBe(400)
    expect(store.workspace_grants[0].revoked_at).toBeNull()
  })

  it('leaves a pending ask exactly as it was — a revoke answers no question', async () => {
    const store = storeWithLiveConsent()
    store.workspace_permission_requests = [pendingAsk({ permission: 'edit_metadata' })]
    installClients(store, memberUser())

    const response = await DELETE(
      bodyRequest('DELETE', { permissions: ['view_metadata'] }),
      params()
    )

    expect(response.status).toBe(200)
    expect(requestRows(store)[0].state).toBe('pending')
    expect(requestRows(store)[0].decided_at).toBeNull()
  })
})

// ─── Kill switch (D-56) ───────────────────────────────────────────────────

describe('the D-56 kill switch fails every verb closed', () => {
  function disabledStore(): Store {
    return buildStore({ workspace_access_config: [{ id: true, enabled: false }] })
  }

  it('returns 503 on GET', async () => {
    installClients(disabledStore(), memberUser())
    expect((await GET(getRequest(), params())).status).toBe(503)
  })

  it('returns 503 on POST and writes nothing', async () => {
    const store = disabledStore()
    installClients(store, memberUser())

    const response = await POST(bodyRequest('POST', { permissions: ['view_metadata'] }), params())
    expect(response.status).toBe(503)
    expect(store.workspace_grants).toHaveLength(0)
  })

  it('returns 503 on DELETE', async () => {
    installClients(disabledStore(), memberUser())
    const response = await DELETE(
      bodyRequest('DELETE', { permissions: ['view_metadata'] }),
      params()
    )
    expect(response.status).toBe(503)
  })

  it('returns 503 when the config row is missing entirely (fails closed)', async () => {
    installClients(buildStore({ workspace_access_config: [] }), memberUser())
    expect((await GET(getRequest(), params())).status).toBe(503)
  })

  // ─── Ordering: auth is decided BEFORE the switch (38.0.1 notes §1) ───────
  //
  // The four cases above all authenticate, so they pass under either ordering
  // and cannot detect a regression here. This one can: while the switch is
  // OFF, an unauthenticated caller must still be refused as UNAUTHENTICATED.
  //
  // A 503 here would mean the route consulted a platform-wide control, and
  // performed a service-role database read, on behalf of somebody it had not
  // identified — and would disclose whether workspace access is enabled to
  // anyone who asked. Both statuses are refusals, so only the code tells them
  // apart; assert it exactly rather than merely asserting "not 2xx".
  it('an unauthenticated caller gets 401, not 503 — auth is decided before the switch', async () => {
    installClients(disabledStore(), null)
    const response = await GET(getRequest(), params())

    expect(response.status).toBe(401)
    expect(response.status).not.toBe(503)
  })

  it('an unauthenticated caller gets 401 on POST too, and writes nothing', async () => {
    const store = disabledStore()
    installClients(store, null)

    const response = await POST(bodyRequest('POST', { permissions: ['view_metadata'] }), params())

    expect(response.status).toBe(401)
    expect(store.workspace_grants).toHaveLength(0)
  })
})
