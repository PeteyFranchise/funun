// ─── CWR (Common Works Registration) — Path A generator ──────────────
// Turns captured release metadata into a CWR 2.1 file: the CISAC-standard
// EDI format composition-side societies accept for registering musical
// works (writers, roles, splits, IPIs, ISWC).
//
// SCOPE (see docs/cwr-plan.md):
//   • Writer-controlled, self-published works only. When a third-party
//     publisher is named we can't split the writer-vs-publisher shares from
//     our current data model, so we flag the work as not-ready instead of
//     emitting wrong shares.
//   • US PROs first (ASCAP/BMI/SESAC) — the only society codes we've
//     verified. Others flag the work as not-ready until confirmed.
//
// DRAFT STATUS: this produces faithful CWR 2.1 record *structure* (control
// records, ordering, key fields). Exact column offsets must still pass each
// society's CWR validator during onboarding (Path B). Until then the output
// is a draft export — and submission is gated on a sender ID anyway.
//
// Client-safe: no Node-only deps.

import type { ReleaseBundle } from '@/lib/metadata/export'
import type { Composer, ComposerRole, PRO } from '@/lib/metadata/schema'
import { isValidIpi, ipiName11, normalizeIpi, normalizeIswc } from '@/lib/metadata/identifiers'

// CISAC society numbers — only the ones we've verified are emitted. A PRO
// that maps to null flags its writers as not-ready (we won't guess a code).
const SOCIETY_CODES: Record<PRO, string | null> = {
  ASCAP: '010',
  BMI: '021',
  SESAC: '071',
  GMR: null, // newer US PRO — code not yet confirmed
  PRS: null,
  SOCAN: null,
  GEMA: null,
  SACEM: null,
  APRA: null,
  JASRAC: null,
  STIM: null,
  BUMA: null,
  other: null,
  none: null,
}

// Composition role → CWR writer designation code.
const WRITER_DESIGNATION: Record<ComposerRole, string> = {
  composer_lyricist: 'CA',
  composer: 'C',
  lyricist: 'A',
  arranger: 'AR',
  producer: 'C', // not a native CWR writing role — see warning in readiness
}

export type CwrSender = {
  /** PB=Publisher, AA=Admin Agency, SO=Society, WR=Writer. */
  type: 'PB' | 'AA' | 'SO' | 'WR'
  ipi: string
  name: string
}

export type CwrWorkStatus = {
  title: string
  ready: boolean
  errors: string[]
  warnings: string[]
}

export type CwrReadiness = {
  works: CwrWorkStatus[]
  totalWorks: number
  readyCount: number
  /** True when at least one work is ready to include in a file. */
  hasReady: boolean
  /** Sender IPI is well-formed (required to actually submit). */
  senderOk: boolean
}

const pct100 = (writers: Composer[]) =>
  Math.round(writers.reduce((s, w) => s + (Number(w.split) || 0), 0) * 100) / 100

// ── Readiness ────────────────────────────────────────────────────────

function assessWork(title: string, writers: Composer[], hasThirdPartyPublisher: boolean): CwrWorkStatus {
  const errors: string[] = []
  const warnings: string[] = []

  if (writers.length === 0) errors.push('No writers captured.')

  for (const w of writers) {
    const who = w.name || 'a writer'
    if (!isValidIpi(w.ipi)) {
      errors.push(`${who} needs an IPI (get one by affiliating with their PRO).`)
    }
    if (w.pro === 'none' || w.pro === 'other') {
      errors.push(`${who} has no PRO selected — CWR needs each writer's society.`)
    } else if (SOCIETY_CODES[w.pro] == null) {
      errors.push(`${who}'s PRO (${w.pro}) isn't supported yet — US PROs (ASCAP/BMI/SESAC) first.`)
    }
    if (w.role === 'producer') {
      warnings.push(`${who} is credited as Producer — mapped to Composer (C) for CWR; confirm the writing role.`)
    }
  }

  const total = pct100(writers)
  if (writers.length > 0 && total !== 100) {
    errors.push(`Writer splits total ${total}% — must equal 100%.`)
  }

  if (hasThirdPartyPublisher) {
    errors.push(
      'A third-party publisher is named — CWR needs the writer/publisher share breakdown, ' +
        'which Funūn doesn’t capture yet. Clear the publisher to register as writer-controlled.'
    )
  }

  return { title, ready: errors.length === 0, errors, warnings }
}

/** Is a publisher value a real third party (vs. blank / self-published)? */
function isThirdPartyPublisher(publisher: string | null | undefined): boolean {
  return Boolean(publisher && publisher.trim())
}

/** Minimal shape readiness needs — so the client studio can call it from its
 *  own state without assembling a full ReleaseBundle. */
export type CwrReadinessInput = {
  tracks: { title: string; composers: Composer[] }[]
  publisher: string | null
}

export function assessCwrReadiness(input: CwrReadinessInput, sender?: CwrSender): CwrReadiness {
  const thirdParty = isThirdPartyPublisher(input.publisher)
  const works = input.tracks
    .filter(t => t.composers.length > 0)
    .map(t => assessWork(t.title, t.composers, thirdParty))

  const readyCount = works.filter(w => w.ready).length
  return {
    works,
    totalWorks: works.length,
    readyCount,
    hasReady: readyCount > 0,
    senderOk: sender ? isValidIpi(sender.ipi) : false,
  }
}

/** Default self-submit sender for Path A: the artist as Writer (type WR). */
export function defaultSelfSubmitSender(bundle: ReleaseBundle): CwrSender {
  const firstWithIpi = bundle.tracks
    .flatMap(t => t.composers)
    .find(c => isValidIpi(c.ipi))
  return {
    type: 'WR',
    ipi: normalizeIpi(firstWithIpi?.ipi) || '',
    name: bundle.artistName || 'Unknown Writer',
  }
}

// ── Fixed-width field helpers ────────────────────────────────────────

/** Alphanumeric: ASCII-safe, upper-cased, left-justified, space-filled. */
const A = (s: string | null | undefined, w: number): string =>
  (s ?? '')
    .toString()
    .toUpperCase()
    .replace(/[^\x20-\x7E]/g, ' ')
    .slice(0, w)
    .padEnd(w, ' ')

/** Numeric: zero-filled, right-justified. */
const N = (n: number, w: number): string => {
  const x = Math.max(0, Math.trunc(Number(n) || 0))
  return x.toString().slice(-w).padStart(w, '0')
}

/** Share field: 5 digits, percentage to 2 decimals (100.00% → "10000"). */
const SHARE = (pct: number): string => N(Math.round((Number(pct) || 0) * 100), 5)

const durationHHMMSS = (s: number | null): string => {
  const t = Math.max(0, Math.trunc(Number(s) || 0))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = t % 60
  return N(h, 2) + N(m, 2) + N(sec, 2)
}

const yyyymmdd = (d: Date) =>
  `${d.getUTCFullYear()}${N(d.getUTCMonth() + 1, 2)}${N(d.getUTCDate(), 2)}`
const hhmmss = (d: Date) =>
  `${N(d.getUTCHours(), 2)}${N(d.getUTCMinutes(), 2)}${N(d.getUTCSeconds(), 2)}`

/** ISWC for the 11-char CWR field: "T" + 10 digits, else spaces. */
const iswcField = (raw: string | null): string => {
  const v = normalizeIswc(raw)
  return /^T\d{10}$/.test(v) ? v : ' '.repeat(11)
}

// ── File builder ─────────────────────────────────────────────────────

/**
 * Build a CWR 2.1 file (NWR transactions) for the writer-controlled works in
 * the bundle. Returns null when nothing is ready. `sender` identifies the
 * submitter; for Path A pass `defaultSelfSubmitSender(bundle)`, for Path B the
 * onboarded Funūn admin-agency sender.
 */
export function buildCwrFile(
  bundle: ReleaseBundle,
  sender: CwrSender,
  now: Date = new Date()
): string | null {
  const thirdParty = isThirdPartyPublisher(bundle.rights.publisher)
  const readyTracks = bundle.tracks.filter(
    t => t.composers.length > 0 && assessWork(t.title, t.composers, thirdParty).ready
  )
  if (readyTracks.length === 0) return null

  const lines: string[] = []
  const senderId9 = ipiName11(sender.ipi).slice(-9)

  // Transmission header
  lines.push(
    'HDR' +
      A(sender.type, 2) +
      A(senderId9, 9) +
      A(sender.name, 45) +
      A('01.10', 5) +
      yyyymmdd(now) +
      hhmmss(now) +
      yyyymmdd(now)
  )
  // Group header (one NWR group)
  lines.push('GRH' + A('NWR', 3) + N(1, 5) + A('02.10', 5) + N(0, 10))

  let txSeq = 0
  let groupRecordCount = 0

  readyTracks.forEach((t, ti) => {
    let rec = 0
    const submitterWorkId = `AOS${N(ti + 1, 8)}`

    // Work transaction header (NWR)
    lines.push(
      'NWR' +
        N(txSeq, 8) +
        N(rec++, 8) +
        A(t.title, 60) +
        A(languageOf(t.language), 2) +
        A(submitterWorkId, 14) +
        iswcField(t.iswc) +
        A('POP', 3) + // musical work distribution category (default)
        durationHHMMSS(t.duration_seconds) +
        A(t.isrc ? 'Y' : 'U', 1) + // recorded indicator
        A('ORI', 3) // version type — original work
    )
    groupRecordCount++

    // One writer block per composer (writer-controlled, no publisher)
    t.composers.forEach((c, ci) => {
      const ipi11 = ipiName11(c.ipi)
      const ip9 = ipi11.slice(-9)
      const society = SOCIETY_CODES[c.pro] ?? '   '
      const desig = A(WRITER_DESIGNATION[c.role], 2)
      const { last, first } = splitName(c.name)
      const prShare = SHARE(c.split)

      // SWR — writer controlled by submitter
      lines.push(
        'SWR' +
          N(txSeq, 8) +
          N(rec++, 8) +
          A(ip9, 9) +
          A(last, 45) +
          A(first, 30) +
          A('N', 1) + // writer unknown indicator
          desig +
          A('', 9) + // tax ID
          A(ipi11, 11) +
          A(society, 3) +
          prShare + // PR ownership share
          A('   ', 3) +
          SHARE(0) + // MR — performance CWR carries no mechanical share
          A('   ', 3) +
          SHARE(0) // SR
      )
      groupRecordCount++

      // SWT — writer territory of control (World = TIS 2136)
      lines.push(
        'SWT' +
          N(txSeq, 8) +
          N(rec++, 8) +
          A(ip9, 9) +
          prShare +
          SHARE(0) +
          SHARE(0) +
          A('I', 1) + // inclusion
          A('2136', 4) + // World
          A('N', 1) +
          N(ci + 1, 3)
      )
      groupRecordCount++
    })

    txSeq++
  })

  // Group + transmission trailers
  lines.push('GRT' + N(1, 5) + N(readyTracks.length, 8) + N(groupRecordCount, 8))
  lines.push('TRL' + N(1, 3) + N(readyTracks.length, 8) + N(groupRecordCount, 8))

  return lines.join('\r\n') + '\r\n'
}

// ── Small helpers ────────────────────────────────────────────────────

/** 2-letter language code for the CWR field (uppercased), else blank. */
function languageOf(code: string | null): string {
  const c = (code ?? '').replace(/[^A-Za-z]/g, '').slice(0, 2)
  return c.length === 2 ? c : ''
}

/** Best-effort split of "First Last" into CWR last/first name fields. */
function splitName(name: string): { last: string; first: string } {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { last: '', first: '' }
  if (parts.length === 1) return { last: parts[0], first: '' }
  return { last: parts[parts.length - 1], first: parts.slice(0, -1).join(' ') }
}

/** Standard CWR filename: CW + yy + 4-digit seq + sender + receiver .Vxx */
export function cwrFilename(sender: CwrSender, now: Date = new Date()): string {
  const yy = String(now.getUTCFullYear()).slice(-2)
  const sid = ipiName11(sender.ipi).slice(-3) || 'AOS'
  return `CW${yy}0001${sid}_000.V21`
}
