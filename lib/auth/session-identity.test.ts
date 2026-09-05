import {
  ACCOUNT_SWITCH_INTENT_TTL_MS,
  accountWorkspaceForUser,
  accountWorkspaceHome,
  isValidAccountSwitchIntent,
  readAccountSwitchIntent,
  readTabIdentity,
} from '@/lib/auth/session-identity'

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
  })

  it('derives Team context only from verified staff metadata', () => {
    expect(accountWorkspaceForUser({ app_metadata: { staff_roles: ['leadership'] } })).toBe('team')
    expect(accountWorkspaceForUser({ app_metadata: { staff_role: 'ae' } })).toBe('team')
    expect(accountWorkspaceForUser({ app_metadata: { member_type: 'artist' } })).toBe('personal')
    expect(accountWorkspaceHome('team')).toBe('/admin/client-partners')
    expect(accountWorkspaceHome('personal')).toBe('/vault')
  })
})
