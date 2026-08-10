import { createServiceClient } from '@/lib/supabase/server'
import { createUserWithProvisionIntent } from '@/lib/accounts/provisionIntent'
import { sendEmail } from '@/lib/email'
import { industryInviteEmail } from '@/lib/email/industryInvite'
import { mapSlugsToProfileRoles } from './roleMapping'

/** Thrown when the invite email already belongs to an existing auth.users row (T-08-20). */
export class DuplicateIndustryMemberError extends Error {}

// ─── provisionIndustryAccount (INDUSTRY-04) ───────────────────────────────
// Shared account-creation primitive extracted from createIndustryMember() so
// any caller that needs its own invite/welcome email copy (e.g. the curator
// claim route, app/api/curators/claim/[token]/route.ts) can create the
// account without triggering createIndustryMember()'s cold-invite email
// (RESEARCH Pitfall 4 — calling the higher-level function wholesale would
// double-send / send the wrong copy). Account creation ONLY — no
// generateLink, no sendEmail. Enabling substrate for a future community/
// Team-Member industry invite (INDUSTRY-03).
//
// app_metadata.role='industry' is set atomically inside admin.createUser()
// (never a post-insert UPDATE) as defense in depth, but on THIS Supabase
// app_metadata is applied AFTER the auth.users INSERT (migration 104), so
// handle_new_user()'s industry branch (migration 039) does NOT fire at INSERT —
// the default (artist) branch creates a plain user_profiles row that this
// function's reconciliation below UPGRADES to industry (member_type + roles +
// capability grant). What admits the account past the artist invite gate is the
// account_provision_intents token createUserWithProvisionIntent writes (plus
// email_confirm:true); role_badges/profile_roles ride in user_metadata.
export async function provisionIndustryAccount(input: {
  email: string
  displayName: string
  roleSlugs: string[]
  invitedBy?: string
}): Promise<{ userId: string }> {
  const { email, displayName, roleSlugs, invitedBy } = input
  const service = createServiceClient()
  const profileRoles = mapSlugsToProfileRoles(roleSlugs)

  // createUserWithProvisionIntent registers a service-role-only
  // account_provision_intents row around createUser() so migration 104's gate
  // exempts this account. app_metadata.role='industry' is not visible to the
  // trigger at INSERT on this Supabase (applied after), so the industry branch
  // cannot fire and the account falls through to the gated artist branch (then
  // this function's reconciliation upgrades it) — the intent + email_confirm:
  // true are what admit it. Also covers the curator-claim path, which mints
  // its account through provisionIndustryAccount().
  const { data: created, error: createError } = await createUserWithProvisionIntent(service, {
    email,
    email_confirm: true,
    app_metadata: { role: 'industry' },
    user_metadata: {
      display_name: displayName,
      role_badges: roleSlugs,
      profile_roles: profileRoles,
      invited_by: invitedBy ?? null,
    },
  })

  if (createError || !created?.user) {
    // WR-03: distinguish "email already exists" (true duplicate) from any
    // other createUser failure (network error, bad key, Supabase outage).
    // Throwing DuplicateIndustryMemberError for ALL errors caused callers
    // to report "already invited" on transient failures, with no path for
    // the caller to discover the truth.
    if (createError?.code === 'email_exists' || createError?.status === 422) {
      throw new DuplicateIndustryMemberError(
        createError?.message ?? 'This email has already been invited.'
      )
    }
    throw new Error(
      `Failed to create industry member: ${createError?.message ?? 'unknown error'}`
    )
  }

  const userId = created.user.id

  // Same trigger-timing reconciliation as createBuyerAccount: handle_new_user
  // could not see app_metadata.role='industry' at INSERT time, so it ran the
  // default artist branch — a member_type='artist' profile with NO industry
  // capability grant. Correct both via the service role. These steps must land
  // as a complete industry account or NONE — every result is now checked and any
  // failure compensates by deleting the just-created auth user, so this can never
  // return success while member_type is still 'artist' or the grant is missing
  // (review finding #3).
  try {
    const { error: updateErr } = await service
      .from('user_profiles')
      .update({
        member_type: 'industry',
        artist_name: displayName,
        industry_roles: roleSlugs,
        roles: profileRoles,
      })
      .eq('id', userId)
    if (updateErr) throw new Error(`user_profiles industry update failed: ${updateErr.message}`)

    // Idempotent industry capability grant: capability_grants_active_uniq is a
    // partial unique index, so a plain insert could 23505 on re-run (or if a
    // future GoTrue makes the trigger's industry branch fire and grant first).
    // Guard with a NOT-EXISTS check, mirroring migration 085's backfill idempotency.
    const { data: existingGrant, error: lookupErr } = await service
      .from('capability_grants')
      .select('id')
      .eq('profile_id', userId)
      .eq('capability', 'industry')
      .eq('status', 'approved')
      .maybeSingle()
    if (lookupErr) throw new Error(`capability_grants lookup failed: ${lookupErr.message}`)

    if (!existingGrant) {
      const { error: grantErr } = await service.from('capability_grants').insert({
        profile_id: userId,
        capability: 'industry',
        status: 'approved',
        role_slugs: roleSlugs,
        source: 'signup',
        decided_at: new Date().toISOString(),
      })
      if (grantErr) throw new Error(`capability_grants insert failed: ${grantErr.message}`)
    }
  } catch (err) {
    // Checked compensation (HIGH-3, 27-CODEX-REVIEW follow-up): remove the auth
    // user (its trigger-created user_profiles row + capability grant cascade
    // via the auth.users FK) so no half-provisioned industry account is left
    // behind — and inspect the result (Supabase returns { error }, doesn't
    // throw) so a cleanup that didn't land surfaces instead of a clean-looking
    // failure.
    let cleanupFailed = false
    try {
      const { error: delErr } = await service.auth.admin.deleteUser(userId)
      if (delErr) cleanupFailed = true
    } catch {
      cleanupFailed = true
    }
    throw new Error(
      cleanupFailed
        ? `Failed to provision industry account for ${email}, and cleanup did NOT complete — ` +
            `an orphaned auth user may remain and should be removed manually. ` +
            `Cause: ${err instanceof Error ? err.message : 'unknown error'}`
        : `Failed to provision industry account: ${err instanceof Error ? err.message : 'unknown error'}`
    )
  }

  return { userId }
}

// ─── createIndustryMember (D-05) ──────────────────────────────────────────
// Standalone, reusable helper — not inlined into the admin route handler —
// so a future self-serve industry signup flow can call it unchanged.
// Delegates account creation to provisionIndustryAccount(), then keeps its
// own cold-invite generateLink + sendEmail flow; external contract
// ({ userId, emailSent }) is unchanged.
export async function createIndustryMember(input: {
  email: string
  displayName: string
  roleSlugs: string[]
  invitedBy?: string
}): Promise<{ userId: string; emailSent: boolean }> {
  const { email, displayName, roleSlugs, invitedBy } = input
  const service = createServiceClient()

  const { userId } = await provisionIndustryAccount({ email, displayName, roleSlugs, invitedBy })

  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !link?.properties?.action_link) {
    // MEDIUM-3 (27-CODEX-REVIEW follow-up): the account was fully provisioned
    // above, so a bare throw would leave it complete-but-unlinked and a retry
    // would hit DuplicateIndustryMemberError. Compensate by removing it so a
    // retry starts clean; inspect the delete result and surface loudly if the
    // cleanup itself did not land.
    let cleanupFailed = false
    try {
      const { error: delErr } = await service.auth.admin.deleteUser(userId)
      if (delErr) cleanupFailed = true
    } catch {
      cleanupFailed = true
    }
    const cause = linkError?.message ?? 'could not generate invite link'
    throw new Error(
      cleanupFailed
        ? `Failed to create industry member for ${email}, and cleanup did NOT complete — ` +
            `an orphaned account may remain and should be removed manually. Cause: ${cause}`
        : `Failed to create industry member: ${cause}`
    )
  }

  // Custom Resend invite email (resolved D-03) — NOT Supabase's built-in
  // invite template. sendEmail() no-ops safely if Resend isn't configured
  // (returns { ok: false }). WR-04: surface delivery failure to the caller
  // instead of silently discarding it so the route can warn the admin.
  const { subject, html } = industryInviteEmail({
    displayName,
    actionLink: link.properties.action_link,
  })
  const { ok: emailSent } = await sendEmail({ to: email, subject, html })

  return { userId, emailSent }
}
