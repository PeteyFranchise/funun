import type { StaffRole } from '@/lib/admin/staff-role'

// ─── One Identity, Many Roles ──────────────────────────────────────────
//
// Account classes describe the security boundary through which a person is
// acting. Professional roles such as songwriter, producer, manager, or music
// supervisor are profile facts and deliberately do not appear here.

export const ACCOUNT_CLASS_VALUES = ['member', 'client_partner', 'funun_team'] as const
export type AccountClass = (typeof ACCOUNT_CLASS_VALUES)[number]

export type AccountContextFacts = {
  hasMemberProfile: boolean
  clientPartnerMembershipCount: number
  staffRoles: readonly StaffRole[]
}
export type AccountContextSummary = {
  classes: AccountClass[]
  defaultClass: AccountClass | null
  hasMemberWorkspace: boolean
  hasClientPartnerWorkspace: boolean
  isFununTeamMember: boolean
}

/**
 * Resolves account classes from server-established relationships.
 *
 * Staff is intentionally exclusive: a staff identity should not also operate
 * personal or buyer workspaces. If legacy data contains that overlap, the
 * resolver fails closed into the Funūn Team context instead of exposing a
 * privileged identity to ordinary product surfaces.
 *
 * Member + Client Partner is the one supported overlap. It represents one
 * human using personal creative tools and separately acting for a verified
 * licensing organization.
 */
export function resolveAccountContext(facts: AccountContextFacts): AccountContextSummary {
  const isFununTeamMember = facts.staffRoles.length > 0
  if (isFununTeamMember) {
    return {
      classes: ['funun_team'],
      defaultClass: 'funun_team',
      hasMemberWorkspace: false,
      hasClientPartnerWorkspace: false,
      isFununTeamMember: true,
    }
  }

  const classes: AccountClass[] = []
  if (facts.hasMemberProfile) classes.push('member')
  if (facts.clientPartnerMembershipCount > 0) classes.push('client_partner')

  return {
    classes,
    defaultClass: facts.hasMemberProfile
      ? 'member'
      : facts.clientPartnerMembershipCount > 0
        ? 'client_partner'
        : null,
    hasMemberWorkspace: facts.hasMemberProfile,
    hasClientPartnerWorkspace: facts.clientPartnerMembershipCount > 0,
    isFununTeamMember: false,
  }
}
