import { isLegalTransition, requiredFieldsForStage, getLegalNextStages } from './stage-machine'
import { DEAL_STAGE_VALUES, type DealStage } from './schema'

const FORWARD_PIPELINE: DealStage[] = [
  'submitted',
  'in_negotiation',
  'terms_agreed',
  'contract',
  'closed_won',
]

describe('isLegalTransition', () => {
  it('allows every forward step along the D-16a pipeline', () => {
    for (let i = 0; i < FORWARD_PIPELINE.length - 1; i++) {
      expect(isLegalTransition(FORWARD_PIPELINE[i], FORWARD_PIPELINE[i + 1])).toBe(true)
    }
  })

  it('allows any non-terminal stage to transition to closed_lost', () => {
    const nonTerminal = FORWARD_PIPELINE.filter(s => s !== 'closed_won')
    for (const stage of nonTerminal) {
      expect(isLegalTransition(stage, 'closed_lost')).toBe(true)
    }
  })

  it('rejects every outbound move from closed_won (terminal)', () => {
    for (const to of DEAL_STAGE_VALUES) {
      if (to === 'closed_won') continue
      expect(isLegalTransition('closed_won', to)).toBe(false)
    }
  })

  it('rejects every outbound move from closed_lost (terminal)', () => {
    for (const to of DEAL_STAGE_VALUES) {
      if (to === 'closed_lost') continue
      expect(isLegalTransition('closed_lost', to)).toBe(false)
    }
  })

  it('rejects skipping a stage forward', () => {
    expect(isLegalTransition('submitted', 'terms_agreed')).toBe(false)
    expect(isLegalTransition('submitted', 'contract')).toBe(false)
    expect(isLegalTransition('submitted', 'closed_won')).toBe(false)
    expect(isLegalTransition('in_negotiation', 'contract')).toBe(false)
    expect(isLegalTransition('in_negotiation', 'closed_won')).toBe(false)
    expect(isLegalTransition('terms_agreed', 'closed_won')).toBe(false)
  })

  it('rejects a same-stage self-transition for every stage', () => {
    for (const stage of DEAL_STAGE_VALUES) {
      expect(isLegalTransition(stage, stage)).toBe(false)
    }
  })

  it('rejects a backward move', () => {
    expect(isLegalTransition('in_negotiation', 'submitted')).toBe(false)
    expect(isLegalTransition('contract', 'terms_agreed')).toBe(false)
  })

  it('fails closed on an unknown "from" stage value', () => {
    expect(isLegalTransition('bogus_stage' as DealStage, 'submitted')).toBe(false)
  })

  it('fails closed on an unknown "to" stage value', () => {
    expect(isLegalTransition('submitted', 'bogus_stage' as DealStage)).toBe(false)
  })

  it('fails closed when both stage values are unknown', () => {
    expect(isLegalTransition('bogus_from' as DealStage, 'bogus_to' as DealStage)).toBe(false)
  })
})

describe('requiredFieldsForStage', () => {
  it('requires gross fee and commission percentage for the contract stage', () => {
    const fields = requiredFieldsForStage('contract')
    expect(fields).toContain('gross_fee_cents')
    expect(fields).toContain('commission_pct')
  })

  it('requires a linked contract document for the closed_won stage', () => {
    const fields = requiredFieldsForStage('closed_won')
    expect(fields).toContain('contract_document_id')
  })

  it('requires nothing extra for submitted, in_negotiation, terms_agreed, and closed_lost', () => {
    expect(requiredFieldsForStage('submitted')).toEqual([])
    expect(requiredFieldsForStage('in_negotiation')).toEqual([])
    expect(requiredFieldsForStage('terms_agreed')).toEqual([])
    expect(requiredFieldsForStage('closed_lost')).toEqual([])
  })
})

describe('getLegalNextStages', () => {
  it('returns the single forward step plus decline for each non-terminal stage', () => {
    expect(getLegalNextStages('submitted').sort()).toEqual(['closed_lost', 'in_negotiation'].sort())
    expect(getLegalNextStages('in_negotiation').sort()).toEqual(['closed_lost', 'terms_agreed'].sort())
    expect(getLegalNextStages('terms_agreed').sort()).toEqual(['closed_lost', 'contract'].sort())
    expect(getLegalNextStages('contract').sort()).toEqual(['closed_lost', 'closed_won'].sort())
  })

  it('returns an empty list for both terminal stages', () => {
    expect(getLegalNextStages('closed_won')).toEqual([])
    expect(getLegalNextStages('closed_lost')).toEqual([])
  })

  it('derives from the same source of truth isLegalTransition enforces (no drift)', () => {
    for (const from of DEAL_STAGE_VALUES) {
      const legalNext = getLegalNextStages(from)
      for (const to of DEAL_STAGE_VALUES) {
        expect(legalNext.includes(to)).toBe(isLegalTransition(from, to))
      }
    }
  })
})
