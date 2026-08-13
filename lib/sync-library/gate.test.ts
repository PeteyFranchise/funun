import type { Stage3Result } from '@/lib/vault/stage3'
import {
  evaluateInclusionGate,
  rightsBadge,
  RIGHTS_BADGE_TO_CATALOG_RIGHTS,
  type GateSignal,
} from './gate'

function stage3(overrides: Partial<Stage3Result> = {}): Stage3Result {
  return {
    required: [],
    recommended: [],
    complete: [],
    requiredComplete: 3,
    requiredTotal: 3,
    canContinue: true,
    sampleBlock: false,
    ...overrides,
  }
}

describe('evaluateInclusionGate', () => {
  const clearSignal: GateSignal = { rightsClear: true, qualityOk: true, metadataComplete: true }

  it('returns admit_eligible only when all three signals are true', () => {
    expect(evaluateInclusionGate(clearSignal)).toBe('admit_eligible')
  })

  it.each<[keyof GateSignal]>([['rightsClear'], ['qualityOk'], ['metadataComplete']])(
    'returns needs_completion when %s is false',
    key => {
      const signal: GateSignal = { ...clearSignal, [key]: false }
      expect(evaluateInclusionGate(signal)).toBe('needs_completion')
    }
  )

  it('never returns rejected for a fully-incomplete signal', () => {
    const verdict = evaluateInclusionGate({
      rightsClear: false,
      qualityOk: false,
      metadataComplete: false,
    })
    expect(verdict).toBe('needs_completion')
    expect(verdict).not.toBe('rejected')
  })
})

describe('rightsBadge', () => {
  it('is ready when canContinue and every required doc is complete', () => {
    expect(rightsBadge(stage3({ canContinue: true, requiredComplete: 3, requiredTotal: 3 }))).toBe(
      'ready'
    )
  })

  it('is contact when nothing required is complete yet', () => {
    expect(
      rightsBadge(stage3({ canContinue: false, requiredComplete: 0, requiredTotal: 3 }))
    ).toBe('contact')
  })

  it('is contact when a sample is blocking, even if some docs are complete', () => {
    expect(
      rightsBadge(stage3({ canContinue: false, requiredComplete: 2, requiredTotal: 3, sampleBlock: true }))
    ).toBe('contact')
  })

  it('is partial otherwise (some but not all required docs complete)', () => {
    expect(
      rightsBadge(stage3({ canContinue: false, requiredComplete: 2, requiredTotal: 3 }))
    ).toBe('partial')
  })
})

describe('RIGHTS_BADGE_TO_CATALOG_RIGHTS', () => {
  it('maps the rights badge tri-state to the CatalogRights code', () => {
    expect(RIGHTS_BADGE_TO_CATALOG_RIGHTS).toEqual({ ready: 'ok', partial: 'part', contact: 'req' })
  })

  it('composes end-to-end from a Stage3Result to a CatalogRights code', () => {
    const badge = rightsBadge(stage3({ canContinue: true, requiredComplete: 3, requiredTotal: 3 }))
    expect(RIGHTS_BADGE_TO_CATALOG_RIGHTS[badge]).toBe('ok')
  })
})
