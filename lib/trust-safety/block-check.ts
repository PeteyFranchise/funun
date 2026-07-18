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
 * True when a block exists in EITHER direction between viewerId and
 * otherId. Uses the SERVICE client (loadBlockedIds requires it — the
 * viewer's own session can only read blocks they themselves placed, per
 * blocks_select_own RLS) so this can also see blocks placed against the
 * viewer, without ever exposing that direction to the caller.
 */
export async function isBlockedRelativeTo(
  service: SupabaseClient,
  viewerId: string,
  otherId: string
): Promise<boolean> {
  if (viewerId === otherId) return false
  const blockedIds = await loadBlockedIds(service, viewerId)
  return blockedIds.has(otherId)
}
