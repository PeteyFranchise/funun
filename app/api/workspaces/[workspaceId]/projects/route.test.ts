import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE } from '@/lib/workspaces/membership'
import { POST } from './route'

// ─── R-14 / WSR-22 (finding F19) ─────────────────────────────────────────
// `vault_projects.release_date` is a DATE column, and this route is one of
// the two remaining workspace surfaces that accepted a caller-supplied date
// as a bare `z.string()`. The cases below assert only what reaches the
// column, plus that the route's existing gate and liveness check are
// untouched.
//
// Style follows ../roster/evidence/route.test.ts: the REAL handler runs
// against in-memory Supabase stubs.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

// Permission resolution is a whole subsystem of its own (grants, lineage,
// consent roots) and is not what these cases are about.
jest.mock('@/lib/workspaces/grant-service', () => ({
  assertMayExercise: jest.fn(async () => ({ ok: true, permission: 'edit_metadata' })),
}))

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ADMIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const RELATIONSHIP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const PROJECT_ID = '11111111-1111-1111-1111-111111111111'

type QueryResult = { data: unknown; error: unknown }

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
  projectRow: Record<string, unknown> | null
  attachmentRow: Record<string, unknown> | null
  auditRows: Record<string, unknown>[]
}

function buildServiceClient(opts: { relationship?: Record<string, unknown> | null } = {}) {
  const calls: ServiceCalls = {
    tables: [],
    projectRow: null,
    attachmentRow: null,
    auditRows: [],
  }

  const client = {
    calls,
    // Plan 13: `requireWorkspaceAccess` resolves the D-56 kill switch and the
    // D-55 cohort window through ONE `workspace_access_permitted` RPC rather
    // than reading `workspace_access_config` through `.from()`. Both open
    // here, so every pre-existing case below keeps asserting what it asserted
    // before. The `workspace_access_config` branch under `from` is retained
    // so a regression to the table read fails loudly rather than silently.
    rpc: (_fn: string, _args: Record<string, unknown>) =>
      Promise.resolve({ data: [{ access_enabled: true, cohort_ok: true }], error: null }),
    from: jest.fn((table: string) => {
      calls.tables.push(table)

      if (table === 'workspace_access_config') {
        return chain({ data: { enabled: true }, error: null })
      }
      if (table === 'workspace_roster_relationships') {
        return chain({
          data:
            opts.relationship === undefined
              ? {
                  id: RELATIONSHIP_ID,
                  workspace_id: WORKSPACE_ID,
                  member_user_id: MEMBER_ID,
                  state: 'accepted',
                  effective_from: null,
                  terminates_on: null,
                }
              : opts.relationship,
          error: null,
        })
      }
      if (table === 'vault_projects') {
        const q: Record<string, unknown> = {}
        q.insert = (row: Record<string, unknown>) => {
          calls.projectRow = row
          return q
        }
        q.select = () => q
        q.single = async () => ({ data: { id: PROJECT_ID, ...(calls.projectRow ?? {}) }, error: null })
        return q
      }
      if (table === 'workspace_attachments') {
        return {
          insert: async (row: Record<string, unknown>) => {
            calls.attachmentRow = row
            return { error: null }
          },
        }
      }
      if (table === 'workspace_audit_log') {
        return {
          insert: async (row: Record<string, unknown>) => {
            calls.auditRows.push(row)
            return { error: null }
          },
        }
      }
      throw new Error(`unexpected table on the service client: ${table}`)
    }),
  }

  return client
}

function postRequest(body: unknown) {
  return new Request(`http://t.local/api/workspaces/${WORKSPACE_ID}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = () => Promise.resolve({ workspaceId: WORKSPACE_ID })

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    relationshipId: RELATIONSHIP_ID,
    title: 'Morning Light',
    type: 'single',
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

describe('POST /api/workspaces/[workspaceId]/projects — strict ISO release date (WSR-22)', () => {
  it('stores a well-formed YYYY-MM-DD release date unchanged', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(postRequest(validBody({ releaseDate: '2026-06-01' })), {
      params: params(),
    })

    expect(res.status).toBe(201)
    expect(service.calls.projectRow).toMatchObject({
      user_id: MEMBER_ID,
      release_date: '2026-06-01',
    })
  })

  it('refuses 400 for a calendar-impossible release date before any write', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(postRequest(validBody({ releaseDate: '2026-04-31' })), {
      params: params(),
    })

    expect(res.status).toBe(400)
    expect(service.calls.projectRow).toBeNull()
    expect(service.calls.tables).not.toContain('vault_projects')
  })

  it('refuses 400 for a malformed release date before any write', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(postRequest(validBody({ releaseDate: 'sometime in June' })), {
      params: params(),
    })

    expect(res.status).toBe(400)
    expect(service.calls.projectRow).toBeNull()
  })

  it('refuses 400 for a datetime where a DATE column is expected', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(postRequest(validBody({ releaseDate: '2026-06-01T00:00:00.000Z' })), {
      params: params(),
    })

    expect(res.status).toBe(400)
    expect(service.calls.projectRow).toBeNull()
  })

  it('still writes null when the release date is omitted', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(postRequest(validBody()), { params: params() })

    expect(res.status).toBe(201)
    expect(service.calls.projectRow).toMatchObject({ release_date: null })
  })
})

describe('POST /api/workspaces/[workspaceId]/projects — existing behaviour is unchanged', () => {
  it('refuses 404 when the relationship does not belong to this workspace', async () => {
    const service = buildServiceClient({ relationship: null })
    wire(service)

    const res = await POST(postRequest(validBody({ releaseDate: '2026-06-01' })), {
      params: params(),
    })

    expect(res.status).toBe(404)
    expect(service.calls.projectRow).toBeNull()
  })

  it('refuses 409 when the relationship is not accepted and live', async () => {
    const service = buildServiceClient({
      relationship: {
        id: RELATIONSHIP_ID,
        workspace_id: WORKSPACE_ID,
        member_user_id: MEMBER_ID,
        state: 'proposed',
        effective_from: null,
        terminates_on: null,
      },
    })
    wire(service)

    const res = await POST(postRequest(validBody()), { params: params() })

    expect(res.status).toBe(409)
    expect(service.calls.projectRow).toBeNull()
  })

  it('attaches the new project to the workspace in the same handler', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(postRequest(validBody({ releaseDate: '2026-06-01' })), {
      params: params(),
    })

    expect(res.status).toBe(201)
    expect(service.calls.attachmentRow).toMatchObject({
      workspace_id: WORKSPACE_ID,
      project_id: PROJECT_ID,
      relationship_id: RELATIONSHIP_ID,
    })
    expect(service.calls.auditRows).toHaveLength(1)
  })
})

// ─── R-20 / WSR-29 — the project-data role floor ──────────────────────────
// Creating a project on a Member's behalf is project data by any reading, so
// the floor applies here. The API-layer twin of the `AND m.role IN (...)`
// conjunct migration 197 adds to `workspace_project_permission` hop 2.
describe('POST /api/workspaces/[workspaceId]/projects — the R-20 role floor (WSR-29)', () => {
  it('refuses a guest with the role-floor message, before any write', async () => {
    const service = buildServiceClient()
    wire(service, 'guest')

    const res = await POST(postRequest(validBody()), { params: params() })
    const payload = (await res.json()) as { error: string }

    expect(res.status).toBe(403)
    expect(payload.error).toBe(WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE)
    expect(service.calls.projectRow).toBeNull()
    expect(service.calls.tables).not.toContain('vault_projects')
  })

  it.each(['owner', 'admin', 'member', 'contractor'])(
    'still admits %s — the floor excludes guest and nobody else',
    async role => {
      const service = buildServiceClient()
      wire(service, role)

      const res = await POST(postRequest(validBody()), { params: params() })

      expect(res.status).toBe(201)
    }
  )
})
