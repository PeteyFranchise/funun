import {
  NETWORK_RELATIONSHIP_VALUES,
  REPORT_TARGET_TYPE_VALUES,
  REPORT_REASON_VALUES,
  REPORT_STATUS_VALUES,
  PROFILE_VISIBILITY_VALUES,
  OPEN_TO_VISIBILITY_VALUES,
  VERIFICATION_ADMIN_ACTION_VALUES,
  isValidNetworkRelationship,
  isValidReportTargetType,
  isValidReportReason,
  isValidReportStatus,
  isValidProfileVisibility,
  isValidOpenToVisibility,
  isValidVerificationAdminAction,
  isProfileVisibleTo,
  isOpenToVisibleTo,
} from '@/lib/trust-safety/contracts'

describe('network relationship contract (DISCOVER-04)', () => {
  it('covers following, follower, connection, and pending states', () => {
    expect(NETWORK_RELATIONSHIP_VALUES).toEqual([
      'following',
      'follower',
      'connection',
      'pending_outgoing',
      'pending_incoming',
    ])
  })

  it('validates known and rejects unknown relationship values', () => {
    expect(isValidNetworkRelationship('connection')).toBe(true)
    expect(isValidNetworkRelationship('blocked')).toBe(false)
    expect(isValidNetworkRelationship('')).toBe(false)
  })
})

describe('report target/reason/status contract (SAFETY-02)', () => {
  it('covers profile, message, and every Green Room target type', () => {
    expect(REPORT_TARGET_TYPE_VALUES).toEqual([
      'profile',
      'message',
      'green_room_post',
      'green_room_comment',
      'green_room_repost',
      'green_room_placement',
    ])
  })

  it('validates report target types', () => {
    expect(isValidReportTargetType('green_room_comment')).toBe(true)
    expect(isValidReportTargetType('vault_project')).toBe(false)
  })

  it('validates report reasons', () => {
    for (const reason of REPORT_REASON_VALUES) {
      expect(isValidReportReason(reason)).toBe(true)
    }
    expect(isValidReportReason('made_up_reason')).toBe(false)
  })

  it('validates report statuses', () => {
    expect(REPORT_STATUS_VALUES).toEqual(['submitted', 'under_review', 'actioned', 'dismissed'])
    for (const status of REPORT_STATUS_VALUES) {
      expect(isValidReportStatus(status)).toBe(true)
    }
    expect(isValidReportStatus('closed')).toBe(false)
  })
})

describe('profile visibility & open-to visibility contract (SAFETY-04)', () => {
  it('exposes exactly public/connections_only for profile visibility', () => {
    expect(PROFILE_VISIBILITY_VALUES).toEqual(['public', 'connections_only'])
    expect(isValidProfileVisibility('connections_only')).toBe(true)
    expect(isValidProfileVisibility('private')).toBe(false)
  })

  it('exposes exactly public/connections/hidden for open-to visibility', () => {
    expect(OPEN_TO_VISIBILITY_VALUES).toEqual(['public', 'connections', 'hidden'])
    expect(isValidOpenToVisibility('hidden')).toBe(true)
    expect(isValidOpenToVisibility('nobody')).toBe(false)
  })

  it('isProfileVisibleTo: owner always sees own profile', () => {
    expect(isProfileVisibleTo('connections_only', true, false)).toBe(true)
  })

  it('isProfileVisibleTo: public profile visible to anyone', () => {
    expect(isProfileVisibleTo('public', false, false)).toBe(true)
  })

  it('isProfileVisibleTo: connections_only hides from non-connections', () => {
    expect(isProfileVisibleTo('connections_only', false, false)).toBe(false)
    expect(isProfileVisibleTo('connections_only', false, true)).toBe(true)
  })

  it('isOpenToVisibleTo: hidden always hides from non-owners', () => {
    expect(isOpenToVisibleTo('hidden', false, true)).toBe(false)
    expect(isOpenToVisibleTo('hidden', false, false)).toBe(false)
    expect(isOpenToVisibleTo('hidden', true, false)).toBe(true)
  })

  it('isOpenToVisibleTo: public always shows to non-owners', () => {
    expect(isOpenToVisibleTo('public', false, false)).toBe(true)
  })

  it('isOpenToVisibleTo: connections-scoped shows only to connections', () => {
    expect(isOpenToVisibleTo('connections', false, false)).toBe(false)
    expect(isOpenToVisibleTo('connections', false, true)).toBe(true)
  })

  it('open-to visibility can hide independent of an otherwise-public profile', () => {
    // Locked requirement: "A member can hide their Open to status from
    // public view" — this must be checkable even when the profile itself
    // is fully public.
    const profileVisible = isProfileVisibleTo('public', false, false)
    const openToVisible = isOpenToVisibleTo('hidden', false, false)
    expect(profileVisible).toBe(true)
    expect(openToVisible).toBe(false)
  })
})

describe('verification authority contract (SAFETY-03)', () => {
  it('only allows grant/revoke admin actions', () => {
    expect(VERIFICATION_ADMIN_ACTION_VALUES).toEqual(['grant', 'revoke'])
    expect(isValidVerificationAdminAction('grant')).toBe(true)
    expect(isValidVerificationAdminAction('revoke')).toBe(true)
    expect(isValidVerificationAdminAction('self_verify')).toBe(false)
  })
})
