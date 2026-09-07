import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { DELETE, GET, POST } from './route'
import * as route from './route'

// ─── R-19 / WSR-28 — the workspace side of the ask ────────────────────────
// Drives the REAL route handlers against in-memory Supabase stubs, so the
// assertions are on actual HTTP status codes and on the exact row handed to
// `.insert()` / `.update()` — not on a re-implementation of the rule.
//
// The assertion this file exists for is the negative one: THIS ROUTE CAN
// ASK AND STOP ASKING, AND IT CANNOT ANSWER. There is no verb, no body key
// and no import here through which a workspace could reach `approved` or
// `declined`.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ADMIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const RELATIONSHIP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const REQUEST_ID = '11111111-1111-1111-1111-111111111111'

type Res = { data: unknown; error: { message: string; code?: string } | null }

const PENDING_ROW = {
  id: REQUEST_ID,
  workspace_id: WORKSPACE_ID,
  relationship_id: RELATIONSHIP_ID,
  member_user_id: MEMBER_ID,
  permission: 'view_metadata',
  project_id: null,
  requested_by: ADMIN_ID,
  requested_at: '2026-09-05T00:00:00.000Z',
  state: 'pending',
  decided_at: null,
  decided_by: null,
  note: null,
}

/** Chainable, awaitable PostgREST stub. */
function thenable(get: () => Res) {
  const q: Record<string, unknown> = {}
  const self = () => q
  q.select = self
  q.eq = self
  q.in = self
  q.is = self
  q.order = self
  q.maybeSingle = self
  q.single = self
  q.then = (resolve: (value: Res) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(get()).then(resolve, reject)
  return q
}

function buildSessionClient(opts: { role?: string } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: ADMIN_ID, app_metadata: {} } } }) },
    from: jest.fn((table: string) => {
      if (table === 'workspace_members') {
        return thenable(() => ({
          data: { role: opts.role ?? 'admin', status: 'active', expires_at: null },
          error: null,
        }))
      }
      throw new Error(`unexpected table on the session client: ${table}`)
    }),
  }
}

function buildServiceClient(opts: {
  accessEnabled?: boolean
  relationship?: Record<string, unknown> | null
  requestSelect?: Res
} = {}) {
  const inserts: Record<string, unknown>[] = []
  const updates: Record<string, unknown>[] = []
  const audits: Record<string, unknown>[] = []

  const client = {
    inserts,
    updates,
    audits,
    from: jest.fn((table: string) => {
      if (table === 'workspace_access_config') {
        return thenable(() => ({
          data: { enabled: opts.accessEnabled !== false },
          error: null,
        }))
      }

      if (table === 'workspace_roster_relationships') {
        return {
          select: () =>
            thenable(() => ({
              data:
                opts.relationship === undefined
                  ? {
                      id: RELATIONSHIP_ID,
                      workspace_id: WORKSPACE_ID,
                      member_user_id: MEMBER_ID,
                      state: 'accepted',
                    }
                  : opts.relationship,
              error: null,
            })),
        }
      }

      if (table === 'workspace_permission_requests') {
        return {
          select: () =>
            thenable(() => opts.requestSelect ?? { data: PENDING_ROW, error: null }),
          insert: (row: Record<string, unknown>) => {
            inserts.push(row)
            return thenable(() => ({ data: { ...PENDING_ROW, ...row }, error: null }))
          },
          update: (row: Record<string, unknown>) => {
            updates.push(row)
            return thenable(() => ({ data: { ...PENDING_ROW, ...row }, error: null }))
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

function jsonRequest(body: unknown): Request {
  return new Request('https://funun.test/api/workspaces/w/permission-requests', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── POST ─────────────────────────────────────────────────────────────────
describe('POST /api/workspaces/[workspaceId]/permission-requests', () => {
  it('records a pending ask and returns 201', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    const response = await POST(
      jsonRequest({ relationshipId: RELATIONSHIP_ID, permission: 'view_metadata' }),
      { params }
    )

    expect(response.status).toBe(201)
    expect(service.inserts).toHaveLength(1)
    expect(service.inserts[0]).toMatchObject({
      workspace_id: WORKSPACE_ID,
      relationship_id: RELATIONSHIP_ID,
      member_user_id: MEMBER_ID,
      permission: 'view_metadata',
      state: 'pending',
      decided_at: null,
      decided_by: null,
    })
  })

  it('[an ask confers nothing] never touches workspace_grants', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    await POST(jsonRequest({ relationshipId: RELATIONSHIP_ID, permission: 'view_metadata' }), {
      params,
    })

    const tables = service.from.mock.calls.map((call) => call[0])
    expect(tables).not.toContain('workspace_grants')
  })

  it('fails closed with 503 when the D-56 kill switch is off, writing nothing', async () => {
    const service = buildServiceClient({ accessEnabled: false })
    install(buildSessionClient(), service)

    const response = await POST(
      jsonRequest({ relationshipId: RELATIONSHIP_ID, permission: 'view_metadata' }),
      { params }
    )

    expect(response.status).toBe(503)
    expect(service.inserts).toHaveLength(0)
  })

  it.each(['member', 'contractor', 'guest'])(
    'refuses a %s with 403 — owner/admin only, matching the RLS policy',
    async (role) => {
      const service = buildServiceClient()
      install(buildSessionClient({ role }), service)

      const response = await POST(
        jsonRequest({ relationshipId: RELATIONSHIP_ID, permission: 'view_metadata' }),
        { params }
      )

      expect(response.status).toBe(403)
      expect(service.inserts).toHaveLength(0)
    }
  )

  it.each(['manage_payouts', 'view_tax_information'])(
    'refuses the structurally excluded capability %s with 403 (D-42)',
    async (excluded) => {
      const service = buildServiceClient()
      install(buildSessionClient(), service)

      const response = await POST(
        jsonRequest({ relationshipId: RELATIONSHIP_ID, permission: excluded }),
        { params }
      )

      expect(response.status).toBe(403)
      expect(service.inserts).toHaveLength(0)
    }
  )

  // ─── Per-project asks are refused for now (owner decision 2026-09-07) ────
  it('refuses a project-scoped ask with 400 and the service explanation, writing nothing', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    const response = await POST(
      jsonRequest({
        relationshipId: RELATIONSHIP_ID,
        permission: 'view_metadata',
        projectId: '22222222-2222-2222-2222-222222222222',
      }),
      { params }
    )

    expect(response.status).toBe(400)
    // The service's own words reach the caller unchanged — the route does
    // not reword the refusal, and `projectId` stays in the strict schema so
    // this is what a caller gets instead of a generic unrecognized-key Zod
    // message.
    await expect(response.json()).resolves.toEqual({
      error:
        'Per-project permission requests are not supported yet. Ask for this permission across the whole relationship instead.',
    })
    expect(service.inserts).toHaveLength(0)
  })

  it('still records the ask when projectId is explicitly null', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    const response = await POST(
      jsonRequest({
        relationshipId: RELATIONSHIP_ID,
        permission: 'view_metadata',
        projectId: null,
      }),
      { params }
    )

    expect(response.status).toBe(201)
    expect(service.inserts).toHaveLength(1)
    expect(service.inserts[0].project_id).toBeNull()
  })

  it('[no body can carry a decision] a state key is rejected by the strict schema', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    const response = await POST(
      jsonRequest({
        relationshipId: RELATIONSHIP_ID,
        permission: 'view_metadata',
        state: 'approved',
      }),
      { params }
    )

    expect(response.status).toBe(400)
    expect(service.inserts).toHaveLength(0)
  })

  it('[no body can redirect the write] a workspaceId key is rejected by the strict schema', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    const response = await POST(
      jsonRequest({
        relationshipId: RELATIONSHIP_ID,
        permission: 'view_metadata',
        workspaceId: '99999999-9999-9999-9999-999999999999',
      }),
      { params }
    )

    expect(response.status).toBe(400)
  })

  it('[no body can name a different Member] a memberUserId key is rejected', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    const response = await POST(
      jsonRequest({
        relationshipId: RELATIONSHIP_ID,
        permission: 'view_metadata',
        memberUserId: ADMIN_ID,
      }),
      { params }
    )

    expect(response.status).toBe(400)
  })

  it('returns 404 for a relationship that is not in this workspace', async () => {
    const service = buildServiceClient({ relationship: null })
    install(buildSessionClient(), service)

    const response = await POST(
      jsonRequest({ relationshipId: RELATIONSHIP_ID, permission: 'view_metadata' }),
      { params }
    )

    expect(response.status).toBe(404)
  })
})

// ─── GET ──────────────────────────────────────────────────────────────────
describe('GET /api/workspaces/[workspaceId]/permission-requests', () => {
  it("returns the workspace's own asks", async () => {
    const service = buildServiceClient({ requestSelect: { data: [PENDING_ROW], error: null } })
    install(buildSessionClient(), service)

    const response = await GET(
      new Request('https://funun.test/api/workspaces/w/permission-requests?state=pending'),
      { params }
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { id: string; state: string }[] }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ id: REQUEST_ID, state: 'pending' })
  })

  it('refuses an ordinary member with 403', async () => {
    const service = buildServiceClient()
    install(buildSessionClient({ role: 'member' }), service)

    const response = await GET(
      new Request('https://funun.test/api/workspaces/w/permission-requests'),
      { params }
    )

    expect(response.status).toBe(403)
  })

  it('fails closed with 503 when the kill switch is off', async () => {
    const service = buildServiceClient({ accessEnabled: false })
    install(buildSessionClient(), service)

    const response = await GET(
      new Request('https://funun.test/api/workspaces/w/permission-requests'),
      { params }
    )

    expect(response.status).toBe(503)
  })
})

// ─── DELETE ───────────────────────────────────────────────────────────────
describe('DELETE /api/workspaces/[workspaceId]/permission-requests', () => {
  it('withdraws a pending ask and writes exactly that state', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    const response = await DELETE(jsonRequest({ requestId: REQUEST_ID }), { params })

    expect(response.status).toBe(200)
    expect(service.updates).toHaveLength(1)
    expect(service.updates[0]).toMatchObject({ state: 'withdrawn', decided_by: ADMIN_ID })
  })

  it('never deletes the row — the record that the workspace asked survives', async () => {
    const service = buildServiceClient()
    install(buildSessionClient(), service)

    await DELETE(jsonRequest({ requestId: REQUEST_ID }), { params })

    const requestTable = service.from.mock.results
      .map((result) => result.value as Record<string, unknown>)
      .filter((value) => typeof value === 'object' && value !== null && 'update' in value)
    for (const table of requestTable) {
      expect(table).not.toHaveProperty('delete')
    }
  })

  it('refuses to withdraw an already-decided ask with 409', async () => {
    const service = buildServiceClient({
      requestSelect: {
        data: {
          ...PENDING_ROW,
          state: 'approved',
          decided_at: '2026-09-05T12:00:00.000Z',
          decided_by: MEMBER_ID,
        },
        error: null,
      },
    })
    install(buildSessionClient(), service)

    const response = await DELETE(jsonRequest({ requestId: REQUEST_ID }), { params })

    expect(response.status).toBe(409)
    expect(service.updates).toHaveLength(0)
  })

  it('refuses an ordinary member with 403', async () => {
    const service = buildServiceClient()
    install(buildSessionClient({ role: 'member' }), service)

    const response = await DELETE(jsonRequest({ requestId: REQUEST_ID }), { params })

    expect(response.status).toBe(403)
    expect(service.updates).toHaveLength(0)
  })
})

// ─── The route surface ────────────────────────────────────────────────────
describe('the route surface — this route cannot answer', () => {
  it('exports exactly POST, GET and DELETE', () => {
    expect(Object.keys(route).sort()).toEqual(['DELETE', 'GET', 'POST'])
  })

  it('does not import the deciding function at all', () => {
    const source = require('fs').readFileSync(
      require('path').join(
        process.cwd(),
        'app/api/workspaces/[workspaceId]/permission-requests/route.ts'
      ),
      'utf8'
    ) as string

    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n')

    expect(codeOnly).not.toContain('decidePermissionRequest')
    expect(codeOnly).not.toContain('issueMemberConsent')
    expect(codeOnly).not.toContain("'approved'")
    expect(codeOnly).not.toContain("'declined'")
  })
})
