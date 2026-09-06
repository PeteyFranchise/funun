import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertGrantIssuable,
  assertMayExercise,
  mustLogUse,
  resolveEffectivePermissions,
  SENSITIVE_USE_LOG_REQUIRED,
} from '@/lib/workspaces/grant-service'

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const ACTOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SUBJECT_MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const RELATIONSHIP_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const PROJECT_A = '11111111-1111-1111-1111-111111111111'
const PROJECT_B = '22222222-2222-2222-2222-222222222222'

type Row = Record<string, unknown> | null
type Rows = Record<string, unknown>[]
type Res<T> = { data: T; error: { message: string } | null }

type Handlers = {
  membership: () => Res<Row>
  relationship: () => Res<Row>
  evidence: () => Res<Rows>
  grants: () => Res<Rows>
}

const DEFAULT_HANDLERS: Handlers = {
  membership: () => ({ data: { status: 'active' }, error: null }),
  relationship: () => ({
    data: { id: RELATIONSHIP_ID, state: 'accepted', effective_from: null, terminates_on: null },
    error: null,
  }),
  evidence: () => ({ data: [], error: null }),
  grants: () => ({ data: [], error: null }),
}

// Builds a stubbed Supabase client whose chained query builders read the
// CURRENT `handlers.*` function on every invocation (not a captured
// one-time value) — this is what lets a test mutate `fake.handlers` between
// two calls to prove resolveEffectivePermissions re-derives rather than
// caches (D-49).
function createFakeSupabase(overrides: Partial<Handlers> = {}) {
  const handlers: Handlers = { ...DEFAULT_HANDLERS, ...overrides }

  const memberMaybeSingle = jest.fn(async () => handlers.membership())
  const memberEq2 = jest.fn(() => ({ maybeSingle: memberMaybeSingle }))
  const memberEq1 = jest.fn(() => ({ eq: memberEq2 }))
  const memberSelect = jest.fn(() => ({ eq: memberEq1 }))

  const relMaybeSingle = jest.fn(async () => handlers.relationship())
  const relNode = () => ({
    in: jest.fn(() => ({ maybeSingle: relMaybeSingle })),
    maybeSingle: relMaybeSingle,
  })
  const relEq2 = jest.fn(() => relNode())
  const relEq1 = jest.fn(() => ({ eq: relEq2 }))
  const relSelect = jest.fn(() => ({ eq: relEq1 }))

  const evidenceEq = jest.fn(async () => handlers.evidence())
  const evidenceSelect = jest.fn(() => ({ eq: evidenceEq }))

  const grantsIs = jest.fn(async () => handlers.grants())
  const grantsEq2 = jest.fn(() => ({ is: grantsIs }))
  const grantsEq1 = jest.fn(() => ({ eq: grantsEq2 }))
  const grantsSelect = jest.fn(() => ({ eq: grantsEq1 }))

  const from = jest.fn((table: string) => {
    if (table === 'workspace_members') return { select: memberSelect }
    if (table === 'workspace_roster_relationships') return { select: relSelect }
    if (table === 'workspace_agreement_evidence') return { select: evidenceSelect }
    if (table === 'workspace_grants') return { select: grantsSelect }
    throw new Error(`Unexpected table: ${table}`)
  })

  return { from, handlers, grantsIs, memberMaybeSingle, relMaybeSingle }
}

function asClient(fake: ReturnType<typeof createFakeSupabase>): SupabaseClient {
  return fake as unknown as SupabaseClient
}

const baseArgs = {
  workspaceId: WORKSPACE_ID,
  actorUserId: ACTOR_ID,
  subjectMemberId: SUBJECT_MEMBER_ID,
}

describe('resolveEffectivePermissions', () => {
  it('returns an empty set when the caller has no active membership in the workspace', async () => {
    const fake = createFakeSupabase({ membership: () => ({ data: null, error: null }) })
    const result = await resolveEffectivePermissions(asClient(fake), baseArgs)
    expect(result.size).toBe(0)
  })

  it('returns an empty set when membership exists but is not active', async () => {
    const fake = createFakeSupabase({ membership: () => ({ data: { status: 'suspended' }, error: null }) })
    const result = await resolveEffectivePermissions(asClient(fake), baseArgs)
    expect(result.size).toBe(0)
  })

  it('[D-49] returns an empty set when the relationship is not live, despite unrevoked grant rows in the stub', async () => {
    const fake = createFakeSupabase({
      relationship: () => ({
        data: {
          id: RELATIONSHIP_ID,
          state: 'accepted',
          effective_from: null,
          // terminates_on in the past relative to `now` below — the row is
          // 'accepted' (would otherwise look live) but the window has closed.
          terminates_on: '2020-01-01',
        },
        error: null,
      }),
      grants: () => ({ data: [{ permission: 'view_metadata', project_id: null }], error: null }),
    })

    const result = await resolveEffectivePermissions(asClient(fake), {
      ...baseArgs,
      now: new Date('2026-01-01').getTime(),
    })

    expect(result.size).toBe(0)
  })

  it('[D-49] returns an empty set when no live roster relationship row exists for the pair', async () => {
    const fake = createFakeSupabase({
      relationship: () => ({ data: null, error: null }),
      grants: () => ({ data: [{ permission: 'view_metadata', project_id: null }], error: null }),
    })

    const result = await resolveEffectivePermissions(asClient(fake), baseArgs)
    expect(result.size).toBe(0)
  })

  it('[D-39] drops an authority-tier grant row when the computed tier is operational', async () => {
    const fake = createFakeSupabase({
      evidence: () => ({ data: [], error: null }), // no qualifying evidence -> tier 'operational'
      grants: () => ({
        data: [
          { permission: 'view_metadata', project_id: null }, // operational tier
          { permission: 'approve_releases', project_id: null }, // authority tier
        ],
        error: null,
      }),
    })

    const result = await resolveEffectivePermissions(asClient(fake), baseArgs)
    expect(result.has('view_metadata')).toBe(true)
    expect(result.has('approve_releases')).toBe(false)
  })

  it('keeps an authority-tier grant row when live scoped evidence supports the relationship', async () => {
    const fake = createFakeSupabase({
      evidence: () => ({
        data: [
          {
            declared_scope: 'Manage registrations',
            effective_from: null,
            expires_at: null,
            superseded_at: null,
            declared_by: SUBJECT_MEMBER_ID,
            uploaded_at: '2026-01-01T00:00:00.000Z',
            witnessed_by_signature: false,
          },
        ],
        error: null,
      }),
      grants: () => ({ data: [{ permission: 'approve_releases', project_id: null }], error: null }),
    })

    const result = await resolveEffectivePermissions(asClient(fake), baseArgs)
    expect(result.has('approve_releases')).toBe(true)
  })

  it('includes a matching per-project row and a null-project row, excludes a non-matching project row', async () => {
    const fake = createFakeSupabase({
      grants: () => ({
        data: [
          { permission: 'view_metadata', project_id: null },
          { permission: 'upload_audio', project_id: PROJECT_A },
          { permission: 'edit_metadata', project_id: PROJECT_B },
        ],
        error: null,
      }),
    })

    const result = await resolveEffectivePermissions(asClient(fake), { ...baseArgs, projectId: PROJECT_A })
    expect(result.has('view_metadata')).toBe(true)
    expect(result.has('upload_audio')).toBe(true)
    expect(result.has('edit_metadata')).toBe(false)
  })

  it('excludes a per-project row when no project is requested (relationship-wide rows only)', async () => {
    const fake = createFakeSupabase({
      grants: () => ({
        data: [
          { permission: 'view_metadata', project_id: null },
          { permission: 'upload_audio', project_id: PROJECT_A },
        ],
        error: null,
      }),
    })

    const result = await resolveEffectivePermissions(asClient(fake), baseArgs)
    expect(result.has('view_metadata')).toBe(true)
    expect(result.has('upload_audio')).toBe(false)
  })

  it('queries workspace_grants filtered to unrevoked rows via .is(revoked_at, null)', async () => {
    const fake = createFakeSupabase()
    await resolveEffectivePermissions(asClient(fake), baseArgs)
    expect(fake.grantsIs).toHaveBeenCalledWith('revoked_at', null)
  })

  it('does not cache — reducing the resolved permissions between two calls changes the second result', async () => {
    const fake = createFakeSupabase({
      grants: () => ({ data: [{ permission: 'view_metadata', project_id: null }], error: null }),
    })

    const first = await resolveEffectivePermissions(asClient(fake), baseArgs)
    expect(first.has('view_metadata')).toBe(true)

    fake.handlers.grants = () => ({ data: [], error: null })

    const second = await resolveEffectivePermissions(asClient(fake), baseArgs)
    expect(second.has('view_metadata')).toBe(false)
  })
})

describe('assertMayExercise', () => {
  it('succeeds when the permission is present in the resolved set', async () => {
    const fake = createFakeSupabase({
      grants: () => ({ data: [{ permission: 'view_metadata', project_id: null }], error: null }),
    })

    await expect(
      assertMayExercise(asClient(fake), { ...baseArgs, permission: 'view_metadata' })
    ).resolves.toEqual({ ok: true, permission: 'view_metadata' })
  })

  it('fails, naming the permission, when it is absent from the resolved set', async () => {
    const fake = createFakeSupabase()

    const result = await assertMayExercise(asClient(fake), { ...baseArgs, permission: 'view_metadata' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.error).toContain('view_metadata')
    }
  })

  it('fails for a structurally excluded capability name regardless of what a grant row might store', async () => {
    const fake = createFakeSupabase({
      grants: () => ({ data: [{ permission: 'manage_payouts', project_id: null }], error: null }),
    })

    const result = await assertMayExercise(asClient(fake), { ...baseArgs, permission: 'manage_payouts' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.error).toContain('manage_payouts')
    }
  })

  it('fails for an unrecognized permission string before any query runs', async () => {
    const fake = createFakeSupabase()

    const result = await assertMayExercise(asClient(fake), { ...baseArgs, permission: 'not_a_real_permission' })
    expect(result.ok).toBe(false)
    expect(fake.from).not.toHaveBeenCalled()
  })
})

describe('assertGrantIssuable', () => {
  const issuanceArgs = {
    workspaceId: WORKSPACE_ID,
    granterUserId: ACTOR_ID,
    relationshipId: RELATIONSHIP_ID,
    subjectMemberId: SUBJECT_MEMBER_ID,
  }

  it('refuses a request exceeding the granters own resolved set, naming the offending permission', async () => {
    const fake = createFakeSupabase({
      grants: () => ({ data: [{ permission: 'view_metadata', project_id: null }], error: null }),
    })

    const result = await assertGrantIssuable(asClient(fake), {
      ...issuanceArgs,
      requested: ['view_metadata', 'upload_audio'],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('upload_audio')
  })

  it('permits a request fully within the granters own resolved set', async () => {
    const fake = createFakeSupabase({
      grants: () => ({
        data: [
          { permission: 'view_metadata', project_id: null },
          { permission: 'upload_audio', project_id: null },
        ],
        error: null,
      }),
    })

    await expect(
      assertGrantIssuable(asClient(fake), { ...issuanceArgs, requested: ['view_metadata'] })
    ).resolves.toEqual({ ok: true, permissions: ['view_metadata'] })
  })

  it('does not cache — the granters own resolved set is re-derived on every call (D-49)', async () => {
    const fake = createFakeSupabase({
      grants: () => ({ data: [{ permission: 'view_metadata', project_id: null }], error: null }),
    })

    const first = await assertGrantIssuable(asClient(fake), {
      ...issuanceArgs,
      requested: ['view_metadata'],
    })
    expect(first).toEqual({ ok: true, permissions: ['view_metadata'] })

    // The granter's own membership is reduced between the two calls — a
    // cached first result would incorrectly let the second call succeed.
    fake.handlers.membership = () => ({ data: { status: 'suspended' }, error: null })

    const second = await assertGrantIssuable(asClient(fake), {
      ...issuanceArgs,
      requested: ['view_metadata'],
    })
    expect(second.ok).toBe(false)
  })
})

describe('SENSITIVE_USE_LOG_REQUIRED / mustLogUse', () => {
  it('names exactly the three D-40 bundle-excluded permissions', () => {
    expect([...SENSITIVE_USE_LOG_REQUIRED].sort()).toEqual(
      ['access_clean_masters', 'view_earnings', 'view_private_rights_identifiers'].sort()
    )
  })

  it('mustLogUse is true only for those three permissions', () => {
    expect(mustLogUse('access_clean_masters')).toBe(true)
    expect(mustLogUse('view_earnings')).toBe(true)
    expect(mustLogUse('view_private_rights_identifiers')).toBe(true)
    expect(mustLogUse('view_metadata')).toBe(false)
  })
})
