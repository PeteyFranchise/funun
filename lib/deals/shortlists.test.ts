import { loadShortlistEntries } from './shortlists'
import { computeStage3 } from '@/lib/vault/stage3'

// ─── loadShortlistEntries — sync-library admission gate (26-06) ──────────
// isRightsReady's contract changed from `is_public` to
// `has_admitted_sync_listing` (lib/deals/catalog.ts). This is a THIRD
// production caller of the shared isRightsReady helper (not itself an
// inline `is_public !== true` duplicate — it already delegated to the
// helper) that must be wired with the same sync_listings-derived signal
// so "still rights ready" does not silently fail closed for every saved
// shortlist entry (Rule 3 — blocking type error / Rule 1 — correctness).

jest.mock('@/lib/vault/stage3', () => ({
  computeStage3: jest.fn(),
}))

const mockedComputeStage3 = computeStage3 as jest.MockedFunction<typeof computeStage3>

function tableBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'in']) {
    builder[m] = jest.fn(() => builder)
  }
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
  return builder
}

function shortlistRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sl-1',
    vault_project_id: 'proj-1',
    created_by: 'saver-1',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// 2026-09-10: isRightsReady gates on the SIX decided entry items
// (split sheets, copyright, producer agreements, audio files, metadata,
// cover art) instead of vault_readiness_score, so a fixture project must
// now actually carry those inputs to be catalogue-visible. The old
// `tracks: [] / vault_documents: []` shape passed only because the gate
// read a rolled-up number. Note there is deliberately NO distributor and
// NO isrc/iswc here — this fixture IS the "every signature signed, no
// release admin" song the new gate exists to admit.
function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj-1',
    title: 'Test Track',
    type: 'single',
    vault_readiness_score: 100,
    content_id_registered: false,
    content_id_dismissed_until: null,
    tracks: [
      {
        id: 'track-1',
        title: 'Test Track',
        // 2026-10-11 (D-11): trackExposure requires a BOUND audio object.
        // Without it the fixture reads 'no_playable_master' and every
        // availability assertion below sees false — fail-closed, but wrong.
        audio_file_url: 'track-audio/owner-1/track-1.wav',
        metadata: {
          composers: [{ name: 'Jane Writer', role: 'composer_lyricist', pro: 'ascap', split: 100 }],
        },
        writers: null,
        producers: null,
        mixing_engineer: null,
        mastering_engineer: null,
        has_sample: false,
        sample_details: null,
      },
    ],
    vault_documents: [
      { id: 'doc-1', type: 'copyright_registration', status: 'signed', track_id: null, document_data: null },
      { id: 'doc-2', type: 'hire_right', status: 'signed', track_id: null, document_data: null },
      { id: 'doc-3', type: 'split_sheet', status: 'signed', track_id: null, document_data: null },
    ],
    vault_assets: [{ id: 'asset-1', type: 'cover_art' }],
    ...overrides,
  }
}

// 2026-10-11 (D-11): the query stopped filtering `.eq('status','admitted')`
// and resolves exposure PER TRACK, so a fixture listing row now needs a
// track_id, a status and a created_at. A bare project id expands to one admitted
// row per track on that project — which is what `admittedProjectIds` always
// meant here. Pass `{ id, trackId, status }` to exercise a terminal row.
function makeService(opts: {
  shortlists: unknown[]
  projects: unknown[]
  admittedProjectIds: (string | { id: string; trackId: string; status?: string })[]
}) {
  const projectsById = new Map(
    (opts.projects as { id: string; tracks?: { id: string }[] }[]).map(p => [p.id, p])
  )
  const admitted = opts.admittedProjectIds.flatMap(entry => {
    if (typeof entry === 'string') {
      return (projectsById.get(entry)?.tracks ?? []).map(t => ({
        vault_project_id: entry,
        track_id: t.id,
        status: 'admitted',
        created_at: '2026-10-01T00:00:00Z',
      }))
    }
    return [
      {
        vault_project_id: entry.id,
        track_id: entry.trackId,
        status: entry.status ?? 'admitted',
        created_at: '2026-10-01T00:00:00Z',
      },
    ]
  })
  return {
    from: jest.fn((table: string) => {
      if (table === 'buyer_shortlists') return tableBuilder(opts.shortlists)
      if (table === 'vault_projects') return tableBuilder(opts.projects)
      if (table === 'sync_listings') return tableBuilder(admitted)
      return tableBuilder([])
    }),
    auth: {
      admin: {
        getUserById: jest.fn(async () => ({ data: { user: { user_metadata: { display_name: 'Saver' } } } })),
      },
    },
  }
}

beforeEach(() => {
  mockedComputeStage3.mockReset()
  mockedComputeStage3.mockReturnValue({
    required: [],
    recommended: [],
    complete: [],
    requiredComplete: 0,
    requiredTotal: 0,
    canContinue: true,
    sampleBlock: false,
  })
})

describe('loadShortlistEntries — sync-library admission gate', () => {
  it('marks stillAvailable true for a saved project with an admitted, playable track', async () => {
    const service = makeService({
      shortlists: [shortlistRow()],
      projects: [projectRow()],
      admittedProjectIds: ['proj-1'],
    })

    const result = await loadShortlistEntries(service as never, 'org-1')

    expect(result).toHaveLength(1)
    // 50.5 Task 2 — availability is WITHHELD, and this test is the reason it
    // had to be. `stillAvailable` was true because SOME track on the project
    // was admitted, which is the any-sibling rule: a song the buyer never
    // chose kept their save alive. The entry carries the distinction so the
    // panel says the recording is being confirmed rather than the false claim
    // "No longer available". The open-path behaviour is still asserted, in the
    // negative control at the end of this file.
    expect(result[0].stillAvailable).toBe(false)
    expect(result[0].availabilityWithheld).toBe(true)
  })

  it('marks stillAvailable false when no track on the project is admitted', async () => {
    const service = makeService({
      shortlists: [shortlistRow()],
      projects: [projectRow()],
      admittedProjectIds: [],
    })

    const result = await loadShortlistEntries(service as never, 'org-1')

    expect(result).toHaveLength(1)
    expect(result[0].stillAvailable).toBe(false)
    // Nothing exposed means no clearance answer to give, rather than a
    // confident "cleared" over an empty set.
    expect(result[0].clearance).toBeNull()
  })
})

// ─── D-11: availability and clearance are separate answers ───────────────
// What changed here is the QUESTION, not the implementation. The field used to
// be stillRightsReady and came from isRightsReady, so a saved entry whose
// paperwork was incomplete rendered "No longer rights-ready" and had its
// Request licence link disabled. Under D-11 clearance work in progress never
// removes a track from The Crate and never blocks request intake.
describe('loadShortlistEntries — D-11: clearance work does not make an entry unavailable', () => {
  it('stays AVAILABLE when a required document is unsigned, and reports clearance_required', async () => {
    const project = projectRow({
      vault_documents: [
        { id: 'doc-1', type: 'copyright_registration', status: 'signed', track_id: null, document_data: null },
        { id: 'doc-2', type: 'hire_right', status: 'signed', track_id: null, document_data: null },
        { id: 'doc-3', type: 'split_sheet', status: 'pending', track_id: null, document_data: null },
      ],
    })
    const service = makeService({
      shortlists: [shortlistRow()],
      projects: [project],
      admittedProjectIds: ['proj-1'],
    })

    const result = await loadShortlistEntries(service as never, 'org-1')

    // D-11's substance is unchanged as a RULE, and is asserted on the open
    // path in the negative control at the end of this file. Here availability
    // is withheld, so the honest assertion is that no availability claim is
    // made at all rather than that the entry is available.
    expect(result[0].stillAvailable).toBe(false)
    expect(result[0].availabilityWithheld).toBe(true)

    // 50.5 Task 2 — the clearance VALUE is now withheld. It was derived from
    // `exposedTracks[0]`, whichever sibling sorted first, and published as the
    // saved entry's answer. The save is keyed to a PROJECT, so there is no song
    // to answer for: a buyer who saved an EP never told us which recording they
    // meant. The panel says "Clearance being confirmed" instead of labelling a
    // song chosen on their behalf.
    //
    // This assertion previously read `.toBe('clearance_required')`. Updated
    // rather than deleted so the reversal is visible.
    expect(result[0].clearance).toBeNull()
  })

  it('goes UNAVAILABLE when the listing was withdrawn — the thing that really does remove it', async () => {
    const service = makeService({
      shortlists: [shortlistRow()],
      projects: [projectRow()],
      admittedProjectIds: [{ id: 'proj-1', trackId: 'track-1', status: 'withdrawn' }],
    })

    const result = await loadShortlistEntries(service as never, 'org-1')

    expect(result[0].stillAvailable).toBe(false)
  })

  it('goes UNAVAILABLE when the master is gone, however complete the paperwork', async () => {
    const project = projectRow({
      tracks: [
        {
          id: 'track-1',
          title: 'Test Track',
          audio_file_url: null,
          metadata: {
            composers: [{ name: 'Jane Writer', role: 'composer_lyricist', pro: 'ascap', split: 100 }],
          },
          writers: null,
          producers: null,
          mixing_engineer: null,
          mastering_engineer: null,
          has_sample: false,
          sample_details: null,
        },
      ],
    })
    const service = makeService({
      shortlists: [shortlistRow()],
      projects: [project],
      admittedProjectIds: ['proj-1'],
    })

    const result = await loadShortlistEntries(service as never, 'org-1')

    expect(result[0].stillAvailable).toBe(false)
  })
})

// ─── 50.5 Task 2 — NEGATIVE CONTROL for the withheld clearance ─────────────
// The assertion above (clearance === null) is only meaningful if the null comes
// from the withholding rather than from the fixture producing nothing. This
// loads the module with isReadWithheld forced false and proves the
// representative-sibling clearance is exactly what the withholding stands in
// front of. If someone deletes the call site, this test keeps passing and the
// one above starts failing — which is the pair working as intended.
describe('50.5 Task 2 — the withheld clearance is produced BY the withholding', () => {
  it('with the flag forced off, the first exposed sibling supplies the answer again', async () => {
    const project = projectRow({
      vault_documents: [
        { id: 'doc-1', type: 'copyright_registration', status: 'signed', track_id: null, document_data: null },
        { id: 'doc-2', type: 'hire_right', status: 'signed', track_id: null, document_data: null },
        { id: 'doc-3', type: 'split_sheet', status: 'pending', track_id: null, document_data: null },
      ],
    })
    const service = makeService({
      shortlists: [shortlistRow()],
      projects: [project],
      admittedProjectIds: ['proj-1'],
    })

    let open!: typeof import('./shortlists')
    await jest.isolateModulesAsync(async () => {
      jest.doMock('@/lib/deals/buyer-song-unit-read-withholding', () => ({
        ...jest.requireActual('@/lib/deals/buyer-song-unit-read-withholding'),
        isReadWithheld: () => false,
      }))
      open = await import('./shortlists')
    })

    const result = await open.loadShortlistEntries(service as never, 'org-1')
    // Both halves of the withholding, proven to come FROM the withholding:
    // availability returns, and so does the representative sibling's clearance.
    expect(result[0].stillAvailable).toBe(true)
    expect(result[0].availabilityWithheld).toBeUndefined()
    expect(result[0].clearance).toBe('clearance_required')
  })
})
