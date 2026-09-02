import {
  authorizePassportAction,
  type PassportActorContext,
} from '@/lib/song-passport/authorization'

const contributor: PassportActorContext = {
  isWorkOwner: false,
  memberTier: 'contribute',
  isIdentitySubject: false,
  isReleaseController: false,
  explicitPermissions: [],
  isStaff: false,
  breakGlassApproved: false,
  hasDocumentedPurpose: false,
}

describe('Song Passport action authorization', () => {
  it('allows a contributor to collaborate but not exercise legal or release authority', () => {
    expect(authorizePassportAction(contributor, 'view_collaborative').allowed).toBe(true)
    expect(authorizePassportAction(contributor, 'draft_creative').allowed).toBe(true)
    expect(authorizePassportAction(contributor, 'approve_composition').allowed).toBe(false)
    expect(authorizePassportAction(contributor, 'approve_release').allowed).toBe(false)
    expect(authorizePassportAction(contributor, 'deliver_clean_master').allowed).toBe(false)
  })

  it('does not give the work owner automatic private, legal or delivery authority', () => {
    const owner = { ...contributor, isWorkOwner: true, memberTier: null }
    expect(authorizePassportAction(owner, 'draft_metadata').allowed).toBe(true)
    expect(authorizePassportAction(owner, 'manage_members').allowed).toBe(true)
    expect(authorizePassportAction(owner, 'view_private_identity').allowed).toBe(false)
    expect(authorizePassportAction(owner, 'view_legal').allowed).toBe(false)
    expect(authorizePassportAction(owner, 'approve_composition').allowed).toBe(false)
    expect(authorizePassportAction(owner, 'deliver_clean_master').allowed).toBe(false)
  })

  it('lets an identity subject confirm and view their own identity only', () => {
    const subject = { ...contributor, memberTier: null, isIdentitySubject: true }
    expect(authorizePassportAction(subject, 'view_private_identity').allowed).toBe(true)
    expect(authorizePassportAction(subject, 'confirm_own_identity').allowed).toBe(true)
    expect(authorizePassportAction(subject, 'approve_composition').allowed).toBe(false)
  })

  it('lets an administrator manage members without creating rights authority', () => {
    const administrator = { ...contributor, memberTier: 'administer' as const }
    expect(authorizePassportAction(administrator, 'manage_members').allowed).toBe(true)
    expect(authorizePassportAction(administrator, 'approve_composition').allowed).toBe(false)
    expect(authorizePassportAction(administrator, 'transfer_custody').allowed).toBe(false)
  })

  it('honors only the explicit permission that was granted', () => {
    const approved = {
      ...contributor,
      explicitPermissions: ['approve_composition'] as const,
    }
    expect(authorizePassportAction(approved, 'approve_composition').allowed).toBe(true)
    expect(authorizePassportAction(approved, 'approve_release').allowed).toBe(false)
    expect(authorizePassportAction(approved, 'deliver_clean_master').allowed).toBe(false)
  })

  it('keeps release-controller authority scoped', () => {
    const releaseController = { ...contributor, memberTier: null, isReleaseController: true }
    expect(authorizePassportAction(releaseController, 'approve_release').allowed).toBe(true)
    expect(authorizePassportAction(releaseController, 'select_master').allowed).toBe(true)
    expect(authorizePassportAction(releaseController, 'export_delivery_safe').allowed).toBe(true)
    expect(authorizePassportAction(releaseController, 'approve_composition').allowed).toBe(false)
    expect(authorizePassportAction(releaseController, 'deliver_clean_master').allowed).toBe(false)
  })

  it('requires both approval and purpose for staff break-glass reads', () => {
    const staff = { ...contributor, memberTier: null, isStaff: true }
    expect(authorizePassportAction(staff, 'view_legal').allowed).toBe(false)
    expect(
      authorizePassportAction({ ...staff, breakGlassApproved: true }, 'view_legal').allowed
    ).toBe(false)
    expect(
      authorizePassportAction(
        { ...staff, breakGlassApproved: true, hasDocumentedPurpose: true },
        'view_legal'
      ).allowed
    ).toBe(true)
  })

  it('returns an actionable denial reason', () => {
    const result = authorizePassportAction(contributor, 'transfer_custody')
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/explicit/i)
  })
})
