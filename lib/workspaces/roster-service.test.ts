import {
  assertCanPropose,
  assertCanTransition,
  assertMemberMayEnd,
  assertWorkspaceMayEnd,
  loadRelationshipTier,
  pickRosterFields,
  ROSTER_EDITABLE_FIELDS,
} from '@/lib/workspaces/roster-service'

const WORKSPACE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const OTHER_WORKSPACE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
const MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const OTHER_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const RELATIONSHIP_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

type QueryResult<T> = { data: T; error: { message: string } | null }

function fakeSupabase(responses: {
  block?: QueryResult<{ id: string } | null>
  liveRelationship?: QueryResult<{ id: string } | null>
  evidence?: QueryResult<Record<string, unknown>[]>
}) {
  const blockMaybeSingle = jest.fn(
    async () => responses.block ?? { data: null, error: null }
  )
  const blockEq2 = jest.fn(() => ({ maybeSingle: blockMaybeSingle }))
  const blockEq1 = jest.fn(() => ({ eq: blockEq2 }))
  const blockSelect = jest.fn(() => ({ eq: blockEq1 }))

  const relMaybeSingle = jest.fn(
    async () => responses.liveRelationship ?? { data: null, error: null }
  )
  const relIn = jest.fn(() => ({ maybeSingle: relMaybeSingle }))
  const relEq2 = jest.fn(() => ({ in: relIn }))
  const relEq1 = jest.fn(() => ({ eq: relEq2 }))
  const relSelect = jest.fn(() => ({ eq: relEq1 }))

  const evidenceEq = jest.fn(async () => responses.evidence ?? { data: [], error: null })
  const evidenceSelect = jest.fn(() => ({ eq: evidenceEq }))

  const from = jest.fn((table: string) => {
    if (table === 'workspace_roster_blocks') return { select: blockSelect }
    if (table === 'workspace_roster_relationships') return { select: relSelect }
    if (table === 'workspace_agreement_evidence') return { select: evidenceSelect }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    from,
    blockSelect,
    blockEq1,
    blockEq2,
    relSelect,
    relEq1,
    relEq2,
    relIn,
    evidenceSelect,
    evidenceEq,
  }
}

describe('assertCanPropose', () => {
  it('refuses when a block row exists for the pair', async () => {
    const supabase = fakeSupabase({ block: { data: { id: 'block-1' }, error: null } })

    await expect(
      assertCanPropose(supabase as never, { workspaceId: WORKSPACE_ID, memberUserId: MEMBER_ID })
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'This Member has blocked this workspace from proposing a roster relationship.',
    })
  })

  it('refuses when a live relationship already exists for the same pair', async () => {
    const supabase = fakeSupabase({
      liveRelationship: { data: { id: RELATIONSHIP_ID }, error: null },
    })

    await expect(
      assertCanPropose(supabase as never, { workspaceId: WORKSPACE_ID, memberUserId: MEMBER_ID })
    ).resolves.toEqual({
      ok: false,
      status: 409,
      error: 'A live roster relationship already exists between this workspace and this Member.',
    })
  })

  it('permits a proposal while the Member holds a live relationship with a different workspace (D-15)', async () => {
    // The query is scoped to THIS workspace/member pair only — it never
    // checks whether the Member holds a live relationship with any OTHER
    // workspace, because Funūn never enforces roster exclusivity (D-15).
    const supabase = fakeSupabase({})

    await expect(
      assertCanPropose(supabase as never, {
        workspaceId: OTHER_WORKSPACE_ID,
        memberUserId: MEMBER_ID,
      })
    ).resolves.toEqual({ ok: true })
    expect(supabase.relEq1).toHaveBeenCalledWith('workspace_id', OTHER_WORKSPACE_ID)
  })

  it('permits when neither a block nor a live relationship holds', async () => {
    const supabase = fakeSupabase({})

    await expect(
      assertCanPropose(supabase as never, { workspaceId: WORKSPACE_ID, memberUserId: MEMBER_ID })
    ).resolves.toEqual({ ok: true })
  })

  it('returns 500 on a block-lookup error without leaking a permissive result', async () => {
    const supabase = fakeSupabase({ block: { data: null, error: { message: 'db down' } } })

    await expect(
      assertCanPropose(supabase as never, { workspaceId: WORKSPACE_ID, memberUserId: MEMBER_ID })
    ).resolves.toEqual({ ok: false, status: 500, error: 'Could not check roster block status.' })
  })

  it('returns 500 on a relationship-lookup error without leaking a permissive result', async () => {
    const supabase = fakeSupabase({
      liveRelationship: { data: null, error: { message: 'db down' } },
    })

    await expect(
      assertCanPropose(supabase as never, { workspaceId: WORKSPACE_ID, memberUserId: MEMBER_ID })
    ).resolves.toEqual({
      ok: false,
      status: 500,
      error: 'Could not check existing roster relationships.',
    })
  })
})

describe('assertCanTransition', () => {
  it('permits a legal transition (proposed -> accepted)', () => {
    expect(assertCanTransition('proposed', 'accepted')).toEqual({ ok: true })
  })

  it('refuses an illegal transition and names the from/to pair', () => {
    expect(assertCanTransition('refused', 'accepted')).toEqual({
      ok: false,
      status: 400,
      error: 'Cannot move a roster relationship from refused to accepted.',
    })
  })
})

describe('assertMemberMayEnd', () => {
  it('permits the Member unconditionally from accepted', () => {
    expect(
      assertMemberMayEnd({ memberUserId: MEMBER_ID, callerUserId: MEMBER_ID, state: 'accepted' })
    ).toEqual({ ok: true })
  })

  it('refuses a caller who is not the named Member', () => {
    expect(
      assertMemberMayEnd({
        memberUserId: MEMBER_ID,
        callerUserId: OTHER_USER_ID,
        state: 'accepted',
      })
    ).toEqual({ ok: false, status: 403, error: 'Only the named Member may end this relationship.' })
  })

  it('refuses even the named Member when the state is not legally endable', () => {
    expect(
      assertMemberMayEnd({ memberUserId: MEMBER_ID, callerUserId: MEMBER_ID, state: 'proposed' })
    ).toEqual({
      ok: false,
      status: 400,
      error: 'Cannot move a roster relationship from proposed to ended.',
    })
  })
})

describe('assertWorkspaceMayEnd', () => {
  it('permits an owner to end an accepted relationship', () => {
    expect(assertWorkspaceMayEnd({ callerRole: 'owner', state: 'accepted' })).toEqual({ ok: true })
  })

  it('permits an admin to end an accepted relationship', () => {
    expect(assertWorkspaceMayEnd({ callerRole: 'admin', state: 'accepted' })).toEqual({ ok: true })
  })

  it('refuses a member-role caller', () => {
    expect(assertWorkspaceMayEnd({ callerRole: 'member', state: 'accepted' })).toEqual({
      ok: false,
      status: 403,
      error: 'Only workspace owners and admins can end a roster relationship.',
    })
  })
})

describe('loadRelationshipTier', () => {
  it('returns none for a non-accepted relationship without querying evidence', async () => {
    const supabase = fakeSupabase({})

    await expect(
      loadRelationshipTier(supabase as never, { relationshipId: RELATIONSHIP_ID, state: 'proposed' })
    ).resolves.toEqual({ ok: true, tier: 'none' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns operational for an accepted relationship with no live evidence', async () => {
    const supabase = fakeSupabase({ evidence: { data: [], error: null } })

    await expect(
      loadRelationshipTier(supabase as never, { relationshipId: RELATIONSHIP_ID, state: 'accepted' })
    ).resolves.toEqual({ ok: true, tier: 'operational' })
  })

  it('R-08/F8: resolves to operational (not authority) when confirmed_by_subject_at is null, however complete the declared scope', async () => {
    const supabase = fakeSupabase({
      evidence: {
        data: [
          {
            declared_scope: 'Manage registrations',
            effective_from: '2026-01-01T00:00:00.000Z',
            expires_at: null,
            superseded_at: null,
            declared_by: MEMBER_ID,
            uploaded_at: '2026-01-01T00:00:00.000Z',
            witnessed_by_signature: false,
            document_id: 'document-123',
            confirmed_by_subject_at: null,
          },
        ],
        error: null,
      },
    })

    await expect(
      loadRelationshipTier(supabase as never, { relationshipId: RELATIONSHIP_ID, state: 'accepted' })
    ).resolves.toEqual({ ok: true, tier: 'operational' })
  })

  it('resolves to authority when the row is confirmed, documented, and effective in the past', async () => {
    const supabase = fakeSupabase({
      evidence: {
        data: [
          {
            declared_scope: 'Manage registrations',
            effective_from: '2026-01-01T00:00:00.000Z',
            expires_at: null,
            superseded_at: null,
            declared_by: MEMBER_ID,
            uploaded_at: '2026-01-01T00:00:00.000Z',
            witnessed_by_signature: false,
            document_id: 'document-123',
            confirmed_by_subject_at: '2026-01-02T00:00:00.000Z',
          },
        ],
        error: null,
      },
    })

    await expect(
      loadRelationshipTier(supabase as never, { relationshipId: RELATIONSHIP_ID, state: 'accepted' })
    ).resolves.toEqual({ ok: true, tier: 'authority' })
    expect(supabase.evidenceSelect).toHaveBeenCalledWith(
      expect.stringContaining('document_id')
    )
    expect(supabase.evidenceSelect).toHaveBeenCalledWith(
      expect.stringContaining('confirmed_by_subject_at')
    )
  })

  it('returns 500 on an evidence-lookup error', async () => {
    const supabase = fakeSupabase({ evidence: { data: [], error: { message: 'db down' } } })

    await expect(
      loadRelationshipTier(supabase as never, { relationshipId: RELATIONSHIP_ID, state: 'accepted' })
    ).resolves.toEqual({
      ok: false,
      status: 500,
      error: 'Could not load agreement evidence for this relationship.',
    })
  })
})

describe('pickRosterFields', () => {
  it('picks only ROSTER_EDITABLE_FIELDS keys', () => {
    expect(
      pickRosterFields({
        professional_role: 'Producer',
        effective_from: '2026-01-01',
        state: 'accepted',
        member_user_id: MEMBER_ID,
      })
    ).toEqual({ professional_role: 'Producer', effective_from: '2026-01-01' })
  })

  it('excludes every lifecycle column named in ROSTER_EDITABLE_FIELDS documentation', () => {
    const lifecycleColumns = ['state', 'member_user_id', 'workspace_id', 'accepted_at', 'ended_at', 'ended_by']
    for (const column of lifecycleColumns) {
      expect(ROSTER_EDITABLE_FIELDS as readonly string[]).not.toContain(column)
    }
  })
})
