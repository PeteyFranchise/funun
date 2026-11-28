import {
  compareCapturedIdentity,
  formatEquivalenceReport,
  type CapturedSongRow,
  type LegacyListingRow,
} from '@/lib/sync-library/crate-identity-equivalence'

const listing = (over: Partial<LegacyListingRow> = {}): LegacyListingRow => ({
  id: 'listing-1', status: 'admitted', track_id: 'track-1', vault_project_id: 'project-1', ...over,
})
const song = (over: Partial<CapturedSongRow> = {}): CapturedSongRow => ({
  id: 'song-1', source_listing_id: 'listing-1', source_track_id: 'track-1',
  source_project_id: 'project-1', lifecycle_state: 'draft', ...over,
})

describe('compareCapturedIdentity', () => {
  it('agrees when captured provenance matches the legacy listing', () => {
    expect(compareCapturedIdentity([song()], [listing()])).toEqual({
      checked: 1, agreed: 1, disagreed: 0, disagreements: [],
    })
  })

  it('catches a captured song pointing at a different track', () => {
    const r = compareCapturedIdentity([song({ source_track_id: 'track-OTHER' })], [listing()])
    expect(r.disagreed).toBe(1)
    expect(r.disagreements[0]).toMatchObject({ field: 'track_id', captured: 'track-OTHER', legacy: 'track-1' })
  })

  it('catches a captured song pointing at a different project', () => {
    const r = compareCapturedIdentity([song({ source_project_id: 'project-OTHER' })], [listing()])
    expect(r.disagreements[0]).toMatchObject({ field: 'vault_project_id' })
  })

  it('catches a captured song whose listing is no longer admitted', () => {
    const r = compareCapturedIdentity([song()], [listing({ status: 'withdrawn' })])
    expect(r.disagreements[0]).toMatchObject({ field: 'listing_not_admitted', legacy: 'withdrawn' })
  })

  it('catches a captured song whose listing has vanished', () => {
    const r = compareCapturedIdentity([song()], [])
    expect(r.disagreements[0]).toMatchObject({ field: 'missing_listing' })
  })

  it('counts an unmatchable song as a DISAGREEMENT, not a skip', () => {
    // Silently excluding what cannot be compared is how a shadow read reports
    // zero while meaning nothing.
    const r = compareCapturedIdentity([song({ source_listing_id: null })], [listing()])
    expect(r).toMatchObject({ checked: 1, agreed: 0, disagreed: 1 })
    expect(r.disagreements[0].field).toBe('no_provenance')
  })

  it('counts a song once even when it disagrees on several fields', () => {
    const r = compareCapturedIdentity(
      [song({ source_track_id: 'x', source_project_id: 'y' })],
      [listing({ status: 'rejected' })]
    )
    expect(r.disagreed).toBe(1)
    expect(r.disagreements.length).toBe(3)
  })

  it('reports the real totals across a mixed set', () => {
    const r = compareCapturedIdentity(
      [song(), song({ id: 'song-2', source_listing_id: 'listing-2', source_track_id: 'wrong' })],
      [listing(), listing({ id: 'listing-2', track_id: 'track-2' })]
    )
    expect(r).toMatchObject({ checked: 2, agreed: 1, disagreed: 1 })
  })
})

describe('formatEquivalenceReport', () => {
  it('states counts and never claims "clean"', () => {
    const line = formatEquivalenceReport({ checked: 412, agreed: 412, disagreed: 0, disagreements: [] })
    expect(line).toBe('crate identity equivalence: checked 412, agreed 412, disagreed 0')
    expect(line).not.toMatch(/clean|ok|pass/i)
  })
})
