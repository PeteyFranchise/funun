import {
  SYNC_LISTING_STATUSES,
  isValidTransition,
  nextStatusOnAgreementSigned,
  initialStatusForEntry,
  isTerminal,
} from './submission'

describe('SYNC_LISTING_STATUSES', () => {
  it('matches migration 096\'s CHECK enum exactly', () => {
    expect(SYNC_LISTING_STATUSES).toEqual([
      'applied',
      'invited',
      'agreement_pending',
      'pending_admit',
      'admitted',
      'rejected',
      'withdrawn',
      'removed',
    ])
  })
})

describe('isValidTransition', () => {
  const legalEdges: [string, string][] = [
    ['applied', 'agreement_pending'],
    ['applied', 'pending_admit'],
    ['applied', 'rejected'],
    ['applied', 'withdrawn'],
    ['invited', 'agreement_pending'],
    ['invited', 'pending_admit'],
    ['invited', 'rejected'],
    ['invited', 'withdrawn'],
    ['agreement_pending', 'pending_admit'],
    ['agreement_pending', 'rejected'],
    ['agreement_pending', 'withdrawn'],
    ['pending_admit', 'admitted'],
    ['pending_admit', 'rejected'],
    ['pending_admit', 'withdrawn'],
    ['admitted', 'removed'],
    ['admitted', 'withdrawn'],
  ]

  it.each(legalEdges)('allows %s -> %s', (from, to) => {
    expect(isValidTransition(from, to)).toBe(true)
  })

  const illegalEdges: [string, string][] = [
    // Self-loops on every status.
    ['applied', 'applied'],
    ['invited', 'invited'],
    ['agreement_pending', 'agreement_pending'],
    ['pending_admit', 'pending_admit'],
    ['admitted', 'admitted'],
    ['rejected', 'rejected'],
    ['withdrawn', 'withdrawn'],
    ['removed', 'removed'],
    // Terminal-exit attempts — no legal edge out of a terminal state.
    ['rejected', 'applied'],
    ['rejected', 'pending_admit'],
    ['withdrawn', 'applied'],
    ['withdrawn', 'pending_admit'],
    ['removed', 'admitted'],
    ['removed', 'applied'],
    // Skipping/backwards edges not in the locked table.
    ['applied', 'admitted'],
    ['invited', 'admitted'],
    ['admitted', 'applied'],
    ['admitted', 'pending_admit'],
    ['admitted', 'rejected'],
    ['pending_admit', 'invited'],
    ['pending_admit', 'agreement_pending'],
  ]

  it.each(illegalEdges)('rejects %s -> %s', (from, to) => {
    expect(isValidTransition(from, to)).toBe(false)
  })

  it('returns false for unknown status strings without throwing', () => {
    expect(() => isValidTransition('bogus', 'applied')).not.toThrow()
    expect(isValidTransition('bogus', 'applied')).toBe(false)
    expect(isValidTransition('applied', 'bogus')).toBe(false)
    expect(isValidTransition('', '')).toBe(false)
  })
})

describe('nextStatusOnAgreementSigned', () => {
  it('returns pending_admit for applied, invited, and agreement_pending', () => {
    expect(nextStatusOnAgreementSigned('applied')).toBe('pending_admit')
    expect(nextStatusOnAgreementSigned('invited')).toBe('pending_admit')
    expect(nextStatusOnAgreementSigned('agreement_pending')).toBe('pending_admit')
  })

  it('returns null for statuses not on the sign-in-progress path', () => {
    expect(nextStatusOnAgreementSigned('pending_admit')).toBeNull()
    expect(nextStatusOnAgreementSigned('admitted')).toBeNull()
    expect(nextStatusOnAgreementSigned('rejected')).toBeNull()
    expect(nextStatusOnAgreementSigned('withdrawn')).toBeNull()
    expect(nextStatusOnAgreementSigned('removed')).toBeNull()
  })

  it('returns null for an unknown status string without throwing', () => {
    expect(() => nextStatusOnAgreementSigned('bogus')).not.toThrow()
    expect(nextStatusOnAgreementSigned('bogus')).toBeNull()
  })
})

describe('initialStatusForEntry', () => {
  it('self_applied, not yet signed -> applied', () => {
    expect(initialStatusForEntry('self_applied', false)).toBe('applied')
  })

  it('self_applied, already signed -> pending_admit', () => {
    expect(initialStatusForEntry('self_applied', true)).toBe('pending_admit')
  })

  it('admin_invited, not yet signed -> invited', () => {
    expect(initialStatusForEntry('admin_invited', false)).toBe('invited')
  })

  it('admin_invited, already signed -> pending_admit', () => {
    expect(initialStatusForEntry('admin_invited', true)).toBe('pending_admit')
  })
})

describe('isTerminal', () => {
  it('is true for rejected, withdrawn, and removed', () => {
    expect(isTerminal('rejected')).toBe(true)
    expect(isTerminal('withdrawn')).toBe(true)
    expect(isTerminal('removed')).toBe(true)
  })

  it('is false for non-terminal statuses', () => {
    expect(isTerminal('applied')).toBe(false)
    expect(isTerminal('invited')).toBe(false)
    expect(isTerminal('agreement_pending')).toBe(false)
    expect(isTerminal('pending_admit')).toBe(false)
    expect(isTerminal('admitted')).toBe(false)
  })

  it('is false for an unknown status string without throwing', () => {
    expect(() => isTerminal('bogus')).not.toThrow()
    expect(isTerminal('bogus')).toBe(false)
  })
})
