// ─── Public handle resolution (D-04, D-07) ───────────────────────────────
// Fixes the pre-existing case-sensitivity defect on `/u/[handle]` and folds
// D-07's retired-handle redirect into the same lookup, both through
// migration 133's `resolve_profile_by_handle()` RPC.
//
// WHY AN RPC AT ALL, NOT A FILTER FROM THE PAGE: PostgREST cannot express a
// `lower(column) = lower($1)` comparison, so the obvious alternative is a
// pattern-match filter (`.ilike()`). That is wrong here: an underscore is
// BOTH a legal handle character (D-05) and a single-character wildcard in a
// LIKE pattern, so `/u/a_c` would silently resolve to `@abc`, or match two
// rows and 404 a legitimate profile. The RPC does an exact lowered equality
// inside the database instead, using migration 010's functional index.
//
// `client` is typed as the minimal structural shape this module actually
// needs — an object with an `rpc` method — rather than the full Supabase
// client. Injecting it (instead of constructing one inside this module) is
// what makes it testable with a plain object literal: this repo has no
// jsdom and no Supabase test harness, and it's the same "extract the
// decision, inject the dependency" move `loadClientPartnersRoomData` uses
// (lib/client-partners/room-data.ts).

const MAX_HANDLE_SEGMENT_LENGTH = 64

export type HandleResolution =
  | { kind: 'none' }
  | { kind: 'current'; profileId: string; handle: string }
  | { kind: 'redirect'; profileId: string; handle: string }

type ResolveProfileByHandleRow = {
  profile_id: string
  current_handle: string
  redirected: boolean
}

export interface HandleResolverClient {
  rpc(
    fn: 'resolve_profile_by_handle',
    args: { p_handle: string }
  ): Promise<{ data: ResolveProfileByHandleRow[] | null; error: unknown }>
}

/**
 * Resolves a `/u/[handle]` URL segment to a profile, case-insensitively,
 * with a fallback to a retired handle's current owner (D-07).
 *
 * Deliberately does NOT gate `raw` on `isValidHandle()` — the format rule
 * governs what may be CLAIMED, not what may be LOOKED UP. Coupling this
 * read path to it would 404 any handle that predates the rule. A malformed
 * segment simply finds nothing once it reaches the database's exact lowered
 * comparison.
 */
export async function resolveHandle(
  client: HandleResolverClient,
  raw: string
): Promise<HandleResolution> {
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_HANDLE_SEGMENT_LENGTH) {
    return { kind: 'none' }
  }

  const { data, error } = await client.rpc('resolve_profile_by_handle', { p_handle: trimmed })
  if (error || !data || data.length === 0) {
    return { kind: 'none' }
  }

  const row = data[0]
  return row.redirected
    ? { kind: 'redirect', profileId: row.profile_id, handle: row.current_handle }
    : { kind: 'current', profileId: row.profile_id, handle: row.current_handle }
}
