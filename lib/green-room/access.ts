import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────
// Green Room account-type access gate (Plan 28-02, INDUSTRY-02 / INDUSTRY-07)
//
// The Green Room has never had an account-type gate (RESEARCH Summary #2):
// every route checked only `if (!user)`, and the RLS insert policy was
// `author_id = auth.uid()` with no member_type join. This module adds the
// APP-LAYER half of the locked access matrix (Artist ✓ / Industry ✓ / else
// ✗). The RLS backstop (defense-in-depth) is the human-gated migration in
// Plan 28-05.
//
// Source-of-truth: member_type only — matches lib/green-room/discover.ts's
// existing member_type-aware column convention and is kept in lockstep with
// capability_grants by Plans 28-01/28-05. Do NOT read capability_grants
// independently here (RESEARCH Anti-Pattern: a fourth disagreeing gate).
// ─────────────────────────────────────────────────────────────────────────

export type GreenRoomGateResult = { ok: true } | { ok: false; error: string; status: number }

/** The two account lanes admitted to the Green Room (owner-locked matrix). */
export const GREEN_ROOM_MEMBER_TYPES = ['artist', 'industry'] as const

// INERT / FORWARD-SAFE stand-in for the unshipped funun_staff table (Phase 25
// has zero runtime code — RESEARCH Runtime State Inventory). This email-domain
// heuristic blocks a Funūn-email principal from posting under the Funūn
// identity (INDUSTRY-07) and no-ops for everyone else. Replace with a
// funun_staff lookup once Phase 25 ships.
export const FUNUN_STAFF_EMAIL_DOMAINS = ['funun.studio']

/** True only when the email's domain is a known Funūn-staff domain. */
export function isFununStaffPrincipal(email: string | null | undefined): boolean {
  if (!email) return false
  const at = email.lastIndexOf('@')
  if (at === -1) return false
  const domain = email.slice(at + 1).toLowerCase()
  return FUNUN_STAFF_EMAIL_DOMAINS.includes(domain)
}

/** Ok only when memberType is one of the two admitted lanes; else 403. */
export function greenRoomViewerGate(principal: { memberType: string | null }): GreenRoomGateResult {
  if ((GREEN_ROOM_MEMBER_TYPES as readonly string[]).includes(principal.memberType ?? '')) {
    return { ok: true }
  }
  return {
    ok: false,
    error: 'The Green Room is open to Artist and Industry accounts.',
    status: 403,
  }
}

/**
 * Ok only when the viewer gate passes AND the principal is not posting under
 * a Funūn-staff email (INDUSTRY-07). A distinct message is returned for the
 * funun-email case so the UI can explain why an otherwise-valid account was
 * blocked.
 */
export function greenRoomPosterGate(principal: {
  memberType: string | null
  email: string | null
}): GreenRoomGateResult {
  const viewer = greenRoomViewerGate(principal)
  if (!viewer.ok) return viewer

  if (isFununStaffPrincipal(principal.email)) {
    return {
      ok: false,
      error: 'Funūn staff cannot post under a Funūn email — use a personal Artist or Industry account.',
      status: 403,
    }
  }

  return { ok: true }
}

/**
 * Reads the caller's member_type (user_profiles) and email (auth session).
 * Returns nulls when absent — a buyer/no-profile principal has no
 * user_profiles row and is excluded by the gates above.
 */
export async function loadGreenRoomPrincipal(
  supabase: SupabaseClient,
  userId: string
): Promise<{ memberType: string | null; email: string | null }> {
  const [{ data: profile }, { data: authData }] = await Promise.all([
    supabase.from('user_profiles').select('member_type').eq('id', userId).maybeSingle(),
    supabase.auth.getUser(),
  ])

  return {
    memberType: (profile as { member_type: string } | null)?.member_type ?? null,
    email: authData.user?.email ?? null,
  }
}
