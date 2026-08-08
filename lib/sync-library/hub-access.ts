import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Sync Library hub access + data (Phase 26, 26-CONTEXT.md) ────────────
// hasAdmittedSyncListing is the server-side gate for BOTH the nav item's
// visibility (app/(artist)/layout.tsx -> ArtistNav) and the hub page's own
// redirect guard (T-26-31 — nav-hiding is never the authority; the hub
// page re-checks independently, mirroring the layout-vs-page double-check
// convention already used elsewhere in this codebase).
export async function hasAdmittedSyncListing(
  service: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { count } = await service
    .from('sync_listings')
    .select('id', { count: 'exact', head: true })
    .eq('artist_user_id', userId)
    .eq('status', 'admitted')
  return (count ?? 0) > 0
}
