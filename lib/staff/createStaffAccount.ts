import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { staffInviteEmail } from '@/lib/email/staffInvite'
import type { StaffRole } from '@/lib/admin/gate'

/** Thrown when the invite email already belongs to an existing auth.users row (mirrors createBuyerAccount's WR-03 discipline). */
export class DuplicateStaffAccountError extends Error {}

// ─── createStaffAccount (Phase 25, D-01/D-02/D-04) ─────────────────────────
// Standalone, reusable helper modelled line-for-line on
// lib/buyers/createBuyerAccount.ts, with one critical divergence:
// handle_new_user() (migration 086) has NO staff branch — a new staff
// account falls through to the default artist branch, inserting a phantom
// user_profiles + subscriptions row and running claim_collaborators(). Staff
// are a fully separate principal type with NO artist profile, so this helper
// reconciles that below (same pattern createBuyerAccount already uses for
// the identical buyer-branch-timing gap).
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

  // handle_new_user's default branch (migration 086) has no staff early
  // return, so it fires for every new staff auth user — creating a phantom
  // user_profiles + subscriptions row and running claim_collaborators().
  // Staff accounts are a fully separate account type with NO artist profile
  // (mirrors createBuyerAccount.ts's identical buyer-branch-timing
  // reconciliation), so remove them here via the service role. Idempotent:
  // a no-op if a future migration ever adds a staff early-return branch.
  await service.from('subscriptions').delete().eq('user_id', created.user.id)
  await service.from('user_profiles').delete().eq('id', created.user.id)

  // migration 089 REVOKEd INSERT on funun_staff from authenticated/anon —
  // this write must go through the service-role client. Must succeed before
  // the auth user is treated as usable: an auth user carrying a staff role
  // with no funun_staff row would list nowhere in Team Member surfaces.
  // funun_staff has no invited_by column (migration 089) — omitted here.
  const { error: staffError } = await service.from('funun_staff').insert({
    user_id: created.user.id,
    staff_role: staffRole,
    display_name: displayName,
  })
  if (staffError) {
    throw new Error(`Failed to create staff account: ${staffError.message}`)
  }

  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !link?.properties?.action_link) {
    throw new Error(
      `Failed to create staff account: ${linkError?.message ?? 'could not generate invite link'}`
    )
  }

  // Custom Resend invite email — NOT Supabase's built-in invite template.
  // sendEmail() no-ops safely if Resend isn't configured (returns
  // { ok: false }). WR-04 (mirrored): surface delivery failure to the caller
  // instead of silently discarding it so the route can warn leadership.
  const { subject, html } = staffInviteEmail({
    displayName,
    actionLink: link.properties.action_link,
  })
  const { ok: emailSent } = await sendEmail({ to: email, subject, html })

  return { userId: created.user.id, emailSent }
}
