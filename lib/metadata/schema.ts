// ─── Metadata Studio — shared schema ─────────────────────────────────
// Types and label maps for the per-track metadata a release needs before
// it goes to DSPs, radio, DJs, or licensing. Safe to import on the client
// (no Node-only deps live here).

// Performing Rights Organizations — who collects a writer's performance
// royalties. `none` = self-published / unaffiliated.
export type PRO =
  | 'ASCAP'
  | 'BMI'
  | 'SESAC'
  | 'GMR'
  | 'PRS'
  | 'SOCAN'
  | 'GEMA'
  | 'SACEM'
  | 'APRA'
  | 'JASRAC'
  | 'STIM'
  | 'BUMA'
  | 'other'
  | 'none'

export const PRO_LABELS: Record<PRO, string> = {
  ASCAP: 'ASCAP (US)',
  BMI: 'BMI (US)',
  SESAC: 'SESAC (US)',
  GMR: 'GMR (US)',
  PRS: 'PRS (UK)',
  SOCAN: 'SOCAN (Canada)',
  GEMA: 'GEMA (Germany)',
  SACEM: 'SACEM (France)',
  APRA: 'APRA (Australia/NZ)',
  JASRAC: 'JASRAC (Japan)',
  STIM: 'STIM (Sweden)',
  BUMA: 'BUMA/STEMRA (Netherlands)',
  other: 'Other',
  none: 'None / self-published',
}

export const PRO_VALUES = Object.keys(PRO_LABELS) as PRO[]

// What a contributor did on the composition (the writing side, distinct
// from performance/engineering credits already on the track).
export type ComposerRole =
  | 'composer_lyricist'
  | 'composer'
  | 'lyricist'
  | 'arranger'
  | 'producer'

export const COMPOSER_ROLE_LABELS: Record<ComposerRole, string> = {
  composer_lyricist: 'Composer & Lyricist',
  composer: 'Composer (music)',
  lyricist: 'Lyricist (words)',
  arranger: 'Arranger',
  producer: 'Producer',
}

export const COMPOSER_ROLE_VALUES = Object.keys(COMPOSER_ROLE_LABELS) as ComposerRole[]

// A single writer credit on a track. `split` is publishing ownership %;
// `ipi` is the writer's IPI/CAE number registered with their PRO.
export type Composer = {
  name: string
  role: ComposerRole
  pro: PRO
  ipi?: string
  /** Writer's email — used to send the split sheet for e-signature. */
  email?: string
  /** Writer's mobile — for SMS signature confirmation (and opt-in marketing). */
  phone?: string
  split: number
}

// Per-track lyrics, stored inside tracks.metadata JSONB. Plain text for v1
// (time-synced/LRC is a later extension under the same object).
export type TrackLyrics = {
  text: string
  language?: string
  explicit?: boolean
  updated_at?: string
}

export const LYRICS_MAX = 20000

// ─── Neighbouring rights / DDEX RDR-N (recording side) ───────────────
// Performers and recording context needed to register a sound recording
// with music licensing companies (SoundExchange / PPL / GVL …) for
// neighbouring-rights collection. See docs/ddex-rdr-compliance.md.
export type PerformerRole = 'featured' | 'non_featured'
export const PERFORMER_ROLES = ['featured', 'non_featured'] as const
export const PERFORMER_ROLE_LABELS: Record<PerformerRole, string> = {
  featured: 'Featured performer',
  non_featured: 'Non-featured performer',
}

export type Performer = {
  name: string
  role: PerformerRole
  /** Instrument / vocal / contribution detail, e.g. "Lead vocals", "Drums". */
  contribution?: string
  /** International Performer Number (IPN) and/or ISNI, when known. */
  ipn?: string
  isni?: string
}

export type OriginalPurpose = 'general' | 'library' | 'commissioned'
export const ORIGINAL_PURPOSES = ['general', 'library', 'commissioned'] as const
export const ORIGINAL_PURPOSE_LABELS: Record<OriginalPurpose, string> = {
  general: 'General release',
  library: 'Library / production music',
  commissioned: 'Specially commissioned',
}

export type RecordingInfo = {
  /** ISO date the recording was fixed, e.g. "2026-04-01". */
  recordingDate?: string
  /** ISO 3166-1 alpha-2 country of fixation, e.g. "US". */
  recordingCountry?: string
  originalPurpose?: OriginalPurpose
  /** RDR-N v1.5 CommercialAvailability flag. */
  commerciallyAvailable?: boolean
}

// Shape we read out of (and write into) tracks.metadata JSONB.
export type TrackMetadata = {
  composers?: Composer[]
  lyrics?: TrackLyrics
  performers?: Performer[]
  recording?: RecordingInfo
}

// Release-level rights & contact — shared across the project. Mirrors the
// columns added in migration 006.
export type ReleaseRights = {
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

// A common, non-exhaustive language list for the dropdown (ISO 639-1).
export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'zxx', label: 'Instrumental (no lyrics)' },
]

// ─── Credit helpers ──────────────────────────────────────────────────

/** "Artist feat. X, Y" — the display/track artist string for tags. */
export function artistCredit(
  primaryArtist: string | null | undefined,
  featuring: string[] | null | undefined
): string {
  const primary = (primaryArtist ?? '').trim() || 'Unknown Artist'
  const feats = (featuring ?? []).map(f => f.trim()).filter(Boolean)
  return feats.length > 0 ? `${primary} feat. ${feats.join(', ')}` : primary
}

/** "Name (PRO); Name2 (PRO2)" — the composer string for the ID3 frame. */
export function composerCredit(composers: Composer[] | null | undefined): string {
  return (composers ?? [])
    .filter(c => c.name.trim())
    .map(c => {
      const pro = c.pro && c.pro !== 'none' && c.pro !== 'other' ? ` (${c.pro})` : ''
      return `${c.name.trim()}${pro}`
    })
    .join('; ')
}

/** Read a typed composer array out of a loose metadata JSONB blob. */
export function readComposers(metadata: Record<string, unknown> | null | undefined): Composer[] {
  const raw = metadata?.composers
  if (!Array.isArray(raw)) return []
  return raw
    .map(r => {
      const o = (r ?? {}) as Record<string, unknown>
      const role = COMPOSER_ROLE_VALUES.includes(o.role as ComposerRole)
        ? (o.role as ComposerRole)
        : 'composer_lyricist'
      const pro = PRO_VALUES.includes(o.pro as PRO) ? (o.pro as PRO) : 'none'
      const split = Number(o.split)
      return {
        name: String(o.name ?? '').trim(),
        role,
        pro,
        ipi: o.ipi ? String(o.ipi).trim() : undefined,
        email: o.email ? String(o.email).trim() : undefined,
        phone: o.phone ? String(o.phone).trim() : undefined,
        split: Number.isFinite(split) ? split : 0,
      }
    })
    .filter(c => c.name)
}

/** Validate + normalize composer input coming from the client. */
export function sanitizeComposers(input: unknown): Composer[] {
  if (!Array.isArray(input)) return []
  const out: Composer[] = []
  for (const r of input) {
    const o = (r ?? {}) as Record<string, unknown>
    const name = String(o.name ?? '').trim()
    if (!name) continue
    const role = COMPOSER_ROLE_VALUES.includes(o.role as ComposerRole)
      ? (o.role as ComposerRole)
      : 'composer_lyricist'
    const pro = PRO_VALUES.includes(o.pro as PRO) ? (o.pro as PRO) : 'none'
    const splitNum = Number(o.split)
    const split = Number.isFinite(splitNum)
      ? Math.max(0, Math.min(100, Math.round(splitNum * 100) / 100))
      : 0
    const ipi = o.ipi ? String(o.ipi).trim() : undefined
    const email = o.email ? String(o.email).trim() : undefined
    const phone = o.phone ? String(o.phone).trim() : undefined
    out.push({ name, role, pro, ipi: ipi || undefined, email: email || undefined, phone: phone || undefined, split })
  }
  return out
}

/** Read typed lyrics out of a loose metadata JSONB blob (null if absent). */
export function readLyrics(metadata: Record<string, unknown> | null | undefined): TrackLyrics | null {
  const raw = metadata?.lyrics as Record<string, unknown> | undefined
  if (!raw || typeof raw.text !== 'string' || !raw.text.trim()) return null
  return {
    text: raw.text,
    language: typeof raw.language === 'string' && raw.language ? raw.language : undefined,
    explicit: raw.explicit === true,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
  }
}

/** Validate + normalize lyrics input from the client (null clears them). */
export function sanitizeLyrics(input: unknown): TrackLyrics | null {
  const o = (input ?? {}) as Record<string, unknown>
  const text = String(o.text ?? '').slice(0, LYRICS_MAX)
  if (!text.trim()) return null
  const language = typeof o.language === 'string' && o.language ? o.language : undefined
  return { text, language, explicit: o.explicit === true, updated_at: new Date().toISOString() }
}

// ── Master audio (the distribution-grade WAV; the shareable MP3 lives on the
// track's audio_file_url column and drives playback). ──
export type MasterAudio = { path: string; size: number; ext: string }

/** Read the master-audio rendition out of a track's metadata JSONB (null if none). */
export function readMasterAudio(
  metadata: Record<string, unknown> | null | undefined
): MasterAudio | null {
  const raw = metadata?.master as Record<string, unknown> | undefined
  if (!raw || typeof raw.path !== 'string' || !raw.path) return null
  return {
    path: raw.path,
    size: typeof raw.size === 'number' ? raw.size : 0,
    ext: typeof raw.ext === 'string' && raw.ext ? raw.ext : 'wav',
  }
}

/** Read a typed performer array out of a loose metadata JSONB blob. */
export function readPerformers(metadata: Record<string, unknown> | null | undefined): Performer[] {
  const raw = metadata?.performers
  if (!Array.isArray(raw)) return []
  return raw
    .map(r => {
      const o = (r ?? {}) as Record<string, unknown>
      const role: PerformerRole = o.role === 'featured' ? 'featured' : 'non_featured'
      return {
        name: String(o.name ?? '').trim(),
        role,
        contribution: o.contribution ? String(o.contribution).trim() : undefined,
        ipn: o.ipn ? String(o.ipn).trim() : undefined,
        isni: o.isni ? String(o.isni).trim() : undefined,
      }
    })
    .filter(p => p.name)
}

/** Validate + normalize performer input coming from the client. */
export function sanitizePerformers(input: unknown): Performer[] {
  if (!Array.isArray(input)) return []
  const out: Performer[] = []
  for (const r of input) {
    const o = (r ?? {}) as Record<string, unknown>
    const name = String(o.name ?? '').trim()
    if (!name) continue
    const role: PerformerRole = o.role === 'featured' ? 'featured' : 'non_featured'
    out.push({
      name,
      role,
      contribution: o.contribution ? String(o.contribution).trim() || undefined : undefined,
      ipn: o.ipn ? String(o.ipn).trim() || undefined : undefined,
      isni: o.isni ? String(o.isni).trim() || undefined : undefined,
    })
  }
  return out
}

/** Read recording context (RDR-N) out of a loose metadata JSONB blob. */
export function readRecordingInfo(
  metadata: Record<string, unknown> | null | undefined
): RecordingInfo | null {
  const o = metadata?.recording as Record<string, unknown> | undefined
  if (!o) return null
  const purpose = ORIGINAL_PURPOSES.includes(o.originalPurpose as OriginalPurpose)
    ? (o.originalPurpose as OriginalPurpose)
    : undefined
  const info: RecordingInfo = {
    recordingDate: typeof o.recordingDate === 'string' && o.recordingDate ? o.recordingDate : undefined,
    recordingCountry:
      typeof o.recordingCountry === 'string' && o.recordingCountry
        ? o.recordingCountry.toUpperCase().slice(0, 2)
        : undefined,
    originalPurpose: purpose,
    commerciallyAvailable: typeof o.commerciallyAvailable === 'boolean' ? o.commerciallyAvailable : undefined,
  }
  const hasAny = Object.values(info).some(v => v !== undefined)
  return hasAny ? info : null
}

/** Validate + normalize recording-info input (null clears it). */
export function sanitizeRecordingInfo(input: unknown): RecordingInfo | null {
  const o = (input ?? {}) as Record<string, unknown>
  const purpose = ORIGINAL_PURPOSES.includes(o.originalPurpose as OriginalPurpose)
    ? (o.originalPurpose as OriginalPurpose)
    : undefined
  const info: RecordingInfo = {
    recordingDate: typeof o.recordingDate === 'string' && o.recordingDate.trim() ? o.recordingDate.trim() : undefined,
    recordingCountry:
      typeof o.recordingCountry === 'string' && o.recordingCountry.trim()
        ? o.recordingCountry.trim().toUpperCase().slice(0, 2)
        : undefined,
    originalPurpose: purpose,
    commerciallyAvailable: typeof o.commerciallyAvailable === 'boolean' ? o.commerciallyAvailable : undefined,
  }
  const hasAny = Object.values(info).some(v => v !== undefined)
  return hasAny ? info : null
}
