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

// Shape we read out of (and write into) tracks.metadata JSONB.
export type TrackMetadata = {
  composers?: Composer[]
  lyrics?: TrackLyrics
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
    out.push({ name, role, pro, ipi: ipi || undefined, split })
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
