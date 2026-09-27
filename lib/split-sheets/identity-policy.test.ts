import {
  resolveIdentityFields,
  identityDigest,
  identityDriftSinceLastAction,
  type PartyIdentityFields,
  type PartyForDriftCheck,
  type SplitSheetStatus,
} from './identity-policy'

const frozen: PartyIdentityFields = {
  legal_name: 'Frozen Legal Name',
  pro: 'ASCAP',
  ipi: '00000000001',
  publishing_designee: 'Frozen Publishing',
  administrator: 'Frozen Admin Co',
}

const claimed: PartyIdentityFields = {
  legal_name: 'Live Legal Name',
  pro: 'BMI',
  ipi: '00000000002',
  publishing_designee: 'Live Publishing',
  administrator: 'Live Admin Co',
}

describe('resolveIdentityFields — Ruling 2, two field classes', () => {
  describe('pre-mint, claimed profile present', () => {
    const preMintStatuses: SplitSheetStatus[] = ['draft', 'pending_approval', 'approved', 'countered']

    it.each(preMintStatuses)(
      '%s: person-scoped fields (legal_name/pro/ipi) are overwritten by the live profile',
      status => {
        const result = resolveIdentityFields(frozen, claimed, status)
        expect(result.legal_name).toBe('Live Legal Name')
        expect(result.pro).toBe('BMI')
        expect(result.ipi).toBe('00000000002')
      }
    )

    it.each(preMintStatuses)(
      '%s: work-specific fields (publishing_designee/administrator) are NOT overwritten by a differing live profile — the exact Ruling 2 defect',
      status => {
        const result = resolveIdentityFields(frozen, claimed, status)
        expect(result.publishing_designee).toBe('Frozen Publishing')
        expect(result.administrator).toBe('Frozen Admin Co')
      }
    )
  })

  it('a blank live person-scoped value never blanks a real stored value', () => {
    const partialClaimed: PartyIdentityFields = { ...claimed, pro: null }
    const result = resolveIdentityFields(frozen, partialClaimed, 'draft')
    expect(result.pro).toBe('ASCAP')
    expect(result.ipi).toBe('00000000002')
  })

  it('a whitespace-only live person-scoped value never blanks a real stored value', () => {
    const partialClaimed: PartyIdentityFields = { ...claimed, ipi: '   ' }
    const result = resolveIdentityFields(frozen, partialClaimed, 'draft')
    expect(result.ipi).toBe('00000000001')
  })

  it('a blank stored work-specific field IS filled from the live profile', () => {
    const blankFrozen: PartyIdentityFields = { ...frozen, publishing_designee: null, administrator: '   ' }
    const result = resolveIdentityFields(blankFrozen, claimed, 'draft')
    expect(result.publishing_designee).toBe('Live Publishing')
    expect(result.administrator).toBe('Live Admin Co')
  })

  it('an unclaimed party (liveProfile null) always returns the party row unchanged', () => {
    const allStatuses: SplitSheetStatus[] = [
      'draft',
      'pending_approval',
      'approved',
      'countered',
      'esign_pending',
      'executed',
    ]
    for (const status of allStatuses) {
      expect(resolveIdentityFields(frozen, null, status)).toEqual(frozen)
    }
  })

  describe('post-mint: the party row wins even with a differing live profile', () => {
    const postMintStatuses: SplitSheetStatus[] = ['esign_pending', 'executed']

    it.each(postMintStatuses)('%s: returns the party row unchanged, ignoring the live profile', status => {
      const result = resolveIdentityFields(frozen, claimed, status)
      expect(result).toEqual(frozen)
    })
  })

  it('returns a new object, never mutating the party row in place', () => {
    const row = { ...frozen }
    resolveIdentityFields(row, claimed, 'draft')
    expect(row).toEqual(frozen)
  })
})

describe('identityDigest', () => {
  it('is stable across repeated calls with equivalent input', () => {
    expect(identityDigest(frozen)).toBe(identityDigest({ ...frozen }))
  })

  it('is stable regardless of key order in the input object', () => {
    const reordered: PartyIdentityFields = {
      administrator: frozen.administrator,
      publishing_designee: frozen.publishing_designee,
      ipi: frozen.ipi,
      pro: frozen.pro,
      legal_name: frozen.legal_name,
    }
    expect(identityDigest(frozen)).toBe(identityDigest(reordered))
  })

  it('treats null and empty string identically for the same field', () => {
    const withNull: PartyIdentityFields = { ...frozen, administrator: null }
    const withEmpty: PartyIdentityFields = { ...frozen, administrator: '' }
    const withWhitespace: PartyIdentityFields = { ...frozen, administrator: '   ' }
    expect(identityDigest(withNull)).toBe(identityDigest(withEmpty))
    expect(identityDigest(withNull)).toBe(identityDigest(withWhitespace))
  })

  it('differs when any single field differs', () => {
    const changed: PartyIdentityFields = { ...frozen, pro: 'BMI' }
    expect(identityDigest(frozen)).not.toBe(identityDigest(changed))
  })

  it('does not collide across a field boundary (concatenation safety)', () => {
    const a: PartyIdentityFields = {
      legal_name: 'AB',
      pro: '',
      ipi: null,
      publishing_designee: null,
      administrator: null,
    }
    const b: PartyIdentityFields = {
      legal_name: 'A',
      pro: 'B',
      ipi: null,
      publishing_designee: null,
      administrator: null,
    }
    expect(identityDigest(a)).not.toBe(identityDigest(b))
  })
})

describe('identityDriftSinceLastAction — Ruling 1 gate predicate', () => {
  function partyWithBaseline(overrides: Partial<PartyForDriftCheck> = {}): PartyForDriftCheck {
    return {
      partyId: 'party-1',
      partyName: 'Jane Smith',
      identityDigestAtApproval: identityDigest(frozen),
      ...frozen,
      ...overrides,
    }
  }

  it('no baseline (null identityDigestAtApproval) — never blocks, even with a wildly different resolved identity', () => {
    const party = partyWithBaseline({ identityDigestAtApproval: null })
    expect(identityDriftSinceLastAction(party, claimed)).toEqual([])
  })

  it('resolved identity matches the baseline exactly — no drift', () => {
    const party = partyWithBaseline()
    expect(identityDriftSinceLastAction(party, frozen)).toEqual([])
  })

  it('a whitespace-only change does not register as drift (same normalization as the digest)', () => {
    const party = partyWithBaseline()
    const resolved: PartyIdentityFields = { ...frozen, pro: 'ASCAP  ' }
    expect(identityDriftSinceLastAction(party, resolved)).toEqual([])
  })

  it('a genuinely different resolved identity blocks and names the changed field', () => {
    const party = partyWithBaseline()
    const resolved: PartyIdentityFields = { ...frozen, pro: 'BMI' }
    const drift = identityDriftSinceLastAction(party, resolved)
    expect(drift.length).toBeGreaterThan(0)
    expect(drift.some(d => d.field === 'pro' && d.valueWhenTheyResponded === 'ASCAP' && d.valueNow === 'BMI')).toBe(
      true
    )
  })

  it('names every party in a multi-field drift', () => {
    const party = partyWithBaseline()
    const resolved: PartyIdentityFields = { ...frozen, pro: 'BMI', legal_name: 'New Name' }
    const drift = identityDriftSinceLastAction(party, resolved)
    const fields = drift.map(d => d.field).sort()
    expect(fields).toContain('pro')
    expect(fields).toContain('legal_name')
    for (const d of drift) {
      expect(d.partyId).toBe('party-1')
      expect(d.partyName).toBe('Jane Smith')
    }
  })
})
