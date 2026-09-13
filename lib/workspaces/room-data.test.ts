import {
  clampWorkspaceRoomLimit,
  clampWorkspaceRoomOffset,
  loadWorkspaceActivityPage,
  loadWorkspaceRosterPage,
  normalizeWorkspaceActivityRows,
  normalizeWorkspaceRosterRows,
  workspaceActivityLabel,
} from '@/lib/workspaces/room-data'

const WORKSPACE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const MEMBER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ROW_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

describe('workspace room pagination', () => {
  it('uses bounded defaults for missing, non-finite, and extreme inputs', () => {
    expect(clampWorkspaceRoomLimit(null)).toBe(50)
    expect(clampWorkspaceRoomLimit('nope')).toBe(50)
    expect(clampWorkspaceRoomLimit('5000')).toBe(200)
    expect(clampWorkspaceRoomLimit('-5')).toBe(1)
    expect(clampWorkspaceRoomOffset(null)).toBe(0)
    expect(clampWorkspaceRoomOffset('-5')).toBe(0)
    expect(clampWorkspaceRoomOffset('12.8')).toBe(12)
  })
})

describe('normalizeWorkspaceRosterRows', () => {
  it('collapses blocked to refused and keeps only the allowlisted reader shape', () => {
    const rows = normalizeWorkspaceRosterRows(
      [
        {
          id: ROW_ID,
          workspace_id: WORKSPACE_ID,
          member_user_id: MEMBER_ID,
          professional_role: ' Producer ',
          state: 'blocked',
          created_at: '2026-09-12T12:00:00.000Z',
          secret: 'must not survive',
        },
      ],
      WORKSPACE_ID
    )

    expect(rows).toEqual([
      expect.objectContaining({
        id: ROW_ID,
        workspace_id: WORKSPACE_ID,
        member_user_id: MEMBER_ID,
        professional_role: 'Producer',
        state: 'refused',
        authorityTier: 'none',
        authorityStatus: { tier: 'none', reason: 'relationship_inactive', changesAt: null },
      }),
    ])
    expect(JSON.stringify(rows)).not.toContain('blocked')
    expect(JSON.stringify(rows)).not.toContain('secret')
  })

  it('fails closed for malformed ids, mismatched workspaces, and unknown states', () => {
    expect(
      normalizeWorkspaceRosterRows(
        [
          { id: 'bad', workspace_id: WORKSPACE_ID, member_user_id: MEMBER_ID, state: 'accepted' },
          { id: ROW_ID, workspace_id: MEMBER_ID, member_user_id: MEMBER_ID, state: 'accepted' },
          { id: ROW_ID, workspace_id: WORKSPACE_ID, member_user_id: MEMBER_ID, state: 'mystery' },
        ],
        WORKSPACE_ID
      )
    ).toEqual([])
  })
})

describe('normalizeWorkspaceActivityRows', () => {
  it('returns display-safe activity facts without forwarding raw changes', () => {
    const rows = normalizeWorkspaceActivityRows([
      {
        id: ROW_ID,
        actor_user_id: ACTOR_ID,
        subject_member_id: MEMBER_ID,
        action: 'workspace.roster.proposed',
        permission_relied_on: null,
        target_type: 'workspace_roster_relationship',
        target_id: ROW_ID,
        changes: { email: 'private@example.com' },
        changes_redacted: true,
        created_at: '2026-09-12T12:00:00.000Z',
      },
    ])

    expect(rows).toEqual([
      expect.objectContaining({
        id: ROW_ID,
        action: 'workspace.roster.proposed',
        actionLabel: 'Proposed a roster relationship',
        changesRedacted: true,
      }),
    ])
    expect(JSON.stringify(rows)).not.toContain('private@example.com')
    expect(JSON.stringify(rows)).not.toContain('changes\":')
  })

  it('uses a neutral label for a future allowlisted workspace action', () => {
    expect(workspaceActivityLabel('workspace.catalogue.reviewed')).toBe('Updated the workspace')
  })
})

describe('workspace room server readers', () => {
  it('uses one bounded roster RPC and one bulk evidence query for multiple accepted rows', async () => {
    const secondRelationship = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
    const secondMember = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    const rpc = jest.fn(async () => ({
      data: [
        { id: ROW_ID, workspace_id: WORKSPACE_ID, member_user_id: MEMBER_ID, state: 'accepted' },
        { id: secondRelationship, workspace_id: WORKSPACE_ID, member_user_id: secondMember, state: 'accepted' },
      ],
      error: null,
    }))
    const evidenceIn = jest.fn()
    const profileIn = jest.fn()
    const service = {
      from: jest.fn((table: string) => ({
        select: () => ({
          in: (column: string, ids: string[]) => {
            const order = async () => {
              if (table === 'workspace_agreement_evidence') {
                evidenceIn(column, ids)
                return {
                  data: [{
                    relationship_id: ROW_ID,
                    declared_scope: 'Manage recordings',
                    effective_from: null,
                    expires_at: null,
                    superseded_at: null,
                    declared_by: MEMBER_ID,
                    uploaded_at: '2026-09-12T12:00:00.000Z',
                    witnessed_by_signature: false,
                    document_id: ACTOR_ID,
                    confirmed_by_subject_at: '2026-09-12T12:00:00.000Z',
                  }],
                  error: null,
                }
              }
              profileIn(column, ids)
              return {
                data: [
                  { id: MEMBER_ID, artist_name: 'Maya Reyes', handle: 'maya' },
                  { id: secondMember, artist_name: null, handle: 'second' },
                ],
                error: null,
              }
            }
            return { order }
          },
        }),
      })),
    }

    const result = await loadWorkspaceRosterPage(
      { rpc } as never,
      service as never,
      { workspaceId: WORKSPACE_ID, userId: ACTOR_ID, limit: 500 }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(rpc).toHaveBeenCalledWith('workspace_roster_page', expect.objectContaining({ p_limit: 200 }))
    expect(evidenceIn).toHaveBeenCalledTimes(1)
    expect(profileIn).toHaveBeenCalledTimes(1)
    expect(result.data.map(row => row.authorityTier)).toEqual(['authority', 'operational'])
    expect(result.data.map(row => row.authorityStatus.reason)).toEqual(['supported', 'no_evidence'])
    expect(result.data.map(row => row.memberDisplayName)).toEqual(['Maya Reyes', '@second'])
  })

  it('reads activity through the redacting RPC and never returns its raw changes object', async () => {
    const rpc = jest.fn(async () => ({
      data: [{
        id: ROW_ID,
        actor_user_id: ACTOR_ID,
        subject_member_id: MEMBER_ID,
        action: 'workspace.member.role_changed',
        permission_relied_on: null,
        target_type: 'workspace_member',
        changes: { email: 'hidden@example.com' },
        changes_redacted: true,
        created_at: '2026-09-12T12:00:00.000Z',
      }],
      error: null,
    }))
    const service = {
      from: () => ({
        select: () => ({
          in: () => ({
            order: async () => ({
              data: [
                { id: ACTOR_ID, artist_name: 'Workspace Owner', handle: 'owner' },
                { id: MEMBER_ID, artist_name: 'Roster Member', handle: 'member' },
              ],
              error: null,
            }),
          }),
        }),
      }),
    }

    const result = await loadWorkspaceActivityPage(
      { rpc } as never,
      service as never,
      { workspaceId: WORKSPACE_ID, userId: ACTOR_ID }
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(rpc).toHaveBeenCalledWith('workspace_audit_page', expect.objectContaining({ p_uid: ACTOR_ID }))
    expect(result.data[0]).toEqual(expect.objectContaining({
      actorDisplayName: 'Workspace Owner',
      subjectDisplayName: 'Roster Member',
      changesRedacted: true,
    }))
    expect(JSON.stringify(result.data)).not.toContain('hidden@example.com')
  })
})
