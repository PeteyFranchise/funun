// ─── Phase 50.5B (B4) — the shadow read ─────────────────────────────────
//
// Captured identity and legacy identity must agree before anything contracts.
// The comparison is a pure function so it can be tested without a database, and
// so the script that runs it cannot quietly soften the predicate.
//
// IT REPORTS COUNTS, NEVER THE WORD "CLEAN". This project has a documented case
// of a named result that read correctly and was wrong: a column called
// owner_segment where six of eight rows held no owner. A summary that says
// "clean" cannot be checked; "checked 412, agreed 412, disagreed 0" can.

export type CapturedSongRow = {
  id: string
  source_listing_id: string | null
  source_track_id: string | null
  source_project_id: string | null
  lifecycle_state: string
}

export type LegacyListingRow = {
  id: string
  status: string
  track_id: string
  vault_project_id: string
}

export type Disagreement = {
  crateSongId: string
  listingId: string | null
  field: 'missing_listing' | 'track_id' | 'vault_project_id' | 'listing_not_admitted' | 'no_provenance'
  captured: string | null
  legacy: string | null
}

export type EquivalenceReport = {
  checked: number
  agreed: number
  disagreed: number
  disagreements: Disagreement[]
}

export function compareCapturedIdentity(
  songs: CapturedSongRow[],
  listings: LegacyListingRow[]
): EquivalenceReport {
  const byId = new Map(listings.map((l) => [l.id, l]))
  const disagreements: Disagreement[] = []

  for (const song of songs) {
    // A captured song with no provenance at all cannot be compared to anything.
    // That is a disagreement, not a skip: silently excluding the unmatchable is
    // how a shadow read reports zero while meaning nothing.
    if (!song.source_listing_id) {
      disagreements.push({
        crateSongId: song.id, listingId: null, field: 'no_provenance',
        captured: null, legacy: null,
      })
      continue
    }

    const listing = byId.get(song.source_listing_id)
    if (!listing) {
      disagreements.push({
        crateSongId: song.id, listingId: song.source_listing_id, field: 'missing_listing',
        captured: song.source_listing_id, legacy: null,
      })
      continue
    }

    if (listing.status !== 'admitted') {
      disagreements.push({
        crateSongId: song.id, listingId: listing.id, field: 'listing_not_admitted',
        captured: 'captured', legacy: listing.status,
      })
    }
    if (song.source_track_id !== listing.track_id) {
      disagreements.push({
        crateSongId: song.id, listingId: listing.id, field: 'track_id',
        captured: song.source_track_id, legacy: listing.track_id,
      })
    }
    if (song.source_project_id !== listing.vault_project_id) {
      disagreements.push({
        crateSongId: song.id, listingId: listing.id, field: 'vault_project_id',
        captured: song.source_project_id, legacy: listing.vault_project_id,
      })
    }
  }

  const songsWithDisagreement = new Set(disagreements.map((d) => d.crateSongId))
  return {
    checked: songs.length,
    agreed: songs.length - songsWithDisagreement.size,
    disagreed: songsWithDisagreement.size,
    disagreements,
  }
}

/** The one-line summary. States the numbers; never asserts a verdict it cannot support. */
export function formatEquivalenceReport(r: EquivalenceReport): string {
  return `crate identity equivalence: checked ${r.checked}, agreed ${r.agreed}, disagreed ${r.disagreed}`
}
