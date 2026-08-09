import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Artist invite allowlist — TypeScript twin of the DB gate ────────────
// isArtistEmailAllowed() mirrors migration 098's handle_new_user() gate
// predicate exactly: EXISTS(collaborators WHERE LOWER(email)=LOWER(email))
// OR EXISTS(artist_invites WHERE LOWER(email)=LOWER(email) AND
// status='pending' AND (token_expires_at IS NULL OR token_expires_at >
// NOW())). Both sides are driven against the SAME shared scenario table
// (lib/invites/invite-fixtures.ts) to guard against drift (27-RESEARCH
// Pitfall 3) — this function's own test, and
// __tests__/migration-098-gate.test.ts, both import INVITE_ALLOWLIST_SCENARIOS.
//
// This is the "check-invite" pre-check UX read only — the real,
// unbypassable boundary lives in the DB trigger (D-02); this function must
// never be treated as the enforcement point itself.

/**
 * True when `email` is authorized to self-serve sign up as an artist:
 * either an existing collaborator row names it (D-04 — auto-allowed the
 * moment any artist adds them as a collaborator), or a pending, unexpired
 * artist_invites row matches it. Case-insensitive, trims the input.
 */
export async function isArtistEmailAllowed(service: SupabaseClient, email: string): Promise<boolean> {
  const trimmed = (email ?? '').trim()
  if (!trimmed) return false

  const { count: collaboratorCount } = await service
    .from('collaborators')
    .select('id', { count: 'exact', head: true })
    .ilike('email', trimmed)
  if ((collaboratorCount ?? 0) > 0) return true

  const nowIso = new Date().toISOString()
  const { count: inviteCount } = await service
    .from('artist_invites')
    .select('id', { count: 'exact', head: true })
    .ilike('email', trimmed)
    .eq('status', 'pending')
    .or(`token_expires_at.is.null,token_expires_at.gt.${nowIso}`)

  return (inviteCount ?? 0) > 0
}

/**
 * True when `email` already has an auth.users account. Routes through the
 * service-role-only email_has_account RPC (migration 097) — never a raw
 * auth.users query (not exposed via PostgREST) and never a session-scoped
 * client, since this must work for arbitrary emails, not just the caller's
 * own.
 */
export async function emailHasExistingAccount(service: SupabaseClient, email: string): Promise<boolean> {
  const trimmed = (email ?? '').trim()
  if (!trimmed) return false

  const { data, error } = await service.rpc('email_has_account', { p_email: trimmed })
  if (error) return false
  return data === true
}
