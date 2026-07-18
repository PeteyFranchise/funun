import type { SupabaseClient } from '@supabase/supabase-js'
import { PROFILE_ROLE_LABELS, type ProfileRole } from '@/types'
import type { WallPostView } from '@/components/profile/Wall'

function roleLabel(roles: unknown): string | null {
  const r = Array.isArray(roles) ? (roles[0] as ProfileRole | undefined) : undefined
  if (!r) return null
  return r.kind === 'preset' ? PROFILE_ROLE_LABELS[r.slug] : r.label
}

/**
 * Load a profile's wall posts with their authors' display identities.
 *
 * `blockedIds` (13-03 hard-block-enforcement audit): wall_posts_select_all
 * (migration 012) is `USING (true)` — no no_block() wiring at the RLS layer
 * for reads, unlike the INSERT policy (migration 038). A pre-existing wall
 * post from someone the viewer has blocked (or who has blocked the viewer)
 * would otherwise still render here even though NEW posts across that pair
 * are already rejected at INSERT. Filtering by the viewer's own bidirectional
 * blocked-id set (lib/green-room/discover.ts's loadBlockedIds) closes that
 * read-side gap without a migration. Defaults to an empty set so existing
 * callers that don't pass one are unaffected (no filtering, same as before).
 */
export async function loadWall(
  supabase: SupabaseClient,
  profileId: string,
  blockedIds: Set<string> = new Set()
): Promise<WallPostView[]> {
  const { data: posts } = await supabase
    .from('wall_posts')
    .select('id, body, created_at, author_id')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50)

  const rows = ((posts ?? []) as { id: string; body: string; created_at: string; author_id: string }[]).filter(
    p => !blockedIds.has(p.author_id)
  )
  if (rows.length === 0) return []

  const authorIds = Array.from(new Set(rows.map(p => p.author_id)))
  const { data: authors } = await supabase
    .from('artist_profiles')
    .select('id, artist_name, avatar_url, roles')
    .in('id', authorIds)

  const map = new Map(
    ((authors ?? []) as { id: string; artist_name: string | null; avatar_url: string | null; roles: unknown }[]).map(
      a => [a.id, a]
    )
  )

  return rows.map(p => {
    const a = map.get(p.author_id)
    return {
      id: p.id,
      body: p.body,
      createdAt: p.created_at,
      authorName: a?.artist_name || 'Member',
      authorAvatarUrl: a?.avatar_url ?? null,
      authorRole: roleLabel(a?.roles),
    }
  })
}
