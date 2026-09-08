import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE } from '@/lib/workspaces/membership'
import { GET as membersGet } from '@/app/api/workspaces/[workspaceId]/members/route'
import { DELETE, GET, POST } from './route'

// ─── R-20 / WSR-29 — the project-data role floor at the API layer ─────────
// Part B of 38.0.1 proved behaviourally that a `guest` seat reached a
// Member's attached project exactly as the owner did: grants are
// per-relationship, and `workspace_project_permission` hop 2 carried no role
// condition at all. Migration 197 adds that conjunct in SQL; these cases
// assert the API layer's independent twin.
//
// THE LAST DESCRIBE BLOCK IS THE POINT OF THE WHOLE FILE. R-20 says guests
// keep everything that is NOT project data, so a test proves a guest still
// reaches a chrome route. Without it, "apply the floor" quietly becomes "ban
// guests", and nothing would catch it.
//
// No database connection: migrations 197 and 198 are authored but unapplied.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

jest.mock('@/lib/workspaces/audit', () => ({
  logWorkspaceAction: jest.fn(async () => undefined),
}))

jest.mock('@/lib/workspaces/catalogue', () => ({
  loadWorkspaceCatalogue: jest.fn(async () => [{ projectId: '11111111-1111-1111-1111-111111111111' }]),
}))

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const CALLER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const RELATIONSHIP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const PROJECT_ID = '11111111-1111-1111-1111-111111111111'
const ATTACHMENT_ID = '22222222-2222-2222-2222-222222222222'

type QueryResult = { data: unknown; error: unknown }

function chain(result: QueryResult) {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.is = () => q
  q.order = async () => result
  q.maybeSingle = async () => result
  q.single = async () => result
  q.insert = async () => ({ error: null })
  q.update = () => q
  return q
}

function buildSessionClient(role: string) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: CALLER_ID, app_metadata: {} } } }) },
    from: jest.fn((table: string) => {
      if (table === 'workspace_members') {
        return chain({ data: { role, status: 'active', expires_at: null }, error: null })
      }
      throw new Error(`unexpected table on the session client: ${table}`)
    }),
  }
}

type ServiceCalls = { tables: string[]; updates: Record<string, unknown>[] }

function buildServiceClient(opts: { custodianUserId?: string } = {}) {
  const calls: ServiceCalls = { tables: [], updates: [] }
  const custodian = opts.custodianUserId ?? MEMBER_ID

  return {
    calls,
    // requireWorkspaceAccess resolves the D-56 switch and the D-55 cohort
    // through this one RPC (plan 13). Both open, so these cases are about
    // the ROLE floor and nothing else.
    rpc: (_fn: string, _args: Record<string, unknown>) =>
      Promise.resolve({ data: [{ access_enabled: true, cohort_ok: true }], error: null }),
    from: (table: string) => {
      calls.tables.push(table)
      if (table === 'workspace_roster_relationships') {
        return chain({
          data: {
            id: RELATIONSHIP_ID,
            workspace_id: WORKSPACE_ID,
            member_user_id: MEMBER_ID,
            state: 'accepted',
            effective_from: null,
            terminates_on: null,
          },
          error: null,
        })
      }
      if (table === 'vault_projects') {
        return chain({ data: { id: PROJECT_ID, user_id: custodian }, error: null })
      }
      if (table === 'workspace_attachments') {
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.is = () => q
        q.maybeSingle = async () => ({
          data: {
            id: ATTACHMENT_ID,
            project_id: PROJECT_ID,
            vault_projects: { user_id: custodian },
          },
          error: null,
        })
        q.insert = async () => ({ error: null })
        q.update = (row: Record<string, unknown>) => {
          calls.updates.push(row)
          return { eq: async () => ({ error: null }) }
        }
        return q
      }
      if (table === 'workspace_members') {
        return chain({ data: [{ id: 'm1', user_id: CALLER_ID, role: 'guest' }], error: null })
      }
      throw new Error(`unexpected table on the service client: ${table}`)
    },
  }
}

function wire(role: string, service = buildServiceClient()) {
  ;(createApiClient as jest.Mock).mockResolvedValue(buildSessionClient(role))
  ;(createServiceClient as jest.Mock).mockReturnValue(service)
  return service
}

const params = () => Promise.resolve({ workspaceId: WORKSPACE_ID })

function jsonRequest(method: string, body: unknown) {
  return new Request(`http://t.local/api/workspaces/${WORKSPACE_ID}/attachments`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// A GET Request cannot carry a body at all, so it needs its own constructor.
function getRequest() {
  return new Request(`http://t.local/api/workspaces/${WORKSPACE_ID}/attachments`)
}

const attachBody = { projectId: PROJECT_ID, relationshipId: RELATIONSHIP_ID }
const detachBody = { projectId: PROJECT_ID }

beforeEach(() => {
  jest.clearAllMocks()
})

describe('attachments — a guest is refused at every project-data handler (R-20 / WSR-29)', () => {
  it('refuses the catalogue read (GET) with the role-floor message', async () => {
    wire('guest')

    const res = await GET(getRequest(), { params: params() })
    const payload = (await res.json()) as { error: string }

    expect(res.status).toBe(403)
    expect(payload.error).toBe(WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE)
  })

  it('refuses an attach (POST)', async () => {
    const service = wire('guest')

    const res = await POST(jsonRequest('POST', attachBody), { params: params() })
    const payload = (await res.json()) as { error: string }

    expect(res.status).toBe(403)
    expect(payload.error).toBe(WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE)
    expect(service.calls.tables).not.toContain('workspace_roster_relationships')
  })

  it('refuses a detach (DELETE) taken through the workspace, not through custody', async () => {
    // The caller is NOT the project custodian, so the workspace-derived
    // branch is the one under test.
    const service = wire('guest', buildServiceClient({ custodianUserId: MEMBER_ID }))

    const res = await DELETE(jsonRequest('DELETE', detachBody), { params: params() })
    const payload = (await res.json()) as { error: string }

    expect(res.status).toBe(403)
    expect(payload.error).toBe(WORKSPACE_PROJECT_ROLE_FLOOR_MESSAGE)
    expect(service.calls.updates).toEqual([])
  })
})

describe('attachments — contractor, the nearest role above the floor, still passes', () => {
  it('reads the catalogue', async () => {
    wire('contractor')

    const res = await GET(getRequest(), { params: params() })

    expect(res.status).toBe(200)
  })

  it('is still refused an attach by the EXISTING owner/admin gate, not by the floor', async () => {
    // The floor is a role MINIMUM and `canManageRoster` is a role MAXIMUM;
    // both hold, and this case proves the floor did not replace the second.
    wire('contractor')

    const res = await POST(jsonRequest('POST', attachBody), { params: params() })
    const payload = (await res.json()) as { error: string }

    expect(res.status).toBe(403)
    expect(payload.error).toBe('Only owners and admins can attach a project to this workspace.')
  })
})

describe('attachments — every existing refusal and success still fires', () => {
  it('an admin still attaches successfully (201)', async () => {
    wire('admin')

    const res = await POST(jsonRequest('POST', attachBody), { params: params() })

    expect(res.status).toBe(201)
  })

  it('an admin still detaches successfully, and the row is updated not deleted (D-25)', async () => {
    const service = wire('admin')

    const res = await DELETE(jsonRequest('DELETE', detachBody), { params: params() })

    expect(res.status).toBe(200)
    expect(service.calls.updates).toHaveLength(1)
    expect(service.calls.updates[0]).toMatchObject({ detached_by: CALLER_ID })
  })

  it('the project custodian still detaches without any workspace role at all', async () => {
    const service = wire('guest', buildServiceClient({ custodianUserId: CALLER_ID }))

    const res = await DELETE(jsonRequest('DELETE', detachBody), { params: params() })

    expect(res.status).toBe(200)
    expect(service.calls.updates).toHaveLength(1)
  })

  it('still refuses a malformed attach payload with 400', async () => {
    wire('admin')

    const res = await POST(jsonRequest('POST', { projectId: 'not-a-uuid' }), { params: params() })

    expect(res.status).toBe(400)
  })
})

// ─── R-20 — the floor is provably NOT over-applied ────────────────────────
// "Guests keep everything that is not project data." A blanket floor inside
// `requireWorkspaceAccess` would satisfy the SQL-parity half of R-20 and
// violate this half, because that gate also covers workspace chrome. This is
// the case that would go red if someone ever "fixed" the apparent omission.
describe('R-20 — a guest still reaches a workspace CHROME route', () => {
  it('admits a guest to the members list (GET /members), which is not project data', async () => {
    wire('guest')

    const res = await membersGet(getRequest(), { params: params() })

    expect(res.status).toBe(200)
  })
})
