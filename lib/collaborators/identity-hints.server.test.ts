import { resolveCollaboratorIdentityHints } from './identity-hints.server'

// ─────────────────────────────────────────────────────────────────────────
// The privacy boundary for a claimed member's @handle.
//
// These cases are the reason the resolver exists: the roster page previously
// read `user_profiles(id, handle)` off the session client with no is_public,
// visibility or block predicate. Each test below removes exactly one of the
// four predicates and asserts NO handle comes back — and every refusal has
// the SAME shape, so an absent handle never says which rule refused it.
//
// loadBlockedIds is NOT mocked: the real function runs against a fake
// `blocks` query so the fail-closed throw it gained in PR #97 is genuinely
// exercised here, not simulated.
// ─────────────────────────────────────────────────────────────────────────

const VIEWER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MEMBER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

type Result<T> = { data: T | null; error: { message: string } | null }

type ProfileRow = {
  id: string
  handle: string | null
  is_public: boolean | null
  profile_visibility: string | null
}

function publicProfile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: MEMBER,
    handle: 'ericsmith',
    is_public: true,
    profile_visibility: 'public',
    ...overrides,
  }
}

type Fakes = {
  profiles?: Result<ProfileRow[]>
  connections?: Result<{ requester_id: string; addressee_id: string }[]>
  blocks?: Result<{ blocker_id: string; blocked_id: string }[]>
}

const selectedColumns: string[] = []

function sessionClient(fakes: Fakes) {
  return {
    from(table: string) {
      if (table === 'user_profiles') {
        return {
          select: (columns: string) => {
            selectedColumns.push(columns)
            return { in: async () => fakes.profiles ?? { data: [], error: null } }
          },
        }
      }
      if (table === 'connections') {
        return {
          select: () => ({
            eq: () => ({ or: async () => fakes.connections ?? { data: [], error: null } }),
          }),
        }
      }
      throw new Error(`unexpected session read of ${table}`)
    },
  }
}

function serviceClient(fakes: Fakes) {
  return {
    from(table: string) {
      if (table !== 'blocks') throw new Error(`service client must only read blocks, got ${table}`)
      return { select: () => ({ or: async () => fakes.blocks ?? { data: [], error: null } }) }
    },
  }
}

function claimedRow(overrides: Record<string, unknown> = {}) {
  return { id: 'row-1', claimed_by: MEMBER, ...overrides } as never
}

async function resolve(fakes: Fakes, rows = [claimedRow()]) {
  return resolveCollaboratorIdentityHints(
    sessionClient(fakes) as never,
    serviceClient(fakes) as never,
    VIEWER,
    rows
  )
}

beforeEach(() => {
  selectedColumns.length = 0
})

describe('resolveCollaboratorIdentityHints — when a handle may be shown', () => {
  it('returns the handle for a claimed, public, unblocked member', async () => {
    await expect(resolve({ profiles: { data: [publicProfile()], error: null } })).resolves.toEqual({
      'row-1': { handle: 'ericsmith' },
    })
  })

  it('returns a connections_only handle ONLY to an accepted connection', async () => {
    const profiles = {
      data: [publicProfile({ profile_visibility: 'connections_only' })],
      error: null,
    }

    await expect(
      resolve({
        profiles,
        connections: { data: [{ requester_id: MEMBER, addressee_id: VIEWER }], error: null },
      })
    ).resolves.toEqual({ 'row-1': { handle: 'ericsmith' } })

    await expect(resolve({ profiles, connections: { data: [], error: null } })).resolves.toEqual({})
  })

  it('keys hints by roster ROW id, so two rows pointing at one member both resolve', async () => {
    await expect(
      resolve({ profiles: { data: [publicProfile()], error: null } }, [
        claimedRow({ id: 'row-1' }),
        claimedRow({ id: 'row-2' }),
      ])
    ).resolves.toEqual({
      'row-1': { handle: 'ericsmith' },
      'row-2': { handle: 'ericsmith' },
    })
  })
})

describe('resolveCollaboratorIdentityHints — every refusal looks the same', () => {
  it('refuses when the profile is not public', async () => {
    await expect(
      resolve({ profiles: { data: [publicProfile({ is_public: false })], error: null } })
    ).resolves.toEqual({})
    await expect(
      resolve({ profiles: { data: [publicProfile({ is_public: null })], error: null } })
    ).resolves.toEqual({})
  })

  it('refuses when the viewer blocked the member (outgoing)', async () => {
    await expect(
      resolve({
        profiles: { data: [publicProfile()], error: null },
        blocks: { data: [{ blocker_id: VIEWER, blocked_id: MEMBER }], error: null },
      })
    ).resolves.toEqual({})
  })

  it('refuses when the member blocked the viewer (incoming)', async () => {
    await expect(
      resolve({
        profiles: { data: [publicProfile()], error: null },
        blocks: { data: [{ blocker_id: MEMBER, blocked_id: VIEWER }], error: null },
      })
    ).resolves.toEqual({})
  })

  it('refuses when the member has no handle, or a malformed one', async () => {
    await expect(
      resolve({ profiles: { data: [publicProfile({ handle: null })], error: null } })
    ).resolves.toEqual({})
    await expect(
      resolve({ profiles: { data: [publicProfile({ handle: '   ' })], error: null } })
    ).resolves.toEqual({})
    await expect(
      resolve({ profiles: { data: [publicProfile({ handle: '../admin' })], error: null } })
    ).resolves.toEqual({})
  })

  it('refuses when no profile row comes back for the claimed member', async () => {
    await expect(resolve({ profiles: { data: [], error: null } })).resolves.toEqual({})
  })

  it('refuses when the profile lookup itself fails', async () => {
    await expect(
      resolve({ profiles: { data: null, error: { message: 'profiles unavailable' } } })
    ).resolves.toEqual({})
  })

  it('degrades to no handles — and does NOT throw — when the block lookup fails', async () => {
    // loadBlockedIds throws BLOCK_LOOKUP_FAILED here (PR #97). The resolver
    // must catch it: fail-closed means "no handle", not a 500 on the roster.
    // Re-swallowing the error inside loadBlockedIds (an empty block set) would
    // be the fail-OPEN direction and would show a blocked member's handle.
    await expect(
      resolve({
        profiles: { data: [publicProfile()], error: null },
        blocks: { data: null, error: { message: 'blocks unavailable' } },
      })
    ).resolves.toEqual({})
  })

  it('refuses when the connections lookup fails and the profile is connections_only', async () => {
    await expect(
      resolve({
        profiles: { data: [publicProfile({ profile_visibility: 'connections_only' })], error: null },
        connections: { data: null, error: { message: 'connections unavailable' } },
      })
    ).resolves.toEqual({})
  })

  it('reads nothing at all for an unclaimed row or a signed-out viewer', async () => {
    const unreadable = {
      from: () => {
        throw new Error('no lookup should happen')
      },
    } as never

    await expect(
      resolveCollaboratorIdentityHints(unreadable, unreadable, VIEWER, [
        { id: 'row-1', claimed_by: null } as never,
      ])
    ).resolves.toEqual({})
    await expect(
      resolveCollaboratorIdentityHints(unreadable, unreadable, null, [claimedRow()])
    ).resolves.toEqual({})
  })
})

describe('resolveCollaboratorIdentityHints — projection', () => {
  it('selects only id/handle/is_public/profile_visibility, never a private column', async () => {
    await resolve({ profiles: { data: [publicProfile()], error: null } })

    expect(selectedColumns).toEqual(['id, handle, is_public, profile_visibility'])

    // Compared as whole column names, not substrings: 'pro' is a substring of
    // 'profile_visibility', and a substring assertion there would fail on a
    // safe projection while passing on a genuinely leaky one that used an
    // unexpected alias.
    const columns = selectedColumns[0].split(',').map(c => c.trim())
    for (const forbidden of [
      'email',
      'legal_name',
      'contact_phone',
      'mailing_address',
      'pro',
      'ipi',
      'publisher',
      'mlc_id',
      'soundexchange_id',
      'artist_name',
    ]) {
      expect(columns).not.toContain(forbidden)
    }
  })

  it('returns nothing but a handle — the hint has no room for another field', async () => {
    const hints = await resolve({ profiles: { data: [publicProfile()], error: null } })
    expect(Object.keys(hints['row-1'])).toEqual(['handle'])
  })
})
