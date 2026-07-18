import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { buildNewDmNotification } from '@/lib/social/notifications'
import { createNotification } from '@/lib/notifications'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// ─── actor snapshot ─────────────────────────────────────────────────────
// Explicit column list — never select('*') on artist_profiles (migration
// 040 column lockdown returns 42501 for any other column set).
async function loadActor(
  supabase: Awaited<ReturnType<typeof createApiClient>>,
  userId: string
): Promise<{ name: string; avatarUrl: string | null; handle: string }> {
  const { data } = await supabase
    .from('artist_profiles')
    .select('artist_name, avatar_url, handle')
    .eq('id', userId)
    .maybeSingle()
  const row = (data ?? {}) as {
    artist_name?: string | null
    avatar_url?: string | null
    handle?: string | null
  }
  return {
    name: row.artist_name || 'Member',
    avatarUrl: row.avatar_url ?? null,
    handle: row.handle ?? '',
  }
}

// POST /api/dm/request/accept/[threadId]  → recipient accepts a message request (D-10)
export async function POST(_request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  if (DEMO) return NextResponse.json({ ok: true })

  const { threadId } = await params

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Service-client status transition: migration 056 revokes direct client
  // UPDATE on dm_threads, so the API owns this state change. The WHERE clause
  // still enforces participant scope + recipient-only acceptance atomically.
  const service = createServiceClient()
  const { data: updated, error } = await service
    .from('dm_threads')
    .update({ status: 'direct' })
    .eq('id', threadId)
    .eq('status', 'pending')
    .neq('requester_id', user.id)
    .or(`a_id.eq.${user.id},b_id.eq.${user.id}`)
    .select('id, requester_id, a_id, b_id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated) return NextResponse.json({ error: 'Request not found or not permitted' }, { status: 404 })

  const updatedRow = updated as { id: string; requester_id: string | null; a_id: string; b_id: string }

  // Recipient-only guard is enforced atomically above via requester_id != user.id.

  // Best-effort notification to the requester — the accept itself already
  // succeeded and must not be rolled back if this fails.
  if (updatedRow.requester_id) {
    try {
      const actor = await loadActor(supabase, user.id)
      await createNotification(
        service,
        buildNewDmNotification({
          recipientId: updatedRow.requester_id,
          actorId: user.id,
          actorName: actor.name,
          actorAvatarUrl: actor.avatarUrl,
          threadId,
        })
      )
    } catch {
      // Non-fatal — the accept itself was persisted.
    }
  }

  return NextResponse.json({ ok: true })
}
