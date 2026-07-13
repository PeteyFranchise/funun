import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { buildConnectRequest, buildRespondTransition } from '@/lib/social/connections'
import {
  buildConnectionRequestNotification,
  buildConnectionAcceptedNotification,
} from '@/lib/social/notifications'
import { createNotification } from '@/lib/notifications'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// ─── actor snapshot ─────────────────────────────────────────────────────
// Read the caller's own artist_profiles row (keyed by auth.uid()) for the
// notification actor snapshot. Column is `artist_name`, NOT `display_name`
// (RESEARCH Pattern 2). Never trust client-supplied actor data (T-10-07).
async function loadActor(
  supabase: ReturnType<typeof createApiClient>,
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

// POST /api/connections  { addresseeId, note? }  → create a connect request
export async function POST(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true, status: 'pending' } })

  const { addresseeId, note } = (await request.json().catch(() => ({}))) as {
    addresseeId?: string
    note?: string | null
  }
  if (!addresseeId) return NextResponse.json({ error: 'Missing addresseeId' }, { status: 400 })

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.id === addresseeId) {
    return NextResponse.json({ error: 'You cannot send a connection request to yourself.' }, { status: 400 })
  }

  // Build the INSERT payload (trims/validates the note; may throw on a 200+
  // char note or a self-request — surface as a 400).
  let payload
  try {
    payload = buildConnectRequest(user.id, addresseeId, note)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  // Status transition path: SESSION client only — RLS `connections_insert_own`
  // enforces requester_id = auth.uid() and no_block() gates the pair.
  const { data: inserted, error } = await supabase
    .from('connections')
    .insert(payload)
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cross-user notify via service client, best-effort (non-fatal): the
  // request already succeeded. Recipient is the addressee (server-derived).
  try {
    const actor = await loadActor(supabase, user.id)
    const service = createServiceClient()
    const notif = buildConnectionRequestNotification({
      recipientId: addresseeId,
      actorId: user.id,
      actorName: actor.name,
      actorAvatarUrl: actor.avatarUrl,
      actorHandle: actor.handle,
      note: payload.note,
      connectionId: inserted.id,
    })
    await createNotification(service, notif)
  } catch {
    // Non-fatal — the connect request itself was persisted.
  }

  return NextResponse.json({ data: { ok: true, status: 'pending' } })
}

// PATCH /api/connections  { connectionId, action }  → accept | decline | withdraw
export async function PATCH(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true, status: 'accepted' } })

  const { connectionId, action } = (await request.json().catch(() => ({}))) as {
    connectionId?: string
    action?: string
  }
  if (!connectionId) return NextResponse.json({ error: 'Missing connectionId' }, { status: 400 })

  // Map action → target status; rejects unknown actions with a 400.
  let target
  try {
    target = buildRespondTransition(action ?? '')
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  const supabase = createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Status transition uses the SESSION client only. RLS's two-policy split
  // (migration 035) allows the caller only the transitions they are
  // authorized for: addressee → accept/decline, requester → withdraw. Using
  // a service-role client here would let a requester self-accept (T-10-06).
  // The auto-follow seed on accept is the DB trigger's job (migration 044),
  // NOT this route's — no follows INSERT here.
  const { data: updated, error } = await supabase
    .from('connections')
    .update({ status: target })
    .eq('id', connectionId)
    .select('id, requester_id, addressee_id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated) {
    // Zero rows: the caller isn't authorized for this transition, or the row
    // is no longer pending — RLS filtered it out.
    return NextResponse.json({ error: 'Connection not found or not permitted' }, { status: 404 })
  }

  // Only a successful accept fires exactly one connection_accepted
  // notification to the original requester. No notification on
  // decline/withdraw (not in NOTIF-01).
  if (target === 'accepted') {
    try {
      const actor = await loadActor(supabase, user.id)
      const service = createServiceClient()
      const notif = buildConnectionAcceptedNotification({
        recipientId: updated.requester_id,
        actorId: user.id,
        actorName: actor.name,
        actorAvatarUrl: actor.avatarUrl,
        actorHandle: actor.handle,
      })
      await createNotification(service, notif)
    } catch {
      // Non-fatal — the accept itself was persisted (and the trigger seeded follows).
    }
  }

  return NextResponse.json({ data: { ok: true, status: target } })
}
