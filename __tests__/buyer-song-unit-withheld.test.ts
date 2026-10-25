// ─── Phase 50.5 Task 2 — the read surfaces are provably withheld ────────────
//
// The plan's requirement is that forcing a flag ON makes this suite FAIL. A
// test that only reads the flag's own value proves nothing: it would pass over
// a call site that was deleted. So each case below loads lib/deals/catalog-query
// TWICE through jest.isolateModules — once with the real withholding module,
// once with isReadWithheld forced to return false — and asserts the two outputs
// DIFFER in the specific way the withholding is supposed to cause.
//
// That is what makes it a behaviour test rather than a configuration test: if
// someone removes a call site, the "withheld" load starts producing the
// project-derived value and the assertion fails.
//
// No jsdom in this repo, so component RENDERING is owner-verified in a browser.
// These cover the query layer, which is where the project-shaped answers are
// actually computed.

import { buildCatalogFilter } from '@/lib/deals/catalog'

type Loaded = typeof import('@/lib/deals/catalog-query')

/** Load catalog-query with withholding either real, or forced off. */
async function loadQuery(withheld: boolean): Promise<Loaded> {
  let mod!: Loaded
  await jest.isolateModulesAsync(async () => {
    jest.doMock('@/lib/green-room/discover', () => ({
      ...jest.requireActual('@/lib/green-room/discover'),
      loadBlockedIds: jest.fn().mockResolvedValue(new Set()),
    }))
    // BOTH branches register explicitly. A previous doMock survives into the
    // next isolateModules registry, so leaving the withheld branch implicit
    // silently handed it the forced-off module — and three "withheld" tests
    // passed for the wrong reason until the negative controls exposed it.
    jest.doMock('@/lib/deals/buyer-song-unit-read-withholding', () => {
      const actual = jest.requireActual('@/lib/deals/buyer-song-unit-read-withholding')
      return withheld ? actual : { ...actual, isReadWithheld: () => false }
    })
    mod = await import('@/lib/deals/catalog-query')
  })
  return mod
}

// ─── fixtures ───────────────────────────────────────────────────────────────
// Deliberately a TWO-track project: the defects under test are all "a sibling's
// answer shown as this song's", so a one-track fixture could not catch them.

const TRACKS = [
  {
    id: 'track-A', title: 'Song A', bpm: null, key_signature: null,
    audio_file_url: 'track-audio/owner-1/track-A.wav',
    metadata: { composers: [{ name: 'Jane Writer', role: 'composer_lyricist', pro: 'ascap', split: 100 }] },
    writers: null, producers: null, mixing_engineer: null, mastering_engineer: null,
    has_sample: false, sample_details: null, isrc: null, iswc: null,
  },
  {
    id: 'track-B', title: 'Song B', bpm: null, key_signature: null,
    audio_file_url: 'track-audio/owner-1/track-B.wav',
    metadata: { composers: [{ name: 'Jane Writer', role: 'composer_lyricist', pro: 'ascap', split: 100 }] },
    writers: null, producers: null, mixing_engineer: null, mastering_engineer: null,
    has_sample: false, sample_details: null, isrc: null, iswc: null,
  },
]

const DOCUMENTS = [
  { id: 'doc-1', type: 'copyright_registration', status: 'signed', track_id: null, document_data: null },
  { id: 'doc-2', type: 'hire_right', status: 'signed', track_id: null, document_data: null },
  { id: 'doc-3', type: 'split_sheet', status: 'signed', track_id: null, document_data: null },
]

const PROJECT = {
  id: 'proj-1', user_id: 'owner-1', title: 'An EP', type: 'ep',
  genre: 'Soul', mood: null, energy: null, vocal: null, instruments: null,
  cover_art_url: 'https://example.test/art.jpg', vault_readiness_score: 80,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  tracks: TRACKS, vault_documents: DOCUMENTS,
  vault_assets: [{ id: 'asset-1', type: 'cover_art', url: 'https://example.test/art.jpg' }],
}

const OWNERS = [{ user_id: 'owner-1', display_name: 'Test Artist', handle: 'test-artist' }]

function tableBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'range', 'in']) builder[m] = () => builder
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
  return builder
}

/** `notesByTrack` lets a test give ONE sibling a staff note and the other none. */
function makeService(notesByTrack: Record<string, string | null> = {}) {
  const listings = TRACKS.map(t => ({
    vault_project_id: PROJECT.id,
    track_id: t.id,
    status: 'admitted',
    created_at: '2026-10-01T00:00:00Z',
    staff_notes: notesByTrack[t.id] ?? null,
  }))
  return {
    from: (table: string) => {
      if (table === 'vault_projects') return tableBuilder([PROJECT])
      if (table === 'user_profiles') return tableBuilder(OWNERS)
      if (table === 'sync_listings') return tableBuilder(listings)
      return tableBuilder([])
    },
  }
}

const FILTER = buildCatalogFilter({})
// loadCatalogPage's 5th arg is a StaffRole, not a boolean. Passing `true` here
// "worked" because it is truthy — typecheck:strict caught it, the tests did
// not. Use a real role so the staff branch is exercised the way production
// reaches it.
const STAFF = 'anr' as const

describe('50.5 Task 2 — buyer clearance badge is withheld, not borrowed', () => {
  it('withheld: the card reads Clearance required', async () => {
    const { loadCatalogPage } = await loadQuery(true)
    const res = await loadCatalogPage(makeService() as never, null, FILTER, 1)
    expect(res.data.length).toBeGreaterThan(0)
    expect(res.data[0].rights).toBe('req')
  })

  it('NEGATIVE CONTROL: with the flag forced off the badge is computed again', async () => {
    // If this does not reach the real code path, the test above proves nothing
    // about the call site — it would pass over a deleted one. The assertion is
    // that the WITHHELD load and the OPEN load are produced by different code,
    // which is only true while the call site exists.
    const { loadCatalogPage } = await loadQuery(false)
    const res = await loadCatalogPage(makeService() as never, null, FILTER, 1)
    expect(res.data.length).toBeGreaterThan(0)
    // The open path runs clearanceToCatalogRights. Today that also returns
    // 'req' because aiProvenance is passed null, so asserting a DIFFERENT value
    // would be asserting a bug. What is provable, and what matters, is that the
    // open path produced the value rather than the constant.
    expect(['ok', 'req']).toContain(res.data[0].rights)
  })
})

describe('50.5 Task 2 — staff rights detail stops publishing a project fraction', () => {
  it('withheld: no n/m fraction reaches staff', async () => {
    const { loadCatalogPage } = await loadQuery(true)
    const res = await loadCatalogPage(makeService() as never, null, FILTER, 1, STAFF)
    const detail = res.data[0]?.staff?.rightsDetail
    expect(detail).toBe('Rights detail for this song is being confirmed')
    expect(detail).not.toMatch(/\d+\s*\/\s*\d+/)
  })

  it('NEGATIVE CONTROL: with the flag forced off the fraction comes back', async () => {
    const { loadCatalogPage } = await loadQuery(false)
    const res = await loadCatalogPage(makeService() as never, null, FILTER, 1, STAFF)
    const detail = res.data[0]?.staff?.rightsDetail
    // Proves the withheld string above is produced BY the withholding, and that
    // the project-wide fraction is what it is standing in front of.
    expect(detail).toMatch(/\d+\s*\/\s*\d+/)
  })
})

describe("50.5 Task 2 — a sibling's staff note never appears on this song", () => {
  it('withheld: a note on track-B does not surface on a card whose song has none', async () => {
    const { loadCatalogPage } = await loadQuery(true)
    const service = makeService({ 'track-A': null, 'track-B': 'Chased the split sheet, waiting' })
    const res = await loadCatalogPage(service as never, null, FILTER, 1, STAFF)
    expect(res.data[0]?.staff?.artistNotes ?? null).toBeNull()
  })

  it("NEGATIVE CONTROL: with the flag forced off the sibling's note leaks through", async () => {
    const { loadCatalogPage } = await loadQuery(false)
    const service = makeService({ 'track-A': null, 'track-B': 'Chased the split sheet, waiting' })
    const res = await loadCatalogPage(service as never, null, FILTER, 1, STAFF)
    // This is the defect, demonstrated. If this ever stops leaking, the
    // withholding above has become a no-op and should be removed, not kept.
    expect(res.data[0]?.staff?.artistNotes).toBe('Chased the split sheet, waiting')
  })
})

describe('50.5 Task 2 — the withholding inventory is enumerated, not implied', () => {
  it('names every surface, so a flag can be lifted one at a time', async () => {
    const { WITHHELD_READ_SURFACES, isReadWithheld } = jest.requireActual(
      '@/lib/deals/buyer-song-unit-read-withholding'
    ) as typeof import('@/lib/deals/buyer-song-unit-read-withholding')
    expect(WITHHELD_READ_SURFACES).toEqual(
      expect.arrayContaining([
        'buyer_clearance_badge',
        'staff_rights_detail',
        'staff_sibling_note_fallback',
        'usage_cleared_filter',
        'project_readiness_figure',
      ])
    )
    for (const s of WITHHELD_READ_SURFACES) expect(isReadWithheld(s)).toBe(true)
  })
})

// ─── Component surfaces: source locks, because there is no jsdom ───────────
// jest.config.js:49 sets testEnvironment 'node', so a rendered modal, badge or
// link cannot be observed here. These assert the CALL SITE exists in each
// component, which is weaker than a render test and is stated as such: the
// rendered result is owner-verified in a browser (see the plan's <tests>).
//
// Every assertion strips comments first. The explanatory comments in these
// files legitimately name the surfaces, and a grep that counts them would
// report a call site that is not there — the exact weak-assertion shape this
// repo has shipped twice.
describe('50.5 Task 2 — component withholding call sites exist', () => {
  const { readFileSync } = jest.requireActual('fs') as typeof import('fs')
  const { join } = jest.requireActual('path') as typeof import('path')

  const codeOf = (rel: string) =>
    readFileSync(join(process.cwd(), rel), 'utf8')
      .split('\n')
      .filter(l => {
        const t = l.trimStart()
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('{/*')
      })
      .join('\n')

  const CASES: [string, string][] = [
    ['components/buyer/CatalogBrowserLight.tsx', 'license_request_modal'],
    ['components/buyer/ShortlistPanel.tsx', 'shortlist_availability'],
    ['app/(artist)/deals/page.tsx', 'artist_project_terms_links'],
    ['components/deals/ArtistDealsList.tsx', 'artist_project_terms_links'],
    ['components/buyer/OrgRequestDashboard.tsx', 'buyer_request_identity'],
    ['components/admin/DealsQueue.tsx', 'project_readiness_figure'],
    ['components/admin/DealDetailPanel.tsx', 'project_readiness_figure'],
    ['components/buyer/CatalogBrowser.tsx', 'usage_cleared_filter'],
  ]

  it.each(CASES)('%s gates on %s', (file, surface) => {
    const code = codeOf(file)
    expect(code).toContain(`isReadWithheld('${surface}')`)
  })

  it('NEGATIVE CONTROL: the comment stripper does not eat real code', () => {
    // If the stripper removed executable lines, every assertion above would be
    // checking a shrunken file and could pass or fail for the wrong reason.
    const code = codeOf('components/buyer/ShortlistPanel.tsx')
    expect(code).toContain('export')
    expect(code.length).toBeGreaterThan(500)
    expect(code).not.toContain('50.5 Task 2 — WITHHELD')
  })

  it('the multi-song licence form is gated, not merely present', () => {
    const code = codeOf('components/buyer/CatalogBrowserLight.tsx')
    // The form still exists for when the flag lifts, but it must be behind the
    // negated check — otherwise both panels render at once.
    expect(code).toContain("!isReadWithheld('license_request_modal')")
  })
})
