import {
  EVIDENCE_DERIVED_MASTER_CAPABILITIES,
  MasterOwnershipClaimSchema,
  MasterOwnershipDecisionSchema,
  presentMasterOwnershipClaim,
} from './master-ownership'

const ID = '11111111-1111-4111-8111-111111111111'

const base = {
  id: ID,
  workspace_id: '22222222-2222-4222-8222-222222222222',
  work_version_id: '33333333-3333-4333-8333-333333333333',
  holder_user_id: '44444444-4444-4444-8444-444444444444',
  state: 'claimed',
  note: null,
  dispute_note: null,
  evidence_document_id: null,
  created_at: '2026-09-13T00:00:00.000Z',
  updated_at: '2026-09-13T00:00:00.000Z',
}

describe('master ownership claims', () => {
  it('accepts a version claim without a caller-supplied holder', () => {
    expect(MasterOwnershipClaimSchema.safeParse({ workVersionId: ID }).success).toBe(true)
    expect(MasterOwnershipClaimSchema.safeParse({ workVersionId: ID, holderUserId: ID }).success).toBe(false)
  })

  it('requires a bounded explanation for a dispute', () => {
    expect(MasterOwnershipDecisionSchema.safeParse({ claimId: ID, action: 'dispute', note: '' }).success).toBe(false)
    expect(MasterOwnershipDecisionSchema.safeParse({ claimId: ID, action: 'dispute', note: 'The recording is not owned by this label.' }).success).toBe(true)
  })

  it('keeps a claimed row inert and strips unknown sensitive columns', () => {
    const result = presentMasterOwnershipClaim({ ...base, audio_path: 'secret/master.wav' })
    expect(result?.access.enabled).toBe(false)
    expect(result?.access.cleanMasterDownload).toBe(false)
    expect(result).not.toHaveProperty('audio_path')
  })

  it('unlocks only the declared non-master capabilities when document-supported', () => {
    const result = presentMasterOwnershipClaim({
      ...base,
      state: 'document_supported',
      evidence_document_id: '55555555-5555-4555-8555-555555555555',
    })
    expect(result?.access.enabled).toBe(true)
    expect(result?.access.capabilities).toEqual(EVIDENCE_DERIVED_MASTER_CAPABILITIES)
    expect(result?.access.capabilities).not.toContain('access_clean_masters')
    expect(result?.access.cleanMasterDownload).toBe(false)
  })

  it('fails closed on an unknown state', () => {
    expect(presentMasterOwnershipClaim({ ...base, state: 'approved' })).toBeNull()
  })
})
