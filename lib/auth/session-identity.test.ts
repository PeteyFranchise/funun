import {
  ACCOUNT_SWITCH_INTENT_TTL_MS,
  accountWorkspaceForUser,
  accountWorkspaceHome,
  isFreshAccountSwitchIntent,
  isValidAccountSwitchIntent,
  readAccountSwitchIntent,
  readTabIdentity,
  resolveInitialSessionIdentity,
  resolveObservedSessionIdentity,
} from '@/lib/auth/session-identity'

const member = { userId: 'member-1', context: 'personal' as const, label: 'Personal workspace' }
const team = { userId: 'team-1', context: 'team' as const, label: 'Funūn Team' }

describe('session identity switching', () => {
  it('parses only complete tab identity snapshots', () => {
    expect(
      readTabIdentity(JSON.stringify({ userId: 'member-1', context: 'personal', label: '@peterzora' }))
    ).toEqual({ userId: 'member-1', context: 'personal', label: '@peterzora' })
    expect(readTabIdentity(JSON.stringify({ userId: '', context: 'personal', label: 'x' }))).toBeNull()
    expect(readTabIdentity(JSON.stringify({ userId: 'x', context: 'buyer', label: 'x' }))).toBeNull()
    expect(readTabIdentity('not-json')).toBeNull()
  })

  it('accepts only a fresh switch intent for the landing workspace', () => {
    const now = 50_000
    const intent = readAccountSwitchIntent(
      JSON.stringify({ targetContext: 'team', startedAt: now - 1_000 })
    )
    expect(isValidAccountSwitchIntent(intent, 'team', now)).toBe(true)
    expect(isValidAccountSwitchIntent(intent, 'personal', now)).toBe(false)
    expect(
      isValidAccountSwitchIntent(
        { targetContext: 'team', startedAt: now - ACCOUNT_SWITCH_INTENT_TTL_MS - 1 },
        'team',
        now
      )
    ).toBe(false)
    expect(isFreshAccountSwitchIntent({ targetContext: 'team', startedAt: now + 1 }, now)).toBe(false)
  })

  it('derives Team context only from verified staff metadata', () => {
    expect(accountWorkspaceForUser({ app_metadata: { staff_roles: ['leadership'] } })).toBe('team')
    expect(accountWorkspaceForUser({ app_metadata: { staff_role: 'ae' } })).toBe('team')
    expect(accountWorkspaceForUser({ app_metadata: { member_type: 'artist' } })).toBe('personal')
    expect(accountWorkspaceHome('team')).toBe('/admin/client-partners')
    expect(accountWorkspaceHome('personal')).toBe('/vault')
  })

  it('accepts an ordinary first load and same-account refresh', () => {
    expect(
      resolveInitialSessionIdentity({ stored: null, intent: null, expected: member })
    ).toEqual({ kind: 'accept', identity: member, finishSwitch: false })
    expect(
      resolveInitialSessionIdentity({ stored: member, intent: null, expected: member })
    ).toEqual({ kind: 'accept', identity: member, finishSwitch: false })
  })

  it('accepts only a fresh target-matching intentional switch', () => {
    const now = 100_000
    const freshTeamSwitch = { targetContext: 'team' as const, startedAt: now - 1_000 }

    expect(
      resolveInitialSessionIdentity({ stored: member, intent: freshTeamSwitch, expected: team, now })
    ).toEqual({ kind: 'accept', identity: team, finishSwitch: true })
    expect(
      resolveInitialSessionIdentity({
        stored: member,
        intent: { ...freshTeamSwitch, targetContext: 'personal' },
        expected: team,
        now,
      })
    ).toEqual({ kind: 'block', issue: { previous: member, current: team } })
  })

  it.each([
    ['expired', 100_000 - ACCOUNT_SWITCH_INTENT_TTL_MS - 1],
    ['future-dated', 100_001],
  ])('blocks account replacement behind a %s switch intent', (_label, startedAt) => {
    expect(
      resolveInitialSessionIdentity({
        stored: member,
        intent: { targetContext: 'team', startedAt },
        expected: team,
        now: 100_000,
      })
    ).toEqual({ kind: 'block', issue: { previous: member, current: team } })
  })

  it('ignores the intermediate sign-out during a fresh intentional switch', () => {
    expect(
      resolveObservedSessionIdentity({
        markerPresent: true,
        intent: { targetContext: 'team', startedAt: 99_000 },
        expected: member,
        nextUser: null,
        now: 100_000,
      })
    ).toEqual({ kind: 'ignore' })
  })

  it.each([
    ['expired', 100_000 - ACCOUNT_SWITCH_INTENT_TTL_MS - 1],
    ['future-dated', 100_001],
  ])('does not let a %s intent suppress an observed account change', (_label, startedAt) => {
    expect(
      resolveObservedSessionIdentity({
        markerPresent: true,
        intent: { targetContext: 'team', startedAt },
        expected: member,
        nextUser: { id: team.userId, email: team.label, app_metadata: { staff_roles: ['ae'] } },
        now: 100_000,
      })
    ).toEqual({ kind: 'block', issue: { previous: member, current: team } })
  })

  it('blocks unplanned sign-out and cross-tab account replacement', () => {
    expect(
      resolveObservedSessionIdentity({
        markerPresent: true,
        intent: null,
        expected: member,
        nextUser: null,
      })
    ).toEqual({ kind: 'block', issue: { previous: member, current: null } })

    expect(
      resolveObservedSessionIdentity({
        markerPresent: true,
        intent: null,
        expected: member,
        nextUser: { id: team.userId, email: team.label, app_metadata: { staff_roles: ['ae'] } },
      })
    ).toEqual({ kind: 'block', issue: { previous: member, current: team } })
  })

  it('ignores same-account observations and events after ordinary local sign-out cleared the marker', () => {
    expect(
      resolveObservedSessionIdentity({
        markerPresent: true,
        intent: null,
        expected: member,
        nextUser: { id: member.userId, email: member.label },
      })
    ).toEqual({ kind: 'ignore' })
    expect(
      resolveObservedSessionIdentity({
        markerPresent: false,
        intent: null,
        expected: member,
        nextUser: null,
      })
    ).toEqual({ kind: 'ignore' })
  })
})
