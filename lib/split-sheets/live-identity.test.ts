import { resolvePartyIdentity, type LivePartyIdentitySource, type SplitSheetStatus } from './live-identity'

const frozen: LivePartyIdentitySource = {
  pro: 'ASCAP',
  ipi: '00000000001',
  publishing_designee: 'Frozen Publishing',
  administrator: 'Frozen Admin Co',
  legal_name: 'Frozen Legal Name',
}

const claimed: LivePartyIdentitySource = {
  pro: 'BMI',
  ipi: '00000000002',
  publishing_designee: 'Live Publishing',
  administrator: 'Live Admin Co',
  legal_name: 'Live Legal Name',
}

describe('resolvePartyIdentity — the live-link resolver', () => {
  describe('pre-mint statuses with a claimed profile: overwrite wins', () => {
    const preMintStatuses: SplitSheetStatus[] = ['draft', 'pending_approval', 'approved', 'countered']

    it.each(preMintStatuses)('%s: claimed PRO overwrites frozen PRO outright', status => {
      const result = resolvePartyIdentity(frozen, claimed, status)
      expect(result.pro).toBe('BMI')
    })

    it.each(preMintStatuses)('%s: every claimed field overwrites the frozen field', status => {
      const result = resolvePartyIdentity(frozen, claimed, status)
      expect(result).toEqual(claimed)
    })

    it('legal_name overwrite behaves identically to the rights fields pre-mint', () => {
      const result = resolvePartyIdentity(frozen, claimed, 'draft')
      expect(result.legal_name).toBe('Live Legal Name')
    })
  })

  describe('a null/blank claimed field falls back to the frozen value', () => {
    it('does not blank a real frozen value when the claimed field is null', () => {
      const partialClaimed: LivePartyIdentitySource = { ...claimed, pro: null }
      const result = resolvePartyIdentity(frozen, partialClaimed, 'draft')
      expect(result.pro).toBe('ASCAP') // frozen value preserved
      expect(result.ipi).toBe('00000000002') // other fields still overwrite
    })

    it('does not blank a real frozen value when the claimed field is whitespace-only', () => {
      const partialClaimed: LivePartyIdentitySource = { ...claimed, administrator: '   ' }
      const result = resolvePartyIdentity(frozen, partialClaimed, 'draft')
      expect(result.administrator).toBe('Frozen Admin Co')
    })
  })

  describe('an unclaimed party (claimedProfile null) — always the frozen snapshot', () => {
    const allStatuses: SplitSheetStatus[] = [
      'draft',
      'pending_approval',
      'approved',
      'countered',
      'esign_pending',
      'executed',
    ]

    it.each(allStatuses)('%s: returns the frozen snapshot unchanged when unclaimed', status => {
      const result = resolvePartyIdentity(frozen, null, status)
      expect(result).toEqual(frozen)
    })
  })

  describe('post-mint statuses: freeze wins even with a differing claimed profile', () => {
    const postMintStatuses: SplitSheetStatus[] = ['esign_pending', 'executed']

    it.each(postMintStatuses)('%s: returns the frozen snapshot, ignoring the claimed profile', status => {
      const result = resolvePartyIdentity(frozen, claimed, status)
      expect(result).toEqual(frozen)
    })
  })

  it('returns a new object, never mutating the frozen snapshot in place', () => {
    const snapshot = { ...frozen }
    resolvePartyIdentity(snapshot, claimed, 'draft')
    expect(snapshot).toEqual(frozen)
  })
})
