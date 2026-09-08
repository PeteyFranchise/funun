import type { StaffRole } from '@/lib/admin/staff-role'

export function isPlaybookEnablementSchemaMissing(error: unknown): boolean {
  const value = error as { code?: string; message?: string } | null
  const message = (value?.message ?? '').toLowerCase()
  return value?.code === '42P01' || value?.code === 'PGRST205' || message.includes('playbook_learning_') || message.includes('playbook_reader_feedback') || message.includes('playbook_workflow_') || message.includes('playbook_exception') || message.includes('playbook_incident') || message.includes('playbook_entry_translation') || message.includes('playbook_glossary') || message.includes('playbook_user_preferences') || message.includes('playbook_media_assets')
}

export function staffTargetApplies(target: { target_kind: 'user' | 'role'; target_user_id: string | null; target_role: StaffRole | null }, userId: string, roles: readonly StaffRole[]): boolean {
  return target.target_kind === 'user' ? target.target_user_id === userId : target.target_role !== null && roles.includes(target.target_role)
}

export function learningProgress(stepIds: readonly string[], completedStepIds: ReadonlySet<string>): { completed: number; total: number; percent: number } {
  const completed = stepIds.reduce((sum, id) => sum + (completedStepIds.has(id) ? 1 : 0), 0)
  return { completed, total: stepIds.length, percent: stepIds.length === 0 ? 0 : Math.round((completed / stepIds.length) * 100) }
}

export type ReaderFeedbackStatus = 'open' | 'triaged' | 'resolved' | 'declined'

export function canTransitionFeedback(from: ReaderFeedbackStatus, to: ReaderFeedbackStatus): boolean {
  if (from === to) return false
  if (from === 'open') return ['triaged', 'resolved', 'declined'].includes(to)
  if (from === 'triaged') return ['open', 'resolved', 'declined'].includes(to)
  return to === 'open'
}

export type WorkflowTaskStatus = 'pending' | 'completed' | 'skipped' | 'blocked'

export function workflowRunState(tasks: readonly { required: boolean; status: WorkflowTaskStatus }[]): 'active' | 'blocked' | 'complete' {
  if (tasks.some(task => task.status === 'blocked')) return 'blocked'
  return tasks.every(task => !task.required || task.status === 'completed') ? 'complete' : 'active'
}

export type ExceptionStatus = 'requested' | 'approved' | 'declined' | 'expired' | 'revoked'

export function effectiveExceptionStatus(status: ExceptionStatus, expiresAt: string | null, now: Date): ExceptionStatus {
  if (status === 'approved' && expiresAt && Date.parse(expiresAt) <= now.getTime()) return 'expired'
  return status
}

export const INCIDENT_LEVELS = {
  1: { label: 'Level 1 · Critical', response: 'Immediate coordinated response' },
  2: { label: 'Level 2 · High', response: 'Urgent same-day response' },
  3: { label: 'Level 3 · Moderate', response: 'Prioritized operational response' },
  4: { label: 'Level 4 · Routine', response: 'Planned maintenance response' },
} as const

export function isValidTimeZone(value: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return true } catch { return false }
}

export function readinessRollup(input: { assigned: number; completed: number; overdue: number; openFeedback: number; staleEntries: number }) {
  const completionRate = input.assigned === 0 ? 100 : Math.round((input.completed / input.assigned) * 100)
  const risk = input.overdue * 3 + input.openFeedback + input.staleEntries * 2
  return { completionRate, risk, state: risk >= 12 ? 'attention' : risk >= 4 ? 'watch' : 'healthy' as 'attention' | 'watch' | 'healthy' }
}
