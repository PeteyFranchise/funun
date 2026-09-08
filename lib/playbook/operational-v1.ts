import type { StaffRole } from '@/lib/admin/staff-role'

export type PlaybookFeatureControl = {
  enabled: boolean
  emergencyDisabled: boolean
}
export type PlaybookCohortGrant = {
  active: boolean
  memberActive: boolean
  expiresAt: string | null
}

export function featureIsAvailable(
  control: PlaybookFeatureControl | null,
  grants: readonly PlaybookCohortGrant[],
  now: Date
): boolean {
  if (!control || !control.enabled || control.emergencyDisabled) return false
  return grants.some(
    (grant) =>
      grant.active &&
      grant.memberActive &&
      (!grant.expiresAt || Date.parse(grant.expiresAt) > now.getTime())
  )
}

export type SlaState =
  | 'complete'
  | 'overdue'
  | 'due_soon'
  | 'on_track'
  | 'no_due'

export function slaState(
  input: { complete: boolean; dueAt: string | null },
  now: Date,
  soonMs = 24 * 60 * 60 * 1000
): SlaState {
  if (input.complete) return 'complete'
  if (!input.dueAt) return 'no_due'
  const due = Date.parse(input.dueAt)
  if (!Number.isFinite(due)) return 'no_due'
  if (due <= now.getTime()) return 'overdue'
  return due - now.getTime() <= soonMs ? 'due_soon' : 'on_track'
}

export type InboxItem = {
  id: string
  kind: string
  title: string
  dueAt: string | null
  complete: boolean
  severity?: number | null
}

export function sortInbox<T extends InboxItem>(
  items: readonly T[],
  now: Date
): T[] {
  const rank: Record<SlaState, number> = {
    overdue: 0,
    due_soon: 1,
    on_track: 2,
    no_due: 3,
    complete: 4,
  }
  return [...items].sort((left, right) => {
    const severity = (left.severity ?? 5) - (right.severity ?? 5)
    const state = rank[slaState(left, now)] - rank[slaState(right, now)]
    if (state !== 0) return state
    if (severity !== 0) return severity
    return (
      (left.dueAt ? Date.parse(left.dueAt) : Number.MAX_SAFE_INTEGER) -
      (right.dueAt ? Date.parse(right.dueAt) : Number.MAX_SAFE_INTEGER)
    )
  })
}

export type SlaRule = {
  workKind: string
  roomId: string | null
  severity: number | null
  resolveMinutes: number
}

export function resolveSlaDueAt(
  item: {
    kind: string
    roomId: string | null
    severity: number | null
    openedAt: string | null
    dueAt: string | null
  },
  rules: readonly SlaRule[]
): string | null {
  if (item.dueAt || !item.openedAt) return item.dueAt
  const specificity = (rule: SlaRule) =>
    Number(rule.roomId !== null) + Number(rule.severity !== null)
  const rule = rules
    .filter((candidate) => candidate.workKind === item.kind)
    .filter(
      (candidate) =>
        candidate.roomId === null || candidate.roomId === item.roomId
    )
    .filter(
      (candidate) =>
        candidate.severity === null || candidate.severity === item.severity
    )
    .sort((left, right) => specificity(right) - specificity(left))[0]
  if (!rule) return null
  const opened = Date.parse(item.openedAt)
  return Number.isFinite(opened)
    ? new Date(opened + rule.resolveMinutes * 60_000).toISOString()
    : null
}

export type DependencyImpact = {
  active: boolean
  sourceRevisionNumber: number
  targetKind: string
}

export function dependencyImpact(
  dependencies: readonly DependencyImpact[],
  proposedRevision: number
) {
  const affected = dependencies.filter(
    (item) => item.active && item.sourceRevisionNumber < proposedRevision
  )
  const byKind = affected.reduce<Record<string, number>>(
    (result, item) => ({
      ...result,
      [item.targetKind]: (result[item.targetKind] ?? 0) + 1,
    }),
    {}
  )
  return {
    affected: affected.length,
    byKind,
    blocksSilentPublish: affected.length > 0,
  }
}

export type SimulationPrompt = { id: string; prompt: string }

export function parseSimulationScenario(
  value: unknown
): SimulationPrompt[] | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as { prompts?: unknown }).prompts)
  )
    return null
  const prompts = (value as { prompts: unknown[] }).prompts.flatMap(
    (item, index) => {
      if (typeof item !== 'string') return []
      const prompt = item.trim()
      return prompt && prompt.length <= 2000
        ? [{ id: `prompt-${index + 1}`, prompt }]
        : []
    }
  )
  return prompts.length > 0 && prompts.length <= 30 ? prompts : null
}

export function simulationReviewStatus(
  score: number,
  passingScore: number,
  needsRemediation: boolean
): 'passed' | 'remediation' | 'failed' {
  if (needsRemediation) return 'remediation'
  return score >= passingScore ? 'passed' : 'failed'
}

export function certificationIsCurrent(
  certificate: { revokedAt: string | null; expiresAt: string | null },
  now: Date
): boolean {
  return (
    !certificate.revokedAt &&
    (!certificate.expiresAt ||
      Date.parse(certificate.expiresAt) > now.getTime())
  )
}

export const OPERATIONAL_ENTITY_TYPES = [
  'member_onboarding',
  'client_partner',
  'deal',
  'release',
  'workspace',
  'buyer_brief',
  'call_log',
] as const
export type OperationalEntityType = (typeof OPERATIONAL_ENTITY_TYPES)[number]

export function operationalEntityHref(
  type: OperationalEntityType,
  id: string
): string {
  const safeId = encodeURIComponent(id)
  if (type === 'member_onboarding') return '/admin/member-onboarding'
  if (type === 'client_partner') return `/admin/client-partners/${safeId}`
  if (type === 'deal') return `/admin/deals/${safeId}`
  if (type === 'release') return `/vault/${safeId}`
  if (type === 'workspace') return `/settings/permissions?workspace=${safeId}`
  if (type === 'buyer_brief') return `/admin/client-partners?brief=${safeId}`
  return `/admin/client-partners?call=${safeId}`
}

export function targetRoleApplies(
  target: {
    targetKind: 'user' | 'role'
    targetUserId: string | null
    targetRole: StaffRole | null
  },
  userId: string,
  roles: readonly StaffRole[]
): boolean {
  return target.targetKind === 'user'
    ? target.targetUserId === userId
    : target.targetRole !== null && roles.includes(target.targetRole)
}

export function isOperationalV1SchemaMissing(error: unknown): boolean {
  const value = error as { code?: string; message?: string } | null
  const message = (value?.message ?? '').toLowerCase()
  return (
    value?.code === '42P01' ||
    value?.code === 'PGRST205' ||
    message.includes('playbook_feature_') ||
    message.includes('playbook_beta_') ||
    message.includes('playbook_sla_') ||
    message.includes('playbook_doctrine_dependencies') ||
    message.includes('playbook_simulation_') ||
    message.includes('playbook_certifications') ||
    message.includes('playbook_operational_')
  )
}
