import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { existingClientPartnerInviteEmail } from '@/lib/email/existingClientPartnerInvite'
import { createBuyerAccount, DuplicateBuyerAccountError } from './createBuyerAccount'
import type { BuyerRole } from './schema'

export type AddClientPartnerMemberResult = {
  userId: string
  emailSent: boolean
  existingAccount: boolean
}

export class IncompatibleClientPartnerIdentityError extends Error {}

/**
 * Adds a person to one Client Partner organization without treating
 * `app_metadata.role = buyer` as their permanent identity.
 *
 * An existing Member keeps their profile, subscription, catalogue, and login;
 * buyer_members adds a second workspace relationship. A genuinely new person
 * still uses the established buyer-only provisioning path.
 *
 * Multi-org switching is not live yet. Until every buyer route resolves an
 * active organization context, an identity that already has any buyer_members
 * row is refused rather than silently creating a second unusable membership.
 */
export async function addClientPartnerMember(input: {
  email: string
  displayName: string
  organizationName: string
  orgId: string
  buyerRole: BuyerRole
  isOrgAdmin: boolean
  invitedBy?: string
  service?: SupabaseClient
}): Promise<AddClientPartnerMemberResult> {
  const email = input.email.trim().toLowerCase()
  const service = input.service ?? createServiceClient()
  const { data: existingUserId, error: lookupError } = await service.rpc(
    'find_auth_user_id_by_email',
    { p_email: email }
  )

  if (lookupError) {
    throw new Error('Could not check the existing Funūn identity')
  }

  if (typeof existingUserId === 'string' && existingUserId) {
    const { data: staffIdentity, error: staffLookupError } = await service
      .from('funun_staff')
      .select('id')
      .eq('user_id', existingUserId)
      .maybeSingle()
    if (staffLookupError) {
      throw new Error('Could not verify the Funūn identity class')
    }
    if (staffIdentity) {
      throw new IncompatibleClientPartnerIdentityError(
        'Funūn Team Member identities cannot join Client Partner organizations.'
      )
    }

    const { data: existingMembership, error: membershipLookupError } = await service
      .from('buyer_members')
      .select('id, org_id')
      .eq('user_id', existingUserId)
      .limit(1)
      .maybeSingle()

    if (membershipLookupError) {
      throw new Error('Could not check Client Partner membership')
    }
    if (existingMembership) {
      throw new DuplicateBuyerAccountError(
        existingMembership.org_id === input.orgId
          ? 'This account already belongs to this Client Partner organization.'
          : 'This account already belongs to a Client Partner organization.'
      )
    }

    const { error: memberError } = await service.from('buyer_members').insert({
      org_id: input.orgId,
      user_id: existingUserId,
      buyer_role: input.buyerRole,
      is_org_admin: input.isOrgAdmin,
      invited_by: input.invitedBy ?? null,
    })
    if (memberError) throw new Error('Could not add the existing Funūn account')

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
    const { subject, html } = existingClientPartnerInviteEmail({
      displayName: input.displayName,
      organizationName: input.organizationName,
      destination: `${appUrl}/sync/catalog`,
    })
    const { ok: emailSent } = await sendEmail({ to: email, subject, html })

    return { userId: existingUserId, emailSent, existingAccount: true }
  }

  const created = await createBuyerAccount({
    email,
    displayName: input.displayName,
    orgId: input.orgId,
    buyerRole: input.buyerRole,
    isOrgAdmin: input.isOrgAdmin,
    invitedBy: input.invitedBy,
  })
  return { ...created, existingAccount: false }
}
