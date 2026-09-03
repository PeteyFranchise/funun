import { buildRightsSetupState, isRightsSetupReminderDue } from './rights-setup'

describe('buildRightsSetupState', () => {
  it('starts with four advisory items and no handled facts', () => {
    const state = buildRightsSetupState({
      legalNameLockedAt: null,
      pro: null,
      ipi: null,
      publisher: null,
    })

    expect(state.handledCount).toBe(0)
    expect(state.remainingCount).toBe(4)
    expect(state.complete).toBe(false)
    expect(state.items.map(item => item.key)).toEqual([
      'legal_identity',
      'pro',
      'ipi',
      'publishing',
    ])
  })

  it('treats an explicit unaffiliated choice as handled and makes IPI not applicable', () => {
    const state = buildRightsSetupState({
      legalNameLockedAt: null,
      pro: 'none',
      ipi: null,
      publisher: null,
    })

    expect(state.items.find(item => item.key === 'pro')).toEqual(
      expect.objectContaining({ status: 'handled', detail: 'Not affiliated yet' })
    )
    expect(state.items.find(item => item.key === 'ipi')).toEqual(
      expect.objectContaining({ status: 'handled', detail: expect.stringContaining('Not needed') })
    )
  })

  it('recognizes self-published as an ordinary handled publishing value', () => {
    const state = buildRightsSetupState({
      legalNameLockedAt: null,
      pro: null,
      ipi: null,
      publisher: 'Self-published',
    })

    expect(state.items.find(item => item.key === 'publishing')).toEqual(
      expect.objectContaining({ status: 'handled', detail: 'Self-published' })
    )
  })

  it('is complete when legal identity, affiliated PRO/IPI, and publishing are handled', () => {
    const state = buildRightsSetupState({
      legalNameLockedAt: '2026-09-02T12:00:00.000Z',
      pro: 'ASCAP',
      ipi: '00123456789',
      publisher: 'Example Songs',
    })

    expect(state.handledCount).toBe(4)
    expect(state.remainingCount).toBe(0)
    expect(state.complete).toBe(true)
  })
})

describe('isRightsSetupReminderDue', () => {
  const now = new Date('2026-09-10T12:00:00.000Z')

  it('is false when no reminder has been requested or the value is malformed', () => {
    expect(isRightsSetupReminderDue(null, now)).toBe(false)
    expect(isRightsSetupReminderDue('not-a-date', now)).toBe(false)
  })

  it('is false before the requested reminder time and true at or after it', () => {
    expect(isRightsSetupReminderDue('2026-09-11T12:00:00.000Z', now)).toBe(false)
    expect(isRightsSetupReminderDue('2026-09-10T12:00:00.000Z', now)).toBe(true)
    expect(isRightsSetupReminderDue('2026-09-09T12:00:00.000Z', now)).toBe(true)
  })
})
