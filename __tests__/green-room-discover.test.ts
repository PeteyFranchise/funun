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
  profileMatchesRole,
  personActionFlags,
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
    // Exact-token check, not substring — `profile_visibility` legitimately
    // contains the substring "pro" (from "profile"), which a naive
    // `.toContain('pro')` would false-positive on (SAFETY-04 addition).
    const columns = new Set(DISCOVER_PUBLIC_COLUMNS.split(',').map(c => c.trim()))
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
      expect(columns.has(forbidden)).toBe(false)
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
    const c = { createdAt: '2026-07-10T00:00:00.000Z', id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }
    expect(parseDiscoverCursor(encodeDiscoverCursor(c))).toEqual(c)
    expect(parseDiscoverCursor('not-a-cursor')).toBeNull()
    expect(parseDiscoverCursor(encodeDiscoverCursor({ ...c, id: 'not-a-uuid' }))).toBeNull()
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

describe('personActionFlags (UAT#1 action gating)', () => {
  it('hides Message on your own card and never offers Follow to self', () => {
    expect(personActionFlags('self')).toEqual({
      canMessage: false,
      canFollow: false,
      alreadyFollowing: false,
    })
  })

  it('offers Follow only for outside-network results', () => {
    expect(personActionFlags('outside_network')).toEqual({
      canMessage: true,
      canFollow: true,
      alreadyFollowing: false,
    })
  })

  it('does not re-offer Follow to people you already follow or connect with', () => {
    expect(personActionFlags('following')).toEqual({
      canMessage: true,
      canFollow: false,
      alreadyFollowing: true,
    })
    expect(personActionFlags('connected')).toEqual({
      canMessage: true,
      canFollow: false,
      alreadyFollowing: false,
    })
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

describe('profileMatchesRole', () => {
  it('matches artist profile roles as well as industry role slugs', () => {
    expect(profileMatchesRole(profileRow({ industry_roles: [], roles: [{ kind: 'preset', slug: 'producer' }] }) as never, 'producer')).toBe(true)
    expect(profileMatchesRole(profileRow({ industry_roles: ['attorney'], roles: [] }) as never, 'attorney')).toBe(true)
    expect(profileMatchesRole(profileRow({ industry_roles: [], roles: [{ kind: 'preset', slug: 'artist' }] }) as never, 'attorney')).toBe(false)
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

  it('applies openTo / genre / location filters server-side and role filtering in the result shaper', async () => {
    const { session, service, main } = makeClients([], {})
    await loadDiscoverResults(
      session as never,
      service as never,
      'me',
      { ...BASE_FILTERS, role: 'producer', openTo: 'collabs', genre: 'house', location: 'berlin' },
      null,
      20
    )
    expect(main.calls.limit).toContainEqual([101])
    // open_to is JSONB — must be passed as a JSON string so PostgREST emits
    // jsonb containment (cs.["collabs"]), not the PG array literal cs.{collabs}
    // which Postgres rejects as invalid JSON. Regression guard for the bug the
    // live smoke test surfaced.
    expect(main.calls.contains).toContainEqual(['open_to', '["collabs"]'])
    expect(main.calls.ilike).toContainEqual(['genre', '%house%'])
    expect(main.calls.ilike).toContainEqual(['location', '%berlin%'])
  })

  it('returns members whose role lives only in the public profile roles JSON', async () => {
    const artistRoleOnly = profileRow({
      id: 'role-json-only',
      industry_roles: [],
      roles: [{ kind: 'preset', slug: 'producer' }],
    })
    const { session, service } = makeClients([artistRoleOnly])

    const out = await loadDiscoverResults(
      session as never,
      service as never,
      'me',
      { ...BASE_FILTERS, role: 'producer' },
      null,
      20
    )

    expect(out.results.map(result => result.id)).toEqual(['role-json-only'])
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

  // Pagination correctness (UAT#1 "Show more" without duplicates/skips).
  function pageRows(count: number) {
    return Array.from({ length: count }, (_, i) =>
      profileRow({
        id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
        // strictly-decreasing created_at so keyset order is deterministic
        created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, count - i)).toISOString(),
      })
    )
  }

  it('returns a nextCursor at the last returned row when more remain (no role filter)', async () => {
    // limit 20, no role filter → queryLimit 21; seed exactly 21 rows.
    const rows = pageRows(21)
    const { session, service } = makeClients(rows)
    const out = await loadDiscoverResults(session as never, service as never, 'me', BASE_FILTERS, null, 20)

    expect(out.results).toHaveLength(20)
    expect(out.nextCursor).not.toBeNull()
    const decoded = parseDiscoverCursor(out.nextCursor as string)
    // cursor must point at the 20th returned row, not the 21st raw row,
    // so the next page resumes strictly after what was shown — no skip, no dupe.
    expect(decoded?.id).toBe('00000000-0000-0000-0000-000000000019')
  })

  it('returns no nextCursor when the last page is not full', async () => {
    const rows = pageRows(12)
    const { session, service } = makeClients(rows)
    const out = await loadDiscoverResults(session as never, service as never, 'me', BASE_FILTERS, null, 20)

    expect(out.results).toHaveLength(12)
    expect(out.nextCursor).toBeNull()
  })

  it('with a role filter, advances the cursor past examined non-matching rows', async () => {
    // 30 raw rows fetched under the over-fetch limit; only a few match the role.
    // Non-matching rows are still "examined", so when fewer than a page match,
    // the cursor advances to the LAST RAW row to avoid re-scanning them forever.
    const rows = pageRows(30).map((r, i) =>
      i < 3
        ? { ...r, industry_roles: ['producer'] }
        : { ...r, industry_roles: [], roles: [] }
    )
    const { session, service } = makeClients(rows)
    const out = await loadDiscoverResults(
      session as never,
      service as never,
      'me',
      { ...BASE_FILTERS, role: 'producer' },
      null,
      20
    )

    expect(out.results.map(r => r.id)).toEqual([
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
    ])
    // 30 rows < queryLimit (101) → all candidates examined, nothing more to page.
    expect(out.nextCursor).toBeNull()
  })
})
