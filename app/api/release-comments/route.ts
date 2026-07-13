import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { buildReleaseCommentNotification } from '@/lib/social/notifications'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST   /api/release-comments  { projectId, body, parentId? }  → comment/reply
// DELETE /api/release-comments  { commentId }                   → remove own comment
export async function POST(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const { projectId, body, parentId } = (await request.json().catch(() => ({}))) as {
    projectId?: string
    body?: string
    parentId?: string | null
  }
  const text = (body ?? '').trim()
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'Comment is empty' }, { status: 400 })
  if (text.length > 2000) return NextResponse.json({ error: 'Comment too long' }, { status: 400 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('release_comments')
    .insert({ project_id: projectId, author_id: user.id, parent_id: parentId ?? null, body: text })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort side effect: notify the PROJECT OWNER (not the commenter). The
  // comment row only carries author_id, so resolve the owner (user_id) and the
  // release title from vault_projects. Skip the notify when the commenter IS
  // the owner (don't notify someone about their own comment).
  try {
    const { data: project } = await supabase
      .from('vault_projects')
      .select('user_id, title')
      .eq('id', projectId)
      .maybeSingle()
    if (project && project.user_id !== user.id) {
      const { data: actor } = await supabase
        .from('artist_profiles')
        .select('artist_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle()
      const service = createServiceClient()
      await createNotification(
        service,
        buildReleaseCommentNotification({
          recipientId: project.user_id,
          actorId: user.id,
          actorName: actor?.artist_name || 'Member',
          actorAvatarUrl: actor?.avatar_url ?? null,
          projectId,
          trackTitle: project.title || 'your release',
        })
      )
    }
  } catch {
    // Non-fatal: the comment already succeeded.
  }

  return NextResponse.json({ data })
}

export async function DELETE(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const { commentId } = (await request.json().catch(() => ({}))) as { commentId?: string }
  if (!commentId) return NextResponse.json({ error: 'Missing commentId' }, { status: 400 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('release_comments').delete().eq('id', commentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { ok: true } })
}
