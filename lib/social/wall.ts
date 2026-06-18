import type { SupabaseClient } from '@supabase/supabase-js'
import { PROFILE_ROLE_LABELS, type ProfileRole } from '@/types'
import type { WallPostView } from '@/components/profile/Wall'

function roleLabel(roles: unknown): string | null {
  const r = Array.isArray(roles) ? (roles[0] as ProfileRole | undefined) : undefined
  if (!r) return null
  return r.kind === 'preset' ? PROFILE_ROLE_LABELS[r.slug] : r.label
}

/** Load a profile's wall posts with their authors' display identities. */
export async function loadWall(supabase: SupabaseClient, profileId: string): Promise<WallPostView[]> {
  const { data: posts } = await supabase
    .from('wall_posts')
    .select('id, body, created_at, author_id')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50)

  const rows = (posts ?? []) as { id: string; body: string; created_at: string; author_id: string }[]
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
