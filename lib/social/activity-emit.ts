import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActivityKind } from '@/types'

// Best-effort emit of a profile activity event. Never throws — activity is
// a side-effect of real flows (release publish, opportunity pitch, readiness
// milestone) and must not block or fail the parent request.
// RLS requires profile_id = auth.uid(), so pass the acting user's client.
export async function emitActivity(
  supabase: SupabaseClient,
  e: { profileId: string; kind: ActivityKind; body: string; data?: Record<string, unknown> }
): Promise<void> {
  try {
    await supabase
      .from('activity_events')
      .insert({ profile_id: e.profileId, kind: e.kind, body: e.body, data: e.data ?? {} })
  } catch {
    /* swallow — best-effort */
  }
}
