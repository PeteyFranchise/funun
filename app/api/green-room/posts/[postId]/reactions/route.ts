import { NextResponse } from 'next/server'
import { isGreenRoomReaction } from '@/lib/green-room/feed'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

type RouteContext = { params: Promise<{ postId: string }> }

// GET /api/green-room/posts/[postId]/reactions
// Returns visible reaction rows only; RLS inherits post visibility.
export async function GET(_request: Request, { params }: RouteContext) {
  if (DEMO) return NextResponse.json({ data: [] })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await params
  const { data, error } = await supabase
    .from('green_room_reactions')
    .select('post_id, user_id, reaction_type, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/green-room/posts/[postId]/reactions { reactionType }
// A viewer has one active reaction per post in the API contract. The table
// can store multiple types, so the route deletes the viewer's prior reaction
// rows before inserting the selected type.
export async function POST(request: Request, { params }: RouteContext) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = (await request.json().catch(() => ({}))) as { reactionType?: unknown }
  if (!isGreenRoomReaction(payload.reactionType)) {
    return NextResponse.json({ error: 'A valid reaction type is required' }, { status: 400 })
  }

  const { postId } = await params
  const { error: deleteError } = await supabase
    .from('green_room_reactions')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', user.id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  const { data, error } = await supabase
    .from('green_room_reactions')
    .insert({ post_id: postId, user_id: user.id, reaction_type: payload.reactionType })
    .select('post_id, user_id, reaction_type, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

// DELETE /api/green-room/posts/[postId]/reactions { reactionType? }
// Without a reactionType, remove the viewer's active reaction for the post.
export async function DELETE(request: Request, { params }: RouteContext) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await params
  const payload = (await request.json().catch(() => ({}))) as { reactionType?: unknown }
  if (payload.reactionType != null && !isGreenRoomReaction(payload.reactionType)) {
    return NextResponse.json({ error: 'A valid reaction type is required' }, { status: 400 })
  }

  let query = supabase
    .from('green_room_reactions')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', user.id)
  if (payload.reactionType) query = query.eq('reaction_type', payload.reactionType)

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { ok: true } })
}

