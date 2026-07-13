import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { buildNewFollowerNotification } from '@/lib/social/notifications'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST   /api/follows  { followeeId }  → follow
// DELETE /api/follows  { followeeId }  → unfollow
async function mutate(request: Request, action: 'follow' | 'unfollow') {
  if (DEMO) return NextResponse.json({ data: { ok: true } }) // no-op in demo

  const { followeeId } = (await request.json().catch(() => ({}))) as { followeeId?: string }
  if (!followeeId) return NextResponse.json({ error: 'Missing followeeId' }, { status: 400 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.id === followeeId) return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 })

  if (action === 'follow') {
    const { error } = await supabase
      .from('follows')
      .upsert({ follower_id: user.id, followee_id: followeeId }, { onConflict: 'follower_id,followee_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Best-effort side effect: notify the followee. Fires ONLY for genuine
    // explicit follows through this route — connect-accept-seeded follow rows
    // are inserted by the Plan-02 DB trigger and never reach this handler, so
    // no suppression logic is needed here (RESEARCH Open Question #1).
    try {
      const { data: actor } = await supabase
        .from('artist_profiles')
        .select('artist_name, avatar_url, handle')
        .eq('id', user.id)
        .maybeSingle()
      const service = createServiceClient()
      await createNotification(
        service,
        buildNewFollowerNotification({
          recipientId: followeeId,
          actorId: user.id,
          actorName: actor?.artist_name || 'Member',
          actorAvatarUrl: actor?.avatar_url ?? null,
          actorHandle: actor?.handle ?? '',
        })
      )
    } catch {
      // Non-fatal: the follow already succeeded.
    }
  } else {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('followee_id', followeeId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data: { ok: true, following: action === 'follow' } })
}

export const POST = (request: Request) => mutate(request, 'follow')
export const DELETE = (request: Request) => mutate(request, 'unfollow')
