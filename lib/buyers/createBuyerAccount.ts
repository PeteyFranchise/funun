import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { buyerInviteEmail } from '@/lib/email/buyerInvite'
import type { BuyerRole } from './schema'

/** Thrown when the invite email already belongs to an existing auth.users row (mirrors createIndustryMember's WR-03 discipline). */
export class DuplicateBuyerAccountError extends Error {}

// ─── createBuyerAccount (D-11/D-12/D-13) ───────────────────────────────────
// Standalone, reusable helper modelled line-for-line on
// lib/industry/createIndustryMember.ts, with one critical divergence: buyers
// follow the CURATOR early-return precedent, so this helper must NEVER
// expect or create a user_profiles row — migration 080's handle_new_user()
// buyer branch returns early with no user_profiles/subscriptions insert.
//
// app_metadata.role='buyer' MUST be set atomically inside
// service.auth.admin.createUser() (never a post-insert UPDATE) so the
// trigger's buyer branch fires in the same transaction with no phantom-row
// race — the bug class this repo has already fixed twice (RESEARCH
// Pitfall 1 / Pattern 2). display_name plus the org id and buyer tier are
// passed through user_metadata for downstream display.
export async function createBuyerAccount(input: {
  email: string
  displayName: string
  orgId: string
  buyerRole: BuyerRole
  isOrgAdmin: boolean
  invitedBy?: string
}): Promise<{ userId: string; emailSent: boolean }> {
  const { email, displayName, orgId, buyerRole, isOrgAdmin, invitedBy } = input
  const service = createServiceClient()

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role: 'buyer' },
    user_metadata: {
      display_name: displayName,
      org_id: orgId,
      buyer_role: buyerRole,
      is_org_admin: isOrgAdmin,
      invited_by: invitedBy ?? null,
    },
  })

  if (createError || !created?.user) {
    // WR-03 (mirrored): distinguish "email already exists" (true duplicate)
    // from any other createUser failure (network error, bad key, Supabase
    // outage) — throwing DuplicateBuyerAccountError for ALL errors would
    // report a transient outage to the admin as "already invited".
    if (createError?.code === 'email_exists' || createError?.status === 422) {
      throw new DuplicateBuyerAccountError(
        createError?.message ?? 'This email has already been invited.'
      )
    }
    throw new Error(
      `Failed to create buyer account: ${createError?.message ?? 'unknown error'}`
    )
  }

  // migration 080 REVOKEd INSERT on buyer_members from authenticated/anon —
  // this write must go through the service-role client. Must succeed before
  // the auth user is treated as usable: an auth user carrying the buyer role
  // with no membership row would reach nothing (the (buyer-portal) layout's
  // membership check redirects it back to the access page).
  const { error: memberError } = await service.from('buyer_members').insert({
    org_id: orgId,
    user_id: created.user.id,
    buyer_role: buyerRole,
    is_org_admin: isOrgAdmin,
    invited_by: invitedBy ?? null,
  })
  if (memberError) {
    throw new Error(`Failed to create buyer account: ${memberError.message}`)
  }

  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkError || !link?.properties?.action_link) {
    throw new Error(
      `Failed to create buyer account: ${linkError?.message ?? 'could not generate invite link'}`
    )
  }

  // Custom Resend invite email — NOT Supabase's built-in invite template.
  // sendEmail() no-ops safely if Resend isn't configured (returns
  // { ok: false }). WR-04 (mirrored): surface delivery failure to the caller
  // instead of silently discarding it so the route can warn the admin.
  const { subject, html } = buyerInviteEmail({
    displayName,
    actionLink: link.properties.action_link,
  })
  const { ok: emailSent } = await sendEmail({ to: email, subject, html })

  return { userId: created.user.id, emailSent }
}
