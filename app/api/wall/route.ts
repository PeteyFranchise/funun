import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST   /api/wall  { profileId, body }   → leave a public message
// DELETE /api/wall  { postId }            → remove (own post, or wall owner)
export async function POST(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const { profileId, body } = (await request.json().catch(() => ({}))) as {
    profileId?: string
    body?: string
  }
  const text = (body ?? '').trim()
  if (!profileId) return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'Message is empty' }, { status: 400 })
  if (text.length > 2000) return NextResponse.json({ error: 'Message too long' }, { status: 400 })

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('wall_posts')
    .insert({ profile_id: profileId, author_id: user.id, body: text })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const { postId } = (await request.json().catch(() => ({}))) as { postId?: string }
  if (!postId) return NextResponse.json({ error: 'Missing postId' }, { status: 400 })

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS already restricts deletes to the author or the wall owner.
  const { error } = await supabase.from('wall_posts').delete().eq('id', postId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { ok: true } })
}
