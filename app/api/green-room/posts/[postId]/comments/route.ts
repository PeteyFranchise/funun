import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'
const COMMENT_MAX = 2000

type RouteContext = { params: Promise<{ postId: string }> }

// GET /api/green-room/posts/[postId]/comments
// RLS on green_room_comments inherits post visibility via
// green_room_can_view_post(), so blocked/hidden/ineligible posts return no
// rows rather than relying on client-side filtering.
export async function GET(_request: Request, { params }: RouteContext) {
  if (DEMO) return NextResponse.json({ data: [] })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await params
  const { data, error } = await supabase
    .from('green_room_comments')
    .select('id, post_id, author_id, body, created_at, updated_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/green-room/posts/[postId]/comments { body }
// Nested comments are intentionally not supported in v1.
export async function POST(request: Request, { params }: RouteContext) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await params
  const payload = (await request.json().catch(() => ({}))) as { body?: unknown; parentId?: unknown }
  if (payload.parentId != null) {
    return NextResponse.json({ error: 'Nested comments are not supported yet' }, { status: 400 })
  }

  const body = typeof payload.body === 'string' ? payload.body.trim() : ''
  if (!body) return NextResponse.json({ error: 'Comment is empty' }, { status: 400 })
  if (body.length > COMMENT_MAX) {
    return NextResponse.json({ error: `Comment must be ${COMMENT_MAX} characters or fewer` }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('green_room_comments')
    .insert({ post_id: postId, author_id: user.id, body })
    .select('id, post_id, author_id, body, created_at, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

// DELETE /api/green-room/posts/[postId]/comments { commentId }
// RLS permits own-comment delete plus post-owner moderation delete.
export async function DELETE(request: Request, { params }: RouteContext) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await params
  const payload = (await request.json().catch(() => ({}))) as { commentId?: unknown }
  if (typeof payload.commentId !== 'string' || !payload.commentId.trim()) {
    return NextResponse.json({ error: 'Missing commentId' }, { status: 400 })
  }

  const { error } = await supabase
    .from('green_room_comments')
    .delete()
    .eq('id', payload.commentId.trim())
    .eq('post_id', postId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { ok: true } })
}

