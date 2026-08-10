import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Admin account-provisioning intent (Phase 27 corrective, migration 104) ──
// Non-artist accounts (buyer/staff/industry/curator) are created via
// service-role admin.createUser(). Because THIS Supabase instance applies
// app_metadata AFTER the auth.users INSERT, handle_new_user()'s
// role/staff_role branches cannot fire at INSERT time — every admin-created
// account falls through to the default (artist) branch, where migrations
// 098/099's invite gate would RAISE 'not_invited' and abort createUser()
// (the 27-11 live-cutover regression).
//
// migration 104's gate exempts such an account only when it sees BOTH: (1) a
// matching, unexpired row in account_provision_intents — a service-role-only
// table anon/authenticated cannot read or write — consumed by the row's
// unguessable id, AND (2) the account being email-confirmed at INSERT.
//
// This module owns signal (1) as a SINGLE-USE, ATTEMPT-BOUND capability
// (27-CODEX-REVIEW follow-up HIGH-1): it generates a fresh random id, inserts
// the intent row under that id BEFORE createUser(), passes the id back through
// user_metadata.provision_intent (user_metadata IS visible to the trigger at
// INSERT), and clears exactly that row by id afterward. A stale row (helper
// crash / failed cleanup) is inert — its id is unguessable and the trigger
// rejects it once expired (expires_at, migration 104) — so it is NOT a
// reusable credential. A self-serve artist signup calls supabase.auth.signUp()
// (anon) and never gets an intent id, so the gate applies to it normally.

const PROVISION_INTENTS_TABLE = 'account_provision_intents'

type CreateUserAttrs = Parameters<SupabaseClient['auth']['admin']['createUser']>[0]
type CreateUserResult = Awaited<ReturnType<SupabaseClient['auth']['admin']['createUser']>>

/**
 * Runs `service.auth.admin.createUser(attrs)` bracketed by a single-use
 * provision-intent so migration 104's gate exempts the admin-created account
 * from the artist invite gate. The intent's random id is generated here,
 * inserted before createUser(), passed to the trigger via
 * user_metadata.provision_intent, and cleared by that exact id afterward.
 *
 * The intent INSERT MUST succeed for the exemption to work, so a failure here
 * throws rather than letting createUser() proceed into a confusing
 * 'not_invited' rejection. The email is normalized (trim + lower) for BOTH the
 * intent row and the createUser call so the trigger's LOWER(email) match is
 * exact regardless of how it was passed in.
 */
export async function createUserWithProvisionIntent(
  service: SupabaseClient,
  attrs: CreateUserAttrs & { email: string }
): Promise<CreateUserResult> {
  const email = attrs.email.trim().toLowerCase()
  const intentId = randomUUID()

  const { error: intentError } = await service
    .from(PROVISION_INTENTS_TABLE)
    .insert({ id: intentId, email })
  if (intentError) {
    throw new Error(
      `Could not register account-provisioning intent: ${intentError.message}`
    )
  }

  try {
    return await service.auth.admin.createUser({
      ...attrs,
      email,
      user_metadata: { ...(attrs.user_metadata ?? {}), provision_intent: intentId },
    })
  } finally {
    // Best-effort cleanup of THIS attempt's row, BY ID (never by email — that
    // could delete a concurrent attempt's intent for the same email). On the
    // success path the trigger already consumed the row, so this is a no-op.
    // This is deliberately best-effort, NOT fail-the-account-on-cleanup-miss: a
    // lingering row is inert — its id is unguessable and it expires (migration
    // 104), so it is not a reusable credential — and there is no logging
    // convention in this codebase to route a cleanup error to. If this delete
    // does not land, the row is left to its TTL. (Durable telemetry for
    // cleanup misses is a tracked follow-up, not a gate bypass.)
    try {
      await service.from(PROVISION_INTENTS_TABLE).delete().eq('id', intentId)
    } catch {
      // network-level throw — same rationale: the row is inert (id + expiry)
    }
  }
}
