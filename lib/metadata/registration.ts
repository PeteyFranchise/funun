// ─── Registration packages (US rights bodies) ───────────────────────
// Turns the captured release metadata into pre-filled registration views
// for the US stack, so an artist can paste each field straight into the
// body's web portal:
//   • ASCAP / BMI / SESAC  → performance, by WORK (writers, splits, IPI)
//   • The MLC              → mechanical, by WORK + matched recordings
//   • SoundExchange        → digital performance, by RECORDING (master)
//
// Composition-side bodies share the same "work" shape; SoundExchange is
// recording-side. Client-safe (no Node-only deps).

import {
  artistCredit,
  COMPOSER_ROLE_LABELS,
  PRO_LABELS,
  type PRO,
} from '@/lib/metadata/schema'
import type { ReleaseBundle } from '@/lib/metadata/export'

const US_PERFORMANCE_PROS: PRO[] = ['ASCAP', 'BMI', 'SESAC', 'GMR']

export type RegWriter = {
  name: string
  role: string
  pro: string
  proCode: PRO
  ipi: string | null
  share: number
}

// A composition ("work") as the PROs / MLC register it.
export type RegWork = {
  title: string
  iswc: string | null
  durationSeconds: number | null
  isrc: string | null
  performingArtist: string
  releaseDate: string | null
  publisher: string
  writers: RegWriter[]
  shareTotal: number
  shareOk: boolean
}

// A sound recording as SoundExchange registers it (master side).
export type RegRecording = {
  title: string
  isrc: string | null
  featuredArtist: string
  rightsOwner: string
  album: string
  upc: string | null
  releaseDate: string | null
}

export type RegistrationPackages = {
  artistName: string
  releaseTitle: string
  works: RegWork[]
  recordings: RegRecording[]
  /** Which US performance PROs actually appear among the writers. */
  usProsPresent: PRO[]
  /** Non-US PROs found — handled by their own societies, out of US scope. */
  foreignProsPresent: PRO[]
}

function publisherLabel(bundle: ReleaseBundle): string {
  return bundle.rights.publisher?.trim() || 'Self-published (no separate publisher)'
}

export function buildRegistrationPackages(bundle: ReleaseBundle): RegistrationPackages {
  const usPros = new Set<PRO>()
  const foreignPros = new Set<PRO>()

  const works: RegWork[] = bundle.tracks
    .filter(t => t.composers.length > 0)
    .map(t => {
      const writers: RegWriter[] = t.composers.map(c => {
        if (c.pro && c.pro !== 'none' && c.pro !== 'other') {
          if (US_PERFORMANCE_PROS.includes(c.pro)) usPros.add(c.pro)
          else foreignPros.add(c.pro)
        }
        return {
          name: c.name,
          role: COMPOSER_ROLE_LABELS[c.role],
          pro: PRO_LABELS[c.pro],
          proCode: c.pro,
          ipi: c.ipi ?? null,
          share: c.split,
        }
      })
      const shareTotal = Math.round(writers.reduce((s, w) => s + (w.share || 0), 0) * 100) / 100
      return {
        title: t.title,
        iswc: t.iswc,
        durationSeconds: t.duration_seconds,
        isrc: t.isrc,
        performingArtist: artistCredit(bundle.artistName, t.featuring_artists),
        releaseDate: bundle.release_date,
        publisher: publisherLabel(bundle),
        writers,
        shareTotal,
        shareOk: shareTotal === 100,
      }
    })

  const recordings: RegRecording[] = bundle.tracks.map(t => ({
    title: t.title,
    isrc: t.isrc,
    featuredArtist: artistCredit(bundle.artistName, t.featuring_artists),
    rightsOwner: bundle.rights.label?.trim() || `${bundle.artistName} (self)`,
    album: bundle.releaseTitle,
    upc: bundle.upc,
    releaseDate: bundle.release_date,
  }))

  return {
    artistName: bundle.artistName,
    releaseTitle: bundle.releaseTitle,
    works,
    recordings,
    usProsPresent: US_PERFORMANCE_PROS.filter(p => usPros.has(p)),
    foreignProsPresent: [...foreignPros],
  }
}

// ── Plain-text rendering (for the .txt download) ─────────────────────

const dash = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === '' ? '—' : String(v)

function durationStr(s: number | null): string {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function buildRegistrationText(pkg: RegistrationPackages): string {
  const L: string[] = []
  L.push('REGISTRATION PACKAGES — US RIGHTS BODIES')
  L.push(`Artist:  ${pkg.artistName}`)
  L.push(`Release: ${pkg.releaseTitle}`)
  L.push('')
  L.push('How to use: each section lists every field a body needs, pre-filled')
  L.push('from your metadata. Register the WORK (composition) with your PRO and')
  L.push('The MLC; register the RECORDING (master) with SoundExchange. A writer')
  L.push('registers a work with the ONE PRO they belong to.')
  L.push('')

  // Performance PROs
  L.push('══════════════════════════════════════════════════════════')
  L.push('1) PERFORMANCE — ASCAP / BMI / SESAC  (register each WORK)')
  L.push('══════════════════════════════════════════════════════════')
  if (pkg.usProsPresent.length)
    L.push(`PROs present among your writers: ${pkg.usProsPresent.join(', ')}`)
  if (pkg.foreignProsPresent.length)
    L.push(`Non-US PROs (register via their own society): ${pkg.foreignProsPresent.join(', ')}`)
  L.push('')
  for (const w of pkg.works) {
    L.push(`• WORK: ${w.title}`)
    L.push(`  ISWC: ${dash(w.iswc)}   Duration: ${durationStr(w.durationSeconds)}`)
    L.push(`  Recording (for matching): ISRC ${dash(w.isrc)} — ${w.performingArtist}`)
    L.push(`  Publisher: ${w.publisher}`)
    L.push('  Writers:')
    for (const wr of w.writers) {
      L.push(
        `    - ${wr.name} | ${wr.role} | ${wr.pro} | IPI ${dash(wr.ipi)} | share ${wr.share}%`
      )
    }
    L.push(`  Writer share total: ${w.shareTotal}%${w.shareOk ? '' : '  ⚠ must equal 100%'}`)
    L.push('')
  }
  if (pkg.works.length === 0) L.push('  (No works with writers captured yet.)\n')

  // The MLC
  L.push('══════════════════════════════════════════════════════════')
  L.push('2) MECHANICAL — THE MLC  (register each WORK + link recordings)')
  L.push('══════════════════════════════════════════════════════════')
  for (const w of pkg.works) {
    L.push(`• WORK: ${w.title}   ISWC: ${dash(w.iswc)}`)
    L.push('  Writers / shares:')
    for (const wr of w.writers) {
      L.push(`    - ${wr.name} | IPI ${dash(wr.ipi)} | share ${wr.share}%`)
    }
    L.push(`  Publisher: ${w.publisher}`)
    L.push(`  Matched recording: ISRC ${dash(w.isrc)} — "${w.title}" — ${w.performingArtist}`)
    L.push(`  Release date: ${dash(w.releaseDate)}`)
    L.push('')
  }
  if (pkg.works.length === 0) L.push('  (No works with writers captured yet.)\n')

  // SoundExchange
  L.push('══════════════════════════════════════════════════════════')
  L.push('3) DIGITAL PERFORMANCE — SOUNDEXCHANGE  (register each RECORDING)')
  L.push('══════════════════════════════════════════════════════════')
  for (const r of pkg.recordings) {
    L.push(`• RECORDING: ${r.title}`)
    L.push(`  ISRC: ${dash(r.isrc)}`)
    L.push(`  Featured artist: ${r.featuredArtist}`)
    L.push(`  Rights owner (master): ${r.rightsOwner}`)
    L.push(`  Album: ${r.album}   UPC: ${dash(r.upc)}   Release: ${dash(r.releaseDate)}`)
    L.push('')
  }

  return L.join('\n')
}
