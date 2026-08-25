import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import { buildRespondTransition } from '@/lib/social/connections'
import { buildConnectionAcceptedNotification } from '@/lib/social/notifications'
import { createNotification } from '@/lib/notifications'
import { createConnectionRequest, BLOCKED_ACTION_ERROR, BLOCKED_ACTION_STATUS } from '@/lib/social/connect-request'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

// ─── actor snapshot ─────────────────────────────────────────────────────
// Read the caller's own artist_profiles row (keyed by auth.uid()) for the
// notification actor snapshot. Column is `artist_name`, NOT `display_name`
// (RESEARCH Pattern 2). Never trust client-supplied actor data (T-10-07).
async function loadActor(
  supabase: Awaited<ReturnType<typeof createApiClient>>,
  userId: string
): Promise<{ name: string; avatarUrl: string | null; handle: string }> {
  const { data } = await supabase
    .from('user_profiles')
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
//
// Thin wrapper (260825-m2k Task 1): auth gate, then delegate the self/
// blocked/duplicate-active/insert/notification mechanics to
// createConnectionRequest (lib/social/connect-request.ts) — the same
// implementation the collaborator invite path uses. Every status code and
// error string below is unchanged from before this extraction.
export async function POST(request: Request) {
  if (DEMO) return NextResponse.json({ data: { ok: true, status: 'pending' } })

  const { addresseeId, note } = (await request.json().catch(() => ({}))) as {
    addresseeId?: string
    note?: string | null
  }
  if (!addresseeId) return NextResponse.json({ error: 'Missing addresseeId' }, { status: 400 })

  const supabase = await createApiClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const result = await createConnectionRequest(supabase, service, {
    requesterId: user.id,
    addresseeId,
    note,
  })

  switch (result.kind) {
    case 'self':
      return NextResponse.json({ error: 'You cannot send a connection request to yourself.' }, { status: 400 })
    case 'blocked':
      return NextResponse.json({ error: BLOCKED_ACTION_ERROR }, { status: BLOCKED_ACTION_STATUS })
    case 'pending':
      return NextResponse.json(
        { error: 'There is already a pending connection request between you and this member.' },
        { status: 409 }
      )
    case 'connected':
      return NextResponse.json(
        { error: 'You are already connected with this member.' },
        { status: 409 }
      )
    case 'connected-conflict':
      return NextResponse.json(
        { error: 'There is already an active connection between you and this member.' },
        { status: 409 }
      )
    case 'error':
      // The note-length/self-request builder throw surfaces as a 400; every
      // other error path (existing-active lookup, insert) surfaces as a 500
      // — same split the pre-extraction route made.
      return NextResponse.json(
        { error: result.message },
        { status: result.message.includes('characters or fewer') ? 400 : 500 }
      )
    case 'created':
      return NextResponse.json({ data: { ok: true, status: 'pending' } })
  }
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

  const supabase = await createApiClient()
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
    .eq('status', 'pending')
    .select('id, requester_id, addressee_id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated) {
    // Zero rows: the caller isn't authorized for this transition, or the row
    // is no longer pending — RLS filtered it out.
    return NextResponse.json({ error: 'Connection not found or not permitted' }, { status: 404 })
  }

  // Resolve the originating connection_request notification so it stops
  // resurfacing (with live Accept/Decline buttons) on a fresh GET after the
  // responder has already acted. Scoped to the responder's own row so this
  // never touches another user's notifications. Best-effort — the status
  // transition itself already succeeded and must not be rolled back here.
  if (target === 'accepted' || target === 'declined') {
    try {
      const service = createServiceClient()
      await service
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('type', 'connection_request')
        .eq('data->>connectionId', connectionId)
    } catch {
      // Non-fatal — the connection transition itself was persisted.
    }
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
