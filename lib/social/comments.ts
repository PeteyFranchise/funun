import type { SupabaseClient } from '@supabase/supabase-js'
import { PROFILE_ROLE_LABELS, type ProfileRole } from '@/types'
import type { CommentView } from '@/components/profile/ReleaseComments'

function roleLabel(roles: unknown): string | null {
  const r = Array.isArray(roles) ? (roles[0] as ProfileRole | undefined) : undefined
  if (!r) return null
  return r.kind === 'preset' ? PROFILE_ROLE_LABELS[r.slug] : r.label
}

/** Load a release's comments (flat, oldest-first) with author identities. */
export async function loadReleaseComments(supabase: SupabaseClient, projectId: string): Promise<CommentView[]> {
  const { data } = await supabase
    .from('release_comments')
    .select('id, parent_id, body, created_at, author_id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(200)

  const rows = (data ?? []) as {
    id: string
    parent_id: string | null
    body: string
    created_at: string
    author_id: string
  }[]
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
