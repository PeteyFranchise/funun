import { buildFirstSignInWelcome } from './first-sign-in'

describe('buildFirstSignInWelcome', () => {
  it('returns no welcome for a completed account', () => {
    expect(
      buildFirstSignInWelcome({
        eligible: true,
        completedAt: '2026-09-02T12:00:00.000Z',
        handle: 'maya',
        inviterName: null,
        hasClaimedCollaboratorProfile: false,
        sharedWork: null,
      })
    ).toBeNull()
  })

  it('never onboards an industry account through the artist Sound Vault experience', () => {
    expect(
      buildFirstSignInWelcome({
        eligible: false,
        completedAt: null,
        handle: 'industry-member',
        inviterName: null,
        hasClaimedCollaboratorProfile: false,
        sharedWork: null,
      })
    ).toBeNull()
  })

  it('leads a collaborator invitee to profile review and includes the inviter', () => {
    expect(
      buildFirstSignInWelcome({
        eligible: true,
        completedAt: null,
        handle: 'shanemaux',
        inviterName: 'Peter',
        hasClaimedCollaboratorProfile: true,
        sharedWork: null,
      })
    ).toEqual(
      expect.objectContaining({
        kind: 'collaborator',
        title: 'Welcome to Funūn, @shanemaux.',
        body: expect.stringContaining('Peter added your collaborator profile'),
        primary: { label: 'Review my profile', href: '/settings' },
        secondary: null,
      })
    )
  })

  it('adds a contextual song link when the invitee is already a work member', () => {
    const welcome = buildFirstSignInWelcome({
      eligible: true,
      completedAt: null,
      handle: 'shanemaux',
      inviterName: 'Peter',
      hasClaimedCollaboratorProfile: true,
      sharedWork: { id: 'work-1', title: 'Justified Noise' },
    })

    expect(welcome?.sharedWork).toEqual({
      title: 'Justified Noise',
      href: '/vault/works/work-1',
    })
  })

  it('gives a newly admitted artist one song-first action', () => {
    expect(
      buildFirstSignInWelcome({
        eligible: true,
        completedAt: null,
        handle: 'maya-reyes',
        inviterName: null,
        hasClaimedCollaboratorProfile: false,
        sharedWork: null,
      })
    ).toEqual({
      kind: 'artist',
      eyebrow: 'Your Sound Vault',
      title: 'Welcome to Funūn, @maya-reyes.',
      body: expect.stringContaining('Start with one song'),
      primary: { label: 'Start my first song', href: '/vault/new' },
      secondary: { label: 'Set up my rights', href: '/settings' },
      sharedWork: null,
    })
  })

  it('offers the business-first path without displacing the song-first primary action', () => {
    const welcome = buildFirstSignInWelcome({
      eligible: true,
      completedAt: null,
      handle: 'maya-reyes',
      inviterName: null,
      hasClaimedCollaboratorProfile: false,
      sharedWork: null,
    })

    expect(welcome?.body).toContain('upload a take or track')
    expect(welcome?.body).toContain('get down to business first')
    expect(welcome?.primary).toEqual({ label: 'Start my first song', href: '/vault/new' })
    expect(welcome?.secondary).toEqual({ label: 'Set up my rights', href: '/settings' })
  })
})
