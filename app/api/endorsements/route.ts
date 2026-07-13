import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { buildEndorsementNotification } from '@/lib/social/notifications'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST   /api/endorsements  { profileId, body }  → endorse (one per author/profile)
// DELETE /api/endorsements  { profileId }        → withdraw your endorsement
export async function POST(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const { profileId, body } = (await request.json().catch(() => ({}))) as {
    profileId?: string
    body?: string
  }
  const text = (body ?? '').trim()
  if (!profileId) return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'Endorsement is empty' }, { status: 400 })
  if (text.length > 1000) return NextResponse.json({ error: 'Endorsement too long' }, { status: 400 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.id === profileId) return NextResponse.json({ error: 'You cannot endorse yourself' }, { status: 400 })

  const { data, error } = await supabase
    .from('endorsements')
    .upsert(
      { profile_id: profileId, author_id: user.id, body: text },
      { onConflict: 'profile_id,author_id' }
    )
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort side effect: notify the endorsed member (profileId). The
  // endorsement deep-link anchors on the owner's OWN profile
  // (/u/{ownHandle}#endorsements), so the handle passed to the builder is the
  // owner's, resolved from artist_profiles keyed by profileId.
  try {
    const [{ data: actor }, { data: owner }] = await Promise.all([
      supabase.from('artist_profiles').select('artist_name, avatar_url').eq('id', user.id).maybeSingle(),
      supabase.from('artist_profiles').select('handle').eq('id', profileId).maybeSingle(),
    ])
    const service = createServiceClient()
    await createNotification(
      service,
      buildEndorsementNotification({
        recipientId: profileId,
        actorId: user.id,
        actorName: actor?.artist_name || 'Member',
        actorAvatarUrl: actor?.avatar_url ?? null,
        ownHandle: owner?.handle ?? '',
      })
    )
  } catch {
    // Non-fatal: the endorsement already succeeded.
  }

  return NextResponse.json({ data })
}

export async function DELETE(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const { profileId } = (await request.json().catch(() => ({}))) as { profileId?: string }
  if (!profileId) return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('endorsements')
    .delete()
    .eq('profile_id', profileId)
    .eq('author_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { ok: true } })
}
