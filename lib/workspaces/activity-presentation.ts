import type { WorkspaceActivityRecord } from '@/lib/workspaces/room-data'

export const WORKSPACE_ACTIVITY_CATEGORY_VALUES = [
  'all',
  'membership',
  'roster',
  'permissions',
  'projects',
  'ownership',
  'workspace',
] as const

export type WorkspaceActivityCategory = (typeof WORKSPACE_ACTIVITY_CATEGORY_VALUES)[number]
export type WorkspaceActivityDateWindow = 'all' | '7d' | '30d' | '90d'
export type WorkspaceActivityDetailFilter = 'all' | 'visible' | 'protected'

export type WorkspaceActivityFilters = {
  query: string
  category: WorkspaceActivityCategory
  person: string
  dateWindow: WorkspaceActivityDateWindow
  detail: WorkspaceActivityDetailFilter
}

export const WORKSPACE_ACTIVITY_CATEGORY_LABELS: Record<WorkspaceActivityCategory, string> = {
  all: 'All activity',
  membership: 'Members',
  roster: 'Roster',
  permissions: 'Permissions',
  projects: 'Projects',
  ownership: 'Ownership',
  workspace: 'Workspace',
}

export function workspaceActivityCategory(action: string): Exclude<WorkspaceActivityCategory, 'all'> {
  if (action.startsWith('workspace.member.') || action.startsWith('workspace.invitation.')) return 'membership'
  if (action.startsWith('workspace.roster.') || action.startsWith('workspace.evidence.')) return 'roster'
  if (action.startsWith('workspace.grant.') || action.startsWith('workspace.permission_request.')) return 'permissions'
  if (action.startsWith('workspace.project.')) return 'projects'
  if (action.startsWith('workspace.ownership.')) return 'ownership'
  return 'workspace'
}

export function workspaceActivityTargetLabel(targetType: string): string {
  const labels: Record<string, string> = {
    workspace: 'Workspace',
    workspace_member: 'Workspace member',
    workspace_invitation: 'Invitation',
    workspace_roster_relationship: 'Roster relationship',
    workspace_agreement_evidence: 'Supporting evidence',
    workspace_grant: 'Project permission',
    workspace_permission_request: 'Permission request',
    vault_project: 'Project',
  }
  return labels[targetType] ?? targetType.replace(/^workspace_/, '').replaceAll('_', ' ')
}

/** Generates only a reviewed workspace-local link whose destination repeats
 * its own authorization check. Unsupported targets remain descriptive text. */
export function workspaceActivityTargetHref(args: {
  workspaceId: string
  targetType: string
  targetId: string | null
}): string | null {
  if (!args.targetId || args.targetType !== 'workspace_roster_relationship') return null
  return `/w/${encodeURIComponent(args.workspaceId)}/roster?relationship=${encodeURIComponent(args.targetId)}`
}

function daysForWindow(window: WorkspaceActivityDateWindow): number | null {
  if (window === '7d') return 7
  if (window === '30d') return 30
  if (window === '90d') return 90
  return null
}

export function filterWorkspaceActivityRows(
  rows: readonly WorkspaceActivityRecord[],
  filters: WorkspaceActivityFilters,
  now = Date.now()
): WorkspaceActivityRecord[] {
  const query = filters.query.trim().toLocaleLowerCase()
  const windowDays = daysForWindow(filters.dateWindow)
  const cutoff = windowDays === null ? null : now - windowDays * 24 * 60 * 60 * 1000

  return rows.filter(row => {
    if (filters.category !== 'all' && workspaceActivityCategory(row.action) !== filters.category) return false
    if (filters.person && row.actorUserId !== filters.person && row.subjectMemberId !== filters.person) return false
    if (filters.detail === 'protected' && !row.changesRedacted) return false
    if (filters.detail === 'visible' && row.changesRedacted) return false
    if (cutoff !== null && new Date(row.createdAt).getTime() < cutoff) return false
    if (!query) return true

    return [
      row.actionLabel,
      row.actorDisplayName,
      row.subjectDisplayName,
      workspaceActivityTargetLabel(row.targetType),
      row.permissionReliedOn,
    ].some(value => value?.toLocaleLowerCase().includes(query))
  })
}

function csvCell(value: string | null): string {
  const text = value ?? ''
  // Spreadsheet programs may execute cells beginning with these characters
  // as formulas. Prefix user-controlled values with an apostrophe before
  // normal CSV escaping so an exported display name cannot become a formula.
  const inert = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${inert.replaceAll('"', '""')}"`
}

/** Exports only the normalized allowlist visible in the Activity UI. User
 * ids, target ids, raw changes, emails, and provider payloads are excluded. */
export function workspaceActivityCsv(rows: readonly WorkspaceActivityRecord[]): string {
  const header = [
    'Action',
    'Category',
    'Performed by',
    'Affected member',
    'When',
    'Record type',
    'Permission used',
    'Detail visibility',
  ].map(csvCell)

  const body = rows.map(row => [
    row.actionLabel,
    WORKSPACE_ACTIVITY_CATEGORY_LABELS[workspaceActivityCategory(row.action)],
    row.actorDisplayName,
    row.subjectDisplayName,
    row.createdAt,
    workspaceActivityTargetLabel(row.targetType),
    row.permissionReliedOn,
    row.changesRedacted ? 'Protected' : 'Summary available',
  ].map(csvCell).join(','))

  return [header.join(','), ...body].join('\n')
}
