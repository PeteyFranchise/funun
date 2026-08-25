import type { SupabaseClient } from '@supabase/supabase-js'
import { isArtistEmailAllowed, emailHasExistingAccount, resolveAccountIdByEmail } from '@/lib/invites/allowlist'
import { INVITE_ALLOWLIST_SCENARIOS, type InviteAllowlistScenario } from '@/lib/invites/invite-fixtures'

// ─── Fake service-role client ─────────────────────────────────────────────
// Each table builder actually applies the filters the chain records (email
// match, status, expiry), so these tests exercise isArtistEmailAllowed()'s
// real query construction against the scenario's raw "DB state" rather than
// trusting the fixture's `expected` field blindly.
//
// M2 (27-CODEX-REVIEW.md) — this mock previously did a naive
// `a.toLowerCase() === b.toLowerCase()` comparison for `.ilike()`, which
// can NEVER catch the M1 wildcard-injection bug (`.ilike('email', input)`
// treating `%`/`_` in raw user input as pattern wildcards) — a naive
// equality check passes or fails identically whether the implementation
// escapes wildcards or not. sqlIlikePatternToRegExp() below reproduces
// Postgres's actual ILIKE pattern language (`%` = any run of characters,
// `_` = any single character, `\` escapes the next character literally,
// case-insensitive) so this mock exercises the SAME wildcard semantics a
// real Postgres ILIKE would — genuinely behavioral, not substring-based.
function sqlIlikePatternToRegExp(pattern: string): RegExp {
  let out = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '\\' && i + 1 < pattern.length) {
      out += escapeRegExpChar(pattern[i + 1])
      i++
    } else if (char === '%') {
      out += '.*'
    } else if (char === '_') {
      out += '.'
    } else {
      out += escapeRegExpChar(char)
    }
  }
  return new RegExp(`^${out}$`, 'i')
}

function escapeRegExpChar(char: string): string {
  return /[.*+?^${}()|[\]\\]/.test(char) ? `\\${char}` : char
}

function collaboratorBuilder(emails: string[]) {
  let pattern = ''
  const builder: any = {
    select: jest.fn(() => builder),
    ilike: jest.fn((_col: string, value: string) => {
      pattern = value
      return builder
    }),
    then: (resolve: (result: { count: number; error: null }) => void) => {
      const regex = sqlIlikePatternToRegExp(pattern)
      const count = emails.filter(e => regex.test(e)).length
      resolve({ count, error: null })
    },
  }
  return builder
}

function inviteBuilder(rows: InviteAllowlistScenario['inviteRows']) {
  let pattern = ''
  let statusFilter: string | undefined
  const builder: any = {
    select: jest.fn(() => builder),
    ilike: jest.fn((_col: string, value: string) => {
      pattern = value
      return builder
    }),
    eq: jest.fn((_col: string, value: string) => {
      statusFilter = value
      return builder
    }),
    or: jest.fn(() => builder),
    then: (resolve: (result: { count: number; error: null }) => void) => {
      const regex = sqlIlikePatternToRegExp(pattern)
      const count = rows.filter(
        r =>
          regex.test(r.email) &&
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

  // M1 (27-CODEX-REVIEW.md) — direct, explicit regression guard: asserts
  // the actual pattern string sent to `.ilike()` has wildcard characters
  // escaped, so a future accidental revert to a raw `.ilike('email', input)`
  // call is caught even if it happened to coincide with a scenario's
  // `expected` outcome.
  it('escapes ILIKE wildcard characters before querying (never passes raw % or _ through)', async () => {
    const ilikeCalls: string[] = []
    const service = {
      from: jest.fn((_table: string) => {
        const builder: any = {
          select: jest.fn(() => builder),
          ilike: jest.fn((_col: string, value: string) => {
            ilikeCalls.push(value)
            return builder
          }),
          eq: jest.fn(() => builder),
          or: jest.fn(() => builder),
          then: (resolve: (result: { count: number; error: null }) => void) =>
            resolve({ count: 0, error: null }),
        }
        return builder
      }),
      rpc: jest.fn(async () => ({ data: false, error: null })),
    } as unknown as SupabaseClient

    await isArtistEmailAllowed(service, 'a_b%c@example.com')

    expect(ilikeCalls.length).toBeGreaterThan(0)
    for (const call of ilikeCalls) {
      expect(call).not.toContain('_b%c') // raw wildcard chars must not survive unescaped
      expect(call).toBe('a\\_b\\%c@example.com')
    }
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

describe('resolveAccountIdByEmail', () => {
  it('returns ok with userId set when the RPC finds an account', async () => {
    const rpc = jest.fn(async () => ({ data: 'user-123', error: null }))
    const service = { from: jest.fn(), rpc } as unknown as SupabaseClient

    const result = await resolveAccountIdByEmail(service, 'Someone@Example.com')

    expect(result).toEqual({ ok: true, userId: 'user-123' })
    expect(rpc).toHaveBeenCalledWith('user_id_for_email', { p_email: 'Someone@Example.com' })
  })

  it('returns ok with userId null when the RPC returns null', async () => {
    const service = {
      from: jest.fn(),
      rpc: jest.fn(async () => ({ data: null, error: null })),
    } as unknown as SupabaseClient

    expect(await resolveAccountIdByEmail(service, 'nobody@example.com')).toEqual({
      ok: true,
      userId: null,
    })
  })

  it('returns ok with userId null for an empty or whitespace-only email, without calling the RPC', async () => {
    const rpc = jest.fn()
    const service = { from: jest.fn(), rpc } as unknown as SupabaseClient

    expect(await resolveAccountIdByEmail(service, '   ')).toEqual({ ok: true, userId: null })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns a NOT-ok result when the RPC errors — never collapses an error into "no account"', async () => {
    const service = {
      from: jest.fn(),
      rpc: jest.fn(async () => ({ data: null, error: { message: 'connection reset' } })),
    } as unknown as SupabaseClient

    expect(await resolveAccountIdByEmail(service, 'someone@example.com')).toEqual({
      ok: false,
      error: 'connection reset',
    })
  })
})
