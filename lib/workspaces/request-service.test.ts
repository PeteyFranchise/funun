import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createPermissionRequest,
  decidePermissionRequest,
  listRequestsForMember,
  listRequestsForWorkspace,
  withdrawPermissionRequest,
} from '@/lib/workspaces/request-service'
import { MEMBER_CONSENT_SOURCE } from '@/lib/workspaces/grant-lineage'

// ─── R-19 / WSR-28 — the ask, and everything it is not ────────────────────
// Drives the real service functions against in-memory Supabase stubs, in
// the style of lib/workspaces/consent-service.test.ts. The assertions are on
// the exact rows handed to `.insert()` / `.update()` — never on a
// re-implementation of the rule.
//
// The load-bearing assertions here are the negative ones: an ask writes no
// grant row and carries no parent_grant_id; a decline writes no grant row
// at all; an approval writes its grant ONLY through issueMemberConsent; and
// a failed consent leaves the request pending rather than recording an
// approval whose grant did not land.

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const OTHER_WORKSPACE_ID = '99999999-9999-9999-9999-999999999999'
const RELATIONSHIP_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ADMIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OTHER_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const REQUEST_ID = '11111111-1111-1111-1111-111111111111'
const PROJECT_ID = '22222222-2222-2222-2222-222222222222'
const NOW = Date.parse('2026-09-06T00:00:00.000Z')

type Res = { data: unknown; error: { message: string; code?: string } | null }

const OK: Res = { data: null, error: null }

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

type Handlers = {
  relationship: () => Res
  requestSelects: Res[]
  requestInsert: (row: Record<string, unknown>) => Res
  requestUpdate: (row: Record<string, unknown>) => Res
  existingGrants: () => Res
  evidence: () => Res
  grantInsert: () => Res
}

/** A chainable, awaitable PostgREST stub: every filter returns itself, and
 * the object itself resolves to the supplied result, so both
 * `await q.maybeSingle()` and `await q.eq(...)` work. */
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

function createFakeSupabase(overrides: Partial<Handlers> = {}) {
  const requestInserts: Record<string, unknown>[] = []
  const requestUpdates: Record<string, unknown>[] = []
  const grantInserts: Record<string, unknown>[] = []
  const audits: Record<string, unknown>[] = []

  const handlers: Handlers = {
    relationship: () => ({
      data: {
        id: RELATIONSHIP_ID,
        workspace_id: WORKSPACE_ID,
        member_user_id: MEMBER_ID,
        state: 'accepted',
      },
      error: null,
    }),
    requestSelects: [],
    requestInsert: (row) => ({ data: { ...PENDING_ROW, ...row }, error: null }),
    requestUpdate: (row) => ({ data: { ...PENDING_ROW, ...row }, error: null }),
    existingGrants: () => ({ data: [], error: null }),
    evidence: () => ({ data: [], error: null }),
    grantInsert: () => OK,
    ...overrides,
  }

  const queuedSelects = [...handlers.requestSelects]
  const nextRequestSelect = (): Res =>
    queuedSelects.length > 0 ? (queuedSelects.shift() as Res) : { data: PENDING_ROW, error: null }

  const from = jest.fn((table: string) => {
    if (table === 'workspace_roster_relationships') {
      return { select: () => thenable(handlers.relationship) }
    }

    if (table === 'workspace_permission_requests') {
      return {
        select: () => thenable(nextRequestSelect),
        insert: (row: Record<string, unknown>) => {
          requestInserts.push(row)
          return thenable(() => handlers.requestInsert(row))
        },
        update: (row: Record<string, unknown>) => {
          requestUpdates.push(row)
          return thenable(() => handlers.requestUpdate(row))
        },
      }
    }

    if (table === 'workspace_grants') {
      return {
        select: () => thenable(handlers.existingGrants),
        insert: (row: Record<string, unknown>) => {
          grantInserts.push(row)
          return thenable(handlers.grantInsert)
        },
      }
    }

    if (table === 'workspace_agreement_evidence') {
      return { select: () => thenable(handlers.evidence) }
    }

    if (table === 'workspace_audit_log') {
      return {
        insert: (row: Record<string, unknown>) => {
          audits.push(row)
          return thenable(() => OK)
        },
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  })

  return { from, requestInserts, requestUpdates, grantInserts, audits }
}

function asClient(fake: ReturnType<typeof createFakeSupabase>): SupabaseClient {
  return fake as unknown as SupabaseClient
}

// ─── createPermissionRequest ──────────────────────────────────────────────
describe('createPermissionRequest', () => {
  it('[the bootstrap case] records an ask with zero pre-existing grants, and writes no grant row', async () => {
    const fake = createFakeSupabase()

    const result = await createPermissionRequest(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      permission: 'view_metadata',
      requestedBy: ADMIN_ID,
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.created).toBe(true)
    expect(fake.grantInserts).toHaveLength(0)
  })

  it('[an ask is not a grant] the inserted row carries no parent_grant_id and no source', async () => {
    const fake = createFakeSupabase()

    await createPermissionRequest(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      permission: 'view_metadata',
      requestedBy: ADMIN_ID,
    })

    const inserted = fake.requestInserts[0]
    expect(Object.keys(inserted)).not.toContain('parent_grant_id')
    expect(Object.keys(inserted)).not.toContain('source')
    expect(Object.keys(inserted)).not.toContain('granted_by')
  })

  it('names every inserted column explicitly and denormalises member_user_id from the relationship', async () => {
    const fake = createFakeSupabase()

    await createPermissionRequest(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      permission: 'view_metadata',
      projectId: PROJECT_ID,
      requestedBy: ADMIN_ID,
      note: 'so we can prep the release',
    })

    expect(fake.requestInserts).toEqual([
      {
        workspace_id: WORKSPACE_ID,
        relationship_id: RELATIONSHIP_ID,
        member_user_id: MEMBER_ID,
        permission: 'view_metadata',
        project_id: PROJECT_ID,
        requested_by: ADMIN_ID,
        state: 'pending',
        decided_at: null,
        decided_by: null,
        note: 'so we can prep the release',
      },
    ])
  })

  it('never accepts a member_user_id from the caller — there is no such parameter', async () => {
    const fake = createFakeSupabase({
      relationship: () => ({
        data: {
          id: RELATIONSHIP_ID,
          workspace_id: WORKSPACE_ID,
          member_user_id: OTHER_USER_ID,
          state: 'accepted',
        },
        error: null,
      }),
    })

    await createPermissionRequest(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      permission: 'view_metadata',
      requestedBy: ADMIN_ID,
    })

    // The relationship's own member, not the actor and not anything the
    // caller could have supplied.
    expect(fake.requestInserts[0].member_user_id).toBe(OTHER_USER_ID)
  })

  it.each(['manage_payouts', 'view_tax_information'])(
    'refuses the structurally excluded capability %s with 403, writing nothing',
    async (excluded) => {
      const fake = createFakeSupabase()

      const result = await createPermissionRequest(asClient(fake), {
        workspaceId: WORKSPACE_ID,
        relationshipId: RELATIONSHIP_ID,
        permission: excluded,
        requestedBy: ADMIN_ID,
      })

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.status).toBe(403)
      expect(fake.requestInserts).toHaveLength(0)
    }
  )

  it('refuses an unrecognised permission with 400, writing nothing', async () => {
    const fake = createFakeSupabase()

    const result = await createPermissionRequest(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      permission: 'become_the_label',
      requestedBy: ADMIN_ID,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
    expect(fake.requestInserts).toHaveLength(0)
  })

  it('returns 404 when the relationship is not in this workspace', async () => {
    const fake = createFakeSupabase({ relationship: () => ({ data: null, error: null }) })

    const result = await createPermissionRequest(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      permission: 'view_metadata',
      requestedBy: ADMIN_ID,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
    expect(fake.requestInserts).toHaveLength(0)
  })

  it.each(['refused', 'blocked', 'ended'])(
    'refuses to ask anything of a %s relationship',
    async (state) => {
      const fake = createFakeSupabase({
        relationship: () => ({
          data: {
            id: RELATIONSHIP_ID,
            workspace_id: WORKSPACE_ID,
            member_user_id: MEMBER_ID,
            state,
          },
          error: null,
        }),
      })

      const result = await createPermissionRequest(asClient(fake), {
        workspaceId: WORKSPACE_ID,
        relationshipId: RELATIONSHIP_ID,
        permission: 'view_metadata',
        requestedBy: ADMIN_ID,
      })

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.status).toBe(409)
      expect(fake.requestInserts).toHaveLength(0)
    }
  )

  it('asks against a still-proposed relationship — the ask can precede acceptance', async () => {
    const fake = createFakeSupabase({
      relationship: () => ({
        data: {
          id: RELATIONSHIP_ID,
          workspace_id: WORKSPACE_ID,
          member_user_id: MEMBER_ID,
          state: 'proposed',
        },
        error: null,
      }),
    })

    const result = await createPermissionRequest(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      permission: 'view_metadata',
      requestedBy: ADMIN_ID,
    })

    expect(result.ok).toBe(true)
  })

  it('is idempotent on a duplicate open ask — returns the existing row with created false', async () => {
    const fake = createFakeSupabase({
      requestInsert: () => ({
        data: null,
        error: { message: 'duplicate key value violates unique constraint', code: '23505' },
      }),
      requestSelects: [{ data: [PENDING_ROW], error: null }],
    })

    const result = await createPermissionRequest(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      permission: 'view_metadata',
      requestedBy: ADMIN_ID,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.created).toBe(false)
      expect(result.request.id).toBe(REQUEST_ID)
    }
  })

  it('writes an audit row naming both the acting admin and the subject Member (D-22, D-50)', async () => {
    const fake = createFakeSupabase()

    await createPermissionRequest(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      permission: 'view_metadata',
      requestedBy: ADMIN_ID,
    })

    expect(fake.audits).toHaveLength(1)
    expect(fake.audits[0]).toMatchObject({
      workspace_id: WORKSPACE_ID,
      actor_user_id: ADMIN_ID,
      subject_member_id: MEMBER_ID,
      action: 'workspace.permission_request.created',
      target_type: 'workspace_permission_requests',
    })
  })
})

// ─── withdrawPermissionRequest ────────────────────────────────────────────
describe('withdrawPermissionRequest', () => {
  it('moves a pending ask to withdrawn, recording who withdrew it and when', async () => {
    const fake = createFakeSupabase()

    const result = await withdrawPermissionRequest(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      requestId: REQUEST_ID,
      actorId: ADMIN_ID,
      now: NOW,
    })

    expect(result.ok).toBe(true)
    expect(fake.requestUpdates).toEqual([
      {
        state: 'withdrawn',
        decided_at: '2026-09-06T00:00:00.000Z',
        decided_by: ADMIN_ID,
      },
    ])
    expect(fake.grantInserts).toHaveLength(0)
  })

  it.each(['approved', 'declined', 'withdrawn'])(
    'refuses to touch an already-%s request (terminal)',
    async (state) => {
      const fake = createFakeSupabase({
        requestSelects: [
          {
            data: { ...PENDING_ROW, state, decided_at: '2026-09-05T12:00:00.000Z', decided_by: MEMBER_ID },
            error: null,
          },
        ],
      })

      const result = await withdrawPermissionRequest(asClient(fake), {
        workspaceId: WORKSPACE_ID,
        requestId: REQUEST_ID,
        actorId: ADMIN_ID,
      })

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.status).toBe(409)
      expect(fake.requestUpdates).toHaveLength(0)
    }
  )

  it('returns 404 for a request belonging to another workspace', async () => {
    const fake = createFakeSupabase({
      requestSelects: [{ data: { ...PENDING_ROW, workspace_id: OTHER_WORKSPACE_ID }, error: null }],
    })

    const result = await withdrawPermissionRequest(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      requestId: REQUEST_ID,
      actorId: ADMIN_ID,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(404)
    expect(fake.requestUpdates).toHaveLength(0)
  })

  it('audits the withdrawal with both identities', async () => {
    const fake = createFakeSupabase()

    await withdrawPermissionRequest(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      requestId: REQUEST_ID,
      actorId: ADMIN_ID,
    })

    expect(fake.audits[0]).toMatchObject({
      actor_user_id: ADMIN_ID,
      subject_member_id: MEMBER_ID,
      action: 'workspace.permission_request.withdrawn',
    })
  })
})

// ─── decidePermissionRequest ──────────────────────────────────────────────
describe('decidePermissionRequest', () => {
  it('[approve] delegates the grant to issueMemberConsent — the only member_consent writer', async () => {
    const fake = createFakeSupabase()

    const result = await decidePermissionRequest(asClient(fake), {
      requestId: REQUEST_ID,
      decidingUserId: MEMBER_ID,
      decision: 'approved',
      now: NOW,
    })

    expect(result.ok).toBe(true)
    expect(fake.grantInserts).toEqual([
      {
        workspace_id: WORKSPACE_ID,
        relationship_id: RELATIONSHIP_ID,
        project_id: null,
        permission: 'view_metadata',
        source: MEMBER_CONSENT_SOURCE,
        parent_grant_id: null,
        granted_by: MEMBER_ID,
      },
    ])
  })

  it('[approve] records only the decision fields on the request row', async () => {
    const fake = createFakeSupabase()

    await decidePermissionRequest(asClient(fake), {
      requestId: REQUEST_ID,
      decidingUserId: MEMBER_ID,
      decision: 'approved',
      now: NOW,
    })

    expect(fake.requestUpdates).toEqual([
      {
        state: 'approved',
        decided_at: '2026-09-06T00:00:00.000Z',
        decided_by: MEMBER_ID,
      },
    ])
  })

  it('[approve] carries the request project scope into the consent', async () => {
    const fake = createFakeSupabase({
      requestSelects: [{ data: { ...PENDING_ROW, project_id: PROJECT_ID }, error: null }],
    })

    await decidePermissionRequest(asClient(fake), {
      requestId: REQUEST_ID,
      decidingUserId: MEMBER_ID,
      decision: 'approved',
    })

    expect(fake.grantInserts[0].project_id).toBe(PROJECT_ID)
  })

  it('[the failure direction that matters] leaves the request pending when the consent write fails', async () => {
    // The relationship is not accepted, so assertMemberMayConsent refuses
    // and issueMemberConsent writes nothing.
    const fake = createFakeSupabase({
      relationship: () => ({
        data: {
          id: RELATIONSHIP_ID,
          workspace_id: WORKSPACE_ID,
          member_user_id: MEMBER_ID,
          state: 'proposed',
        },
        error: null,
      }),
    })

    const result = await decidePermissionRequest(asClient(fake), {
      requestId: REQUEST_ID,
      decidingUserId: MEMBER_ID,
      decision: 'approved',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
    expect(fake.grantInserts).toHaveLength(0)
    // Never record a decision whose grant did not land.
    expect(fake.requestUpdates).toHaveLength(0)
    expect(fake.audits).toHaveLength(0)
  })

  it('[decline] writes no grant row of any kind', async () => {
    const fake = createFakeSupabase()

    const result = await decidePermissionRequest(asClient(fake), {
      requestId: REQUEST_ID,
      decidingUserId: MEMBER_ID,
      decision: 'declined',
      now: NOW,
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.issued).toEqual([])
    expect(fake.grantInserts).toHaveLength(0)
    expect(fake.requestUpdates).toEqual([
      {
        state: 'declined',
        decided_at: '2026-09-06T00:00:00.000Z',
        decided_by: MEMBER_ID,
      },
    ])
  })

  it('refuses a caller who is not the named Member, before any write', async () => {
    const fake = createFakeSupabase()

    const result = await decidePermissionRequest(asClient(fake), {
      requestId: REQUEST_ID,
      decidingUserId: ADMIN_ID,
      decision: 'approved',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
    expect(fake.grantInserts).toHaveLength(0)
    expect(fake.requestUpdates).toHaveLength(0)
  })

  it('gives a missing request and a not-yours request the same refusal, so ids cannot be enumerated', async () => {
    const missing = createFakeSupabase({ requestSelects: [{ data: null, error: null }] })
    const notYours = createFakeSupabase()

    const a = await decidePermissionRequest(asClient(missing), {
      requestId: REQUEST_ID,
      decidingUserId: OTHER_USER_ID,
      decision: 'approved',
    })
    const b = await decidePermissionRequest(asClient(notYours), {
      requestId: REQUEST_ID,
      decidingUserId: OTHER_USER_ID,
      decision: 'approved',
    })

    expect(a).toEqual(b)
  })

  it.each(['approved', 'declined', 'withdrawn'])(
    'refuses to re-decide an already-%s request',
    async (state) => {
      const fake = createFakeSupabase({
        requestSelects: [
          {
            data: { ...PENDING_ROW, state, decided_at: '2026-09-05T12:00:00.000Z', decided_by: MEMBER_ID },
            error: null,
          },
        ],
      })

      const result = await decidePermissionRequest(asClient(fake), {
        requestId: REQUEST_ID,
        decidingUserId: MEMBER_ID,
        decision: 'approved',
      })

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.status).toBe(409)
      expect(fake.grantInserts).toHaveLength(0)
      expect(fake.requestUpdates).toHaveLength(0)
    }
  )

  it('audits the decision with both identities and the permission it concerned', async () => {
    const fake = createFakeSupabase()

    await decidePermissionRequest(asClient(fake), {
      requestId: REQUEST_ID,
      decidingUserId: MEMBER_ID,
      decision: 'approved',
    })

    expect(fake.audits[0]).toMatchObject({
      workspace_id: WORKSPACE_ID,
      actor_user_id: MEMBER_ID,
      subject_member_id: MEMBER_ID,
      action: 'workspace.permission_request.approved',
      target_type: 'workspace_permission_requests',
    })
    expect((fake.audits[0].changes as Record<string, unknown>).permission).toBe('view_metadata')
  })
})

// ─── the two list reads ───────────────────────────────────────────────────
describe('listRequestsForMember / listRequestsForWorkspace', () => {
  it('returns the Member their own asks', async () => {
    const fake = createFakeSupabase({ requestSelects: [{ data: [PENDING_ROW], error: null }] })

    const result = await listRequestsForMember(asClient(fake), { memberUserId: MEMBER_ID })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.requests).toHaveLength(1)
      expect(result.requests[0]).toMatchObject({
        id: REQUEST_ID,
        permission: 'view_metadata',
        state: 'pending',
        memberUserId: MEMBER_ID,
      })
    }
  })

  it('returns the workspace its own outbox', async () => {
    const fake = createFakeSupabase({ requestSelects: [{ data: [PENDING_ROW], error: null }] })

    const result = await listRequestsForWorkspace(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      states: ['pending'],
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.requests).toHaveLength(1)
  })

  it('[fail closed] drops a row whose permission is not in the grantable catalogue', async () => {
    const fake = createFakeSupabase({
      requestSelects: [
        {
          data: [
            { ...PENDING_ROW, permission: 'manage_payouts' },
            { ...PENDING_ROW, permission: 'not_a_permission' },
            PENDING_ROW,
          ],
          error: null,
        },
      ],
    })

    const result = await listRequestsForMember(asClient(fake), { memberUserId: MEMBER_ID })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.requests).toHaveLength(1)
      expect(result.requests[0].permission).toBe('view_metadata')
    }
  })

  it('surfaces a read failure as 500 rather than an empty list', async () => {
    const fake = createFakeSupabase({
      requestSelects: [{ data: null, error: { message: 'boom' } }],
    })

    const result = await listRequestsForMember(asClient(fake), { memberUserId: MEMBER_ID })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(500)
  })
})

// ─── the module boundary ──────────────────────────────────────────────────
describe('request-service module boundary', () => {
  it('writes no grant row itself — the only grant path is issueMemberConsent', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const source = require('fs').readFileSync(
      require('path').join(process.cwd(), 'lib/workspaces/request-service.ts'),
      'utf8'
    ) as string

    expect(source).toContain("from '@/lib/workspaces/consent-service'")

    // Executable code only. The prose in this module deliberately DISCUSSES
    // parent_grant_id and the grant lineage at length — the assertions below
    // are about what the code does, so the doc comments that explain why it
    // does not do it must not trip them (the same sqlOnly/sqlNoDocs
    // discipline __tests__/migration-195.test.ts uses).
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n')

    // No direct table write against workspace_grants anywhere in this module.
    expect(codeOnly).not.toContain("from('workspace_grants')")
    // A request row has no lineage link, and this module never names one.
    expect(codeOnly).not.toContain('parent_grant_id')
    expect(codeOnly).not.toContain('MEMBER_CONSENT_SOURCE')
    expect(codeOnly).not.toContain('member_consent')
  })
})
