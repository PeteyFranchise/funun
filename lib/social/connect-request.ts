import type { SupabaseClient } from '@supabase/supabase-js'
import { buildConnectRequest } from '@/lib/social/connections'
import { buildConnectionRequestNotification } from '@/lib/social/notifications'
import { createNotification } from '@/lib/notifications'
import { isBlockedRelativeTo, BLOCKED_ACTION_ERROR, BLOCKED_ACTION_STATUS } from '@/lib/trust-safety/block-check'

// ─── createConnectionRequest — the single connection-request implementation ─
// Extracted out of the POST handler in app/api/connections/route.ts
// (260825-m2k Task 1) so a second caller (the collaborator invite path,
// lib/collaborators/invite.ts) can send the exact same connection request
// through the exact same self/blocked/duplicate-active guards, rather than
// a second, drifting copy of them. POST /api/connections now delegates to
// this module; this extraction is behavior-preserving — every status code
// and error string the route returned before is unchanged.

export { BLOCKED_ACTION_ERROR, BLOCKED_ACTION_STATUS }

const ACTIVE_CONNECTION_STATUSES = ['pending', 'accepted']

// ─── actor snapshot ─────────────────────────────────────────────────────
// Read the caller's own artist_profiles row (keyed by auth.uid()) for the
// notification actor snapshot. Column is `artist_name`, NOT `display_name`
// (RESEARCH Pattern 2). Never trust client-supplied actor data (T-10-07).
async function loadActor(
  supabase: SupabaseClient,
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

export type CreateConnectionRequestResult =
  | { kind: 'created'; connectionId: string; actorName: string }
  | { kind: 'self' }
  | { kind: 'blocked' }
  | { kind: 'pending' }
  | { kind: 'connected' }
  | { kind: 'connected-conflict' }
  | { kind: 'error'; message: string }

/**
 * Creates a connection request from `requesterId` to `addresseeId`, in the
 * exact order POST /api/connections enforced before this extraction: self
 * check, block pre-check, unordered active-pair pre-check, INSERT (session
 * client — RLS connections_insert_own is still the enforcement point, never
 * a service-client insert here), then a best-effort connection_request
 * notification that cannot fail the request.
 *
 * `supabase` is the caller's session-authenticated client (used for the
 * duplicate-active read, the actual insert, and loadActor); `service` is
 * used only for the block pre-check and the cross-user notification write.
 */
export async function createConnectionRequest(
  supabase: SupabaseClient,
  service: SupabaseClient,
  input: { requesterId: string; addresseeId: string; note?: string | null }
): Promise<CreateConnectionRequestResult> {
  const { requesterId, addresseeId, note } = input

  if (requesterId === addresseeId) return { kind: 'self' }

  // 13-03 hard-block-enforcement audit: connections_insert_own RLS
  // (migration 044) already appends a no_block() check, but a raw RLS
  // rejection surfaces a distinguishable Postgres error shape. Pre-check and
  // return the same generic, block-state-agnostic outcome any other rejected
  // request would get — checked BEFORE the duplicate-active pre-check below
  // so a blocked pair never even reaches that (equally generic) path.
  if (await isBlockedRelativeTo(service, requesterId, addresseeId)) {
    return { kind: 'blocked' }
  }

  // Build the INSERT payload (trims/validates the note; may throw on a 200+
  // char note or a self-request — the self case is already handled above,
  // so only the note-length throw is reachable here).
  let payload
  try {
    payload = buildConnectRequest(requesterId, addresseeId, note)
  } catch (e) {
    return { kind: 'error', message: (e as Error).message }
  }

  // Friendly pre-check for the unordered active-pair invariant enforced by
  // migration 050. This avoids a confusing duplicate-key error when the other
  // member has already sent a pending request or the pair is already connected.
  const { data: existingActive, error: existingError } = await supabase
    .from('connections')
    .select('id, status')
    .or(
      `and(requester_id.eq.${requesterId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${requesterId})`
    )
    .in('status', ACTIVE_CONNECTION_STATUSES)
    .limit(1)
    .maybeSingle()
  if (existingError) return { kind: 'error', message: existingError.message }
  if (existingActive) {
    const status = (existingActive as { status: string }).status
    return status === 'accepted' ? { kind: 'connected' } : { kind: 'pending' }
  }

  // Status transition path: SESSION client only — RLS `connections_insert_own`
  // enforces requester_id = auth.uid() and no_block() gates the pair.
  const { data: inserted, error } = await supabase
    .from('connections')
    .insert(payload)
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { kind: 'connected-conflict' }
    return { kind: 'error', message: error.message }
  }

  const actor = await loadActor(supabase, requesterId)

  // Cross-user notify via service client, best-effort (non-fatal): the
  // request already succeeded. Recipient is the addressee (server-derived).
  try {
    const notif = buildConnectionRequestNotification({
      recipientId: addresseeId,
      actorId: requesterId,
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

  return { kind: 'created', connectionId: inserted.id, actorName: actor.name }
}
