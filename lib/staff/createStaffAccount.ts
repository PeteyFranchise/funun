import { createServiceClient } from '@/lib/supabase/server'
import { createUserWithProvisionIntent } from '@/lib/accounts/provisionIntent'
import { sendEmail } from '@/lib/email'
import { staffInviteEmail } from '@/lib/email/staffInvite'
import { primaryStaffRole, type StaffRole } from '@/lib/admin/gate'

/** Thrown when the invite email already belongs to an existing auth.users row (mirrors createBuyerAccount's WR-03 discipline). */
export class DuplicateStaffAccountError extends Error {}

// ─── createStaffAccount (Phase 25, D-01/D-02/D-04) ─────────────────────────
// Standalone, reusable helper modelled line-for-line on
// lib/buyers/createBuyerAccount.ts. handle_new_user()'s staff branch is keyed
// on app_metadata.staff_role, but on THIS Supabase app_metadata is applied
// AFTER the auth.users INSERT (see migration 104), so that branch never fires
// at INSERT — a new staff signup runs the DEFAULT (artist) branch, which
// creates a phantom user_profiles + subscriptions row this helper cleans up
// below. What actually admits the account past migration 104's artist invite
// gate is the account_provision_intents row that createUserWithProvisionIntent
// writes, NOT the staff_role branch. The phantom-row
// cleanup below is therefore load-bearing, not a defensive no-op.
//
// app_metadata.staff_role is still set atomically inside createUser() (never a
// post-insert UPDATE) so requireStaff() trusts it and the defense-in-depth
// staff branch is correct if a future GoTrue ever exposes app_metadata at
// INSERT — mirrors every other account-creation helper in this repo.
export async function createStaffAccount(input: {
  email: string
  displayName: string
  staffRoles: StaffRole[]
  invitedBy?: string
}): Promise<{ userId: string; emailSent: boolean }> {
  const { email, displayName, staffRoles, invitedBy } = input
  // staff_role is the PRIMARY (highest-priority) display copy that must
  // accompany the authoritative staff_roles set (migration 119 / 089 rule).
  const primary = primaryStaffRole(staffRoles)
  if (!primary) throw new Error('createStaffAccount: at least one valid staff role is required')
  const service = createServiceClient()

  // createUserWithProvisionIntent registers a service-role-only
  // account_provision_intents row around createUser() so migration 105's gate
  // exempts this staff account. app_metadata.staff_role is not visible to the
  // trigger at INSERT on this Supabase (applied after), so the staff branch
  // cannot fire; the intent's unguessable id (carried in user_metadata) is what
  // admits the account. email_confirm:true is passed for the account's own
  // confirmation, not the gate (email_confirmed_at is not visible at INSERT — 27-13).
  const { data: created, error: createError } = await createUserWithProvisionIntent(service, {
    email,
    email_confirm: true,
    app_metadata: { staff_roles: staffRoles, staff_role: primary },
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
    // handle_new_user()'s staff branch can't fire at INSERT on this Supabase
    // (app_metadata applied post-INSERT, migration 104), so the default branch
    // creates a phantom user_profiles + subscriptions row for every new staff
    // signup — these deletes are load-bearing, not a no-op. Staff have NO
    // artist profile; a lingering user_profiles row would even make the account
    // wrongly Green-Room-eligible, so a cleanup error stays fatal rather than
    // ignored.
    const { error: subErr } = await service.from('subscriptions').delete().eq('user_id', userId)
    if (subErr) throw new Error(`subscriptions cleanup failed: ${subErr.message}`)
    const { error: profErr } = await service.from('user_profiles').delete().eq('id', userId)
    if (profErr) throw new Error(`user_profiles cleanup failed: ${profErr.message}`)

    // migration 089 REVOKEd INSERT on funun_staff from authenticated/anon — this
    // write goes through the service role. funun_staff has no invited_by column.
    const { error: staffError } = await service.from('funun_staff').insert({
      user_id: userId,
      staff_role: primary,
      staff_roles: staffRoles,
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
    // Compensation (HIGH-3, 27-CODEX-REVIEW follow-up): requireStaff() trusts
    // app_metadata.staff_role, so a failed cleanup that leaves the auth user
    // behind is a TRUSTED ghost principal, not an inert row. Clear the role
    // FIRST (so even a later delete failure leaves nothing privileged), then
    // remove the directory + auth rows. cleanupFailed tracks the AUTHORITATIVE
    // results (role-clear + auth delete) — a miss on either surfaces as "manual
    // intervention required" instead of a clean-looking failure. The funun_staff
    // delete is best-effort and intentionally NOT folded in: it is
    // non-authoritative AND its auth.users FK is ON DELETE CASCADE, so a
    // successful auth delete removes it regardless — folding it in would raise a
    // false alarm on the common path where deleteUser succeeds and cascades it.
    let cleanupFailed = false
    try {
      const { error: roleErr } = await service.auth.admin.updateUserById(userId, {
        app_metadata: { staff_role: null, staff_roles: null },
      })
      if (roleErr) cleanupFailed = true
    } catch {
      cleanupFailed = true
    }
    try {
      await service.from('funun_staff').delete().eq('user_id', userId)
    } catch {
      // best-effort; cascaded by the auth deleteUser below (ON DELETE CASCADE)
    }
    try {
      const { error: delErr } = await service.auth.admin.deleteUser(userId)
      if (delErr) cleanupFailed = true
    } catch {
      cleanupFailed = true
    }
    if (cleanupFailed) {
      throw new Error(
        `Failed to create staff account for ${email}, and cleanup did NOT complete — ` +
          `an auth user carrying app_metadata.staff_role may still exist and must be ` +
          `removed manually. Cause: ${err instanceof Error ? err.message : 'unknown error'}`
      )
    }
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
