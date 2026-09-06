import {
  createInvitationToken,
  hashInvitationToken,
  isInvitationRedeemable,
  resolveInvitationExpiry,
  normalizeInvitedEmail,
  INVITATION_RATE_LIMIT,
} from '@/lib/workspaces/invitations'

const NOW = new Date('2026-09-05T12:00:00.000Z')

describe('hashInvitationToken', () => {
  it('produces a stable digest for the same token', () => {
    expect(hashInvitationToken('same-token')).toBe(hashInvitationToken('same-token'))
  })

  it('produces a different digest for a different token', () => {
    expect(hashInvitationToken('token-a')).not.toBe(hashInvitationToken('token-b'))
  })

  it('never returns the input token', () => {
    expect(hashInvitationToken('my-raw-token')).not.toBe('my-raw-token')
  })
})

describe('createInvitationToken', () => {
  it('returns a token of at least 32 characters', () => {
    const { token } = createInvitationToken()
    expect(token.length).toBeGreaterThanOrEqual(32)
  })

  it('returns a hash paired to the token via hashInvitationToken', () => {
    const { token, tokenHash } = createInvitationToken()
    expect(tokenHash).toBe(hashInvitationToken(token))
  })

  it('differs across two calls', () => {
    expect(createInvitationToken().token).not.toBe(createInvitationToken().token)
  })
})

describe('isInvitationRedeemable', () => {
  const future = new Date(NOW.getTime() + 60_000)
  const past = new Date(NOW.getTime() - 60_000)

  it('is true for pending with expiry strictly after now', () => {
    expect(isInvitationRedeemable({ status: 'pending', expiresAt: future, now: NOW })).toBe(true)
  })

  it('is false for pending whose expiresAt has passed', () => {
    expect(isInvitationRedeemable({ status: 'pending', expiresAt: past, now: NOW })).toBe(false)
  })

  it('is false for pending whose expiresAt equals now exactly', () => {
    expect(isInvitationRedeemable({ status: 'pending', expiresAt: NOW, now: NOW })).toBe(false)
  })

  it.each(['accepted', 'refused', 'revoked', 'expired'] as const)(
    'is false for status %s regardless of expiry',
    status => {
      expect(isInvitationRedeemable({ status, expiresAt: future, now: NOW })).toBe(false)
    }
  )
})

describe('resolveInvitationExpiry', () => {
  it('returns a shorter window for a time-boxed role (contractor) than a standing role', () => {
    const contractorExpiry = resolveInvitationExpiry({ role: 'contractor', now: NOW })
    const memberExpiry = resolveInvitationExpiry({ role: 'member', now: NOW })
    expect(contractorExpiry.getTime()).toBeLessThan(memberExpiry.getTime())
  })

  it('returns a finite expiry for a time-boxed role', () => {
    const expiry = resolveInvitationExpiry({ role: 'contractor', now: NOW })
    expect(Number.isFinite(expiry.getTime())).toBe(true)
    expect(expiry.getTime()).toBeGreaterThan(NOW.getTime())
  })

  it('returns a finite expiry for a standing role', () => {
    const expiry = resolveInvitationExpiry({ role: 'owner', now: NOW })
    expect(Number.isFinite(expiry.getTime())).toBe(true)
    expect(expiry.getTime()).toBeGreaterThan(NOW.getTime())
  })
})

describe('normalizeInvitedEmail', () => {
  it('trims and lowercases a valid address', () => {
    expect(normalizeInvitedEmail('  A@B.COM ')).toBe('a@b.com')
  })

  it('returns null for an empty address', () => {
    expect(normalizeInvitedEmail('   ')).toBeNull()
  })

  it('returns null for a malformed address', () => {
    expect(normalizeInvitedEmail('not-an-email')).toBeNull()
  })
})

describe('INVITATION_RATE_LIMIT', () => {
  it('exports a finite window and maximum', () => {
    expect(INVITATION_RATE_LIMIT.windowMs).toBeGreaterThan(0)
    expect(INVITATION_RATE_LIMIT.maxAttempts).toBeGreaterThan(0)
  })
})
