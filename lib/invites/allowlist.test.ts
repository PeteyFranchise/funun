import type { SupabaseClient } from '@supabase/supabase-js'
import { isArtistEmailAllowed, emailHasExistingAccount } from '@/lib/invites/allowlist'
import { INVITE_ALLOWLIST_SCENARIOS, type InviteAllowlistScenario } from '@/lib/invites/invite-fixtures'

// ─── Fake service-role client ─────────────────────────────────────────────
// Each table builder actually applies the filters the chain records (email
// match, status, expiry), so these tests exercise isArtistEmailAllowed()'s
// real query construction against the scenario's raw "DB state" rather than
// trusting the fixture's `expected` field blindly.

function collaboratorBuilder(emails: string[]) {
  let matchEmail = ''
  const builder: any = {
    select: jest.fn(() => builder),
    ilike: jest.fn((_col: string, value: string) => {
      matchEmail = value
      return builder
    }),
    then: (resolve: (result: { count: number; error: null }) => void) => {
      const count = emails.filter(e => e.toLowerCase() === matchEmail.toLowerCase()).length
      resolve({ count, error: null })
    },
  }
  return builder
}

function inviteBuilder(rows: InviteAllowlistScenario['inviteRows']) {
  let matchEmail = ''
  let statusFilter: string | undefined
  const builder: any = {
    select: jest.fn(() => builder),
    ilike: jest.fn((_col: string, value: string) => {
      matchEmail = value
      return builder
    }),
    eq: jest.fn((_col: string, value: string) => {
      statusFilter = value
      return builder
    }),
    or: jest.fn(() => builder),
    then: (resolve: (result: { count: number; error: null }) => void) => {
      const count = rows.filter(
        r =>
          r.email.toLowerCase() === matchEmail.toLowerCase() &&
          (!statusFilter || r.status === statusFilter) &&
          !r.expired
      ).length
      resolve({ count, error: null })
    },
  }
  return builder
}

function fakeService(scenario: InviteAllowlistScenario): SupabaseClient {
  return {
    from: jest.fn((table: string) => {
      if (table === 'collaborators') return collaboratorBuilder(scenario.collaboratorEmails)
      if (table === 'artist_invites') return inviteBuilder(scenario.inviteRows)
      throw new Error(`unexpected .from('${table}') call in this test`)
    }),
    rpc: jest.fn(async () => ({ data: false, error: null })),
  } as unknown as SupabaseClient
}

describe('isArtistEmailAllowed', () => {
  describe.each(INVITE_ALLOWLIST_SCENARIOS)('$name', scenario => {
    it(`resolves to ${scenario.expected}`, async () => {
      const service = fakeService(scenario)
      expect(await isArtistEmailAllowed(service, scenario.email)).toBe(scenario.expected)
    })
  })

  it('is false for an empty/whitespace-only email without querying', async () => {
    const service = fakeService({
      name: 'unused',
      email: '',
      collaboratorEmails: [],
      inviteRows: [],
      expected: false,
    })
    expect(await isArtistEmailAllowed(service, '   ')).toBe(false)
    expect(service.from).not.toHaveBeenCalled()
  })
})

describe('emailHasExistingAccount', () => {
  it('routes through the email_has_account RPC via the service-role client', async () => {
    const rpc = jest.fn(async () => ({ data: true, error: null }))
    const service = { from: jest.fn(), rpc } as unknown as SupabaseClient

    const result = await emailHasExistingAccount(service, 'Someone@Example.com')

    expect(result).toBe(true)
    expect(rpc).toHaveBeenCalledWith('email_has_account', { p_email: 'Someone@Example.com' })
    expect(service.from).not.toHaveBeenCalled()
  })

  it('returns false when the RPC reports no account', async () => {
    const service = {
      from: jest.fn(),
      rpc: jest.fn(async () => ({ data: false, error: null })),
    } as unknown as SupabaseClient
    expect(await emailHasExistingAccount(service, 'nobody@example.com')).toBe(false)
  })

  it('returns false (fail-closed) when the RPC errors', async () => {
    const service = {
      from: jest.fn(),
      rpc: jest.fn(async () => ({ data: null, error: { message: 'boom' } })),
    } as unknown as SupabaseClient
    expect(await emailHasExistingAccount(service, 'nobody@example.com')).toBe(false)
  })

  it('is false for an empty email without calling the RPC', async () => {
    const rpc = jest.fn()
    const service = { from: jest.fn(), rpc } as unknown as SupabaseClient
    expect(await emailHasExistingAccount(service, '  ')).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})
