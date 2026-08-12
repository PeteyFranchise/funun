// ─── Buyer brief (Brief Builder) ─────────────────────────────────────────
// The structured shape behind the Brief Builder. A buyer describes a project
// in their own words; Claude (lib/buyer/brief-ai.ts, server-only) turns that
// into this shape; the form (components/buyer/BriefBuilder.tsx) renders and
// edits it; briefToCrateFilters() maps the creative side onto The Crate's
// browse filters (apply-to-Crate, v1).
//
// v1 has no persistence — the brief lives in component state + a one-shot
// sessionStorage handoff to the catalogue. Persistence + real AE routing land
// in v2 (see .planning/design/crate-lead-engine-BUILD-SPEC.md).
//
// No server dependencies here so the form can import it on the client.

// ── Canonical option vocabularies ──
// Single-sourced so the form, the AI prompt, and validation all agree. The
// creative values are a subset of The Crate's filter options
// (components/buyer/CatalogBrowserLight.tsx FILTER_OPTIONS) so apply-to-Crate
// maps cleanly; deal values match the form's select options.
export const BRIEF_MOODS = ['Cinematic', 'Hopeful', 'Warm', 'Driving', 'Pensive', 'Uplifting'] as const
export const BRIEF_GENRES = ['Alt-Pop', 'Electronic', 'Soul', 'Folk', 'Indie Rock', 'Cinematic', 'Ambient'] as const
export const BRIEF_ENERGY = ['Low', 'Low-Medium', 'Medium', 'Medium-High', 'High'] as const
export const BRIEF_VOCALS = ['Instrumental', 'Vocal', 'Either'] as const
export const BRIEF_USES = ['Advertising — online', 'Advertising — broadcast', 'Film / TV sync', 'Trailer / promo', 'Game', 'Corporate / internal', 'Social'] as const
export const BRIEF_TERRITORIES = ['Worldwide', 'North America', 'EU / UK', 'Single country'] as const
export const BRIEF_TERMS = ['1 year', '2 years', '3 years', 'Perpetuity'] as const
export const BRIEF_EXCLUSIVITY = ['None', 'Category', 'Timed', 'Full'] as const

export type Brief = {
  creative: {
    mood: string[]
    genre: string[]
    energy: string[]
    vocals: string // one of BRIEF_VOCALS
  }
  deal: {
    use: string
    territory: string
    term: string
    exclusivity: string
    budget: string
  }
  notes: string
}

export function emptyBrief(): Brief {
  return {
    creative: { mood: [], genre: [], energy: [], vocals: 'Either' },
    deal: {
      use: BRIEF_USES[0],
      territory: BRIEF_TERRITORIES[0],
      term: BRIEF_TERMS[0],
      exclusivity: BRIEF_EXCLUSIVITY[0],
      budget: '',
    },
    notes: '',
  }
}

// Keep only values present in `allowed` (defensive against model drift).
function keepKnown(values: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(values)) return []
  return values.map(v => String(v)).filter(v => allowed.includes(v))
}
function oneKnown(value: unknown, allowed: readonly string[], fallback: string): string {
  const v = String(value ?? '')
  return allowed.includes(v) ? v : fallback
}

// Coerce an arbitrary parsed object (e.g. the model's JSON) into a valid
// Brief, dropping anything outside the known vocab. Never throws.
export function coerceBrief(raw: unknown): Brief {
  const o = (raw ?? {}) as { creative?: unknown; deal?: unknown; notes?: unknown }
  const c = (o.creative ?? {}) as Record<string, unknown>
  const d = (o.deal ?? {}) as Record<string, unknown>
  return {
    creative: {
      mood: keepKnown(c.mood, BRIEF_MOODS),
      genre: keepKnown(c.genre, BRIEF_GENRES),
      energy: keepKnown(c.energy, BRIEF_ENERGY),
      vocals: oneKnown(c.vocals, BRIEF_VOCALS, 'Either'),
    },
    deal: {
      use: oneKnown(d.use, BRIEF_USES, BRIEF_USES[0]),
      territory: oneKnown(d.territory, BRIEF_TERRITORIES, BRIEF_TERRITORIES[0]),
      term: oneKnown(d.term, BRIEF_TERMS, BRIEF_TERMS[0]),
      exclusivity: oneKnown(d.exclusivity, BRIEF_EXCLUSIVITY, BRIEF_EXCLUSIVITY[0]),
      budget: typeof d.budget === 'string' ? d.budget.slice(0, 80) : '',
    },
    notes: typeof o.notes === 'string' ? o.notes.slice(0, 1000) : '',
  }
}

// ── apply-to-Crate: creative fields → catalogue filter selections ──
// Returns Crate filter values keyed by the Crate's FilterKey. `filterOptions`
// is the Crate's own FILTER_OPTIONS, so we only ever emit values it can filter
// on (Mood "Uplifting", for instance, has no Crate option and is dropped).
// "Either" vocals means no preference → no Vocals filter.
export function briefToCrateFilters(
  brief: Brief,
  filterOptions: Record<string, string[]>
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const put = (key: string, values: string[]) => {
    const allowed = filterOptions[key] ?? []
    const keep = values.filter(v => allowed.includes(v))
    if (keep.length) out[key] = keep
  }
  put('Mood', brief.creative.mood)
  put('Genres', brief.creative.genre)
  put('Energy', brief.creative.energy)
  if (brief.creative.vocals && brief.creative.vocals !== 'Either') put('Vocals', [brief.creative.vocals])
  return out
}

// One-shot sessionStorage handoff key (BriefBuilder → Crate).
export const BRIEF_APPLY_KEY = 'funun:brief:apply'

// ── AI re-rank (v1.1) ──
// After the brief's creative fields narrow the catalogue by filters, the
// remaining candidates are re-ordered by fit to the WHOLE brief (prose/notes
// included) via lib/buyer/brief-ai.ts. A compact per-track shape is sent to
// the model — enough to judge fit, nothing sensitive.
export type BriefCandidate = {
  id: string
  title: string
  artist: string
  genres: string
  mood: string
  energy: string
  vocal: string
  dynamics: string // human label, e.g. "Builds"
  length: string
  instruments: string[]
}

export type RankedItem = { id: string; reason: string }

// Cap on how many candidates we hand the model per re-rank (bounds cost +
// latency). The catalogue filters run first, so this trims an already-narrowed
// set.
export const RERANK_CAND_CAP = 40

// Sanitise an untrusted candidate array (the re-rank route receives this from
// the client). Drops anything without an id, caps the count and field lengths.
export function coerceCandidates(raw: unknown): BriefCandidate[] {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, RERANK_CAND_CAP)
    .map(x => {
      const o = (x ?? {}) as Record<string, unknown>
      return {
        id: String(o.id ?? ''),
        title: String(o.title ?? '').slice(0, 120),
        artist: String(o.artist ?? '').slice(0, 120),
        genres: String(o.genres ?? '').slice(0, 120),
        mood: String(o.mood ?? '').slice(0, 40),
        energy: String(o.energy ?? '').slice(0, 40),
        vocal: String(o.vocal ?? '').slice(0, 40),
        dynamics: String(o.dynamics ?? '').slice(0, 40),
        length: String(o.length ?? '').slice(0, 12),
        instruments: Array.isArray(o.instruments)
          ? o.instruments.map(i => String(i).slice(0, 40)).slice(0, 12)
          : [],
      }
    })
    .filter(c => c.id)
}
