import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { MEMBER_CONSENT_SOURCE } from '@/lib/workspaces/grant-lineage'
import { STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES } from '@/lib/workspaces/permissions'
import * as routeModule from './route'
import { GET } from './route'

// ─── Route tests for the Member's aggregate consent view (WSR-27) ─────────
// Same convention as app/api/roster/relationships/[relationshipId]/consent/
// route.test.ts: mock ONLY the two Supabase client factories, then drive the
// REAL handler and the REAL lib/workspaces modules (request-service.ts,
// grant-lineage-service.ts, grant-lineage.ts, permissions.ts,
// member-api-gate.ts, access-kill-switch.ts) against an in-memory backend
// that mirrors the tables' actual shapes. Nothing about the scoping
// decision is mocked — a test that stubbed "these rows name me" would
// assert nothing about T-38.0.1-12-01, which is the whole point of this
// endpoint's threat model.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const MEMBER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OWNER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const WORKSPACE_B_ID = '99999999-9999-9999-9999-999999999999'
const RELATIONSHIP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const RELATIONSHIP_B_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const PROJECT_ID = '77777777-7777-7777-7777-777777777777'

// The two D-42 names live only in this test file — it is a .test.ts and is
// therefore not walked by __tests__/workspace-structural-exclusions.test.ts,
// so the route can be probed with them without either literal appearing in
// application source. Imported, not restated, so the probe cannot drift.
const EXCLUDED_CAPABILITIES: readonly string[] = STRUCTURALLY_EXCLUDED_CAPABILITY_VALUES

// ─── In-memory Supabase stand-in ──────────────────────────────────────────

type Row = Record<string, unknown>
type Store = Record<string, Row[]>

class FakeQuery {
  private eqFilters: Array<{ column: string; value: unknown }> = []
  private inFilters: Array<{ column: string; values: unknown[] }> = []

  constructor(
    private store: Store,
    private table: string
  ) {}

  private matching(): Row[] {
    const rows = this.store[this.table] ?? []
    return rows.filter(
      (row) =>
        this.eqFilters.every((filter) => (row[filter.column] ?? null) === filter.value) &&
        this.inFilters.every((filter) => filter.values.includes(row[filter.column] ?? null))
    )
  }

  select(_columns?: string): this {
    return this
  }

  eq(column: string, value: unknown): this {
    this.eqFilters.push({ column, value })
    return this
  }

  in(column: string, values: unknown[]): this {
    this.inFilters.push({ column, values })
    return this
  }

  order(_column: string, _options?: unknown): this {
    return this
  }

  async maybeSingle(): Promise<{ data: Row | null; error: null }> {
    return { data: this.matching()[0] ?? null, error: null }
  }

  then<TResult>(
    onFulfilled: (value: { data: Row[]; error: null }) => TResult
  ): Promise<TResult> {
    return Promise.resolve({ data: this.matching(), error: null }).then(onFulfilled)
  }
}

function buildStore(overrides: Partial<Store> = {}): Store {
  return {
    workspace_access_config: [{ id: true, enabled: true }],
    user_profiles: [{ id: MEMBER_ID }, { id: OWNER_ID }],
    workspaces: [
      { id: WORKSPACE_ID, name: 'Neon Row Label', workspace_type: 'label' },
      { id: WORKSPACE_B_ID, name: 'Third Coast Management', workspace_type: 'management' },
    ],
    workspace_roster_relationships: [
      {
        id: RELATIONSHIP_ID,
        workspace_id: WORKSPACE_ID,
        member_user_id: MEMBER_ID,
        state: 'accepted',
        accepted_at: '2026-08-01T00:00:00.000Z',
        created_at: '2026-07-01T00:00:00.000Z',
      },
    ],
    workspace_permission_requests: [],
    workspace_grants: [],
    ...overrides,
  }
}

function pendingRequest(overrides: Row = {}): Row {
  return {
    id: `req-${Math.random().toString(16).slice(2)}`,
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

function consentRoot(overrides: Row = {}): Row {
  return {
    id: `grant-${Math.random().toString(16).slice(2)}`,
    workspace_id: WORKSPACE_ID,
    relationship_id: RELATIONSHIP_ID,
    parent_grant_id: null,
    source: MEMBER_CONSENT_SOURCE,
    permission: 'view_summaries',
    project_id: null,
    revoked_at: null,
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

function request() {
  return new Request('http://t.local/api/settings/permissions')
}

async function callGet(store: Store, user: Row | null) {
  installClients(store, user)
  const response = await GET(request())
  return { response, body: await response.json() }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/settings/permissions — the Member sees their own rows', () => {
  it('returns pending requests and active permissions, grouped by workspace', async () => {
    const store = buildStore({
      workspace_permission_requests: [
        pendingRequest({ permission: 'edit_metadata' }),
        pendingRequest({ permission: 'access_clean_masters' }),
      ],
      workspace_grants: [consentRoot({ permission: 'view_summaries' })],
    })

    const { response, body } = await callGet(store, memberUser())

    expect(response.status).toBe(200)
    expect(body.pending).toHaveLength(1)
    expect(body.pending[0]).toEqual({
      workspaceId: WORKSPACE_ID,
      workspaceName: 'Neon Row Label',
      workspaceType: 'label',
      relationshipId: RELATIONSHIP_ID,
      relationshipAcceptedAt: '2026-08-01T00:00:00.000Z',
      permissions: [
        { permission: 'edit_metadata', tier: 'operational', sensitive: false },
        { permission: 'access_clean_masters', tier: 'operational', sensitive: true },
      ],
    })

    expect(body.active).toEqual([
      {
        workspaceId: WORKSPACE_ID,
        workspaceName: 'Neon Row Label',
        workspaceType: 'label',
        relationshipId: RELATIONSHIP_ID,
        relationshipAcceptedAt: '2026-08-01T00:00:00.000Z',
        permissions: [{ permission: 'view_summaries', tier: 'operational', sensitive: false }],
      },
    ])
  })

  it('carries the authority tier through for an authority-tier ask', async () => {
    const store = buildStore({
      workspace_permission_requests: [pendingRequest({ permission: 'act_on_behalf' })],
    })

    const { body } = await callGet(store, memberUser())

    expect(body.pending[0].permissions).toEqual([
      { permission: 'act_on_behalf', tier: 'authority', sensitive: false },
    ])
  })

  it('emits one group per requesting workspace when two workspaces are asking', async () => {
    const store = buildStore({
      workspace_roster_relationships: [
        {
          id: RELATIONSHIP_ID,
          workspace_id: WORKSPACE_ID,
          member_user_id: MEMBER_ID,
          state: 'accepted',
          accepted_at: '2026-08-01T00:00:00.000Z',
          created_at: '2026-07-01T00:00:00.000Z',
        },
        {
          id: RELATIONSHIP_B_ID,
          workspace_id: WORKSPACE_B_ID,
          member_user_id: MEMBER_ID,
          state: 'proposed',
          accepted_at: null,
          created_at: '2026-08-20T00:00:00.000Z',
        },
      ],
      workspace_permission_requests: [
        pendingRequest({ permission: 'view_metadata' }),
        pendingRequest({
          workspace_id: WORKSPACE_B_ID,
          relationship_id: RELATIONSHIP_B_ID,
          permission: 'view_split_sheets',
        }),
      ],
    })

    const { body } = await callGet(store, memberUser())

    expect(body.pending.map((group: { workspaceId: string }) => group.workspaceId)).toEqual([
      WORKSPACE_ID,
      WORKSPACE_B_ID,
    ])
    // A proposed relationship has no accepted date, and that is a null, not
    // a fabricated one — a workspace may ask alongside its proposal.
    expect(body.pending[1].relationshipAcceptedAt).toBeNull()
  })
})

describe('GET /api/settings/permissions — scoping (T-38.0.1-12-01)', () => {
  it('shows a workspace owner nothing for a relationship that does not name them', async () => {
    const store = buildStore({
      workspace_permission_requests: [pendingRequest()],
      workspace_grants: [consentRoot()],
    })

    const { response, body } = await callGet(store, workspaceOwnerUser())

    expect(response.status).toBe(200)
    expect(body).toEqual({ pending: [], active: [] })
  })

  it('never returns a pending request naming another Member', async () => {
    const store = buildStore({
      workspace_permission_requests: [
        pendingRequest({ member_user_id: OWNER_ID, permission: 'view_earnings' }),
      ],
    })

    const { body } = await callGet(store, memberUser())

    expect(body.pending).toEqual([])
  })
})

describe('GET /api/settings/permissions — empty and decided states', () => {
  it('emits no pending card for a workspace with no undecided permissions', async () => {
    const store = buildStore({
      workspace_permission_requests: [
        pendingRequest({ state: 'approved', decided_at: '2026-09-02T00:00:00.000Z', decided_by: MEMBER_ID }),
        pendingRequest({ state: 'declined', decided_at: '2026-09-02T00:00:00.000Z', decided_by: MEMBER_ID }),
        pendingRequest({ state: 'withdrawn', decided_at: '2026-09-02T00:00:00.000Z', decided_by: OWNER_ID }),
      ],
    })

    const { body } = await callGet(store, memberUser())

    expect(body.pending).toEqual([])
  })

  it('returns an empty active array rather than omitting it when nothing is granted', async () => {
    const store = buildStore({ workspace_permission_requests: [pendingRequest()] })

    const { body } = await callGet(store, memberUser())

    expect(Object.prototype.hasOwnProperty.call(body, 'active')).toBe(true)
    expect(body.active).toEqual([])
  })

  // A project-scoped ask is deliberately NOT surfaced by this minimal
  // aggregate: the group shape carries no project, so a client approving
  // from it would send a relationship-wide consent and grant MORE than was
  // asked for. Showing nothing is the fail-closed answer until 38.1's real
  // workspace UX carries project scope end to end.
  it('omits a project-scoped ask rather than presenting it as relationship-wide', async () => {
    const store = buildStore({
      workspace_permission_requests: [
        pendingRequest({ permission: 'upload_audio', project_id: PROJECT_ID }),
      ],
    })

    const { body } = await callGet(store, memberUser())

    expect(body.pending).toEqual([])
  })

  it('drops a revoked consent root from the active list', async () => {
    const store = buildStore({
      workspace_grants: [consentRoot({ revoked_at: '2026-09-03T00:00:00.000Z' })],
    })

    const { body } = await callGet(store, memberUser())

    expect(body).toEqual({ pending: [], active: [] })
  })
})

describe('GET /api/settings/permissions — structural exclusion (T-38.0.1-12-03)', () => {
  it('returns neither structurally excluded capability from either array', async () => {
    const store = buildStore({
      workspace_permission_requests: EXCLUDED_CAPABILITIES.map((permission) =>
        pendingRequest({ permission })
      ),
      workspace_grants: EXCLUDED_CAPABILITIES.map((permission) => consentRoot({ permission })),
    })

    const { body } = await callGet(store, memberUser())

    const serialized = JSON.stringify(body)
    const offending = EXCLUDED_CAPABILITIES.filter((name) => serialized.includes(name))
    expect(offending).toEqual([])
    expect(body).toEqual({ pending: [], active: [] })
  })
})

describe('GET /api/settings/permissions — the response carries no restricted PII (T-38.0.1-12-04)', () => {
  it('returns no email, no third-party member id and no document reference', async () => {
    const store = buildStore({
      workspace_permission_requests: [pendingRequest()],
      workspace_grants: [consentRoot()],
    })

    const { body } = await callGet(store, memberUser())
    const serialized = JSON.stringify(body)

    expect(serialized).not.toContain('@')
    expect(serialized).not.toContain(OWNER_ID)
    expect(serialized).not.toContain(MEMBER_ID)
    expect(serialized).not.toContain('evidence')
    expect(serialized).not.toContain('document')
  })
})

describe('GET /api/settings/permissions — gates', () => {
  it('refuses an unauthenticated caller with 401', async () => {
    const { response } = await callGet(buildStore(), null)
    expect(response.status).toBe(401)
  })

  it('refuses a Funūn Team Member identity with the Member-only account gate', async () => {
    const { response } = await callGet(buildStore(), staffUser())
    expect(response.status).toBe(403)
  })

  it('returns 503 when the D-56 kill switch is off', async () => {
    const store = buildStore({
      workspace_access_config: [{ id: true, enabled: false }],
      workspace_permission_requests: [pendingRequest()],
    })

    const { response, body } = await callGet(store, memberUser())

    expect(response.status).toBe(503)
    expect(body.error).toMatch(/temporarily disabled/i)
  })

  it('still returns 401 for an unauthenticated caller while the kill switch is off', async () => {
    const store = buildStore({ workspace_access_config: [{ id: true, enabled: false }] })
    const { response } = await callGet(store, null)
    expect(response.status).toBe(401)
  })
})

describe('GET /api/settings/permissions — read-only by construction (T-38.0.1-12-02)', () => {
  it('exports no mutation verb', async () => {
    const exportedVerbs = ['POST', 'PATCH', 'PUT', 'DELETE'].filter(
      (verb) => (routeModule as Record<string, unknown>)[verb] !== undefined
    )
    expect(exportedVerbs).toEqual([])
  })

  it('exports GET and nothing else callable', async () => {
    expect(typeof routeModule.GET).toBe('function')
    const callableExports = Object.keys(routeModule).filter(
      (name) => typeof (routeModule as Record<string, unknown>)[name] === 'function'
    )
    expect(callableExports).toEqual(['GET'])
  })
})
