import { resolveAccountContext } from './account-context'

describe('resolveAccountContext', () => {
  it('treats every profile-owning person as a Member without an artist/industry split', () => {
    expect(
      resolveAccountContext({
        hasMemberProfile: true,
        clientPartnerMembershipCount: 0,
        staffRoles: [],
      })
    ).toEqual({
      classes: ['member'],
      defaultClass: 'member',
      hasMemberWorkspace: true,
      hasClientPartnerWorkspace: false,
      isFununTeamMember: false,
    })
  })

  it('supports one identity acting as both a Member and Client Partner', () => {
    expect(
      resolveAccountContext({
        hasMemberProfile: true,
        clientPartnerMembershipCount: 1,
        staffRoles: [],
      })
    ).toMatchObject({
      classes: ['member', 'client_partner'],
      defaultClass: 'member',
      hasMemberWorkspace: true,
      hasClientPartnerWorkspace: true,
    })
  })

  it('resolves a buyer-only identity from organization membership, not metadata', () => {
    expect(
      resolveAccountContext({
        hasMemberProfile: false,
        clientPartnerMembershipCount: 1,
        staffRoles: [],
      })
    ).toMatchObject({
      classes: ['client_partner'],
      defaultClass: 'client_partner',
      hasMemberWorkspace: false,
      hasClientPartnerWorkspace: true,
    })
  })

  it('keeps Funūn Team identities isolated even if legacy rows overlap', () => {
    expect(
      resolveAccountContext({
        hasMemberProfile: true,
        clientPartnerMembershipCount: 1,
        staffRoles: ['leadership'],
      })
    ).toEqual({
      classes: ['funun_team'],
      defaultClass: 'funun_team',
      hasMemberWorkspace: false,
      hasClientPartnerWorkspace: false,
      isFununTeamMember: true,
    })
  })

  it('returns no class for a limited guest/signature identity', () => {
    expect(
      resolveAccountContext({
        hasMemberProfile: false,
        clientPartnerMembershipCount: 0,
        staffRoles: [],
      })
    ).toMatchObject({ classes: [], defaultClass: null })
  })
})
