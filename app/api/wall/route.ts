import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { buildWallPostNotification } from '@/lib/social/notifications'

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

  const supabase = await createApiClient()
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

  // Best-effort side effect: notify the wall owner (profileId). The wall_post
  // deep-link anchors on the owner's OWN profile (/u/{ownHandle}#wall), so the
  // handle passed to the builder is the owner's, resolved from artist_profiles
  // keyed by profileId. Actor snapshot is the poster's own profile.
  try {
    const [{ data: actor }, { data: owner }] = await Promise.all([
      supabase.from('artist_profiles').select('artist_name, avatar_url').eq('id', user.id).maybeSingle(),
      supabase.from('artist_profiles').select('handle').eq('id', profileId).maybeSingle(),
    ])
    const service = createServiceClient()
    await createNotification(
      service,
      buildWallPostNotification({
        recipientId: profileId,
        actorId: user.id,
        actorName: actor?.artist_name || 'Member',
        actorAvatarUrl: actor?.avatar_url ?? null,
        ownHandle: owner?.handle ?? '',
      })
    )
  } catch {
    // Non-fatal: the wall post already succeeded.
  }

  return NextResponse.json({ data })
}

export async function DELETE(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const { postId } = (await request.json().catch(() => ({}))) as { postId?: string }
  if (!postId) return NextResponse.json({ error: 'Missing postId' }, { status: 400 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS already restricts deletes to the author or the wall owner.
  const { error } = await supabase.from('wall_posts').delete().eq('id', postId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { ok: true } })
}
