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
  private mode: 'select' | 'insert' | 'update' = 'select'
  private payload: Row | null = null

  constructor(
    private store: Store,
    private table: string
  ) {}

  private matching(): Row[] {
    const rows = this.store[this.table] ?? []
    return rows.filter((row) =>
      this.filters.every((filter) => (row[filter.column] ?? null) === filter.value)
    )
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
    workspace_audit_log: [],
    ...overrides,
  }
}

function installClients(store: Store, user: Row | null) {
  ;(createApiClient as jest.Mock).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => new FakeQuery(store, table),
  })
  ;(createServiceClient as jest.Mock).mockReturnValue({
    from: (table: string) => new FakeQuery(store, table),
  })
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
        // A revoked consent root plus the workspace's still-open delegated
        // row beneath it: the workspace is asking, the Member has not
        // granted (see the route header on how a request is represented).
        {
          id: 'grant-dead-root',
          workspace_id: WORKSPACE_ID,
          relationship_id: RELATIONSHIP_ID,
          project_id: null,
          permission: 'edit_metadata',
          source: 'member_consent',
          parent_grant_id: null,
          revoked_at: '2026-08-20T00:00:00.000Z',
        },
        {
          id: 'grant-open-request',
          workspace_id: WORKSPACE_ID,
          relationship_id: RELATIONSHIP_ID,
          project_id: null,
          permission: 'edit_metadata',
          source: 'individual',
          parent_grant_id: 'grant-dead-root',
          revoked_at: null,
        },
      ],
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
          {
            id: 'grant-excluded-request',
            workspace_id: WORKSPACE_ID,
            relationship_id: RELATIONSHIP_ID,
            project_id: null,
            permission: excluded,
            source: 'individual',
            parent_grant_id: 'grant-excluded-root',
            revoked_at: null,
          },
        ],
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
})
