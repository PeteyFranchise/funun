import { loadCatalogPage } from './catalog-query'
import { buildCatalogFilter } from './catalog'
import { loadBlockedIds } from '@/lib/green-room/discover'

// ─── loadCatalogPage — anonymous-safe branch (23-03 Task 1) ──────────────
// RESEARCH Pitfall 3: passing an anonymous visitor's null id straight into
// loadBlockedIds's .or(`blocker_id.eq.${id},...`) against a uuid column
// throws `invalid input syntax for type uuid`. loadCatalogPage must skip
// the block-exclusion call entirely for a null buyerUserId (a visitor with
// no account can neither block nor be blocked) while leaving the
// authenticated block-exclusion path unchanged.

jest.mock('@/lib/green-room/discover', () => ({
  loadBlockedIds: jest.fn(),
}))

const mockedLoadBlockedIds = loadBlockedIds as jest.MockedFunction<typeof loadBlockedIds>

// Chainable query-builder spy — mirrors __tests__/green-room-discover.test.ts's
// tableBuilder so it can stand in for a PostgREST builder no matter where the
// chain terminates (awaitable via `.then`).
function tableBuilder(rows: unknown[]) {
  const calls: Record<string, unknown[][]> = {}
  const record = (name: string) => (...args: unknown[]) => {
    ;(calls[name] ??= []).push(args)
    return builder
  }
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'range', 'in']) {
    builder[m] = record(m)
  }
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
  return { builder, calls }
}

// 2026-09-10: isRightsReady gates on the SIX decided entry items
// (split sheets, copyright, producer agreements, audio files, metadata,
// cover art) instead of vault_readiness_score, so a fixture project must
// now actually carry those inputs to be catalogue-visible. The old
// `tracks: [] / vault_documents: []` shape passed only because the gate
// read a rolled-up number. Note there is deliberately NO distributor and
// NO isrc/iswc here — this fixture IS the "every signature signed, no
// release admin" song the new gate exists to admit.
const ENTRY_COMPLETE_TRACKS = [
  {
    id: 'track-1',
    title: 'Test Track',
    bpm: null,
    key_signature: null,
    metadata: {
      composers: [{ name: 'Jane Writer', role: 'composer_lyricist', pro: 'ascap', split: 100 }],
    },
    writers: null,
    producers: null,
    mixing_engineer: null,
    mastering_engineer: null,
    has_sample: false,
    sample_details: null,
    isrc: null,
    iswc: null,
  },
]

const ENTRY_COMPLETE_DOCUMENTS = [
  { id: 'doc-1', type: 'copyright_registration', status: 'signed', track_id: null, document_data: null },
  { id: 'doc-2', type: 'hire_right', status: 'signed', track_id: null, document_data: null },
  { id: 'doc-3', type: 'split_sheet', status: 'signed', track_id: null, document_data: null },
]

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    title: 'Test Track',
    type: 'single',
    genre: 'House',
    vault_readiness_score: 100,
    user_id: 'owner-1',
    cover_art_url: null,
    content_id_registered: false,
    content_id_dismissed_until: null,
    tracks: ENTRY_COMPLETE_TRACKS,
    vault_documents: ENTRY_COMPLETE_DOCUMENTS,
    vault_assets: [{ id: 'asset-1', type: 'cover_art' }],
    ...overrides,
  }
}

// admittedProjectIds defaults to the id of every project row passed in —
// tests that want to exercise the NOT-admitted branch pass an explicit
// (possibly empty) list.
//
// 2026-09-10: a caller may pass `{ id, trackId }` instead of a bare project
// id, because the admitted-listings query now also selects `track_id` —
// admission is SONG-level, and the card must describe the admitted song.
// A bare id still yields `track_id: null`, which is exactly the "no admitted
// track resolves" shape the fallback path handles.
function makeService(
  projects: unknown[],
  ownerRows: unknown[],
  admittedProjectIds?: (string | { id: string; trackId: string })[]
) {
  const admitted = (
    admittedProjectIds ?? (projects as { id: string }[]).map(p => p.id)
  ).map(entry =>
    typeof entry === 'string'
      ? { vault_project_id: entry, track_id: null }
      : { vault_project_id: entry.id, track_id: entry.trackId }
  )

  return {
    from: jest.fn((table: string) => {
      if (table === 'vault_projects') return tableBuilder(projects).builder
      if (table === 'user_profiles') return tableBuilder(ownerRows).builder
      if (table === 'sync_listings') return tableBuilder(admitted).builder
      if (table === 'project_license_terms') return tableBuilder([]).builder
      return tableBuilder([]).builder
    }),
  }
}

const BASE_FILTER = buildCatalogFilter({})

beforeEach(() => {
  mockedLoadBlockedIds.mockReset()
  mockedLoadBlockedIds.mockResolvedValue(new Set())
})

describe('loadCatalogPage — anonymous visitor (buyerUserId = null)', () => {
  it('does not call loadBlockedIds and returns the rights-ready public cards', async () => {
    const project = projectRow()
    const service = makeService(
      [project],
      [{ id: 'owner-1', profile_visibility: 'public' }]
    )

    const result = await loadCatalogPage(service as never, null, BASE_FILTER, 1)

    expect(mockedLoadBlockedIds).not.toHaveBeenCalled()
    expect(result.data).toHaveLength(1)
    expect(result.data[0].id).toBe('proj-1')
  })

  it('never throws for an anonymous caller', async () => {
    const project = projectRow()
    const service = makeService(
      [project],
      [{ id: 'owner-1', profile_visibility: 'public' }]
    )

    await expect(loadCatalogPage(service as never, null, BASE_FILTER, 1)).resolves.not.toThrow()
  })

  it('preserves the empty-projects short-circuit for an anonymous caller', async () => {
    const service = makeService([], [])
    const result = await loadCatalogPage(service as never, null, BASE_FILTER, 1)
    expect(mockedLoadBlockedIds).not.toHaveBeenCalled()
    expect(result.data).toEqual([])
  })
})

describe('loadCatalogPage — authenticated buyer (buyerUserId = real id)', () => {
  it('calls loadBlockedIds with the real buyer id and still applies block exclusion', async () => {
    const project = projectRow({ user_id: 'blocked-owner' })
    const service = makeService(
      [project],
      [{ id: 'blocked-owner', profile_visibility: 'public' }]
    )
    mockedLoadBlockedIds.mockResolvedValue(new Set(['blocked-owner']))

    const result = await loadCatalogPage(service as never, 'buyer-1', BASE_FILTER, 1)

    expect(mockedLoadBlockedIds).toHaveBeenCalledWith(service, 'buyer-1')
    expect(result.data).toEqual([])
  })

  it('returns cards for a non-blocked owner (authenticated behavior unchanged)', async () => {
    const project = projectRow({ user_id: 'owner-1' })
    const service = makeService(
      [project],
      [{ id: 'owner-1', profile_visibility: 'public' }]
    )
    mockedLoadBlockedIds.mockResolvedValue(new Set())

    const result = await loadCatalogPage(service as never, 'buyer-1', BASE_FILTER, 1)

    expect(mockedLoadBlockedIds).toHaveBeenCalledWith(service, 'buyer-1')
    expect(result.data).toHaveLength(1)
  })
})

// ─── The six-item entry gate, at the query level (2026-09-10) ────────────
// lib/deals/catalog.test.ts pins isRightsReady itself. These two pin that
// loadCatalogPage feeds it the right inputs — i.e. that PROJECT_COLUMNS
// actually selects vault_assets and tracks.metadata. A unit test on the
// predicate alone would still pass if this query stopped fetching them.
describe('loadCatalogPage — the six-item entry gate, not the aggregate score', () => {
  // NOTE for whoever reads this next. lib/deals/catalog.test.ts's named
  // test pins the score-50 case against isRightsReady DIRECTLY, because a
  // score of 50 is not reachable HERE: loadCatalogPage runs the real
  // computeStage3, whose canContinue is `vault_readiness_score >= 60 &&
  // !sampleBlock`, and the real DB scoring function awards 70 for exactly
  // these six items. So at the query level the score condition was never
  // the binding one — the change bites in the other direction, which is
  // what the two EXCLUDES cases below cover.
  it('INCLUDES the decision\'s song — every signature signed, no distributor, no ISRC', async () => {
    const project = projectRow({ vault_readiness_score: 70 })
    const service = makeService([project], [{ id: 'owner-1', profile_visibility: 'public' }])

    const result = await loadCatalogPage(service as never, null, BASE_FILTER, 1)

    expect(result.data.map(c => c.id)).toEqual(['proj-1'])
    // The fixture really does lack release admin — otherwise this test
    // would be asserting nothing.
    expect(project.tracks.every(t => t.isrc == null && t.iswc == null)).toBe(true)
  })

  it('EXCLUDES a high-scoring project that is missing cover art — the real behaviour change', async () => {
    const project = projectRow({ vault_readiness_score: 100, vault_assets: [] })
    const service = makeService([project], [{ id: 'owner-1', profile_visibility: 'public' }])

    const result = await loadCatalogPage(service as never, null, BASE_FILTER, 1)

    expect(result.data).toEqual([])
  })

  it('EXCLUDES a high-scoring project whose split sheet is unsigned', async () => {
    const project = projectRow({
      vault_readiness_score: 100,
      vault_documents: [
        { id: 'doc-1', type: 'copyright_registration', status: 'signed', track_id: null, document_data: null },
        { id: 'doc-2', type: 'hire_right', status: 'signed', track_id: null, document_data: null },
        { id: 'doc-3', type: 'split_sheet', status: 'pending', track_id: null, document_data: null },
      ],
    })
    const service = makeService([project], [{ id: 'owner-1', profile_visibility: 'public' }])

    const result = await loadCatalogPage(service as never, null, BASE_FILTER, 1)

    expect(result.data).toEqual([])
  })
})

// ─── The representative track follows ADMISSION (2026-09-10, defect 4) ───
// The card's mood/energy/vocal/instruments used to come from
// `tracks.find(t => readDescriptors(t.metadata) != null) ?? tracks[0]` —
// whichever track happened to be TAGGED, chosen with no reference to which
// track staff actually admitted. On a multi-track project that shows a
// buyer one song's descriptors for a project admitted on a different song.
describe('loadCatalogPage — the card describes the ADMITTED track', () => {
  // Two tagged tracks. The OLD rule picks track-a (first tagged); the
  // admitted song is track-b. If the card carries track-a's data, a
  // supervisor is reading the wrong song.
  const TRACK_A = {
    ...ENTRY_COMPLETE_TRACKS[0],
    id: 'track-a',
    title: 'Not The Admitted Song',
    metadata: {
      ...ENTRY_COMPLETE_TRACKS[0].metadata,
      descriptors: { moods: ['peaceful'], energy: 'low', vocal: 'instrumental' },
    },
  }
  const TRACK_B = {
    ...ENTRY_COMPLETE_TRACKS[0],
    id: 'track-b',
    title: 'The Admitted Song',
    metadata: {
      ...ENTRY_COMPLETE_TRACKS[0].metadata,
      descriptors: { moods: ['driving'], energy: 'high', vocal: 'vocal' },
    },
  }

  it('carries the admitted track\'s descriptors, not the first tagged track\'s', async () => {
    const project = projectRow({ tracks: [TRACK_A, TRACK_B] })
    const service = makeService(
      [project],
      [{ id: 'owner-1', profile_visibility: 'public' }],
      [{ id: 'proj-1', trackId: 'track-b' }]
    )

    const result = await loadCatalogPage(service as never, null, BASE_FILTER, 1)

    expect(result.data).toHaveLength(1)
    expect(result.data[0].mood).toBe('Driving')
    expect(result.data[0].energy).toBe('High energy')
    expect(result.data[0].vocal).toBe('Vocal')

    // The OLD rule's answer, spelled out so this test cannot pass by
    // accident if the fixtures are ever made identical.
    expect(TRACK_A.metadata.descriptors.energy).toBe('low')
    expect(result.data[0].energy).not.toBe('Low energy')
  })

  it('prefers an admitted track that is TAGGED over an admitted track that is not', async () => {
    // Composers intact (so the entry gate still passes) but NO descriptors.
    const untaggedAdmitted = { ...ENTRY_COMPLETE_TRACKS[0], id: 'track-c' }
    const project = projectRow({ tracks: [untaggedAdmitted, TRACK_B] })
    const service = makeService(
      [project],
      [{ id: 'owner-1', profile_visibility: 'public' }],
      // BOTH tracks admitted; only one has anything to display.
      [
        { id: 'proj-1', trackId: 'track-c' },
        { id: 'proj-1', trackId: 'track-b' },
      ]
    )

    const result = await loadCatalogPage(service as never, null, BASE_FILTER, 1)

    expect(result.data[0].mood).toBe('Driving')
  })

  it('shows an admitted track\'s BLANK descriptors rather than another song\'s', async () => {
    // The admitted song is untagged. A blank field is honest; borrowing
    // track-a's mood would not be.
    // Composers intact (so the entry gate still passes) but NO descriptors.
    const untaggedAdmitted = { ...ENTRY_COMPLETE_TRACKS[0], id: 'track-c' }
    const project = projectRow({ tracks: [TRACK_A, untaggedAdmitted] })
    const service = makeService(
      [project],
      [{ id: 'owner-1', profile_visibility: 'public' }],
      [{ id: 'proj-1', trackId: 'track-c' }]
    )

    const result = await loadCatalogPage(service as never, null, BASE_FILTER, 1)

    expect(result.data).toHaveLength(1)
    expect(result.data[0].mood).toBe('')
    expect(result.data[0].energy).toBe('')
  })

  it('falls back to the first tagged track when NO admitted track id resolves', async () => {
    // A listing whose track_id is null, or whose track has since been
    // deleted from the project. The gate has already established the
    // project IS admitted, so the card still renders — hiding a listed song
    // over a display detail would be worse than the old behaviour.
    const project = projectRow({ tracks: [TRACK_A, TRACK_B] })
    const service = makeService(
      [project],
      [{ id: 'owner-1', profile_visibility: 'public' }],
      ['proj-1'] // bare id -> track_id null
    )

    const result = await loadCatalogPage(service as never, null, BASE_FILTER, 1)

    expect(result.data).toHaveLength(1)
    expect(result.data[0].mood).toBe('Peaceful')
  })
})

describe('loadCatalogPage — sync-library admission gate (26-06)', () => {
  it('excludes a project with no admitted sync listing, even if otherwise rights-ready', async () => {
    const project = projectRow()
    const service = makeService(
      [project],
      [{ id: 'owner-1', profile_visibility: 'public' }],
      [] // no admitted sync_listings rows for any project
    )

    const result = await loadCatalogPage(service as never, null, BASE_FILTER, 1)

    expect(result.data).toEqual([])
  })

  it('includes a project with an admitted sync listing (and excludes an unadmitted sibling)', async () => {
    const admittedProject = projectRow({ id: 'proj-admitted' })
    const unadmittedProject = projectRow({ id: 'proj-not-admitted' })
    const service = makeService(
      [admittedProject, unadmittedProject],
      [{ id: 'owner-1', profile_visibility: 'public' }],
      ['proj-admitted']
    )

    const result = await loadCatalogPage(service as never, null, BASE_FILTER, 1)

    expect(result.data.map(c => c.id)).toEqual(['proj-admitted'])
  })
})
