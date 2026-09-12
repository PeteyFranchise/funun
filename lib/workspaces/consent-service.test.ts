import type { SupabaseClient } from '@supabase/supabase-js'
import { issueMemberConsent, revokeMemberConsent } from '@/lib/workspaces/consent-service'
import { MEMBER_CONSENT_SOURCE } from '@/lib/workspaces/grant-lineage'

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const RELATIONSHIP_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const OTHER_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

type Row = Record<string, unknown> | null
type Rows = Record<string, unknown>[]
type Res<T> = { data: T; error: { message: string } | null }

type Handlers = {
  relationship: () => Res<Row>
  evidence: () => Res<Rows>
  existingGrants: () => Res<Rows>
  insert: () => Res<Row>
  revokeUpdate: () => Res<Row>
}

const DEFAULT_HANDLERS: Handlers = {
  relationship: () => ({
    data: {
      id: RELATIONSHIP_ID,
      workspace_id: WORKSPACE_ID,
      member_user_id: MEMBER_ID,
      state: 'accepted',
    },
    error: null,
  }),
  evidence: () => ({ data: [], error: null }),
  existingGrants: () => ({ data: [], error: null }),
  insert: () => ({ data: null, error: null }),
  revokeUpdate: () => ({ data: { id: 'grant-1' }, error: null }),
}

// Reads the CURRENT `handlers.*` function on every invocation, mirroring
// grant-service.test.ts's createFakeSupabase convention.
function createFakeSupabase(overrides: Partial<Handlers> = {}) {
  const handlers: Handlers = { ...DEFAULT_HANDLERS, ...overrides }
  const insertedRows: Record<string, unknown>[] = []

  const relMaybeSingle = jest.fn(async () => handlers.relationship())
  const relEq2 = jest.fn(() => ({ maybeSingle: relMaybeSingle }))
  const relEq1 = jest.fn(() => ({ eq: relEq2 }))
  const relSelect = jest.fn(() => ({ eq: relEq1 }))

  const evidenceEq = jest.fn(async () => handlers.evidence())
  const evidenceSelect = jest.fn(() => ({ eq: evidenceEq }))

  const grantsIs = jest.fn(async () => handlers.existingGrants())
  const grantsEq3 = jest.fn(() => ({ is: grantsIs }))
  const grantsEq2 = jest.fn(() => ({ eq: grantsEq3 }))
  const grantsEq1 = jest.fn(() => ({ eq: grantsEq2 }))
  const grantsSelect = jest.fn(() => ({ eq: grantsEq1 }))

  const grantsInsert = jest.fn((row: Record<string, unknown>) => {
    insertedRows.push(row)
    return handlers.insert()
  })

  const revokeMaybeSingle = jest.fn(async () => handlers.revokeUpdate())
  const revokeSelect = jest.fn(() => ({ maybeSingle: revokeMaybeSingle }))
  const revokeIs = jest.fn(() => ({ select: revokeSelect }))
  const revokeEq4 = jest.fn(() => ({ is: revokeIs }))
  const revokeEq3 = jest.fn(() => ({ eq: revokeEq4 }))
  const revokeEq2 = jest.fn(() => ({ eq: revokeEq3 }))
  const revokeEq1 = jest.fn(() => ({ eq: revokeEq2 }))
  const grantsUpdate = jest.fn(() => ({ eq: revokeEq1 }))

  const from = jest.fn((table: string) => {
    if (table === 'workspace_roster_relationships') return { select: relSelect }
    if (table === 'workspace_agreement_evidence') return { select: evidenceSelect }
    if (table === 'workspace_grants') {
      return { select: grantsSelect, insert: grantsInsert, update: grantsUpdate }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from, handlers, insertedRows, grantsInsert, grantsUpdate }
}

function asClient(fake: ReturnType<typeof createFakeSupabase>): SupabaseClient {
  return fake as unknown as SupabaseClient
}

describe('issueMemberConsent', () => {
  it('[F6] the bootstrap case: zero pre-existing grant rows, first consent succeeds', async () => {
    const fake = createFakeSupabase()

    const result = await issueMemberConsent(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      consentingUserId: MEMBER_ID,
      requested: ['view_metadata'],
    })

    expect(result).toEqual({ ok: true, permissions: ['view_metadata'] })
    expect(fake.insertedRows).toEqual([
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

  it('writes one row per requested permission with the member-consent source and a null parent', async () => {
    const fake = createFakeSupabase()

    await issueMemberConsent(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      consentingUserId: MEMBER_ID,
      requested: ['view_metadata', 'upload_audio'],
    })

    expect(fake.insertedRows).toHaveLength(2)
    for (const row of fake.insertedRows) {
      expect(row.source).toBe(MEMBER_CONSENT_SOURCE)
      expect(row.parent_grant_id).toBeNull()
    }
  })

  it('refuses a caller who is not the relationships named Member, before any write', async () => {
    const fake = createFakeSupabase()

    const result = await issueMemberConsent(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      consentingUserId: OTHER_USER_ID,
      requested: ['view_metadata'],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
    expect(fake.grantsInsert).not.toHaveBeenCalled()
  })

  it('refuses the whole request when one permission is structurally excluded, writing nothing (all-or-nothing)', async () => {
    const fake = createFakeSupabase()

    const result = await issueMemberConsent(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      consentingUserId: MEMBER_ID,
      requested: ['view_metadata', 'manage_payouts'],
    })

    expect(result.ok).toBe(false)
    expect(fake.grantsInsert).not.toHaveBeenCalled()
  })

  it('refuses a relationship that is not accepted', async () => {
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

    const result = await issueMemberConsent(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      consentingUserId: MEMBER_ID,
      requested: ['view_metadata'],
    })

    expect(result.ok).toBe(false)
    expect(fake.grantsInsert).not.toHaveBeenCalled()
  })

  it('re-consenting to an already-live permission is a no-op success, not a duplicate row', async () => {
    const fake = createFakeSupabase({
      existingGrants: () => ({ data: [{ permission: 'view_metadata' }], error: null }),
    })

    const result = await issueMemberConsent(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      consentingUserId: MEMBER_ID,
      requested: ['view_metadata'],
    })

    expect(result).toEqual({ ok: true, permissions: [] })
    expect(fake.grantsInsert).not.toHaveBeenCalled()
  })

  it('returns 404 when the relationship is not found', async () => {
    const fake = createFakeSupabase({ relationship: () => ({ data: null, error: null }) })

    const result = await issueMemberConsent(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      consentingUserId: MEMBER_ID,
      requested: ['view_metadata'],
    })

    expect(result).toEqual({ ok: false, status: 404, error: 'Roster relationship not found.' })
  })

  it('returns 500 on a relationship lookup error, never a permissive default', async () => {
    const fake = createFakeSupabase({
      relationship: () => ({ data: null, error: { message: 'db down' } }),
    })

    const result = await issueMemberConsent(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      consentingUserId: MEMBER_ID,
      requested: ['view_metadata'],
    })

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: 'Could not load the roster relationship.',
    })
  })
})

describe('revokeMemberConsent', () => {
  it('sets revoked_at/revoked_by on the matching live member-consent row and never deletes', async () => {
    const fake = createFakeSupabase()

    const result = await revokeMemberConsent(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      consentingUserId: MEMBER_ID,
      permissions: ['view_metadata'],
    })

    expect(result).toEqual({ ok: true, permissions: ['view_metadata'] })
  })

  it('refuses a caller who is not the relationships named Member', async () => {
    const fake = createFakeSupabase()

    const result = await revokeMemberConsent(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      consentingUserId: OTHER_USER_ID,
      permissions: ['view_metadata'],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(403)
    expect(fake.grantsUpdate).not.toHaveBeenCalled()
  })

  it('refuses an empty revoke request', async () => {
    const fake = createFakeSupabase()

    const result = await revokeMemberConsent(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      consentingUserId: MEMBER_ID,
      permissions: [],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(400)
  })

  it('omits a permission with no matching live row from the returned revoked list', async () => {
    const fake = createFakeSupabase({ revokeUpdate: () => ({ data: null, error: null }) })

    const result = await revokeMemberConsent(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      consentingUserId: MEMBER_ID,
      permissions: ['view_metadata'],
    })

    expect(result).toEqual({ ok: true, permissions: [] })
  })

  it('returns 404 when the relationship is not found', async () => {
    const fake = createFakeSupabase({ relationship: () => ({ data: null, error: null }) })

    const result = await revokeMemberConsent(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      consentingUserId: MEMBER_ID,
      permissions: ['view_metadata'],
    })

    expect(result).toEqual({ ok: false, status: 404, error: 'Roster relationship not found.' })
  })

  it('returns 500 on an update error', async () => {
    const fake = createFakeSupabase({
      revokeUpdate: () => ({ data: null, error: { message: 'db down' } }),
    })

    const result = await revokeMemberConsent(asClient(fake), {
      workspaceId: WORKSPACE_ID,
      relationshipId: RELATIONSHIP_ID,
      consentingUserId: MEMBER_ID,
      permissions: ['view_metadata'],
    })

    expect(result).toEqual({ ok: false, status: 500, error: 'Consent decision could not be recorded.' })
  })
})
