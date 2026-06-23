// ─── Metadata Studio — validation ────────────────────────────────────
// Pure pre-flight checks: format validation (ISRC/UPC/ISWC), publishing
// split totals, PRO coverage, cover-art dimensions, and whether the audio
// format can carry embedded tags. Used both server-side (export/embed
// guards) and client-side (live report in the studio).

import type { Composer, ReleaseRights } from '@/lib/metadata/schema'
import { isValidIswc as isValidIswcFull, isValidIswcShape } from '@/lib/metadata/identifiers'

export type CheckLevel = 'error' | 'warn' | 'ok'

export type Check = {
  /** Stable key for React lists. */
  key: string
  /** Human label of the field being checked. */
  field: string
  level: CheckLevel
  message: string
  /** Which track this relates to (omitted for release-level checks). */
  trackTitle?: string
}

export type ValidationReport = {
  checks: Check[]
  errors: number
  warnings: number
  /** No errors — safe to export / deliver. */
  ready: boolean
}

// ── Format matchers ──────────────────────────────────────────────────

/** ISRC = 2 country + 3 registrant + 2 year + 5 designation (12 chars). */
export function isValidIsrc(raw: string | null | undefined): boolean {
  if (!raw) return false
  const v = raw.replace(/[\s-]/g, '').toUpperCase()
  return /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/.test(v)
}

/** UPC-A (12) or EAN-13 (13) — digits only. */
export function isValidUpc(raw: string | null | undefined): boolean {
  if (!raw) return false
  const v = raw.replace(/[\s-]/g, '')
  return /^\d{12,13}$/.test(v)
}

/** ISWC = T + 9 digits + 1 CISAC check digit, e.g. T-034.524.680-1. */
export function isValidIswc(raw: string | null | undefined): boolean {
  if (!raw) return false
  return isValidIswcFull(raw)
}

const EMBEDDABLE_EXT = ['mp3', 'flac']
const TAGGABLE_NOTE: Record<string, string> = {
  wav: 'WAV files do not carry embedded tags — deliver the sidecar alongside the file.',
  aif: 'AIFF tag support is limited — prefer MP3/FLAC for tagged delivery, or use the sidecar.',
  aiff: 'AIFF tag support is limited — prefer MP3/FLAC for tagged delivery, or use the sidecar.',
}

export function audioExtension(url: string | null | undefined): string | null {
  if (!url) return null
  const clean = url.split('?')[0]
  const m = clean.match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : null
}

/** Can this file format carry embedded tags (vs. needing a sidecar)? */
export function canEmbed(url: string | null | undefined): boolean {
  const ext = audioExtension(url)
  return ext != null && EMBEDDABLE_EXT.includes(ext)
}

// ── Track / release shapes the validator reads ───────────────────────

export type TrackForCheck = {
  id: string
  title: string
  isrc: string | null
  iswc: string | null
  audio_file_url: string | null
  composers: Composer[]
}

export type ReleaseForCheck = {
  title: string
  type: string
  upc: string | null
  cover_art_url: string | null
  cover_width?: number | null
  cover_height?: number | null
  rights: ReleaseRights
  tracks: TrackForCheck[]
}

const MIN_ART = 1600 // absolute floor a few DSPs still accept
const RECOMMENDED_ART = 3000 // the square spec every distributor/DSP wants

// ── Main entry ───────────────────────────────────────────────────────
export function validateRelease(release: ReleaseForCheck): ValidationReport {
  const checks: Check[] = []
  const add = (
    key: string,
    field: string,
    level: CheckLevel,
    message: string,
    trackTitle?: string
  ) => checks.push({ key, field, level, message, trackTitle })

  // ── Release-level ──
  if (release.upc) {
    add(
      'upc',
      'UPC / EAN',
      isValidUpc(release.upc) ? 'ok' : 'error',
      isValidUpc(release.upc) ? 'Valid barcode.' : 'UPC must be 12–13 digits.'
    )
  } else {
    add('upc', 'UPC / EAN', 'warn', 'No barcode yet — your distributor usually assigns one.')
  }

  // Cover art — distributors require a SQUARE image; 3000×3000 is the standard
  // every DSP accepts (1600 is the bare floor only a few still take).
  if (!release.cover_art_url) {
    add('art', 'Cover art', 'error', 'No cover art uploaded.')
  } else if (release.cover_width && release.cover_height) {
    const w = release.cover_width
    const h = release.cover_height
    const dims = `${w}×${h}px`
    const square = w === h
    if (w < MIN_ART || h < MIN_ART)
      add('art', 'Cover art', 'error', `Art is ${dims} — below the ${MIN_ART}×${MIN_ART} minimum DSPs accept. Use ${RECOMMENDED_ART}×${RECOMMENDED_ART}.`)
    else if (!square)
      add('art', 'Cover art', 'error', `Art is ${dims} — cover art must be square (${RECOMMENDED_ART}×${RECOMMENDED_ART}).`)
    else if (w < RECOMMENDED_ART)
      add('art', 'Cover art', 'warn', `Art is ${dims} — accepted, but ${RECOMMENDED_ART}×${RECOMMENDED_ART} is the distribution standard. Upsize before you submit.`)
    else
      add('art', 'Cover art', 'ok', `${dims} — meets the ${RECOMMENDED_ART}×${RECOMMENDED_ART} distribution standard.`)
  } else {
    add('art', 'Cover art', 'warn', `Uploaded, but dimensions unverified — confirm it is ${RECOMMENDED_ART}×${RECOMMENDED_ART}px and square.`)
  }

  // Rights block
  const r = release.rights
  if (!r.p_line) add('p_line', '℗ line', 'warn', 'Add the ℗ (sound-recording) line, e.g. "℗ 2026 Your Name".')
  if (!r.c_line) add('c_line', '© line', 'warn', 'Add the © (composition) line, e.g. "© 2026 Your Name".')
  if (!r.contact_email) add('contact', 'Contact', 'warn', 'Add a contact email so radio/DJs/licensors can reach you.')
  else add('contact', 'Contact', 'ok', `Contact set: ${r.contact_email}.`)

  // ── Per track ──
  for (const t of release.tracks) {
    const T = t.title || 'Untitled track'

    // ISRC
    if (t.isrc) {
      add(`isrc:${t.id}`, 'ISRC', isValidIsrc(t.isrc) ? 'ok' : 'error',
        isValidIsrc(t.isrc) ? 'Valid recording code.' : 'ISRC format looks wrong (expected CC-XXX-YY-NNNNN).', T)
    } else {
      add(`isrc:${t.id}`, 'ISRC', 'error', 'No ISRC — required to track plays and royalties.', T)
    }

    // ISWC (optional, PRO-issued — validate shape + check digit if present)
    if (t.iswc) {
      if (!isValidIswcShape(t.iswc)) {
        add(`iswc:${t.id}`, 'ISWC', 'warn', 'ISWC format looks wrong (expected T-DDDDDDDDD-C).', T)
      } else if (!isValidIswcFull(t.iswc)) {
        add(`iswc:${t.id}`, 'ISWC', 'warn', 'ISWC check digit doesn’t match — re-check the code from your PRO.', T)
      }
    }

    // Composers
    if (t.composers.length === 0) {
      add(`comp:${t.id}`, 'Composers', 'error', 'No songwriters listed — needed for publishing royalties.', T)
    } else {
      const total = Math.round(t.composers.reduce((s, c) => s + (c.split || 0), 0) * 100) / 100
      if (total !== 100) {
        add(`split:${t.id}`, 'Publishing split', 'error', `Writer splits total ${total}% — must equal 100%.`, T)
      } else {
        add(`split:${t.id}`, 'Publishing split', 'ok', 'Writer splits total 100%.', T)
      }
      const missingPro = t.composers.filter(c => !c.pro || c.pro === 'none')
      if (missingPro.length > 0) {
        add(`pro:${t.id}`, 'PRO affiliation', 'warn',
          `${missingPro.map(c => c.name).join(', ')} ${missingPro.length === 1 ? 'has' : 'have'} no PRO — performance royalties may go uncollected.`, T)
      }
    }

    // Audio format suitability for embedding
    const ext = audioExtension(t.audio_file_url)
    if (!t.audio_file_url) {
      add(`audio:${t.id}`, 'Audio file', 'warn', 'No audio uploaded yet.', T)
    } else if (ext && TAGGABLE_NOTE[ext]) {
      add(`audio:${t.id}`, 'Tagging', 'warn', TAGGABLE_NOTE[ext], T)
    } else if (ext && EMBEDDABLE_EXT.includes(ext)) {
      add(`audio:${t.id}`, 'Tagging', 'ok', `${ext.toUpperCase()} supports embedded tags.`, T)
    }
  }

  const errors = checks.filter(c => c.level === 'error').length
  const warnings = checks.filter(c => c.level === 'warn').length
  return { checks, errors, warnings, ready: errors === 0 }
}
