import type { SupabaseClient } from '@supabase/supabase-js'
import { isValidVerificationAdminAction, type VerificationAdminAction } from './contracts'

// ─────────────────────────────────────────────────────────────────────────
// Verified-badge admin grant/revoke (SAFETY-03, Plan 13-05 Task 1)
//
// Every function here assumes the caller has already run verifyAdmin() —
// mirrors lib/trust-safety/admin-reports.ts's split (route does the gate,
// lib does validation + data access with the already-authorized service
// client). Verified badge grant/revoke is admin-owned only — there is no
// self-serve verification request in V1 (13-UI-SPEC.md).
// ─────────────────────────────────────────────────────────────────────────

// Explicit column list — never select('*') on artist_profiles (migration
// 040 column lockdown / this plan's non-negotiable constraint). Only the
// fields the verification admin queue needs per 13-UI-SPEC.md ("Name,
// handle, roles, current verified state, last updated").
export const VERIFICATION_MEMBER_COLUMNS =
  'id, artist_name, handle, avatar_url, member_type, roles, verified, verified_at'

export type VerificationMemberRow = {
  id: string
  artist_name: string | null
  handle: string | null
  avatar_url: string | null
  member_type: 'artist' | 'industry'
  roles: unknown
  verified: boolean
  verified_at: string | null
}

export type VerificationActionInput = {
  profileId: string
  action: VerificationAdminAction
}

export type VerificationValidation<T> = { ok: true; value: T } | { ok: false; error: string }

/** Validates a PATCH /api/admin/verification/[id] body: `{ action: 'grant'|'revoke' }`. */
export function validateVerificationAction(
  body: Record<string, unknown>
): VerificationValidation<{ action: VerificationAdminAction }> {
  if (typeof body.action !== 'string' || !isValidVerificationAdminAction(body.action)) {
    return { ok: false, error: "action must be 'grant' or 'revoke'" }
  }
  return { ok: true, value: { action: body.action } }
}

/**
 * Loads members for the admin verification queue, optionally filtered by a
 * free-text search over artist_name/handle. Ordered so unverified members
 * surface first (the more common triage action), then most-recently-updated.
 */
export async function loadMembersForVerification(
  service: SupabaseClient,
  q: string | null
): Promise<VerificationMemberRow[]> {
  let query = service
    .from('artist_profiles')
    .select(VERIFICATION_MEMBER_COLUMNS)
    .order('verified', { ascending: true })
    .order('updated_at', { ascending: false })
    .limit(200)

  if (q) {
    const escaped = q.replace(/[%_]/g, m => `\\${m}`)
    query = query.or(`artist_name.ilike.%${escaped}%,handle.ilike.%${escaped}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as VerificationMemberRow[]
}

export type VerificationActionResult =
  | { ok: true; data: VerificationMemberRow }
  | { ok: false; error: string; status: number }

/**
 * Grants or revokes a profile's verified badge. Always appends a
 * verification_audit_log row (grant/revoke + actor_id) regardless of
 * whether the profile's `verified` state actually changes — an admin's
 * explicit action is audited every time it's taken, not only on state
 * transitions (mirrors 13-01's decision that a single verified_at column
 * can't capture repeated actions; the log is the full history).
 */
export async function grantOrRevokeVerification(
  service: SupabaseClient,
  profileId: string,
  action: VerificationAdminAction,
  actorId: string
): Promise<VerificationActionResult> {
  const { data: existing, error: fetchError } = await service
    .from('artist_profiles')
    .select('id')
    .eq('id', profileId)
    .maybeSingle()

  if (fetchError) return { ok: false, error: fetchError.message, status: 500 }
  if (!existing) return { ok: false, error: 'Profile not found', status: 404 }

  const verifiedAt = new Date().toISOString()

  const { error: updateError } = await service
    .from('artist_profiles')
    .update({ verified: action === 'grant', verified_at: verifiedAt })
    .eq('id', profileId)

  if (updateError) return { ok: false, error: updateError.message, status: 500 }

  const { error: auditError } = await service
    .from('verification_audit_log')
    .insert({ profile_id: profileId, action, actor_id: actorId })

  if (auditError) return { ok: false, error: auditError.message, status: 500 }

  const { data: updated, error: reloadError } = await service
    .from('artist_profiles')
    .select(VERIFICATION_MEMBER_COLUMNS)
    .eq('id', profileId)
    .maybeSingle()

  if (reloadError) return { ok: false, error: reloadError.message, status: 500 }
  if (!updated) return { ok: false, error: 'Profile not found', status: 404 }
  return { ok: true, data: updated as VerificationMemberRow }
}
