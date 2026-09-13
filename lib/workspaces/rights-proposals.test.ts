import {
  MemberRightsDecisionSchema,
  presentRightsProposal,
  WORKSPACE_RIGHTS_FIELD_VALUES,
  WorkspaceRightsProposalSchema,
} from '@/lib/workspaces/rights-proposals'

describe('workspace rights proposals', () => {
  it('allows exactly the four D-41 fields', () => {
    expect(WORKSPACE_RIGHTS_FIELD_VALUES).toEqual(['pro', 'ipi', 'publisher', 'soundexchange_id'])
    for (const field of WORKSPACE_RIGHTS_FIELD_VALUES) {
      expect(WorkspaceRightsProposalSchema.safeParse({
        relationshipId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        field,
        proposedValue: 'Example',
      }).success).toBe(true)
    }
    expect(WorkspaceRightsProposalSchema.safeParse({
      relationshipId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      field: 'payout_account',
      proposedValue: 'Example',
    }).success).toBe(false)
  })

  it('lets the Member confirm or decline, never let the workspace name a generic status', () => {
    expect(MemberRightsDecisionSchema.safeParse({
      proposalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', decision: 'confirmed',
    }).success).toBe(true)
    expect(MemberRightsDecisionSchema.safeParse({
      proposalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', decision: 'superseded',
    }).success).toBe(false)
  })

  it('presents an allowlisted record without forwarding unknown fields', () => {
    const result = presentRightsProposal({
      id: 'one', workspace_id: 'workspace', relationship_id: 'relationship',
      member_user_id: 'member', field: 'ipi', proposed_value: '00123456789', note: 'Confirm this',
      status: 'pending', proposed_by: 'actor', created_at: '2026-09-13T00:00:00Z',
      decided_at: null, private: 'do not return',
    }, 'Rise Management')
    expect(result).toEqual(expect.objectContaining({ fieldLabel: expect.stringContaining('IPI') }))
    expect(JSON.stringify(result)).not.toContain('do not return')
  })
})
