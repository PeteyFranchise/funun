import { createServiceClient } from '@/lib/supabase/server'
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
// app_metadata.role='industry' MUST be set atomically inside admin.createUser()
// (never a post-insert UPDATE) — mirrors the curator-claim precedent so
// handle_new_user()'s industry branch (migration 039) fires in the same
// transaction and builds a real artist_profiles row + free subscription,
// with no phantom-row race (RESEARCH Pitfall 2/3). This function does NOT
// insert into artist_profiles or subscriptions itself — the trigger owns
// those, reading role_badges and profile_roles back out of user_metadata.
export async function provisionIndustryAccount(input: {
  email: string
  displayName: string
  roleSlugs: string[]
  invitedBy?: string
}): Promise<{ userId: string }> {
  const { email, displayName, roleSlugs, invitedBy } = input
  const service = createServiceClient()
  const profileRoles = mapSlugsToProfileRoles(roleSlugs)

  const { data: created, error: createError } = await service.auth.admin.createUser({
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
    // Best-effort compensation: remove the auth user (its trigger-created
    // user_profiles row cascades via the auth.users FK) so no half-provisioned
    // industry account is left behind.
    try {
      await service.auth.admin.deleteUser(userId)
    } catch {}
    throw new Error(
      `Failed to provision industry account: ${err instanceof Error ? err.message : 'unknown error'}`
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
    throw new Error(
      `Failed to create industry member: ${linkError?.message ?? 'could not generate invite link'}`
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
