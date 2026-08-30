// ─── The handle gate decision (D-09, D-10, D-10b) ─────────────────────────
// The rule, in one sentence: the gate exists to collect a handle from someone
// who SHOULD have one, and an absent profile row means "not my business",
// never "block".
//
// Pure and dependency-free, in the same spirit as lib/handles/validate.ts —
// the decision is separated from the layout so it can be machine-verified for
// identities that are hard to construct in a running app (a Team Member, a
// Client Partner). See lib/handles/gate.test.ts.

export interface HandleGateUser {
  id: string
}

export interface HandleGateProfile {
  handle: string | null
}

/**
 * True only when a signed-in identity OWNS a `user_profiles` row and that
 * row has no usable handle.
 *
 * The `profile !== null` test is LOAD-BEARING, not a defensive nicety. Only
 * a User Account (Artist or Industry) has a `user_profiles` row: a Team
 * Member's identity lives in `funun_staff`, and `handle_new_user()` returns
 * early for `app_metadata.role = 'buyer'` before any profile insert, so a
 * Client Partner has no row either (docs/architecture/ACCOUNT-TYPES.md).
 * `null` is therefore the STRUCTURAL signal for "not a User Account".
 *
 * Anything that reduces this to a truthiness check on the user — gating on
 * "is authenticated" — is the D-10 trap: it locks staff out of the admin
 * console and buyers out of the catalogue, and it passes every test written
 * with an artist account.
 */
export function shouldGateForHandle(input: {
  user: HandleGateUser | null
  profile: HandleGateProfile | null
}): boolean {
  const { user, profile } = input
  if (!user) return false
  if (profile === null) return false
  // A NULL column, an empty string and a whitespace-only string are all
  // "no handle" — the format authority in lib/handles/validate.ts would
  // reject every one of them, so none of them is a public identity.
  return (profile.handle ?? '').trim().length === 0
}

/**
 * Resolves the gate for a request, returning `renderGate(user.id)` only when
 * the account genuinely needs to pick a handle, and `null` otherwise.
 *
 * Both the profile loader and the renderer are INJECTED. That is what lets
 * the test prove the gate is not merely `false` for a Team Member or a
 * Client Partner but is genuinely never CONSTRUCTED for them — the same
 * never-called shape lib/admin/gate.test.ts uses for leadership-only
 * loaders. It also keeps this module free of any Supabase or React import,
 * so the decision stays testable under `testEnvironment: 'node'`.
 *
 * With no session it short-circuits without touching `loadProfile` at all —
 * an unauthenticated render owes the database nothing.
 */
export async function resolveHandleGate<T>(input: {
  user: HandleGateUser | null
  loadProfile: (userId: string) => Promise<HandleGateProfile | null>
  renderGate: (userId: string) => T
}): Promise<T | null> {
  const { user, loadProfile, renderGate } = input
  if (!user) return null

  const profile = await loadProfile(user.id)
  if (!shouldGateForHandle({ user, profile })) return null

  return renderGate(user.id)
}
