import { NextResponse } from 'next/server'
import { createGreenRoomRepost } from '@/lib/green-room/repost'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

type RouteContext = { params: Promise<{ postId: string }> }

// GET /api/green-room/posts/[postId]/reposts
// RLS ensures only reposts whose original is still visible to the viewer are
// returned. Visibility is not copied from the original into repost rows.
export async function GET(_request: Request, { params }: RouteContext) {
  if (DEMO) return NextResponse.json({ data: [] })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await params
  const { data, error } = await supabase
    .from('green_room_reposts')
    .select('id, original_post_id, author_id, quote_body, created_at')
    .eq('original_post_id', postId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/green-room/posts/[postId]/reposts { quoteBody? }
export async function POST(request: Request, { params }: RouteContext) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await params
  const payload = (await request.json().catch(() => ({}))) as { quoteBody?: unknown }
  const result = await createGreenRoomRepost(supabase, user.id, postId, payload.quoteBody)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({ data: result.repost }, { status: 201 })
}

// DELETE /api/green-room/posts/[postId]/reposts { repostId? }
// Without repostId, deletes the caller's repost for this original. With
// repostId, RLS also allows the original post owner to remove a repost.
export async function DELETE(request: Request, { params }: RouteContext) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await params
  const payload = (await request.json().catch(() => ({}))) as { repostId?: unknown }
  let query = supabase.from('green_room_reposts').delete().eq('original_post_id', postId)
  if (typeof payload.repostId === 'string' && payload.repostId.trim()) {
    query = query.eq('id', payload.repostId.trim())
  } else {
    query = query.eq('author_id', user.id)
  }

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { ok: true } })
}

