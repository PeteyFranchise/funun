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

  it('returns admit_eligible when quality and metadata are both satisfied', () => {
    expect(evaluateInclusionGate(clearSignal)).toBe('admit_eligible')
  })

  it.each<[keyof GateSignal]>([['qualityOk'], ['metadataComplete']])(
    'returns needs_completion when %s is false',
    key => {
      const signal: GateSignal = { ...clearSignal, [key]: false }
      expect(evaluateInclusionGate(signal)).toBe('needs_completion')
    }
  )

  // ─── REVERSED 2026-10-11 by owner decision D-11 ───────────────────────
  // `rightsClear` was the third conjunct and this case asserted it blocked
  // admission. D-11 names the admission bar — quality judgment, a playable
  // finished master, sufficient identity/metadata, a valid project type — and
  // says it is NOT every clearance document. rightsClear is exactly "every
  // clearance document" (SYNC_RIGHTS_KEYS: split_sheets, copyright,
  // hire_right), so it had to stop refusing.
  //
  // Rewritten as the positive assertion rather than deleted, because the
  // removal is the behaviour and an absent test would not pin it. The signal
  // is still carried and still reported to staff — visible, not blocking.
  it('ADMITS despite unfinished rights paperwork — rights are reported, not blocking (D-11)', () => {
    expect(evaluateInclusionGate({ ...clearSignal, rightsClear: false })).toBe('admit_eligible')
  })

  // The negative control for the case above: dropping one conjunct must not
  // have made the gate unconditional.
  it('still refuses when rights are unfinished AND the quality bar is unmet', () => {
    expect(evaluateInclusionGate({ rightsClear: false, qualityOk: false, metadataComplete: true })).toBe(
      'needs_completion'
    )
  })

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
