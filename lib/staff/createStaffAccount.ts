import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { staffInviteEmail } from '@/lib/email/staffInvite'
import type { StaffRole } from '@/lib/admin/gate'

/** Thrown when the invite email already belongs to an existing auth.users row (mirrors createBuyerAccount's WR-03 discipline). */
export class DuplicateStaffAccountError extends Error {}

// ─── createStaffAccount (Phase 25, D-01/D-02/D-04) ─────────────────────────
// Standalone, reusable helper modelled line-for-line on
// lib/buyers/createBuyerAccount.ts, with one critical divergence:
// migrations 086-098 shipped handle_new_user() with NO staff branch — a new
// staff account fell through to the default artist branch, inserting a
// phantom user_profiles + subscriptions row and running
// claim_collaborators() (and, once migration 098's invite gate went live,
// getting REJECTED outright by it — 27-CODEX-REVIEW.md B1). Migration 099
// adds a native staff early-return branch keyed on app_metadata.staff_role,
// which this function sets atomically inside createUser() below, so as of
// 099 the phantom-row cleanup further down never actually fires (the
// trigger no longer creates those rows for a staff signup). It is left in
// place as a defensive no-op: it costs nothing when there is nothing to
// clean up, and keeps this helper correct for the window before 099 is
// pushed, or if Layer 3 of docs/BREAK-GLASS.md is ever used to temporarily
// revert the gate (which also reverts the staff branch).
//
// app_metadata.staff_role MUST be set atomically inside
// service.auth.admin.createUser() (never a post-insert UPDATE) — RESEARCH's
// Anti-Pattern, mirrors every other account-creation helper in this repo.
export async function createStaffAccount(input: {
  email: string
  displayName: string
  staffRole: StaffRole
  invitedBy?: string
}): Promise<{ userId: string; emailSent: boolean }> {
  const { email, displayName, staffRole, invitedBy } = input
  const service = createServiceClient()

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { staff_role: staffRole },
    user_metadata: {
      display_name: displayName,
      invited_by: invitedBy ?? null,
    },
  })

  if (createError || !created?.user) {
    // WR-03 (mirrored): distinguish "email already exists" (true duplicate)
    // from any other createUser failure (network error, bad key, Supabase
    // outage) — throwing DuplicateStaffAccountError for ALL errors would
    // report a transient outage to leadership as "already invited".
    if (createError?.code === 'email_exists' || createError?.status === 422) {
      throw new DuplicateStaffAccountError(
        createError?.message ?? 'This email has already been invited.'
      )
    }
    throw new Error(
      `Failed to create staff account: ${createError?.message ?? 'unknown error'}`
    )
  }

  const userId = created.user.id

  // Everything after createUser must land as a COMPLETE account, or none at all
  // (review finding #3). If any critical step fails we compensate by deleting the
  // just-created auth user (+ any funun_staff row) — otherwise a partial "ghost"
  // account is left behind: an auth user carrying app_metadata.staff_role that
  // requireStaff() still trusts, with no directory row. Errors that were silently
  // ignored before (the phantom-row cleanup, the invite-link generation) are now
  // fatal-with-rollback.
  let actionLink: string
  try {
    // Pre-migration-099, handle_new_user's default branch had no staff early
    // return, so it fired for every new staff auth user — creating a phantom
    // user_profiles + subscriptions row. Migration 099 adds a native staff
    // branch that RETURNs NEW before any insert, so these deletes are now a
    // defensive no-op (nothing to clean up) once 099 is live — kept for the
    // window before it's pushed and for the Layer-3 gate-revert case
    // (docs/BREAK-GLASS.md). Staff have NO artist profile; a lingering
    // user_profiles row would even make the account wrongly Green-Room-
    // eligible, so a cleanup error (on the rare path where it still applies)
    // stays fatal rather than ignored.
    const { error: subErr } = await service.from('subscriptions').delete().eq('user_id', userId)
    if (subErr) throw new Error(`subscriptions cleanup failed: ${subErr.message}`)
    const { error: profErr } = await service.from('user_profiles').delete().eq('id', userId)
    if (profErr) throw new Error(`user_profiles cleanup failed: ${profErr.message}`)

    // migration 089 REVOKEd INSERT on funun_staff from authenticated/anon — this
    // write goes through the service role. funun_staff has no invited_by column.
    const { error: staffError } = await service.from('funun_staff').insert({
      user_id: userId,
      staff_role: staffRole,
      display_name: displayName,
    })
    if (staffError) throw new Error(`funun_staff insert failed: ${staffError.message}`)

    const { data: link, error: linkError } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (linkError || !link?.properties?.action_link) {
      throw new Error(linkError?.message ?? 'could not generate invite link')
    }
    actionLink = link.properties.action_link
  } catch (err) {
    // Best-effort compensation so a retry starts clean and no ghost principal remains.
    try {
      await service.from('funun_staff').delete().eq('user_id', userId)
    } catch {}
    try {
      await service.auth.admin.deleteUser(userId)
    } catch {}
    throw new Error(
      `Failed to create staff account: ${err instanceof Error ? err.message : 'unknown error'}`
    )
  }

  // Past this point the account is complete + valid — email delivery is best-effort
  // (sendEmail() no-ops with { ok: false } when Resend isn't configured) and never
  // rolls back the account. WR-04: surface delivery failure to the caller.
  const { subject, html } = staffInviteEmail({ displayName, actionLink })
  const { ok: emailSent } = await sendEmail({ to: email, subject, html })

  return { userId, emailSent }
}
