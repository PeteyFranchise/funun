import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { WORKSPACE_ACCESS_GENERAL_ENABLED_VAR } from '@/lib/workspaces/cohort'
import { GET, POST } from './route'

// ─── WSR-23 / R-15 + WSR-16 / R-07 / R-25 (plan 13) ───────────────────────
// Two changes are asserted here together because they land in the same
// handler: creation moved onto `public.workspace_create` (one transaction,
// so the compensating DELETE became unreachable), and the second of the
// three kill-switch call sites gained the D-55 cohort gate.
//
// Style follows ./[workspaceId]/projects/route.test.ts: the REAL handler runs
// against in-memory Supabase stubs. Nothing here opens a database
// connection — migrations 197 and 198 are authored but unapplied.

jest.mock('@/lib/supabase/server', () => ({
  createApiClient: jest.fn(),
  createServiceClient: jest.fn(),
}))

// The Member-account boundary is a separate gate with its own suite; these
// cases are about what happens AFTER it admits the caller.
jest.mock('@/lib/accounts/member-api-gate', () => ({
  requireMemberApiAccount: jest.fn(async () => ({
    ok: true,
    user: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
  })),
}))

const CREATOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SUBJECT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

const WORKSPACE_ROW = {
  id: WORKSPACE_ID,
  name: 'Morning Light',
  slug: 'morning-light-1a2b3c4d',
  workspace_type: 'management',
  roster_enabled: false,
  catalogue_enabled: false,
  verification_state: 'unverified',
  subject_member_id: null,
  created_by: CREATOR_ID,
  created_at: '2026-09-07T00:00:00.000Z',
}

type RpcCall = { fn: string; args: Record<string, unknown> }
type PgError = { message: string; code?: string } | null

type ServiceCalls = {
  rpc: RpcCall[]
  inserts: string[]
  deletes: string[]
  tables: string[]
}

function buildServiceClient(
  opts: {
    decision?: { access_enabled: boolean; cohort_ok: boolean } | null
    decisionError?: PgError
    createResult?: Record<string, unknown> | null
    createError?: PgError
  } = {}
) {
  const calls: ServiceCalls = { rpc: [], inserts: [], deletes: [], tables: [] }

  const decision =
    opts.decision === undefined ? { access_enabled: true, cohort_ok: true } : opts.decision

  const createResult =
    opts.createResult === undefined
      ? { outcome: 'ok', workspace_id: WORKSPACE_ID, slug: WORKSPACE_ROW.slug, audit_id: null }
      : opts.createResult

  return {
    calls,
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.rpc.push({ fn, args })
      const result =
        fn === 'workspace_access_permitted'
          ? { data: decision === null ? null : [decision], error: opts.decisionError ?? null }
          : { data: createResult, error: opts.createError ?? null }
      // Thenable AND `.single()`-able: the cohort module awaits the builder
      // directly, the create call chains `.single()` off it.
      return Object.assign(Promise.resolve(result), { single: async () => result })
    },
    from: (table: string) => {
      calls.tables.push(table)
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.order = async () => ({ data: [WORKSPACE_ROW], error: null })
      q.maybeSingle = async () => ({ data: WORKSPACE_ROW, error: null })
      q.single = async () => ({ data: WORKSPACE_ROW, error: null })
      q.insert = () => {
        calls.inserts.push(table)
        return q
      }
      q.delete = () => {
        calls.deletes.push(table)
        return q
      }
      return q
    },
  }
}

function buildSessionClient(opts: { user?: { id: string } | null } = {}) {
  const user = opts.user === undefined ? { id: CREATOR_ID, app_metadata: {} } : opts.user
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: jest.fn(() => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.order = async () => ({ data: [WORKSPACE_ROW], error: null })
      return q
    }),
  }
}

function wire(service: ReturnType<typeof buildServiceClient>, session = buildSessionClient()) {
  ;(createApiClient as jest.Mock).mockResolvedValue(session)
  ;(createServiceClient as jest.Mock).mockReturnValue(service)
  return session
}

function postRequest(body: unknown) {
  return new Request('http://t.local/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return { name: 'Morning Light', workspaceType: 'management', ...overrides }
}

let savedGeneralEnabled: string | undefined

beforeEach(() => {
  jest.clearAllMocks()
  savedGeneralEnabled = process.env[WORKSPACE_ACCESS_GENERAL_ENABLED_VAR]
  delete process.env[WORKSPACE_ACCESS_GENERAL_ENABLED_VAR]
})

afterEach(() => {
  if (savedGeneralEnabled === undefined) delete process.env[WORKSPACE_ACCESS_GENERAL_ENABLED_VAR]
  else process.env[WORKSPACE_ACCESS_GENERAL_ENABLED_VAR] = savedGeneralEnabled
})

describe('POST /api/workspaces — the second kill-switch call site (WSR-16 / R-07)', () => {
  it('returns 503 when the platform control is off, unchanged', async () => {
    const service = buildServiceClient({ decision: { access_enabled: false, cohort_ok: true } })
    wire(service)

    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(503)
    expect(service.calls.rpc.map(c => c.fn)).not.toContain('workspace_create')
  })

  it('returns 404 — not 403 and not 503 — for a Member outside the pilot cohort (R-25)', async () => {
    const service = buildServiceClient({ decision: { access_enabled: true, cohort_ok: false } })
    wire(service)

    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(404)
    expect(service.calls.rpc.map(c => c.fn)).not.toContain('workspace_create')
  })

  it('fails closed with 503 when the decision cannot be resolved at all', async () => {
    const service = buildServiceClient({ decision: null })
    wire(service)

    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(503)
  })

  it('asks for the cohort by default and names the proved actor as p_uid', async () => {
    const service = buildServiceClient()
    wire(service)

    await POST(postRequest(validBody()))

    const decisionCall = service.calls.rpc.find(c => c.fn === 'workspace_access_permitted')
    expect(decisionCall?.args).toMatchObject({ p_uid: CREATOR_ID, p_require_cohort: true })
  })

  it('stops asking for the cohort once general availability is on', async () => {
    process.env[WORKSPACE_ACCESS_GENERAL_ENABLED_VAR] = 'true'
    const service = buildServiceClient({ decision: { access_enabled: true, cohort_ok: false } })
    wire(service)

    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(201)
    const decisionCall = service.calls.rpc.find(c => c.fn === 'workspace_access_permitted')
    expect(decisionCall?.args.p_require_cohort).toBe(false)
  })
})

describe('POST /api/workspaces — creation is ONE transaction (WSR-23 / R-15)', () => {
  it('creates through a single workspace_create RPC call', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(201)
    expect(service.calls.rpc.filter(c => c.fn === 'workspace_create')).toHaveLength(1)
  })

  it('performs no .insert() on any table, on any path', async () => {
    const service = buildServiceClient()
    wire(service)

    await POST(postRequest(validBody()))

    expect(service.calls.inserts).toEqual([])
  })

  it('performs no compensating .delete() when the RPC refuses', async () => {
    const service = buildServiceClient({
      createResult: { outcome: 'disabled', workspace_id: null, slug: null, audit_id: null },
    })
    wire(service)

    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(503)
    expect(service.calls.deletes).toEqual([])
  })

  it('performs no compensating .delete() when the RPC errors', async () => {
    const service = buildServiceClient({
      createError: { message: 'boom', code: 'XX000' },
    })
    wire(service)

    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(500)
    expect(service.calls.deletes).toEqual([])
  })

  it('returns the created workspace in the shape the client already reads', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(postRequest(validBody()))
    const payload = (await res.json()) as { data: Record<string, unknown> }

    expect(res.status).toBe(201)
    expect(payload.data).toMatchObject({
      id: WORKSPACE_ID,
      name: 'Morning Light',
      slug: WORKSPACE_ROW.slug,
      workspace_type: 'management',
      verification_state: 'unverified',
      created_by: CREATOR_ID,
    })
  })

  it('maps a deadlock (40P01) to 409, never 500', async () => {
    const service = buildServiceClient({ createError: { message: 'deadlock', code: '40P01' } })
    wire(service)

    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(409)
  })

  it('maps a lock timeout (55P03) to 409, never 500', async () => {
    const service = buildServiceClient({ createError: { message: 'lock', code: '55P03' } })
    wire(service)

    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(409)
  })

  it('degrades an outcome code it does not recognise to 400, not a 500', async () => {
    const service = buildServiceClient({
      createResult: { outcome: 'something_new', workspace_id: null, slug: null, audit_id: null },
    })
    wire(service)

    const res = await POST(postRequest(validBody()))

    expect(res.status).toBe(400)
  })
})

describe('POST /api/workspaces — the mass-assignment allowlist is unchanged', () => {
  it.each([
    ['verification_state', { verification_state: 'verified' }],
    ['verified_at', { verified_at: '2026-09-07T00:00:00.000Z' }],
    ['verified_by', { verified_by: CREATOR_ID }],
    ['created_by', { created_by: SUBJECT_ID }],
    ['slug', { slug: 'chosen-by-the-caller' }],
    ['id', { id: WORKSPACE_ID }],
  ])('refuses to take %s from the body, before any RPC call', async (_label, extra) => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(postRequest(validBody(extra)))

    expect(res.status).toBe(400)
    expect(service.calls.rpc.map(c => c.fn)).not.toContain('workspace_create')
  })

  it('rejects an unknown body key via the allowlist plus Zod .strict()', async () => {
    const service = buildServiceClient()
    wire(service)

    const res = await POST(postRequest({ ...validBody(), somethingElse: true }))

    expect(res.status).toBe(400)
    expect(service.calls.rpc.map(c => c.fn)).not.toContain('workspace_create')
  })
})

describe('POST /api/workspaces — the slug is still computed in TypeScript', () => {
  it('passes a slugified name with a random suffix as p_slug', async () => {
    const service = buildServiceClient()
    wire(service)

    await POST(postRequest(validBody()))

    const create = service.calls.rpc.find(c => c.fn === 'workspace_create')
    expect(create?.args.p_slug).toMatch(/^morning-light-[0-9a-f]{8}$/)
  })

  it('falls back to the literal workspace slug for a name with no slug characters', async () => {
    const service = buildServiceClient()
    wire(service)

    await POST(postRequest(validBody({ name: '!!!' })))

    const create = service.calls.rpc.find(c => c.fn === 'workspace_create')
    expect(create?.args.p_slug).toMatch(/^workspace-[0-9a-f]{8}$/)
  })
})

describe('POST /api/workspaces — subject_member_id is artist_team only (D-07)', () => {
  it('passes the subject through for an artist_team workspace', async () => {
    const service = buildServiceClient()
    wire(service)

    await POST(
      postRequest(validBody({ workspaceType: 'artist_team', subjectMemberId: SUBJECT_ID }))
    )

    const create = service.calls.rpc.find(c => c.fn === 'workspace_create')
    expect(create?.args.p_subject_member_id).toBe(SUBJECT_ID)
  })

  it('drops the subject for any other workspace type', async () => {
    const service = buildServiceClient()
    wire(service)

    await POST(postRequest(validBody({ workspaceType: 'label', subjectMemberId: SUBJECT_ID })))

    const create = service.calls.rpc.find(c => c.fn === 'workspace_create')
    expect(create?.args.p_subject_member_id).toBeNull()
  })
})

describe('GET /api/workspaces — unchanged and still ungated', () => {
  it('lists through the RLS-scoped session client without consulting the control', async () => {
    const service = buildServiceClient({ decision: { access_enabled: false, cohort_ok: false } })
    const session = wire(service)

    const res = await GET()
    const payload = (await res.json()) as { data: unknown[] }

    expect(res.status).toBe(200)
    expect(payload.data).toHaveLength(1)
    expect(session.from).toHaveBeenCalledWith('workspaces')
    expect(service.calls.rpc).toEqual([])
  })

  it('still returns 401 for an unauthenticated caller', async () => {
    const service = buildServiceClient()
    wire(service, buildSessionClient({ user: null }))

    const res = await GET()

    expect(res.status).toBe(401)
  })
})
