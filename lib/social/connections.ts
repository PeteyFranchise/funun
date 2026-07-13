// Phase 10 connect request/respond/withdraw payload + transition builders.
//
// Pure functions only — no Supabase client, no I/O. RLS enforcement (who
// may accept vs. withdraw) stays in the DB policies (migration 035's
// two-policy UPDATE split); this module only shapes the intended payload
// or status value, it does not re-implement authorization. Note length is
// validated here in TS as a friendly pre-check; the Postgres CHECK
// constraint (Plan 02 migration) is the hard backstop.

const NOTE_MAX_LENGTH = 200

export type ConnectRequestPayload = {
  requester_id: string
  addressee_id: string
  note: string | null
}

/**
 * Build the INSERT payload for a new connect request.
 * Trims `note`, coerces empty/whitespace to null, and rejects (throws) when
 * `note` exceeds 200 chars or when requesterId === addresseeId.
 */
export function buildConnectRequest(
  requesterId: string,
  addresseeId: string,
  note?: string | null
): ConnectRequestPayload {
  if (requesterId === addresseeId) {
    throw new Error('You cannot send a connection request to yourself.')
  }

  const trimmed = (note ?? '').trim()
  if (trimmed.length > NOTE_MAX_LENGTH) {
    throw new Error(`Connection note must be ${NOTE_MAX_LENGTH} characters or fewer.`)
  }

  return {
    requester_id: requesterId,
    addressee_id: addresseeId,
    note: trimmed.length > 0 ? trimmed : null,
  }
}

export type ConnectRespondAction = 'accept' | 'decline' | 'withdraw'
export type ConnectStatus = 'accepted' | 'declined' | 'withdrawn'

const RESPOND_TRANSITIONS: Record<ConnectRespondAction, ConnectStatus> = {
  accept: 'accepted',
  decline: 'declined',
  withdraw: 'withdrawn',
}

/**
 * Map a connect-respond action string to its target `connections.status`
 * value. Rejects (throws) any action not in the known set.
 */
export function buildRespondTransition(action: string): ConnectStatus {
  const status = RESPOND_TRANSITIONS[action as ConnectRespondAction]
  if (!status) {
    throw new Error(`Unknown connect action "${action}". Expected accept, decline, or withdraw.`)
  }
  return status
}
