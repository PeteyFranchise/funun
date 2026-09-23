import type { SupabaseClient } from '@supabase/supabase-js'
import { loadBlockedIds } from '@/lib/green-room/discover'

// ─────────────────────────────────────────────────────────────────────────
// Shared app-layer block gate (Plan 13-03: Hard Block Enforcement Audit).
//
// Several write paths (follows, connections, wall posts, endorsements,
// release comments) already have DB-level no_block() RLS wiring (migrations
// 038/044) that rejects the INSERT outright. But an RLS rejection surfaces
// to the client as a raw Postgres "new row violates row-level security
// policy" error — a message shape that is DISTINGUISHABLE from a generic
// validation/not-found failure, which risks letting a blocked party infer
// "I am specifically blocked" by elimination (13-03's non-negotiable rule:
// no distinguishable "you are blocked" state anywhere).
//
// This module gives every mutation route one shared, pre-emptive check
// (reusing loadBlockedIds's SERVICE-client bidirectional lookup from
// lib/green-room/discover.ts rather than re-deriving it) plus one shared,
// block-state-agnostic error shape, so a rejected write because of a block
// looks exactly like any other generic failed request.
// ─────────────────────────────────────────────────────────────────────────

// Never mentions "block" — must be indistinguishable from any other generic
// failure for the same action.
export const BLOCKED_ACTION_ERROR = 'This action could not be completed'
export const BLOCKED_ACTION_STATUS = 400

/**
 * True when the action must be refused — because a block exists in EITHER
 * direction between viewerId and otherId, OR because the block lookup could
 * not be completed.
 *
 * Named "must block the action" rather than "is blocked" for the same reason
 * mustBlockActionForEmail below is: a failed lookup is not evidence of a
 * block, but it is not evidence of safety either, so the action fails
 * CLOSED and the name must not claim more than the data carries. (It was
 * called `isBlockedRelativeTo` while loadBlockedIds swallowed its error and
 * returned an empty set, so the answer was "false, nobody is blocked" on a
 * failed lookup — a fail-OPEN gate wearing a predicate's name.)
 *
 * The catch here is not a blanket error swallow: this is the ONE boundary
 * where a refusal must be byte-identical to a real block's refusal. Callers
 * return the shared BLOCKED_ACTION_ERROR / BLOCKED_ACTION_STATUS above for
 * `true`, so an infrastructure failure and a real block are indistinguishable
 * to the client — which is exactly 13-03's requirement — while the write
 * itself is never performed either way. The driver error is not discarded;
 * loadBlockedIds attaches it to `.cause` for the server log.
 *
 * Uses the SERVICE client (loadBlockedIds requires it — the viewer's own
 * session can only read blocks they themselves placed, per blocks_select_own
 * RLS) so this can also see blocks placed against the viewer, without ever
 * exposing that direction to the caller.
 */
export async function mustBlockActionBetween(
  service: SupabaseClient,
  viewerId: string,
  otherId: string
): Promise<boolean> {
  if (viewerId === otherId) return false
  let blockedIds: Set<string>
  try {
    blockedIds = await loadBlockedIds(service, viewerId)
  } catch {
    return true
  }
  return blockedIds.has(otherId)
}

/**
 * True when the action must be refused because the supplied email belongs to
 * an account blocked in either direction relative to viewerId — OR because
 * the identity lookup could not be completed, which is why this is named
 * "must block the action" rather than "is blocked": a failed lookup is not
 * evidence of a block, but it is not evidence of safety either, so the
 * action fails CLOSED.
 *
 * Why an email-shaped entry point exists at all: the collaborator roster is
 * the one write surface where the target identity is supplied as an email
 * rather than an account id. Migration 179's BEFORE INSERT OR UPDATE OF
 * email trigger then resolves that email to a confirmed Member and writes
 * claimed_by with no block predicate, so a route that inserts first has
 * already disclosed the target's membership by the time it could check.
 * Resolving and checking HERE, before any write, means the trigger never
 * fires and there is no row to disclose.
 *
 * The email is resolved through the service-only find_auth_user_id_by_email
 * RPC (migration 177). Neither the email nor the resolved account id is ever
 * returned to the caller — only the boolean.
 */
export async function mustBlockActionForEmail(
  service: SupabaseClient,
  viewerId: string,
  email: string | null | undefined
): Promise<boolean> {
  const normalized = (email ?? '').trim().toLowerCase()
  if (!normalized) return false

  const { data, error } = await service.rpc('find_auth_user_id_by_email', {
    p_email: normalized,
  })
  // Fail closed: an unknown identity state must not be written through.
  if (error) return true
  if (typeof data !== 'string' || !data) return false

  return mustBlockActionBetween(service, viewerId, data)
}
