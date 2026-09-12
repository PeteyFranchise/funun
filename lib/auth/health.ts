import type { SupabaseClient } from '@supabase/supabase-js'

export type AuthHealthEvent = {
  correlation_id: string
  event_code: string
  stage: string
  surface: string
  workspace_intent: 'personal' | 'team' | null
  runtime: 'browser' | 'server'
  created_at: string
}

export type AuthHealthData = {
  activated: boolean
  events: AuthHealthEvent[]
}

export async function loadAuthHealth(
  service: SupabaseClient,
  now = Date.now()
): Promise<AuthHealthData> {
  try {
    const since = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await service
      .from('auth_diagnostic_events')
      .select('correlation_id,event_code,stage,surface,workspace_intent,runtime,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(250)

    if (error) return { activated: false, events: [] }
    return { activated: true, events: (data ?? []) as AuthHealthEvent[] }
  } catch {
    return { activated: false, events: [] }
  }
}

export function summarizeAuthHealth(events: AuthHealthEvent[], now = Date.now()) {
  const last24Hours = events.filter(
    event => Date.parse(event.created_at) >= now - 24 * 60 * 60 * 1000
  ).length
  const counts = (field: 'event_code' | 'stage' | 'surface') =>
    events.reduce<Record<string, number>>((result, event) => {
      result[event[field]] = (result[event[field]] ?? 0) + 1
      return result
    }, {})
  const top = (values: Record<string, number>) =>
    Object.entries(values).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'None'

  const byEvent = counts('event_code')
  return {
    last24Hours,
    last7Days: events.length,
    topStage: top(counts('stage')),
    topSurface: top(counts('surface')),
    byEvent: Object.entries(byEvent).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  }
}
