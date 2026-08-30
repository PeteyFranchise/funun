// ─── Work access decision — one function for every /api/works route ───
// `decideWorkAccess` is the ONLY implementation of "may this person write
// into this song?" in this codebase (T-37-20). Every wave-2 route calls
// `resolveWorkAccess` as the first statement of its body — never its own
// hand-rolled ownership or tier check.
//
// The split below is deliberate and enforced by this file's shape: the
// DECISION is pure and is the thing worth testing (it is fully testable
// without a database, via injected fact-getters); the WRAPPER is thin I/O
// that cannot be tested without one and therefore contains nothing worth
// testing beyond "does it await both calls and pass the result through."
//
// STANDING RULE FOR EVERY CONSUMER: no route may read a tier from a
// request body, a query parameter or a header (T-37-21). The tier is a
// database fact, fetched here, every time — `decideWorkAccess`'s
// signature has no slot for a client-asserted tier.

import type { WorkTier } from '@/lib/catalogue/membership'

// ─── Types ──────────────────────────────────────────────────────────

export type WorkAccessStatus = 401 | 403 | 404

export type WorkAccessGrant = {
  granted: true
  /** The effective tier for this request — 'administer' when the caller is the owner, otherwise the caller's actual membership tier. */
  tier: WorkTier
  isOwner: boolean
}

export type WorkAccessRefusal = {
  granted: false
  status: WorkAccessStatus
  reason: string
}

export type WorkAccessResult = WorkAccessGrant | WorkAccessRefusal

export type DecideWorkAccessInput = {
  userId: string | null
  /** From migration 136's `is_work_owner(work_id, uid)`. */
  isOwner: boolean
  /** From migration 136's `work_member_tier(work_id, uid)` — null when no membership row exists for this user. */
  tier: WorkTier | null
  requiredTier: WorkTier
}

// ─── The decision — pure, no I/O ───────────────────────────────────────

/**
 * Decides whether `userId` may act on a work at `requiredTier`, given the
 * two database facts a caller already fetched. Never touches a client,
 * never throws — every branch returns a typed result.
 *
 * Status code choices (T-37-22, T-37-23):
 *   - 401: no signed-in user at all.
 *   - 404, never 403, for a signed-in user who is neither the owner nor
 *     any kind of member: a work id is a UUID and is not guessable, but a
 *     leaked or logged id must not become an existence oracle — the
 *     response cannot distinguish "exists but not yours" from "does not
 *     exist". This reasoning stops the moment membership is proven.
 *   - 403 once membership IS proven but the tier is insufficient for the
 *     requested action: hiding the work from a contribute-tier member who
 *     is asking for an administer-only action would be confusing rather
 *     than protective, so they get a real permission error instead.
 *
 * An owner is granted the administer tier WITHOUT requiring a
 * `work_members` row: plan 05 creates the owner's row at work creation,
 * but the `works.user_id` column is the authority, and a route must keep
 * working correctly even if that row is ever missing.
 */
export function decideWorkAccess(input: DecideWorkAccessInput): WorkAccessResult {
  const { userId, isOwner, tier, requiredTier } = input

  if (!userId) {
    return { granted: false, status: 401, reason: 'Not signed in.' }
  }

  if (isOwner) {
    return { granted: true, tier: 'administer', isOwner: true }
  }

  if (!tier) {
    return { granted: false, status: 404, reason: 'Work not found.' }
  }

  if (requiredTier === 'administer' && tier !== 'administer') {
    return { granted: false, status: 403, reason: 'This action requires the administer tier.' }
  }

  return { granted: true, tier, isOwner: false }
}

// ─── The wrapper — the only I/O in this module ─────────────────────────

export type WorkAccessFactGetters = {
  getIsOwner(workId: string, userId: string | null): Promise<boolean>
  getTier(workId: string, userId: string | null): Promise<WorkTier | null>
}

/**
 * Fetches the two facts `decideWorkAccess` needs and delegates to it
 * unchanged. Contains no branching beyond awaiting — no authorization
 * reasoning lives here. Both getters are called unconditionally, even for
 * an unauthenticated caller; `deps` built by `createWorkAccessDeps` below
 * short-circuits that case internally without a network call.
 */
export async function resolveWorkAccess(
  deps: WorkAccessFactGetters,
  workId: string,
  userId: string | null,
  requiredTier: WorkTier
): Promise<WorkAccessResult> {
  const [isOwner, tier] = await Promise.all([
    deps.getIsOwner(workId, userId),
    deps.getTier(workId, userId),
  ])
  return decideWorkAccess({ userId, isOwner, tier, requiredTier })
}

// ─── The real fact-getters — migration 136's RPC pair ──────────────────

/**
 * `client` is typed as the minimal structural shape this module actually
 * needs — an object with an `rpc` method for exactly these two functions
 * — rather than the full Supabase client (same "extract the decision,
 * inject the dependency" move as lib/handles/resolve.ts's
 * `HandleResolverClient`). This repo has no jsdom and no Supabase test
 * harness; injecting a plain object literal is what keeps
 * `resolveWorkAccess` testable.
 *
 * The RPCs are granted to `authenticated` (migration 136's
 * `GRANT EXECUTE ... TO authenticated`), so the caller's own session
 * client is sufficient here — this factory does not need, and must not
 * be handed, the service-role client.
 */
export interface WorkAccessRpcClient {
  rpc(
    fn: 'is_work_owner',
    args: { p_work_id: string; p_uid: string }
  ): PromiseLike<{ data: boolean | null; error: unknown }>
  rpc(
    fn: 'work_member_tier',
    args: { p_work_id: string; p_uid: string }
  ): PromiseLike<{ data: string | null; error: unknown }>
}

function isWorkTier(value: string | null): value is WorkTier {
  return value === 'contribute' || value === 'administer'
}

/** Builds the real `WorkAccessFactGetters` from a Supabase client for use by `resolveWorkAccess` in an API route. */
export function createWorkAccessDeps(client: WorkAccessRpcClient): WorkAccessFactGetters {
  return {
    async getIsOwner(workId, userId) {
      if (!userId) return false
      const { data, error } = await client.rpc('is_work_owner', { p_work_id: workId, p_uid: userId })
      return !error && data === true
    },
    async getTier(workId, userId) {
      if (!userId) return null
      const { data, error } = await client.rpc('work_member_tier', { p_work_id: workId, p_uid: userId })
      if (error || !data) return null
      return isWorkTier(data) ? data : null
    },
  }
}
