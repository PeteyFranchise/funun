import {
  DISCOVER_PUBLIC_COLUMNS,
  clampDiscoverLimit,
  parseDiscoverFilters,
  encodeDiscoverCursor,
  parseDiscoverCursor,
  deriveRelationship,
  toPersonResult,
  reasonLabel,
  loadDiscoverResults,
  type DiscoverFilters,
} from '@/lib/green-room/discover'

// A chainable query-builder spy that records every filter call and is
// awaitable (thenable) so it can stand in for a PostgREST builder no matter
// where the chain terminates.
function tableBuilder(rows: unknown[]) {
  const calls: Record<string, unknown[][]> = {}
  const record = (name: string) => (...args: unknown[]) => {
    ;(calls[name] ??= []).push(args)
    return builder
  }
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'order', 'limit', 'in', 'not', 'contains', 'ilike', 'textSearch', 'or']) {
    builder[m] = record(m)
  }
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
  return { builder, calls }
}

const BASE_FILTERS: DiscoverFilters = {
  q: null,
  role: null,
  openTo: null,
  genre: null,
  location: null,
  relationship: null,
  capability: null,
}

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    artist_name: 'Nova',
    handle: 'nova',
    avatar_url: null,
    bio: 'Producer and engineer',
    genre: 'House',
    genres: ['house'],
    location: 'Berlin',
    industry_roles: ['producer'],
    roles: [{ kind: 'preset', slug: 'producer' }],
    open_to: ['collabs'],
    member_type: 'artist',
    verified: false,
    is_public: true,
    created_at: '2026-07-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('DISCOVER_PUBLIC_COLUMNS', () => {
  it('never selects private / PII columns', () => {
    for (const forbidden of [
      'legal_first_name',
      'legal_last_name',
      'contact_phone',
      'mailing_address',
      'pro',
      'ipi',
      'publisher',
      'mlc_id',
      'soundexchange_id',
      'email',
    ]) {
      expect(DISCOVER_PUBLIC_COLUMNS).not.toContain(forbidden)
    }
  })

  it('selects the display columns the result card needs', () => {
    for (const col of ['id', 'artist_name', 'handle', 'is_public', 'open_to', 'industry_roles']) {
      expect(DISCOVER_PUBLIC_COLUMNS).toContain(col)
    }
  })
})

describe('parseDiscoverFilters', () => {
  it('drops unknown enum values instead of throwing', () => {
    const params = new URLSearchParams({
      role: 'not-a-real-role',
      openTo: 'nonsense',
      relationship: 'bogus',
      capability: 'wat',
    })
    const filters = parseDiscoverFilters(params)
    expect(filters.role).toBeNull()
    expect(filters.openTo).toBeNull()
    expect(filters.relationship).toBeNull()
    expect(filters.capability).toBeNull()
  })

  it('accepts known enum values and trims free text', () => {
    const params = new URLSearchParams({
      q: '  nova  ',
      role: 'producer',
      openTo: 'collabs',
      relationship: 'following',
      capability: 'industry',
      genre: ' house ',
    })
    const filters = parseDiscoverFilters(params)
    expect(filters).toMatchObject({
      q: 'nova',
      role: 'producer',
      openTo: 'collabs',
      relationship: 'following',
      capability: 'industry',
      genre: 'house',
    })
  })
})

describe('clampDiscoverLimit', () => {
  it('defaults and clamps', () => {
    expect(clampDiscoverLimit(undefined)).toBe(20)
    expect(clampDiscoverLimit('5')).toBe(5)
    expect(clampDiscoverLimit('9999')).toBe(40)
    expect(clampDiscoverLimit('0')).toBe(1)
  })
})

describe('cursor', () => {
  it('round-trips and rejects garbage', () => {
    const c = { createdAt: '2026-07-10T00:00:00.000Z', id: 'abc' }
    expect(parseDiscoverCursor(encodeDiscoverCursor(c))).toEqual(c)
    expect(parseDiscoverCursor('not-a-cursor')).toBeNull()
  })
})

describe('deriveRelationship', () => {
  const rel = { followingIds: new Set(['f1']), connectedIds: new Set(['c1']) }
  it('classifies self/connected/following/outside', () => {
    expect(deriveRelationship('me', 'me', rel)).toBe('self')
    expect(deriveRelationship('me', 'c1', rel)).toBe('connected')
    expect(deriveRelationship('me', 'f1', rel)).toBe('following')
    expect(deriveRelationship('me', 'x', rel)).toBe('outside_network')
  })
})

describe('reasonLabel', () => {
  const rel = { followingIds: new Set<string>(), connectedIds: new Set<string>() }
  it('prefers relationship, then matched filter', () => {
    expect(reasonLabel(profileRow() as never, 'connected', BASE_FILTERS, [])).toBe('Connected with you')
    expect(reasonLabel(profileRow() as never, 'following', BASE_FILTERS, [])).toBe('You follow this member')
    expect(
      reasonLabel(profileRow() as never, 'outside_network', { ...BASE_FILTERS, openTo: 'collabs' }, [])
    ).toBe('Open to collaboration')
    void rel
  })
})

describe('toPersonResult', () => {
  it('omits sensitive fields and shapes the public result', () => {
    const result = toPersonResult(profileRow() as never, 'me', { followingIds: new Set(), connectedIds: new Set() }, BASE_FILTERS)
    expect(Object.keys(result).sort()).toEqual(
      [
        'avatarUrl',
        'displayName',
        'genre',
        'handle',
        'headline',
        'id',
        'location',
        'memberType',
        'openTo',
        'profileHref',
        'reasonLabel',
        'relationship',
        'roles',
        'verified',
      ].sort()
    )
    expect(result.profileHref).toBe('/u/nova')
    expect(result.relationship).toBe('outside_network')
  })
})

describe('loadDiscoverResults', () => {
  function makeClients(mainRows: unknown[], opts: { follows?: unknown[]; connections?: unknown[]; blocks?: unknown[] } = {}) {
    const main = tableBuilder(mainRows)
    const session = {
      from: jest.fn((table: string) => {
        if (table === 'follows') return tableBuilder(opts.follows ?? []).builder
        if (table === 'connections') return tableBuilder(opts.connections ?? []).builder
        if (table === 'artist_profiles') return main.builder
        return tableBuilder([]).builder
      }),
    }
    const service = {
      from: jest.fn((table: string) => {
        if (table === 'blocks') return tableBuilder(opts.blocks ?? []).builder
        return tableBuilder([]).builder
      }),
    }
    return { session, service, main }
  }

  it('filters to public profiles, excludes self, and selects only public-safe columns', async () => {
    const { session, service, main } = makeClients([profileRow()])
    await loadDiscoverResults(session as never, service as never, 'me', BASE_FILTERS, null, 20)

    expect(main.calls.select?.[0][0]).toBe(DISCOVER_PUBLIC_COLUMNS)
    expect(main.calls.eq).toContainEqual(['is_public', true])
    expect(main.calls.neq).toContainEqual(['id', 'me'])
  })

  it('excludes blocked ids in BOTH directions', async () => {
    // viewer 'me' blocked 'b1'; 'b2' blocked 'me'.
    const { session, service, main } = makeClients([], {
      blocks: [
        { blocker_id: 'me', blocked_id: 'b1' },
        { blocker_id: 'b2', blocked_id: 'me' },
      ],
    })
    await loadDiscoverResults(session as never, service as never, 'me', BASE_FILTERS, null, 20)

    const notCall = (main.calls.not ?? []).find(args => args[0] === 'id' && args[1] === 'in')
    expect(notCall).toBeTruthy()
    const inList = String(notCall?.[2])
    expect(inList).toContain('b1')
    expect(inList).toContain('b2')
  })

  it('applies role / openTo / genre / location filters server-side', async () => {
    const { session, service, main } = makeClients([], {})
    await loadDiscoverResults(
      session as never,
      service as never,
      'me',
      { ...BASE_FILTERS, role: 'producer', openTo: 'collabs', genre: 'house', location: 'berlin' },
      null,
      20
    )
    expect(main.calls.contains).toContainEqual(['industry_roles', ['producer']])
    // open_to is JSONB — must be passed as a JSON string so PostgREST emits
    // jsonb containment (cs.["collabs"]), not the PG array literal cs.{collabs}
    // which Postgres rejects as invalid JSON. Regression guard for the bug the
    // live smoke test surfaced.
    expect(main.calls.contains).toContainEqual(['open_to', '["collabs"]'])
    expect(main.calls.ilike).toContainEqual(['genre', '%house%'])
    expect(main.calls.ilike).toContainEqual(['location', '%berlin%'])
  })

  it('short-circuits to empty when a following filter has no candidates', async () => {
    const { session, service } = makeClients([profileRow()], { follows: [] })
    const out = await loadDiscoverResults(
      session as never,
      service as never,
      'me',
      { ...BASE_FILTERS, relationship: 'following' },
      null,
      20
    )
    expect(out.results).toEqual([])
    expect(out.nextCursor).toBeNull()
  })
})
