import { NextResponse } from 'next/server'
import { createApiClient } from '@/lib/supabase/server'

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

  const supabase = createApiClient()
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
  return NextResponse.json({ data })
}

export async function DELETE(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const { commentId } = (await request.json().catch(() => ({}))) as { commentId?: string }
  if (!commentId) return NextResponse.json({ error: 'Missing commentId' }, { status: 400 })

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('release_comments').delete().eq('id', commentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { ok: true } })
}
