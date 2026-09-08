import { canTransitionFeedback, effectiveExceptionStatus, isPlaybookEnablementSchemaMissing, isValidTimeZone, learningProgress, readinessRollup, staffTargetApplies, workflowRunState } from '@/lib/playbook/enablement'

describe('Playbook enablement rules', () => {
  it('keeps role and person assignments exact', () => {
    expect(staffTargetApplies({ target_kind: 'role', target_role: 'ae', target_user_id: null }, 'u1', ['ae'])).toBe(true)
    expect(staffTargetApplies({ target_kind: 'role', target_role: 'legal', target_user_id: null }, 'u1', ['ae'])).toBe(false)
    expect(staffTargetApplies({ target_kind: 'user', target_role: null, target_user_id: 'u1' }, 'u1', [])).toBe(true)
  })
  it('calculates learning progress without dividing by zero', () => {
    expect(learningProgress(['a','b','c'], new Set(['a','c']))).toEqual({ completed: 2, total: 3, percent: 67 })
    expect(learningProgress([], new Set())).toEqual({ completed: 0, total: 0, percent: 0 })
  })
  it('keeps feedback resolution reversible but explicit', () => {
    expect(canTransitionFeedback('open', 'resolved')).toBe(true)
    expect(canTransitionFeedback('resolved', 'triaged')).toBe(false)
    expect(canTransitionFeedback('resolved', 'open')).toBe(true)
  })
  it('derives workflow and exception states', () => {
    expect(workflowRunState([{ required: true, status: 'completed' }, { required: false, status: 'skipped' }])).toBe('complete')
    expect(workflowRunState([{ required: true, status: 'blocked' }])).toBe('blocked')
    expect(effectiveExceptionStatus('approved', '2026-09-01T00:00:00Z', new Date('2026-09-08T00:00:00Z'))).toBe('expired')
  })
  it('validates timezones and produces readiness signals', () => {
    expect(isValidTimeZone('America/Detroit')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
    expect(readinessRollup({ assigned: 10, completed: 8, overdue: 1, openFeedback: 0, staleEntries: 0 })).toMatchObject({ completionRate: 80, state: 'healthy' })
  })
  it('distinguishes missing candidate schema from ordinary failures', () => {
    expect(isPlaybookEnablementSchemaMissing({ code: '42P01' })).toBe(true)
    expect(isPlaybookEnablementSchemaMissing({ message: 'playbook_incidents does not exist' })).toBe(true)
    expect(isPlaybookEnablementSchemaMissing({ code: '42501', message: 'permission denied' })).toBe(false)
  })
})
