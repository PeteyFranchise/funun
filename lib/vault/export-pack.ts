// ─── Export Pack — pure manifest assembler ────────────────────────────
// Gathers a vault project + its tracks into a typed list of which bundle
// members actually exist (master WAV, share MP3, stems ZIP, instrumental,
// and two always-generated PDFs). Pure transform — no Storage I/O, no
// Supabase queries. I/O stays in the export route (Plan 06).

import {
  readMasterAudio,
  readStems,
  readInstrumental,
  readComposers,
} from '@/lib/metadata/schema'
import type { ProjectRow, TrackRow } from '@/lib/metadata/bundle'

// ─── Types ───────────────────────────────────────────────────────────────

/** A single downloadable file in the export bundle. */
export type BundleFile = {
  /** Storage path (relative to the bucket root) — used by the route to download. */
  path: string
  /** Human-readable, collision-safe filename for the ZIP entry. */
  filename: string
  /** What audio rendition this file contains. */
  kind: 'master' | 'share' | 'stems' | 'instrumental'
}

/** A track row enriched with the derived fields PDF renderers need. */
export type ExportTrack = {
  id: string
  title: string
  track_number: number | null
  isrc: string | null
  iswc: string | null
  duration_seconds: number | null
  bpm: number | null
  key_signature: string | null
  language: string | null
  composers: ReturnType<typeof readComposers>
}

/** The fully resolved manifest the export route iterates to build the ZIP. */
export type ExportManifest = {
  /** Downloadable audio/stems files that are actually present on this project. */
  files: BundleFile[]
  /** True if at least one track has a master WAV. Used for the no-master gate. */
  hasMaster: boolean
  /** Always true — the credits/splits PDF is always generated from whatever data exists. */
  creditsSheet: true
  /** Always true — the metadata PDF is always generated from whatever data exists. */
  metadataSheet: true
  /** Enriched track rows for the PDF renderers (same order as files: sorted by track_number). */
  tracks: ExportTrack[]
  /** Release title and artist name — used as PDF headers. */
  releaseTitle: string
  artistName: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Sort tracks by track_number ascending; tracks with null come last. */
function sortTracks(tracks: TrackRow[]): TrackRow[] {
  return [...tracks].sort((a, b) => (a.track_number ?? 9999) - (b.track_number ?? 9999))
}

/**
 * Sanitize a track title into a URL/filename-safe slug.
 * Keeps ASCII letters, digits, and hyphens; collapses runs of dashes.
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'track'
}

/**
 * Build a collision-safe filename for a bundle entry.
 * Format: `{padded-track-number}-{title-slug}.{kind}.{ext}`
 * Example: `01-song-title.master.wav`, `02-other-song.stems.zip`
 */
function bundleFilename(
  trackNumber: number | null,
  title: string | null,
  kind: BundleFile['kind'],
  ext: string
): string {
  const num = trackNumber != null ? String(trackNumber).padStart(2, '0') : '00'
  const slug = slugify(title ?? 'track')
  return `${num}-${slug}.${kind}.${ext}`
}

// ─── Main export ─────────────────────────────────────────────────────────

/**
 * Build the export manifest for a project: which files exist, collision-safe
 * filenames for each, and the enriched track list the PDF renderers need.
 *
 * This function is PURE — it performs no Storage downloads and no Supabase
 * queries. All I/O responsibility belongs to the export route that calls it.
 */
export function buildExportManifest(
  project: ProjectRow & { artist_name?: string | null },
  tracks: TrackRow[]
): ExportManifest {
  const sorted = sortTracks(tracks)
  const files: BundleFile[] = []
  let hasMaster = false

  for (const t of sorted) {
    const num = t.track_number
    const title = t.title

    // Share MP3 — present when audio_file_url is set
    if (t.audio_file_url) {
      // audio_file_url is a public URL; extract the storage path from it or
      // treat it as the path directly (the route already knows the bucket).
      files.push({
        path: t.audio_file_url,
        filename: bundleFilename(num, title, 'share', 'mp3'),
        kind: 'share',
      })
    }

    // Master WAV — present when tracks.metadata.master exists
    const master = readMasterAudio(t.metadata)
    if (master) {
      hasMaster = true
      files.push({
        path: master.path,
        filename: bundleFilename(num, title, 'master', master.ext),
        kind: 'master',
      })
    }

    // Stems ZIP — present when tracks.metadata.stems exists
    const stems = readStems(t.metadata)
    if (stems) {
      const ext = stems.name.split('.').pop() ?? 'zip'
      files.push({
        path: stems.path,
        filename: bundleFilename(num, title, 'stems', ext),
        kind: 'stems',
      })
    }

    // Instrumental audio — present when tracks.metadata.instrumental exists
    const instrumental = readInstrumental(t.metadata)
    if (instrumental) {
      files.push({
        path: instrumental.path,
        filename: bundleFilename(num, title, 'instrumental', instrumental.ext),
        kind: 'instrumental',
      })
    }
  }

  // Enrich tracks for PDF renderers
  const exportTracks: ExportTrack[] = sorted.map(t => ({
    id: t.id,
    title: t.title ?? 'Untitled track',
    track_number: t.track_number,
    isrc: t.isrc,
    iswc: t.iswc,
    duration_seconds: t.duration_seconds,
    bpm: t.bpm,
    key_signature: t.key_signature,
    language: t.language,
    composers: readComposers(t.metadata),
  }))

  return {
    files,
    hasMaster,
    creditsSheet: true,
    metadataSheet: true,
    tracks: exportTracks,
    releaseTitle: project.title,
    artistName: project.artist_name ?? '',
  }
}
