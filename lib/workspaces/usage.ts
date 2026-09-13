import type { SupabaseClient } from '@supabase/supabase-js'

export const WORKSPACE_USAGE_METRICS = [
  'storage_bytes_ingested',
  'ai_requests',
  'ai_input_tokens',
  'ai_output_tokens',
  'esign_requests',
  'audio_processing_seconds',
] as const

export type WorkspaceUsageMetric = (typeof WORKSPACE_USAGE_METRICS)[number]

export type WorkspaceUsageTotals = Record<WorkspaceUsageMetric, number>

export type WorkspaceUsageSnapshot = {
  from: string
  to: string
  activeSeats: number
  acceptedRosterRelationships: number
  totals: WorkspaceUsageTotals
}

export type WorkspaceUsageObservation = {
  workspaceId: string
  metric: WorkspaceUsageMetric
  quantity: number
  idempotencyKey: string
  sourceKind: 'storage' | 'ai' | 'esign' | 'audio_processing' | 'system_adjustment'
  sourceId?: string | null
  actorUserId?: string | null
  occurredAt?: string
}

export const WORKSPACE_USAGE_LABELS: Readonly<Record<WorkspaceUsageMetric, string>> = {
  storage_bytes_ingested: 'Storage ingested',
  ai_requests: 'AI requests',
  ai_input_tokens: 'AI input tokens',
  ai_output_tokens: 'AI output tokens',
  esign_requests: 'E-sign requests',
  audio_processing_seconds: 'Audio processing',
}

function emptyTotals(): WorkspaceUsageTotals {
  return {
    storage_bytes_ingested: 0,
    ai_requests: 0,
    ai_input_tokens: 0,
    ai_output_tokens: 0,
    esign_requests: 0,
    audio_processing_seconds: 0,
  }
}

export function normalizeWorkspaceUsageTotals(rows: unknown): WorkspaceUsageTotals {
  const totals = emptyTotals()
  if (!Array.isArray(rows)) return totals

  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (
      typeof row.metric !== 'string' ||
      !WORKSPACE_USAGE_METRICS.includes(row.metric as WorkspaceUsageMetric)
    ) continue
    const quantity = Number(row.total_quantity)
    if (!Number.isSafeInteger(quantity) || quantity < 0) continue
    totals[row.metric as WorkspaceUsageMetric] = quantity
  }

  return totals
}

export function formatWorkspaceUsage(metric: WorkspaceUsageMetric, quantity: number): string {
  if (metric === 'storage_bytes_ingested') {
    if (quantity < 1024) return `${quantity} B`
    if (quantity < 1024 ** 2) return `${(quantity / 1024).toFixed(1)} KB`
    if (quantity < 1024 ** 3) return `${(quantity / 1024 ** 2).toFixed(1)} MB`
    return `${(quantity / 1024 ** 3).toFixed(2)} GB`
  }
  if (metric === 'audio_processing_seconds') {
    const hours = Math.floor(quantity / 3600)
    const minutes = Math.floor((quantity % 3600) / 60)
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`
  }
  return new Intl.NumberFormat('en-US').format(quantity)
}

export async function loadWorkspaceUsageSnapshot(
  client: SupabaseClient,
  workspaceId: string,
  now = new Date()
): Promise<WorkspaceUsageSnapshot | null> {
  const to = now.toISOString()
  const fromDate = new Date(now)
  fromDate.setUTCDate(fromDate.getUTCDate() - 30)
  const from = fromDate.toISOString()
  const today = to.slice(0, 10)

  const [summary, seats, roster] = await Promise.all([
    client.rpc('workspace_usage_summary', {
      p_workspace_id: workspaceId,
      p_from: from,
      p_to: to,
    }),
    client
      .from('workspace_members')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'active'),
    client
      .from('workspace_roster_relationships')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('state', 'accepted')
      .or(`terminates_on.is.null,terminates_on.gt.${today}`),
  ])

  if (summary.error || seats.error || roster.error) return null

  return {
    from,
    to,
    activeSeats: seats.count ?? 0,
    acceptedRosterRelationships: roster.count ?? 0,
    totals: normalizeWorkspaceUsageTotals(summary.data),
  }
}

/** Beta usage is observational. Failure must never block the underlying action. */
export async function recordWorkspaceUsageBestEffort(
  client: SupabaseClient,
  observation: WorkspaceUsageObservation
): Promise<boolean> {
  if (
    !Number.isSafeInteger(observation.quantity) ||
    observation.quantity <= 0 ||
    !observation.idempotencyKey.trim() ||
    observation.idempotencyKey.length > 200
  ) return false

  try {
    const { data, error } = await client.rpc('record_workspace_usage', {
      p_workspace_id: observation.workspaceId,
      p_metric: observation.metric,
      p_quantity: observation.quantity,
      p_idempotency_key: observation.idempotencyKey,
      p_source_kind: observation.sourceKind,
      p_source_id: observation.sourceId ?? null,
      p_actor_user_id: observation.actorUserId ?? null,
      p_occurred_at: observation.occurredAt ?? new Date().toISOString(),
    })
    return !error && data === true
  } catch {
    return false
  }
}
