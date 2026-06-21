import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityKind } from '@/types'
import type { ActivityView } from '@/components/profile/ActivityFeed'

const KINDS: ActivityKind[] = ['placement', 'release', 'readiness', 'other']

/** Load a profile's activity feed, newest first. */
export async function loadActivity(supabase: SupabaseClient, profileId: string): Promise<ActivityView[]> {
  const { data } = await supabase
    .from('activity_events')
    .select('id, kind, body, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50)

  return ((data ?? []) as { id: string; kind: string; body: string; created_at: string }[]).map(e => ({
    id: e.id,
    kind: (KINDS.includes(e.kind as ActivityKind) ? e.kind : 'other') as ActivityKind,
    body: e.body,
    createdAt: e.created_at,
  }))
}
