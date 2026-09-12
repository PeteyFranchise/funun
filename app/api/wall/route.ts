import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { buildWallPostNotification } from '@/lib/social/notifications'
import { isBlockedRelativeTo, BLOCKED_ACTION_ERROR, BLOCKED_ACTION_STATUS } from '@/lib/trust-safety/block-check'
import { profileDisplayTitle } from '@/lib/profile/display-name'
import { checkRateLimit } from '@/lib/security/rate-limit'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// POST   /api/wall  { profileId, body }   → leave a public message
// DELETE /api/wall  { postId }            → remove (own post, or wall owner)
export async function POST(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true } })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { profileId, body } = (await request.json().catch(() => ({}))) as {
    profileId?: string
    body?: string
  }
  const text = (body ?? '').trim()
  if (!profileId) return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'Message is empty' }, { status: 400 })
  if (text.length > 2000) return NextResponse.json({ error: 'Message too long' }, { status: 400 })

  const contentHash = createHash('sha256').update(text.toLocaleLowerCase()).digest('hex')
  const limited =
    (await checkRateLimit(`social:wall:${user.id}`, {
      maxAttempts: 30,
      windowMs: 60 * 60 * 1000,
      failClosed: true,
    })) ||
    (await checkRateLimit(`social:wall:recipient:${user.id}:${profileId}`, {
      maxAttempts: 10,
      windowMs: 24 * 60 * 60 * 1000,
      failClosed: true,
    })) ||
    (await checkRateLimit(`social:wall:repeat:${user.id}:${contentHash}`, {
      maxAttempts: 2,
      windowMs: 24 * 60 * 60 * 1000,
      failClosed: true,
    }))
  if (limited) {
    return NextResponse.json({ error: 'Wall-post limit reached. Try again later.' }, { status: 429 })
  }

  // 13-03 hard-block-enforcement audit: wall_insert_author RLS (migration
  // 038) already rejects this INSERT across a block, but a raw RLS
  // rejection surfaces a distinguishable Postgres error shape. Pre-check
  // and return the same generic, block-state-agnostic error any other
  // rejected wall post would get.
  const service = createServiceClient()
  if (await isBlockedRelativeTo(service, user.id, profileId)) {
    return NextResponse.json({ error: BLOCKED_ACTION_ERROR }, { status: BLOCKED_ACTION_STATUS })
  }

  const { data, error } = await supabase
    .from('wall_posts')
    .insert({ profile_id: profileId, author_id: user.id, body: text })
    .select()
    .single()
  if (error) return NextResponse.json({ error: 'Wall message could not be posted.' }, { status: 500 })

  // Best-effort side effect: notify the wall owner (profileId). The wall_post
  // deep-link anchors on the owner's OWN profile (/u/{ownHandle}#wall), so the
  // handle passed to the builder is the owner's, resolved from artist_profiles
  // keyed by profileId. Actor snapshot is the poster's own profile.
  try {
    const [{ data: actor }, { data: owner }] = await Promise.all([
      supabase.from('user_profiles').select('artist_name, handle, avatar_url').eq('id', user.id).maybeSingle(),
      supabase.from('user_profiles').select('handle').eq('id', profileId).maybeSingle(),
    ])
    const actorName = profileDisplayTitle({
      artistName: actor?.artist_name ?? null,
      handle: actor?.handle ?? null,
    }) || 'Member'
    await createNotification(
      service,
      buildWallPostNotification({
        recipientId: profileId,
        actorId: user.id,
        actorName,
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

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = (await request.json().catch(() => ({}))) as { postId?: string }
  if (!postId) return NextResponse.json({ error: 'Missing postId' }, { status: 400 })

  // RLS already restricts deletes to the author or the wall owner.
  const { error } = await supabase.from('wall_posts').delete().eq('id', postId)
  if (error) return NextResponse.json({ error: 'Wall message could not be removed.' }, { status: 500 })
  return NextResponse.json({ data: { ok: true } })
}
