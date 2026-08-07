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

  const userId = created.user.id

  // Everything after createUser must land as a COMPLETE account, or none at all
  // (review finding #3): if any critical step fails, compensate by deleting the
  // just-created auth user (+ any buyer_members row). The phantom-row cleanup is
  // now fatal-on-error rather than ignored — a buyer that keeps its stray
  // user_profiles row would pass is_green_room_eligible() and could post directly.
  let actionLink: string
  try {
    // handle_new_user's buyer early-return (migration 080) cannot fire in this
    // Supabase instance (GoTrue applies app_metadata just AFTER the auth.users
    // insert), so the trigger's default artist branch creates a phantom
    // user_profiles + subscriptions row. Buyers have NO profile — remove them.
    const { error: subErr } = await service.from('subscriptions').delete().eq('user_id', userId)
    if (subErr) throw new Error(`subscriptions cleanup failed: ${subErr.message}`)
    const { error: profErr } = await service.from('user_profiles').delete().eq('id', userId)
    if (profErr) throw new Error(`user_profiles cleanup failed: ${profErr.message}`)

    // migration 080 REVOKEd INSERT on buyer_members from authenticated/anon —
    // service-role write. An auth user with the buyer role but no membership row
    // reaches nothing (the (buyer-portal) layout redirects it back to access).
    const { error: memberError } = await service.from('buyer_members').insert({
      org_id: orgId,
      user_id: userId,
      buyer_role: buyerRole,
      is_org_admin: isOrgAdmin,
      invited_by: invitedBy ?? null,
    })
    if (memberError) throw new Error(`buyer_members insert failed: ${memberError.message}`)

    const { data: link, error: linkError } = await service.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (linkError || !link?.properties?.action_link) {
      throw new Error(linkError?.message ?? 'could not generate invite link')
    }
    actionLink = link.properties.action_link
  } catch (err) {
    try {
      await service.from('buyer_members').delete().eq('user_id', userId)
    } catch {}
    try {
      await service.auth.admin.deleteUser(userId)
    } catch {}
    throw new Error(
      `Failed to create buyer account: ${err instanceof Error ? err.message : 'unknown error'}`
    )
  }

  // Past this point the account is complete + valid — email delivery is best-effort
  // (sendEmail() no-ops with { ok: false } when Resend isn't configured) and never
  // rolls back the account. WR-04: surface delivery failure to the caller.
  const { subject, html } = buyerInviteEmail({ displayName, actionLink })
  const { ok: emailSent } = await sendEmail({ to: email, subject, html })

  return { userId, emailSent }
}
