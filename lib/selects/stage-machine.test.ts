import { isLegalSelectsTransition } from './stage-machine'
import { SELECTS_STATUS_VALUES, type SelectsStatus } from './types'

describe('isLegalSelectsTransition', () => {
  it('allows draft -> sent', () => {
    expect(isLegalSelectsTransition('draft', 'sent')).toBe(true)
  })

  it('rejects draft -> approved and draft -> changes_requested (must go through sent)', () => {
    expect(isLegalSelectsTransition('draft', 'approved')).toBe(false)
    expect(isLegalSelectsTransition('draft', 'changes_requested')).toBe(false)
  })

  it('allows sent -> approved and sent -> changes_requested', () => {
    expect(isLegalSelectsTransition('sent', 'approved')).toBe(true)
    expect(isLegalSelectsTransition('sent', 'changes_requested')).toBe(true)
  })

  it('rejects sent -> draft (no backward move)', () => {
    expect(isLegalSelectsTransition('sent', 'draft')).toBe(false)
  })

  it('allows changes_requested -> sent (re-send after a revision)', () => {
    expect(isLegalSelectsTransition('changes_requested', 'sent')).toBe(true)
  })

  it('rejects changes_requested -> approved (must re-send first)', () => {
    expect(isLegalSelectsTransition('changes_requested', 'approved')).toBe(false)
  })

  it('rejects every outbound move from approved (terminal in Slice 1)', () => {
    for (const to of SELECTS_STATUS_VALUES) {
      if (to === 'approved') continue
      expect(isLegalSelectsTransition('approved', to)).toBe(false)
    }
  })

  it('rejects a same-stage self-transition for every status', () => {
    for (const status of SELECTS_STATUS_VALUES) {
      expect(isLegalSelectsTransition(status, status)).toBe(false)
    }
  })

  it('fails closed on an unknown "from" status value', () => {
    expect(isLegalSelectsTransition('bogus_status' as SelectsStatus, 'sent')).toBe(false)
  })

  it('fails closed on an unknown "to" status value', () => {
    expect(isLegalSelectsTransition('draft' as SelectsStatus, 'bogus_status' as SelectsStatus)).toBe(false)
  })

  it('fails closed when both status values are unknown', () => {
    expect(
      isLegalSelectsTransition('bogus_from' as SelectsStatus, 'bogus_to' as SelectsStatus)
    ).toBe(false)
  })

  it('rejects changes_requested -> draft (no backward move)', () => {
    expect(isLegalSelectsTransition('changes_requested', 'draft')).toBe(false)
  })
})
