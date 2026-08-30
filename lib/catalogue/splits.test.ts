import { validateApprovalTotal } from '@/lib/split-sheets/approval'
import {
  identityKey,
  planWriterPromotion,
  planWriterRemoval,
  writersMissingFromSheet,
  type LivingDraftParty,
  type PartyIdentity,
  type WorkMember,
} from './splits'

const alice: PartyIdentity = { collaboratorId: 'collab-alice', name: 'Alice' }
const ben: PartyIdentity = { collaboratorId: 'collab-ben', name: 'Ben' }
const cara: PartyIdentity = { collaboratorId: 'collab-cara', name: 'Cara' }

describe('planWriterPromotion', () => {
  it('promoting the first writer on an empty sheet yields one party at 100', () => {
    const result = planWriterPromotion({ parties: [], writer: alice, status: 'draft' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.parties).toHaveLength(1)
      expect(result.parties[0].splitPercentage).toBe(100)
      expect(result.changed).toBe(true)
    }
  })

  it('promoting a second writer redrafts BOTH parties to 50 each', () => {
    const existing: LivingDraftParty[] = [{ ...alice, splitPercentage: 100 }]
    const result = planWriterPromotion({ parties: existing, writer: ben, status: 'draft' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.parties).toHaveLength(2)
      for (const party of result.parties) {
        expect(party.splitPercentage).toBe(50)
      }
    }
  })

  it('promoting a third yields three parties at evenSplit(3), summing to a valid total', () => {
    const existing: LivingDraftParty[] = [
      { ...alice, splitPercentage: 50 },
      { ...ben, splitPercentage: 50 },
    ]
    const result = planWriterPromotion({ parties: existing, writer: cara, status: 'draft' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.parties).toHaveLength(3)
      const total = result.parties.reduce((acc, p) => acc + p.splitPercentage, 0)
      expect(validateApprovalTotal(result.parties.map((p) => p.splitPercentage))).toBe(true)
      expect(Math.round(total * 1000) / 1000).toBe(100)
      // Every party's share is evenSplit(3) = 33.333, except the one
      // absorbing the rounding residue (33.334).
      for (const party of result.parties) {
        expect([33.333, 33.334]).toContain(party.splitPercentage)
      }
    }
  })

  it('promoting someone already on the sheet is a no-op', () => {
    const existing: LivingDraftParty[] = [
      { ...alice, splitPercentage: 50 },
      { ...ben, splitPercentage: 50 },
    ]
    const result = planWriterPromotion({ parties: existing, writer: alice, status: 'draft' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.changed).toBe(false)
      expect(result.parties).toHaveLength(2)
      expect(result.parties).toEqual(existing)
    }
  })

  it('refuses the redraft when the sheet status is outside the living-draft states', () => {
    const result = planWriterPromotion({ parties: [], writer: alice, status: 'executed' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason.length).toBeGreaterThan(0)
    }
  })

  it('refuses the redraft for a sheet pending approval, even though assertEditable would allow it with a consensus reset', () => {
    const result = planWriterPromotion({ parties: [], writer: alice, status: 'pending_approval' })
    expect(result.ok).toBe(false)
  })

  it('refuses for esign_pending with the lifecycle module\'s own reason', () => {
    const result = planWriterPromotion({ parties: [], writer: alice, status: 'esign_pending' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason.toLowerCase()).toContain('void')
    }
  })

  it('allows a redraft for a countered sheet (also a living-draft state)', () => {
    const result = planWriterPromotion({ parties: [], writer: alice, status: 'countered' })
    expect(result.ok).toBe(true)
  })
})

describe('planWriterRemoval', () => {
  it('redrafts the remainder to equal shares', () => {
    const existing: LivingDraftParty[] = [
      { ...alice, splitPercentage: 33.333 },
      { ...ben, splitPercentage: 33.333 },
      { ...cara, splitPercentage: 33.334 },
    ]
    const result = planWriterRemoval({ parties: existing, writer: cara, status: 'draft' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.parties).toHaveLength(2)
      for (const party of result.parties) {
        expect(party.splitPercentage).toBe(50)
      }
    }
  })

  it('is a no-op when the writer is not on the sheet', () => {
    const existing: LivingDraftParty[] = [{ ...alice, splitPercentage: 100 }]
    const result = planWriterRemoval({ parties: existing, writer: ben, status: 'draft' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.changed).toBe(false)
      expect(result.parties).toEqual(existing)
    }
  })

  it('refuses when the sheet is executed', () => {
    const existing: LivingDraftParty[] = [{ ...alice, splitPercentage: 100 }]
    const result = planWriterRemoval({ parties: existing, writer: alice, status: 'executed' })
    expect(result.ok).toBe(false)
  })
})

describe('writersMissingFromSheet', () => {
  it('returns a work member who has contributed and is absent from the sheet, as a person only', () => {
    const members: WorkMember[] = [{ ...ben, hasContributed: true }]
    const parties: PartyIdentity[] = [alice]
    const missing = writersMissingFromSheet(members, parties)
    expect(missing).toHaveLength(1)
    expect(missing[0].name).toBe('Ben')
    // No percentage field anywhere on the return type.
    expect(missing[0]).not.toHaveProperty('splitPercentage')
    expect(missing[0]).not.toHaveProperty('percentage')
    expect(missing[0]).not.toHaveProperty('share')
  })

  it('does not return a work member who has not contributed — being on the work is not being a writer', () => {
    const members: WorkMember[] = [{ ...ben, hasContributed: false }]
    const parties: PartyIdentity[] = []
    const missing = writersMissingFromSheet(members, parties)
    expect(missing).toHaveLength(0)
  })

  it('does not return a contributing writer who is already on the sheet', () => {
    const members: WorkMember[] = [{ ...alice, hasContributed: true }]
    const parties: PartyIdentity[] = [alice]
    const missing = writersMissingFromSheet(members, parties)
    expect(missing).toHaveLength(0)
  })
})

describe('identityKey', () => {
  it('prefers collaboratorId, then userId, then name', () => {
    expect(identityKey({ collaboratorId: 'c1', userId: 'u1', name: 'X' })).toBe('collaborator:c1')
    expect(identityKey({ userId: 'u1', name: 'X' })).toBe('user:u1')
    expect(identityKey({ name: 'X' })).toBe('name:X')
  })
})
