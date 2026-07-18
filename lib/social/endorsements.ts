import type { SupabaseClient } from '@supabase/supabase-js'
import { PROFILE_ROLE_LABELS, type ProfileRole } from '@/types'
import type { EndorsementView } from '@/components/profile/Endorsements'

function roleLabel(roles: unknown): string | null {
  const r = Array.isArray(roles) ? (roles[0] as ProfileRole | undefined) : undefined
  if (!r) return null
  return r.kind === 'preset' ? PROFILE_ROLE_LABELS[r.slug] : r.label
}

/**
 * Load endorsements with author identities, and whether the viewer endorsed.
 *
 * `blockedIds` (13-03 hard-block-enforcement audit): endo_select_all
 * (migration 012) is `USING (true)` — no no_block() read-side filtering,
 * unlike the INSERT policy (migration 038). Filters out endorsements
 * authored by anyone in the viewer's bidirectional blocked-id set
 * (lib/green-room/discover.ts's loadBlockedIds) so a pre-existing
 * endorsement from a now-blocked pair doesn't keep rendering. Computed from
 * the UNFILTERED rows for `viewerHasEndorsed` — that flag only ever reads
 * the viewer's OWN row, which can never be in its own blocked-id set.
 */
export async function loadEndorsements(
  supabase: SupabaseClient,
  profileId: string,
  viewerId: string | null,
  blockedIds: Set<string> = new Set()
): Promise<{ items: EndorsementView[]; viewerHasEndorsed: boolean }> {
  const { data } = await supabase
    .from('endorsements')
    .select('id, body, created_at, author_id')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(50)

  const allRows = (data ?? []) as { id: string; body: string; created_at: string; author_id: string }[]
  const viewerHasEndorsed = viewerId ? allRows.some(r => r.author_id === viewerId) : false
  const rows = allRows.filter(r => !blockedIds.has(r.author_id))
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
