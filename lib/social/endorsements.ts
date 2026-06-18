import type { SupabaseClient } from '@supabase/supabase-js'
import { PROFILE_ROLE_LABELS, type ProfileRole } from '@/types'
import type { EndorsementView } from '@/components/profile/Endorsements'

function roleLabel(roles: unknown): string | null {
  const r = Array.isArray(roles) ? (roles[0] as ProfileRole | undefined) : undefined
  if (!r) return null
  return r.kind === 'preset' ? PROFILE_ROLE_LABELS[r.slug] : r.label
}

/** Load endorsements with author identities, and whether the viewer endorsed. */
export async function loadEndorsements(
  supabase: SupabaseClient,
  profileId: string,
  viewerId: string | null
): Promise<{ items: EndorsementView[]; viewerHasEndorsed: boolean }> {
  const { data } = await supabase
    .from('endorsements')
    .select('id, body, created_at, author_id')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50)

  const rows = (data ?? []) as { id: string; body: string; created_at: string; author_id: string }[]
  const viewerHasEndorsed = viewerId ? rows.some(r => r.author_id === viewerId) : false
  if (rows.length === 0) return { items: [], viewerHasEndorsed }

  const authorIds = Array.from(new Set(rows.map(r => r.author_id)))
  const { data: authors } = await supabase
    .from('artist_profiles')
    .select('id, artist_name, avatar_url, roles')
    .in('id', authorIds)

  const map = new Map(
    ((authors ?? []) as { id: string; artist_name: string | null; avatar_url: string | null; roles: unknown }[]).map(
      a => [a.id, a]
    )
  )

  const items: EndorsementView[] = rows.map(r => {
    const a = map.get(r.author_id)
    return {
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      authorName: a?.artist_name || 'Member',
      authorAvatarUrl: a?.avatar_url ?? null,
      authorRole: roleLabel(a?.roles),
    }
  })
  return { items, viewerHasEndorsed }
}
