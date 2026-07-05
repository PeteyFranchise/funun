import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { industryInviteEmail } from '@/lib/email/industryInvite'
import { mapSlugsToProfileRoles } from './roleMapping'

/** Thrown when the invite email already belongs to an existing auth.users row (T-08-20). */
export class DuplicateIndustryMemberError extends Error {}

// ─── createIndustryMember (D-05) ──────────────────────────────────────────
// Standalone, reusable helper — not inlined into the admin route handler —
// so a future self-serve industry signup flow can call it unchanged.
//
// app_metadata.role='industry' MUST be set atomically inside admin.createUser()
// (never a post-insert UPDATE) — mirrors the curator-claim precedent
// (app/api/curators/claim/[token]/route.ts) so handle_new_user()'s industry
// branch (migration 039) fires in the same transaction and builds a real
// artist_profiles row + free subscription, with no phantom-row race
// (RESEARCH Pitfall 2/3). This function does NOT insert into artist_profiles
// or subscriptions itself — the trigger owns those, reading role_badges and
// profile_roles back out of user_metadata.
export async function createIndustryMember(input: {
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
    // Edge case (mirrors the curator route's "email already exists" branch):
    // do NOT clobber an existing account's role/profile by linking it here —
    // surface a clear duplicate error instead so the caller can return 409
    // (T-08-20). Unlike the curator flow, industry invites are not silently
    // re-linked to a pre-existing account.
    throw new DuplicateIndustryMemberError(
      createError?.message ?? 'This email has already been invited.'
    )
  }

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
  // invite template. sendEmail() no-ops safely if Resend isn't configured.
  const { subject, html } = industryInviteEmail({
    displayName,
    actionLink: link.properties.action_link,
  })
  await sendEmail({ to: email, subject, html })

  return { userId: created.user.id }
}
