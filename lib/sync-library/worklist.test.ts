import {
  buildWorklist,
  shapeWorklistRow,
  type WorklistListingRow,
  type WorklistLookups,
  type WorklistProjectInput,
  type WorklistTrackInput,
} from './worklist'

// ─── Fixtures ─────────────────────────────────────────────────────────────
// Mirrors lib/sync-library/readiness.test.ts's COMPLETE_INPUT convention —
// a fully-covered single-track project that reads 'complete' on every
// SYNC_READINESS_KEYS item, so tests can flip exactly one field to observe
// exactly one item go missing.

function completeTrackMetadata(): Record<string, unknown> {
  return {
    composers: [{ name: 'Jane Writer', role: 'composer_lyricist', pro: 'ascap', split: 100 }],
  }
}

const COMPLETE_TRACK: WorklistTrackInput = {
  id: 'track-1',
  title: 'Golden Hour',
  isrc: 'US-ABC-26-00001',
  iswc: 'T-123456789-1',
  metadata: completeTrackMetadata(),
}

const COMPLETE_PROJECT: WorklistProjectInput = {
  title: 'Golden EP',
  type: 'single',
  documents: [
    { type: 'copyright_registration', status: 'signed' },
    { type: 'hire_right', status: 'signed' },
    { type: 'split_sheet', status: 'signed' },
  ],
}

const BASE_LISTING: WorklistListingRow = {
  id: 'listing-1',
  status: 'pending_admit',
  trackId: 'track-1',
  projectId: 'project-1',
  artistUserId: 'artist-1',
  appliedAt: '2026-08-01T00:00:00Z',
  qualityOk: null,
  staffNotes: null,
}

function lookupsFor(
  tracks: Record<string, WorklistTrackInput>,
  projects: Record<string, WorklistProjectInput>,
  artists: Record<string, string | null> = {}
): WorklistLookups {
  return {
    tracksById: new Map(Object.entries(tracks)),
    projectsById: new Map(Object.entries(projects)),
    artistNameById: new Map(Object.entries(artists)),
  }
}

// ─── shapeWorklistRow ───────────────────────────────────────────────────

describe('shapeWorklistRow', () => {
  it('derives missing[] via missingSyncItems(syncReadinessForTrack(...)) — an ISRC-less track surfaces isrc_codes', () => {
    const row = shapeWorklistRow({
      listing: {
        id: 'listing-1',
        status: 'pending_admit',
        trackId: 'track-1',
        appliedAt: '2026-08-01T00:00:00Z',
        qualityOk: null,
        staffNotes: null,
      },
      track: { ...COMPLETE_TRACK, isrc: null },
      project: COMPLETE_PROJECT,
      artistName: 'Jane Doe',
    })
    expect(row.missing.some(m => m.key === 'isrc_codes')).toBe(true)
    expect(row.missing.find(m => m.key === 'isrc_codes')?.label).toBe('ISRC codes assigned')
  })

  it('a fully-complete track yields an empty missing[]', () => {
    const row = shapeWorklistRow({
      listing: {
        id: 'listing-1',
        status: 'pending_admit',
        trackId: 'track-1',
        appliedAt: '2026-08-01T00:00:00Z',
        qualityOk: null,
        staffNotes: null,
      },
      track: COMPLETE_TRACK,
      project: COMPLETE_PROJECT,
      artistName: 'Jane Doe',
    })
    expect(row.missing).toEqual([])
  })

  it('carries through listingId/trackId/status/qualityOk/staffNotes/artistName unchanged', () => {
    const row = shapeWorklistRow({
      listing: {
        id: 'listing-9',
        status: 'applied',
        trackId: 'track-9',
        appliedAt: '2026-08-02T00:00:00Z',
        qualityOk: true,
        staffNotes: 'Needs ISRC',
      },
      track: COMPLETE_TRACK,
      project: COMPLETE_PROJECT,
      artistName: 'Jane Doe',
    })
    expect(row.listingId).toBe('listing-9')
    expect(row.trackId).toBe('track-9')
    expect(row.status).toBe('applied')
    expect(row.qualityOk).toBe(true)
    expect(row.staffNotes).toBe('Needs ISRC')
    expect(row.artistName).toBe('Jane Doe')
  })
})

// ─── buildWorklist ────────────────────────────────────────────────────────

describe('buildWorklist', () => {
  it('yields a WorklistRow for a pending_admit listing whose track lacks an ISRC, with missing including isrc_codes', () => {
    const listings: WorklistListingRow[] = [{ ...BASE_LISTING }]
    const lookups = lookupsFor(
      { 'track-1': { ...COMPLETE_TRACK, isrc: null } },
      { 'project-1': COMPLETE_PROJECT },
      { 'artist-1': 'Jane Doe' }
    )
    const rows = buildWorklist(listings, lookups)
    expect(rows).toHaveLength(1)
    expect(rows[0].missing.some(m => m.key === 'isrc_codes')).toBe(true)
  })

  it('excludes admitted and terminal (rejected/withdrawn/removed) listings', () => {
    const listings: WorklistListingRow[] = [
      { ...BASE_LISTING, id: 'l-admitted', status: 'admitted' },
      { ...BASE_LISTING, id: 'l-rejected', status: 'rejected' },
      { ...BASE_LISTING, id: 'l-withdrawn', status: 'withdrawn' },
      { ...BASE_LISTING, id: 'l-removed', status: 'removed' },
      { ...BASE_LISTING, id: 'l-included', status: 'pending_admit' },
    ]
    const lookups = lookupsFor(
      { 'track-1': COMPLETE_TRACK },
      { 'project-1': COMPLETE_PROJECT },
      { 'artist-1': 'Jane Doe' }
    )
    const rows = buildWorklist(listings, lookups)
    expect(rows.map(r => r.listingId)).toEqual(['l-included'])
  })

  it('a fully-complete pending listing has an empty missing[]', () => {
    const listings: WorklistListingRow[] = [{ ...BASE_LISTING, status: 'applied' }]
    const lookups = lookupsFor(
      { 'track-1': COMPLETE_TRACK },
      { 'project-1': COMPLETE_PROJECT },
      { 'artist-1': 'Jane Doe' }
    )
    const rows = buildWorklist(listings, lookups)
    expect(rows).toHaveLength(1)
    expect(rows[0].missing).toEqual([])
  })

  it('orders rows oldest-first by appliedAt and carries through qualityOk/staffNotes', () => {
    const listings: WorklistListingRow[] = [
      {
        ...BASE_LISTING,
        id: 'l-newer',
        appliedAt: '2026-08-05T00:00:00Z',
        qualityOk: true,
        staffNotes: 'Looks good',
      },
      {
        ...BASE_LISTING,
        id: 'l-older',
        appliedAt: '2026-08-01T00:00:00Z',
        qualityOk: false,
        staffNotes: 'Failed quality bar',
      },
    ]
    const lookups = lookupsFor(
      { 'track-1': COMPLETE_TRACK },
      { 'project-1': COMPLETE_PROJECT },
      { 'artist-1': 'Jane Doe' }
    )
    const rows = buildWorklist(listings, lookups)
    expect(rows.map(r => r.listingId)).toEqual(['l-older', 'l-newer'])
    expect(rows[0].qualityOk).toBe(false)
    expect(rows[0].staffNotes).toBe('Failed quality bar')
    expect(rows[1].qualityOk).toBe(true)
    expect(rows[1].staffNotes).toBe('Looks good')
  })

  it('skips a listing whose track or project lookup is missing, rather than throwing', () => {
    const listings: WorklistListingRow[] = [{ ...BASE_LISTING, id: 'l-orphan', trackId: 'ghost-track' }]
    const lookups = lookupsFor({}, { 'project-1': COMPLETE_PROJECT }, {})
    expect(() => buildWorklist(listings, lookups)).not.toThrow()
    expect(buildWorklist(listings, lookups)).toEqual([])
  })
})
