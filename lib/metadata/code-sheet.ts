// ─── Cross-project code sheet ────────────────────────────────────────
// One row per track across an artist's ENTIRE catalog, listing every
// identifier Funūn knows about that track/release. This is a catalog
// inventory, not a filtered list — a track with no identifiers still
// gets a row (blank cells), so the artist can see what's missing as
// easily as what's present. Client-safe: no Node-only deps.

import { csvCell } from '@/lib/metadata/export'

export type CodeSheetProjectRow = {
  id: string
  title: string
  release_date: string | null
  upc: string | null
  grid: string | null
  catalog_number: string | null
}

export type CodeSheetTrackRow = {
  project_id: string
  title: string | null
  track_number: number | null
  isrc: string | null
  iswc: string | null
  duration_seconds: number | null
}

const CODE_SHEET_HEADERS = [
  'release_title',
  'track_title',
  'isrc',
  'iswc',
  'upc',
  'grid',
  'catalog_number',
  'duration_seconds',
  'release_date',
]

/** Sort key for release_date, oldest/null last when sorting descending. */
function releaseDateSortKey(d: string | null): number {
  if (!d) return -Infinity
  const t = new Date(d).getTime()
  return Number.isFinite(t) ? t : -Infinity
}

/**
 * One row per track, release title + track title + every identifier +
 * duration + release date, newest release first (then track number
 * ascending within a release). Tracks referencing a project not present
 * in `projects` are skipped defensively — callers should always pass a
 * matched, owner-scoped set of both.
 */
export function buildCodeSheet(
  projects: CodeSheetProjectRow[],
  tracks: CodeSheetTrackRow[]
): string {
  const byProject = new Map(projects.map(p => [p.id, p]))

  const rows = tracks
    .map(t => {
      const project = byProject.get(t.project_id)
      if (!project) return null
      return {
        releaseTitle: project.title,
        trackTitle: t.title ?? '',
        isrc: t.isrc ?? '',
        iswc: t.iswc ?? '',
        upc: project.upc ?? '',
        grid: project.grid ?? '',
        catalogNumber: project.catalog_number ?? '',
        duration: t.duration_seconds ?? '',
        releaseDate: project.release_date ?? '',
        trackNumber: t.track_number ?? 0,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  rows.sort((a, b) => {
    const dateDiff = releaseDateSortKey(b.releaseDate || null) - releaseDateSortKey(a.releaseDate || null)
    if (dateDiff !== 0) return dateDiff
    return a.trackNumber - b.trackNumber
  })

  const lines = [CODE_SHEET_HEADERS.join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.releaseTitle,
        r.trackTitle,
        r.isrc,
        r.iswc,
        r.upc,
        r.grid,
        r.catalogNumber,
        r.duration,
        r.releaseDate,
      ]
        .map(csvCell)
        .join(',')
    )
  }
  return lines.join('\n')
}
