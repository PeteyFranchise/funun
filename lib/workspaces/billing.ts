export const WORKSPACE_PLAN_VALUES = [
  'beta_free',
  'workspace_starter',
  'workspace_growth',
  'workspace_custom',
] as const

export type WorkspacePlan = (typeof WORKSPACE_PLAN_VALUES)[number]

export const WORKSPACE_BILLING_STATUS_VALUES = [
  'beta_active',
  'active',
  'past_due',
  'paused',
  'canceled',
] as const

export type WorkspaceBillingStatus = (typeof WORKSPACE_BILLING_STATUS_VALUES)[number]

export type WorkspaceBillingSnapshot = {
  workspaceId: string
  plan: WorkspacePlan
  status: WorkspaceBillingStatus
  currentPeriodEnd: string | null
  updatedAt: string
  writesAllowed: boolean
}

export type WorkspaceBillingClient = {
  from(table: 'workspace_subscriptions'): {
    select(columns: string): {
      eq(column: 'workspace_id', value: string): {
        maybeSingle(): PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>
      }
    }
  }
  rpc(
    name: 'workspace_writes_allowed',
    args: { p_workspace_id: string }
  ): PromiseLike<{ data: unknown; error: unknown }>
}

const PLAN_LABELS: Record<WorkspacePlan, string> = {
  beta_free: 'Beta workspace',
  workspace_starter: 'Workspace Starter',
  workspace_growth: 'Workspace Growth',
  workspace_custom: 'Workspace Custom',
}

const STATUS_LABELS: Record<WorkspaceBillingStatus, string> = {
  beta_active: 'Active during beta',
  active: 'Active',
  past_due: 'Read-only · payment past due',
  paused: 'Read-only · paused',
  canceled: 'Read-only · canceled',
}

export function workspacePlanLabel(plan: WorkspacePlan): string {
  return PLAN_LABELS[plan]
}

export function workspaceBillingStatusLabel(status: WorkspaceBillingStatus): string {
  return STATUS_LABELS[status]
}

export function workspaceStatusAllowsWrites(status: WorkspaceBillingStatus): boolean {
  return status === 'beta_active' || status === 'active'
}

function isPlan(value: unknown): value is WorkspacePlan {
  return typeof value === 'string' && WORKSPACE_PLAN_VALUES.includes(value as WorkspacePlan)
}

function isStatus(value: unknown): value is WorkspaceBillingStatus {
  return (
    typeof value === 'string' &&
    WORKSPACE_BILLING_STATUS_VALUES.includes(value as WorkspaceBillingStatus)
  )
}

export async function loadWorkspaceBillingSnapshot(
  client: WorkspaceBillingClient,
  workspaceId: string
): Promise<WorkspaceBillingSnapshot | null> {
  const { data, error } = await client
    .from('workspace_subscriptions')
    .select('workspace_id,plan_key,status,current_period_end,updated_at')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error || !data || !isPlan(data.plan_key) || !isStatus(data.status)) return null
  if (typeof data.updated_at !== 'string') return null

  return {
    workspaceId,
    plan: data.plan_key,
    status: data.status,
    currentPeriodEnd:
      typeof data.current_period_end === 'string' ? data.current_period_end : null,
    updatedAt: data.updated_at,
    writesAllowed: workspaceStatusAllowsWrites(data.status),
  }
}

export async function resolveWorkspaceWritesAllowed(
  client: WorkspaceBillingClient,
  workspaceId: string
): Promise<boolean | null> {
  try {
    const { data, error } = await client.rpc('workspace_writes_allowed', {
      p_workspace_id: workspaceId,
    })
    if (error || typeof data !== 'boolean') return null
    return data
  } catch {
    return null
  }
}
