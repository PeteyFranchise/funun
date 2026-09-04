import { createServiceClient } from '@/lib/supabase/server'
import { createUserWithProvisionIntent } from '@/lib/accounts/provisionIntent'
import { sendEmail } from '@/lib/email'
import { buyerInviteEmail } from '@/lib/email/buyerInvite'
import type { BuyerRole } from './schema'

/** Thrown when the buyer-only provisioning path receives an existing auth identity. */
export class DuplicateBuyerAccountError extends Error {}

// ─── createBuyerAccount (D-11/D-12/D-13) ───────────────────────────────────
// Compatibility helper for a genuinely new Client Partner-only identity,
// modelled line-for-line on
// lib/industry/createIndustryMember.ts. Buyers get NO user_profiles row, but on
// THIS Supabase app_metadata is applied AFTER the auth.users INSERT (migration
// 104), so handle_new_user()'s buyer branch does NOT fire at INSERT — the
// default (artist) branch runs and creates a phantom user_profiles +
// subscriptions row this helper deletes below. What admits the account past the
// artist invite gate is the account_provision_intents token that
// createUserWithProvisionIntent writes, NOT the buyer
// branch.
//
// app_metadata.role='buyer' remains a legacy bootstrap hint set atomically inside createUser() (never
// a post-insert UPDATE) as defense in depth; the org id, buyer tier, and
// display_name ride along in user_metadata for downstream display.
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

  // createUserWithProvisionIntent writes a service-role-only
  // account_provision_intents row before createUser() and clears it after, so
  // migration 105's gate exempts this buyer from the artist invite gate. On
  // this Supabase, app_metadata is applied AFTER the auth.users INSERT, so the
  // trigger's buyer branch cannot fire and the account falls through to the
  // gated artist branch — the intent's unguessable id (carried in user_metadata)
  // is what admits it. email_confirm:true is still passed for the account's own
  // confirmation, but is NOT a gate signal (email_confirmed_at is not visible at
  // INSERT here — 27-13 diagnostic; that is why migration 105 dropped it).
  const { data: created, error: createError } = await createUserWithProvisionIntent(service, {
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

    // 23-05 Task 3 (AUTH DECISION — LOCKED, password path): a recovery-style
    // link lands the new buyer on the "set your password" step (/update-password,
    // role-aware per 23-05 Task 2) instead of an immediate passwordless session.
    // redirectTo mirrors forgot-password/page.tsx's own recovery redirectTo
    // exactly (/auth/callback?next=/update-password) so the same code-exchange
    // + role-aware-landing path handles both the reset flow and this invite.
    // Reversible on purpose: swapping `type` back to 'magiclink' (and dropping
    // redirectTo) is the entire diff required to revert to magic-link-only,
    // per this task's own directive.
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
    const { data: link, error: linkError } = await service.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${appUrl}/auth/callback?next=/update-password` },
    })
    if (linkError || !link?.properties?.action_link) {
      throw new Error(linkError?.message ?? 'could not generate invite link')
    }
    actionLink = link.properties.action_link
  } catch (err) {
    // Checked compensation (HIGH-3, 27-CODEX-REVIEW follow-up): a buyer ghost
    // is inert without a buyer_members row (the (buyer-portal) layout redirects
    // it), but a failed deleteUser still leaves an orphaned auth user — inspect
    // the result (Supabase returns { error }, doesn't throw) and surface it
    // rather than reporting a clean failure while a stray account remains.
    // cleanupFailed tracks only the AUTHORITATIVE cleanup (the auth deleteUser
    // below). The buyer_members delete is best-effort and not folded in: it is
    // non-authoritative AND cascaded by the auth delete (ON DELETE CASCADE on
    // its auth.users FK), so folding it in would false-alarm on the common path.
    let cleanupFailed = false
    try {
      await service.from('buyer_members').delete().eq('user_id', userId)
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
        `Failed to create buyer account for ${email}, and cleanup did NOT complete — ` +
          `an orphaned auth user may remain and should be removed manually. ` +
          `Cause: ${err instanceof Error ? err.message : 'unknown error'}`
      )
    }
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
