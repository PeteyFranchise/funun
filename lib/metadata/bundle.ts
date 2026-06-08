// ─── Metadata Studio — bundle builder ────────────────────────────────
// Assembles the loose DB rows (project + tracks + artist name) into the
// typed ReleaseBundle the exporters use and the ReleaseForCheck the
// validator uses. One place so the page, export, and embed routes agree.

import { readComposers, type ReleaseRights } from '@/lib/metadata/schema'
import type { ReleaseBundle, TrackMeta } from '@/lib/metadata/export'
import type { ReleaseForCheck, TrackForCheck } from '@/lib/metadata/validate'

export type ProjectRow = {
  title: string
  type: string
  genre: string | null
  sub_genre: string | null
  release_date: string | null
  upc: string | null
  cover_art_url: string | null
  label: string | null
  publisher: string | null
  c_line: string | null
  p_line: string | null
  copyright_year: number | null
  primary_language: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
}

export type TrackRow = {
  id: string
  title: string | null
  track_number: number | null
  isrc: string | null
  iswc: string | null
  duration_seconds: number | null
  bpm: number | null
  key_signature: string | null
  explicit: boolean | null
  language: string | null
  featuring_artists: string[] | null
  audio_file_url: string | null
  metadata: Record<string, unknown> | null
}

export function rightsOf(project: ProjectRow): ReleaseRights {
  return {
    label: project.label,
    publisher: project.publisher,
    c_line: project.c_line,
    p_line: project.p_line,
    copyright_year: project.copyright_year,
    primary_language: project.primary_language,
    contact_name: project.contact_name,
    contact_email: project.contact_email,
    contact_phone: project.contact_phone,
  }
}

function sortTracks(tracks: TrackRow[]): TrackRow[] {
  return [...tracks].sort((a, b) => (a.track_number ?? 0) - (b.track_number ?? 0))
}

export function buildBundle(
  project: ProjectRow,
  tracks: TrackRow[],
  artistName: string
): ReleaseBundle {
  const trackMetas: TrackMeta[] = sortTracks(tracks).map(t => ({
    title: t.title ?? 'Untitled track',
    track_number: t.track_number,
    isrc: t.isrc,
    iswc: t.iswc,
    duration_seconds: t.duration_seconds,
    bpm: t.bpm,
    key_signature: t.key_signature,
    explicit: t.explicit ?? false,
    language: t.language,
    featuring_artists: t.featuring_artists ?? [],
    composers: readComposers(t.metadata),
    audio_file_url: t.audio_file_url,
  }))

  return {
    artistName: artistName || 'Unknown Artist',
    releaseTitle: project.title,
    releaseType: project.type,
    genre: project.genre,
    sub_genre: project.sub_genre,
    release_date: project.release_date,
    upc: project.upc,
    cover_art_url: project.cover_art_url,
    rights: rightsOf(project),
    tracks: trackMetas,
  }
}

export function buildCheckInput(
  project: ProjectRow,
  tracks: TrackRow[],
  cover?: { width?: number | null; height?: number | null }
): ReleaseForCheck {
  const trackChecks: TrackForCheck[] = sortTracks(tracks).map(t => ({
    id: t.id,
    title: t.title ?? 'Untitled track',
    isrc: t.isrc,
    iswc: t.iswc,
    audio_file_url: t.audio_file_url,
    composers: readComposers(t.metadata),
  }))

  return {
    title: project.title,
    type: project.type,
    upc: project.upc,
    cover_art_url: project.cover_art_url,
    cover_width: cover?.width ?? null,
    cover_height: cover?.height ?? null,
    rights: rightsOf(project),
    tracks: trackChecks,
  }
}
