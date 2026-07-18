import type { SupabaseClient } from '@supabase/supabase-js'
import { PROFILE_ROLE_LABELS, type ProfileRole } from '@/types'
import type { CommentView } from '@/components/profile/ReleaseComments'

function roleLabel(roles: unknown): string | null {
  const r = Array.isArray(roles) ? (roles[0] as ProfileRole | undefined) : undefined
  if (!r) return null
  return r.kind === 'preset' ? PROFILE_ROLE_LABELS[r.slug] : r.label
}

/**
 * Load a release's comments (flat, oldest-first) with author identities.
 *
 * `blockedIds` (13-03 hard-block-enforcement audit): rc_select_public
 * (migration 012) has no no_block() read-side filtering — and unlike
 * wall_posts/endorsements, release_comments' INSERT policy (rc_insert_author)
 * was never wired with no_block() at all (migrations 038/044 covered
 * follows/wall_posts/endorsements/dm_threads/dm_messages/connections but not
 * this table), so a comment can still be freshly written across a block at
 * the DB layer today. This app-layer read filter (reusing
 * lib/green-room/discover.ts's loadBlockedIds bidirectional set) closes the
 * read-side leak; the write-side gap is additionally covered by the
 * pre-emptive check added to app/api/release-comments/route.ts in this same
 * plan (see lib/trust-safety/block-check.ts). A migration to wire
 * no_block() directly into rc_insert_author would close the DB-level gap
 * too, but that requires a live `supabase db push` — a human-gated action
 * per this codebase's convention (migration 058's header comment) — so it
 * is documented here as a follow-up rather than applied by this executor.
 */
export async function loadReleaseComments(
  supabase: SupabaseClient,
  projectId: string,
  blockedIds: Set<string> = new Set()
): Promise<CommentView[]> {
  const { data } = await supabase
    .from('release_comments')
    .select('id, parent_id, body, created_at, author_id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(200)

  const rows = ((data ?? []) as {
    id: string
    parent_id: string | null
    body: string
    created_at: string
    author_id: string
  }[]).filter(r => !blockedIds.has(r.author_id))
  if (rows.length === 0) return []

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

  return rows.map(r => {
    const a = map.get(r.author_id)
    return {
      id: r.id,
      parentId: r.parent_id,
      body: r.body,
      createdAt: r.created_at,
      authorName: a?.artist_name || 'Member',
      authorAvatarUrl: a?.avatar_url ?? null,
      authorRole: roleLabel(a?.roles),
    }
  })
}
