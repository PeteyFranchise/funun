import { authorizeRequestTarget } from './request-target'
import { isProfileVisibleTo } from '@/lib/trust-safety/contracts'
import { mustBlockActionBetween } from '@/lib/trust-safety/block-check'

// ─── authorizeRequestTarget — sync-library admission gate (26-06) ────────
// Replaces the beta `is_public !== true` inline check with a sync_listings
// admitted-row lookup routed through the SAME isAdmittedToSyncLibrary
// helper lib/deals/catalog.ts's isRightsReady uses (T-26-24 — no drift
// between the two gates). Everything downstream of the admission gate
// (visibility, block-check) is mocked here so this test isolates the gate
// itself. Stage 3 was mocked here too until D-11 removed it from this module.

jest.mock('@/lib/trust-safety/contracts', () => ({
  isProfileVisibleTo: jest.fn(),
}))
jest.mock('@/lib/trust-safety/block-check', () => ({
  mustBlockActionBetween: jest.fn(),
}))

const mockedIsProfileVisibleTo = isProfileVisibleTo as jest.MockedFunction<typeof isProfileVisibleTo>
const mockedMustBlockActionBetween = mustBlockActionBetween as jest.MockedFunction<typeof mustBlockActionBetween>

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    title: 'Test Track',
    user_id: 'owner-1',
    type: 'single',
    is_public: true,
    vault_readiness_score: 100,
    content_id_registered: false,
    content_id_dismissed_until: null,
    // 2026-10-11 (D-11): trackExposure requires a BOUND audio object. Note
    // what omitting it did while this file was being updated — the Stage-3 test
    // below kept PASSING after the gate it asserts was deleted, because
    // 'no_playable_master' refused the request for an unrelated reason. A
    // fixture gap can keep a test green over a behaviour it no longer covers.
    tracks: [{ id: 'track-1', title: 'Track One', audio_file_url: 'track-audio/o/1.wav' }],
    vault_documents: [],
    ...overrides,
  }
}

// Chainable query-builder spy — mirrors catalog-query.test.ts's tableBuilder,
// terminating on maybeSingle() rather than an awaitable `.then`.
function tableBuilder(row: unknown | null) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'limit']) {
    builder[m] = jest.fn(() => builder)
  }
  builder.maybeSingle = jest.fn(async () => ({ data: row, error: null }))
  return builder
}

// C-01: the sync_listings query no longer terminates on
// .limit(1).maybeSingle() (that only ever proved ANY row exists for the
// project) — it now returns every admitted row's track_id, so the gate can
// resolve admission per TRACK. This builder's select/eq chain returns
// itself and resolves via `.then`, mirroring catalog-query.test.ts's own
// tableBuilder shape for its (already per-track) sync_listings branch.
function arrayTableBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq']) {
    builder[m] = jest.fn(() => builder)
  }
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
  return builder
}

// 2026-10-11 (D-11): the sync_listings query no longer filters on
// status='admitted' — trackExposure's contract covers the terminal states and
// ranks them above everything, so the caller must pass every row for the track
// and let resolveListingStatus pick the one that describes it now. A fixture row
// therefore carries a status; it defaults to 'admitted' so existing cases read
// unchanged.
function makeService(opts: {
  project?: unknown | null
  admittedTracks?: { track_id: string; status?: string; created_at?: string }[] | null
  owner?: unknown | null
}) {
  const project = 'project' in opts ? opts.project : projectRow()
  const admittedTracks = ('admittedTracks' in opts ? opts.admittedTracks : [{ track_id: 'track-1' }]) ?? []
  const listingRows = admittedTracks.map(r => ({
    track_id: r.track_id,
    status: r.status ?? 'admitted',
    created_at: r.created_at ?? '2026-10-01T00:00:00Z',
  }))
  const owner = 'owner' in opts ? opts.owner : { id: 'owner-1', profile_visibility: 'public' }

  return {
    from: jest.fn((table: string) => {
      if (table === 'vault_projects') return tableBuilder(project)
      if (table === 'sync_listings') return arrayTableBuilder(listingRows)
      if (table === 'user_profiles') return tableBuilder(owner)
      return tableBuilder(null)
    }),
  }
}

beforeEach(() => {
  mockedIsProfileVisibleTo.mockReset()
  mockedMustBlockActionBetween.mockReset()
  mockedIsProfileVisibleTo.mockReturnValue(true)
  mockedMustBlockActionBetween.mockResolvedValue(false)
})

describe('authorizeRequestTarget — sync-library admission gate', () => {
  it('returns ok:false when the project has no admitted sync listing, even if otherwise ready', async () => {
    const service = makeService({ admittedTracks: [] })

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result).toEqual({ ok: false })
  })

  it('returns ok:true through the gate when the project has an admitted sync listing', async () => {
    const service = makeService({})

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.project.id).toBe('proj-1')
    }
  })

  it('returns ok:false when the project cannot be found, regardless of admission', async () => {
    const service = makeService({ project: null })

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result).toEqual({ ok: false })
  })

  it('still applies the visibility gate on top of admission (unchanged behavior)', async () => {
    const service = makeService({})
    mockedIsProfileVisibleTo.mockReturnValue(false)

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result).toEqual({ ok: false })
  })

  it('still applies the block gate on top of admission (unchanged behavior)', async () => {
    const service = makeService({})
    mockedMustBlockActionBetween.mockResolvedValue(true)

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result).toEqual({ ok: false })
  })

  // ─── REVERSED 2026-10-11 by owner decision D-11 ───────────────────────
  // This case used to assert ok:FALSE when computeStage3().canContinue was
  // false, i.e. when required rights documents were unsigned or a sample was
  // flagged. D-11: "Interest and request intake may proceed for a
  // clearance-required track; licence execution and delivery stay gated." A
  // supervisor asking about a song whose split sheet is not yet signed is the
  // ordinary case the product exists to serve.
  //
  // The gate is not merely unread — computeStage3 is no longer called from this
  // module at all, which is why its mock is gone from this file. An unread gate
  // left in the signature is the same bug with a comment on it.
  //
  // Rewritten as the positive assertion, so the removal is pinned rather than
  // just absent: a project with NOTHING signed is still requestable.
  it('ADMITS a request for a track with outstanding clearance work (D-11)', async () => {
    const service = makeService({ project: projectRow({ vault_documents: [], vault_readiness_score: 0 }) })

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.project.tracks.map(t => t.id)).toEqual(['track-1'])
  })

  // The negative controls that keep the case above from being satisfied by a
  // function that approves everything. Each is a reason the track is genuinely
  // UNAVAILABLE rather than merely uncleared.
  it('refuses a withdrawn listing — terminal state outranks everything', async () => {
    const service = makeService({ admittedTracks: [{ track_id: 'track-1', status: 'withdrawn' }] })

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result).toEqual({ ok: false })
  })

  it('refuses a track with no playable master, however complete its paperwork', async () => {
    const service = makeService({
      project: projectRow({ tracks: [{ id: 'track-1', title: 'Track One', audio_file_url: null }] }),
    })

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result).toEqual({ ok: false })
  })

  it('refuses a project type the catalogue would never have shown', async () => {
    // This function previously had NO type check, so a buyer could request a
    // project the catalogue refused to list. The two surfaces now agree.
    const service = makeService({ project: projectRow({ type: 'snippet' }) })

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result).toEqual({ ok: false })
  })

  it("does NOT refuse a truthful 'unreleased' project — the label is inside the eligible set", async () => {
    const service = makeService({ project: projectRow({ type: 'unreleased' }) })

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result.ok).toBe(true)
  })
})

// ─── C-01: admission is per TRACK, not per PROJECT ───────────────────────
// .planning/deliberations/2026-10-05-pass-5-rights-eligibility-review.md.
// This is the shared authority both POST /api/buyer/requests and
// POST /api/admin/deals consume verbatim (both build their validTrackIds
// directly from this return value, with no other admission check of their
// own) — proving track-2 is absent here proves neither route can build a
// license request naming it.
describe('authorizeRequestTarget — C-01: project.tracks excludes an unadmitted sibling', () => {
  it('stays ok:true for a mixed-admission project but returns only the admitted track', async () => {
    const project = projectRow({
      tracks: [
        { id: 'track-1', title: 'Track One', audio_file_url: 'track-audio/o/1.wav' },
        { id: 'track-2', title: 'Unreviewed Track', audio_file_url: 'track-audio/o/2.wav' },
      ],
    })
    const service = makeService({ project, admittedTracks: [{ track_id: 'track-1' }] })

    const result = await authorizeRequestTarget(service as never, 'buyer-1', 'proj-1')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.project.tracks.map(t => t.id)).toEqual(['track-1'])
    }
  })
})
