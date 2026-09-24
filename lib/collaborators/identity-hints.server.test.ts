import {
  redactHiddenMemberLinks,
  resolveCollaboratorIdentityHints,
} from './identity-hints.server'

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
//
// TWO SIGNALS, NOT ONE. Every refusal below clears the HANDLE, but only a
// block clears `memberVisible`. That split is the point: a hidden /
// connections-only / is_public:false member keeps `memberVisible: true`
// because they ARE a member, and whether that may be disclosed is Phase 41's
// D-01a — an OPEN owner decision this resolver must not settle in either
// direction by accident.
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

/** A claimed row whose handle is withheld, but whose membership is not. */
const NO_HANDLE = { 'row-1': { handle: null, memberVisible: true } }
/** A claimed row on the other side of a block: both signals withheld. */
const SUPPRESSED = { 'row-1': { handle: null, memberVisible: false } }

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
      'row-1': { handle: 'ericsmith', memberVisible: true },
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
    ).resolves.toEqual({ 'row-1': { handle: 'ericsmith', memberVisible: true } })

    await expect(resolve({ profiles, connections: { data: [], error: null } })).resolves.toEqual(
      NO_HANDLE
    )
  })

  it('keys hints by roster ROW id, so two rows pointing at one member both resolve', async () => {
    await expect(
      resolve({ profiles: { data: [publicProfile()], error: null } }, [
        claimedRow({ id: 'row-1' }),
        claimedRow({ id: 'row-2' }),
      ])
    ).resolves.toEqual({
      'row-1': { handle: 'ericsmith', memberVisible: true },
      'row-2': { handle: 'ericsmith', memberVisible: true },
    })
  })
})

describe('resolveCollaboratorIdentityHints — every refusal looks the same', () => {
  it('refuses when the profile is not public', async () => {
    await expect(
      resolve({ profiles: { data: [publicProfile({ is_public: false })], error: null } })
    ).resolves.toEqual(NO_HANDLE)
    await expect(
      resolve({ profiles: { data: [publicProfile({ is_public: null })], error: null } })
    ).resolves.toEqual(NO_HANDLE)
  })

  it('refuses when the viewer blocked the member (outgoing)', async () => {
    await expect(
      resolve({
        profiles: { data: [publicProfile()], error: null },
        blocks: { data: [{ blocker_id: VIEWER, blocked_id: MEMBER }], error: null },
      })
    ).resolves.toEqual(SUPPRESSED)
  })

  it('refuses when the member blocked the viewer (incoming)', async () => {
    await expect(
      resolve({
        profiles: { data: [publicProfile()], error: null },
        blocks: { data: [{ blocker_id: MEMBER, blocked_id: VIEWER }], error: null },
      })
    ).resolves.toEqual(SUPPRESSED)
  })

  it('refuses when the member has no handle, or a malformed one', async () => {
    await expect(
      resolve({ profiles: { data: [publicProfile({ handle: null })], error: null } })
    ).resolves.toEqual(NO_HANDLE)
    await expect(
      resolve({ profiles: { data: [publicProfile({ handle: '   ' })], error: null } })
    ).resolves.toEqual(NO_HANDLE)
    await expect(
      resolve({ profiles: { data: [publicProfile({ handle: '../admin' })], error: null } })
    ).resolves.toEqual(NO_HANDLE)
  })

  it('refuses when no profile row comes back for the claimed member', async () => {
    await expect(resolve({ profiles: { data: [], error: null } })).resolves.toEqual(NO_HANDLE)
  })

  it('refuses when the profile lookup itself fails', async () => {
    await expect(
      resolve({ profiles: { data: null, error: { message: 'profiles unavailable' } } })
    ).resolves.toEqual(NO_HANDLE)
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
    ).resolves.toEqual(SUPPRESSED)
  })

  it('refuses when the connections lookup fails and the profile is connections_only', async () => {
    await expect(
      resolve({
        profiles: { data: [publicProfile({ profile_visibility: 'connections_only' })], error: null },
        connections: { data: null, error: { message: 'connections unavailable' } },
      })
    ).resolves.toEqual(NO_HANDLE)
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

  it('returns nothing but the two decisions — the hint has no room for a field', async () => {
    const hints = await resolve({ profiles: { data: [publicProfile()], error: null } })
    expect(Object.keys(hints['row-1']).sort()).toEqual(['handle', 'memberVisible'])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// memberVisible: the SECOND signal, and the one that must not answer D-01a.
// ─────────────────────────────────────────────────────────────────────────

describe('resolveCollaboratorIdentityHints — memberVisible is the BLOCK predicate only', () => {
  it('a HIDDEN member is still memberVisible — hiding is not blocking, and D-01a stays open', async () => {
    // The assertion that stops this work settling an open owner decision by
    // accident. is_public:false, a connections_only profile with no accepted
    // connection, and a member with no handle at all each withhold the HANDLE
    // — and each leaves the member state alone, because none of them is a
    // block. Whether a hidden member's membership may be disclosed to the
    // roster owner is Phase 41's D-01a, which nothing here decides.
    // (`profile_visibility` has exactly two values, 'public' and
    // 'connections_only' — lib/trust-safety/contracts.ts.)
    const hidden = [
      publicProfile({ is_public: false }),
      publicProfile({ is_public: null }),
      publicProfile({ profile_visibility: 'connections_only' }),
      publicProfile({ handle: null }),
    ]

    for (const profile of hidden) {
      const hints = await resolve({ profiles: { data: [profile], error: null } })
      expect(hints['row-1']).toEqual({ handle: null, memberVisible: true })
    }
  })

  it('an OUTGOING block clears it — the viewer blocked the member', async () => {
    const hints = await resolve({
      profiles: { data: [publicProfile()], error: null },
      blocks: { data: [{ blocker_id: VIEWER, blocked_id: MEMBER }], error: null },
    })
    expect(hints['row-1']).toEqual({ handle: null, memberVisible: false })
  })

  it('an INCOMING block clears it — the member blocked the viewer', async () => {
    // The direction the viewer can never see for themselves: `blocks` RLS only
    // exposes rows they placed, which is why the resolver takes a service
    // client at all.
    const hints = await resolve({
      profiles: { data: [publicProfile()], error: null },
      blocks: { data: [{ blocker_id: MEMBER, blocked_id: VIEWER }], error: null },
    })
    expect(hints['row-1']).toEqual({ handle: null, memberVisible: false })
  })

  it('a failed block lookup clears it for EVERY row — no Set value means "maybe blocked"', async () => {
    const hints = await resolve(
      {
        profiles: { data: [publicProfile()], error: null },
        blocks: { data: null, error: { message: 'blocks unavailable' } },
      },
      [claimedRow({ id: 'row-1' }), claimedRow({ id: 'row-2' }), { id: 'row-3', claimed_by: null } as never]
    )

    expect(hints).toEqual({
      'row-1': { handle: null, memberVisible: false },
      'row-2': { handle: null, memberVisible: false },
      // An unclaimed row has no member to suppress and gets no entry at all.
    })
  })

  it('a failed PROFILE lookup does not clear it — that outage says nothing about blocks', async () => {
    // Conflating the two would strip the member state off every unblocked row
    // during a transient profiles outage, which is D-01a's question again.
    const hints = await resolve({
      profiles: { data: null, error: { message: 'profiles unavailable' } },
    })
    expect(hints['row-1']).toEqual({ handle: null, memberVisible: true })
  })

  it('leaves a blocked row and an unblocked row side by side, each with its own answer', async () => {
    const OTHER = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    const hints = await resolve(
      {
        profiles: {
          data: [publicProfile(), publicProfile({ id: OTHER, handle: 'mayaokoro' })],
          error: null,
        },
        blocks: { data: [{ blocker_id: OTHER, blocked_id: VIEWER }], error: null },
      },
      [claimedRow({ id: 'row-1' }), claimedRow({ id: 'row-2', claimed_by: OTHER })]
    )

    expect(hints).toEqual({
      'row-1': { handle: 'ericsmith', memberVisible: true },
      'row-2': { handle: null, memberVisible: false },
    })
  })
})

describe('redactHiddenMemberLinks', () => {
  const rows = [
    { id: 'row-1', name: 'Eric Smith', pro: 'ASCAP', claimed_by: MEMBER },
    { id: 'row-2', name: 'Maya Okoro', pro: 'BMI', claimed_by: 'dddddddd-dddd-dddd-dddd-dddddddddddd' },
    { id: 'row-3', name: 'No Account', pro: null, claimed_by: null },
  ]

  it('strips claimed_by from a non-memberVisible row and nothing else', () => {
    const out = redactHiddenMemberLinks(rows, {
      'row-1': { handle: null, memberVisible: false },
      'row-2': { handle: 'mayaokoro', memberVisible: true },
    })

    expect(out[0]).toEqual({ id: 'row-1', name: 'Eric Smith', pro: 'ASCAP' })
    expect(out[0]).not.toHaveProperty('claimed_by')
    // The row SURVIVES — it is the owner's own entry, and a block on this
    // platform filters rather than severs. Their name for that person, their
    // notes and their PRO all stay.
    expect(out[0].name).toBe('Eric Smith')
    expect(out[0].pro).toBe('ASCAP')
  })

  it('leaves every visible row byte-identical, including the unclaimed one', () => {
    const out = redactHiddenMemberLinks(rows, {
      'row-1': { handle: 'ericsmith', memberVisible: true },
    })

    expect(out).toEqual(rows)
  })

  it('strips every row when the resolver refused wholesale (a failed block lookup)', () => {
    const out = redactHiddenMemberLinks(rows, {
      'row-1': { handle: null, memberVisible: false },
      'row-2': { handle: null, memberVisible: false },
    })

    expect(out.some(r => 'claimed_by' in r && r.claimed_by)).toBe(false)
    expect(out).toHaveLength(3)
  })
})
