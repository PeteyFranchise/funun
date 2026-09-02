// ─── Song Passport — action-level authorization doctrine ───────────────
// Pure route helper. Callers must derive every context fact server-side from
// the authenticated user, work membership, scoped grants and source records.
// Never accept this context from a request body.

export const PASSPORT_PERMISSIONS = [
  'view_private_identity',
  'view_legal',
  'approve_composition',
  'approve_release',
  'select_master',
  'export_delivery_safe',
  'deliver_clean_master',
  'transfer_custody',
  'delete_passport',
] as const

export type PassportPermission = (typeof PASSPORT_PERMISSIONS)[number]

export const PASSPORT_AUTHORIZATION_ACTIONS = [
  'view_collaborative',
  'view_private_identity',
  'view_legal',
  'draft_creative',
  'draft_metadata',
  'confirm_own_identity',
  'confirm_own_contribution',
  'approve_composition',
  'approve_release',
  'select_master',
  'export_delivery_safe',
  'deliver_clean_master',
  'manage_members',
  'transfer_custody',
  'delete_passport',
] as const

export type PassportAuthorizationAction = (typeof PASSPORT_AUTHORIZATION_ACTIONS)[number]
export type PassportMemberTier = 'contribute' | 'administer' | null

export type PassportActorContext = {
  isWorkOwner: boolean
  memberTier: PassportMemberTier
  isIdentitySubject: boolean
  isContributionSubject?: boolean
  isReleaseController: boolean
  explicitPermissions: readonly PassportPermission[]
  isStaff: boolean
  breakGlassApproved: boolean
  hasDocumentedPurpose: boolean
}

export type PassportAuthorizationDecision =
  | { allowed: true; reason: string }
  | { allowed: false; reason: string }

const ACTION_PERMISSION: Partial<Record<PassportAuthorizationAction, PassportPermission>> = {
  view_private_identity: 'view_private_identity',
  view_legal: 'view_legal',
  approve_composition: 'approve_composition',
  approve_release: 'approve_release',
  select_master: 'select_master',
  export_delivery_safe: 'export_delivery_safe',
  deliver_clean_master: 'deliver_clean_master',
  transfer_custody: 'transfer_custody',
  delete_passport: 'delete_passport',
}

export function authorizePassportAction(
  context: PassportActorContext,
  action: PassportAuthorizationAction
): PassportAuthorizationDecision {
  const isMember = context.memberTier !== null
  const isAdministrator = context.memberTier === 'administer'
  const hasExplicitPermission = (permission: PassportPermission) =>
    context.explicitPermissions.includes(permission)
  const hasBreakGlassRead =
    context.isStaff && context.breakGlassApproved && context.hasDocumentedPurpose

  switch (action) {
    case 'view_collaborative':
      return decide(
        context.isWorkOwner || isMember || context.isIdentitySubject || context.isReleaseController || hasBreakGlassRead,
        'Work relationship permits collaborative Passport viewing',
        'A work relationship or approved staff purpose is required'
      )

    case 'view_private_identity':
      return decide(
        context.isIdentitySubject || hasExplicitPermission('view_private_identity') || hasBreakGlassRead,
        'The actor is the identity subject or holds scoped private-identity access',
        'Private identity requires self-access, an explicit grant, or approved staff break-glass'
      )

    case 'view_legal':
      return decide(
        hasExplicitPermission('view_legal') || hasBreakGlassRead,
        'The actor holds scoped legal access',
        'Legal data requires an explicit grant or approved staff break-glass'
      )

    case 'draft_creative':
      return decide(
        context.isWorkOwner || isMember,
        'Creative work access permits a draft contribution',
        'Drafting creative content requires work ownership or membership'
      )

    case 'draft_metadata':
      return decide(
        context.isWorkOwner || isMember || context.isReleaseController,
        'The actor may propose metadata without approving it',
        'Drafting metadata requires a work or release relationship'
      )

    case 'confirm_own_identity':
      return decide(
        context.isIdentitySubject,
        'The actor may confirm their own identity facts',
        'Only the identity subject may self-confirm identity facts'
      )

    case 'confirm_own_contribution':
      return decide(
        context.isContributionSubject === true,
        'The actor may confirm their own contribution',
        'Only the contribution subject may self-confirm that contribution'
      )

    case 'approve_release':
    case 'select_master':
    case 'export_delivery_safe': {
      const permission = ACTION_PERMISSION[action]
      return decide(
        context.isReleaseController || (permission ? hasExplicitPermission(permission) : false),
        'Release-controller authority covers this release action',
        `Action requires release-controller status or explicit ${permission ?? 'release'} authority`
      )
    }

    case 'manage_members':
      return decide(
        context.isWorkOwner || isAdministrator,
        'Work ownership or administer membership permits roster management',
        'Managing members requires work ownership or the administer tier'
      )

    case 'approve_composition':
    case 'deliver_clean_master':
    case 'transfer_custody':
    case 'delete_passport': {
      const permission = ACTION_PERMISSION[action]
      return decide(
        permission ? hasExplicitPermission(permission) : false,
        `The actor holds explicit ${permission ?? action} authority`,
        `Action requires explicit ${permission ?? action} authority`
      )
    }
  }
}

function decide(
  allowed: boolean,
  allowedReason: string,
  deniedReason: string
): PassportAuthorizationDecision {
  return allowed
    ? { allowed: true, reason: allowedReason }
    : { allowed: false, reason: deniedReason }
}
