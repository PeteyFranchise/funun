// ─── AI tag suggestion — mood/energy/vocal/instrument/genre auto-listen ──────
// Mirrors lib/buyer/brief-ai.ts's draftBriefFromProse pattern exactly: the
// Anthropic client is constructed inline from process.env.ANTHROPIC_API_KEY so
// a missing key degrades gracefully (never throws at import, unlike
// lib/anthropic/index.ts's eager singleton — that module cannot be imported
// here for exactly that reason). Output is constrained to the SAME controlled
// vocab the buyer catalogue filters against (lib/metadata/schema.ts,
// lib/genres.ts) so an AI suggestion can never be off-vocabulary/filter-invisible
// (T-30-04 — Tampering / prompt injection defense: constrain, then drop the rest).
import Anthropic from '@anthropic-ai/sdk'
import {
  MOOD_VALUES,
  ENERGY_VALUES,
  VOCAL_VALUES,
  INSTRUMENT_VALUES,
  MOODS_MAX,
  coerceMoods,
  coerceEnergy,
  coerceVocal,
  coerceInstruments,
  type Mood,
  type EnergyLevel,
  type VocalType,
  type Instrument,
} from '@/lib/metadata/schema'
import { ALL_GENRE_SLUGS } from '@/lib/genres'

// Mirrors lib/anthropic/index.ts's MODEL id. That module can't be imported
// directly here — it throws at import when ANTHROPIC_API_KEY is unset (eager
// singleton), which would break tag-suggest routes with no key configured.
// Re-declared instead of a third, different value (30-RESEARCH Open Q #5).
const MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 2000

/** Tagging stays a signal, not a checkbox sweep — cap suggested genres too. */
const GENRES_MAX = MOODS_MAX

export type TagSuggestion = {
  moods: Mood[]
  energy: EnergyLevel | null
  vocal: VocalType | null
  instruments: Instrument[]
  genres: string[]
  suggested_at: string
  model: string
}

export type SuggestTrackTagsInput = {
  title: string
  /** Any artist-supplied text available to the caller — lyrics, notes, etc. */
  text?: string
}

export type SuggestTrackTagsResult =
  | { ok: true; suggestion: TagSuggestion }
  | { ok: false; error: string }

function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

function list(vals: readonly string[]): string {
  return vals.map(v => `"${v}"`).join(', ')
}

function buildPrompt(title: string, text: string): string {
  return `You are auto-listening to a track and suggesting tags for a sync-licensing catalogue. Suggest tags a sync supervisor would filter by.

Track title: "${title}"
${text ? `Additional context (lyrics/notes):\n"""\n${text}\n"""\n` : ''}
Respond with ONLY a JSON object in exactly this shape:
{
  "moods": [],       // zero or more of: ${list(MOOD_VALUES)}
  "energy": "",      // one of: ${list(ENERGY_VALUES)} — or "" if unclear
  "vocal": "",       // one of: ${list(VOCAL_VALUES)} — or "" if unclear
  "instruments": [], // zero or more of: ${list(INSTRUMENT_VALUES)}
  "genres": []       // zero or more of: ${list(ALL_GENRE_SLUGS)}
}

Rules:
- Use ONLY the allowed values above, copied exactly. Do not invent a value to force a fit.
- If nothing clearly applies to a field, use [] (or "" for energy/vocal).
- Output JSON only, with no prose before or after.`
}

/**
 * Pure coercion — keeps only controlled-vocab members (dedupes, caps counts),
 * drops everything else silently, and stamps suggested_at/model. Unit-testable
 * without the network call; suggestTrackTags calls this after extractJson.
 */
export function coerceSuggestion(parsed: Record<string, unknown> | null): TagSuggestion {
  const o = parsed ?? {}
  const rawGenres = Array.isArray(o.genres) ? o.genres : []
  const genres = Array.from(
    new Set(
      rawGenres.filter(
        (g): g is string => typeof g === 'string' && ALL_GENRE_SLUGS.includes(g)
      )
    )
  ).slice(0, GENRES_MAX)

  return {
    moods: coerceMoods(o.moods),
    energy: coerceEnergy(o.energy),
    vocal: coerceVocal(o.vocal),
    instruments: coerceInstruments(o.instruments),
    genres,
    suggested_at: new Date().toISOString(),
    model: MODEL,
  }
}

/** AI-suggest moods/energy/vocal/instruments/genres for a track. Degrades gracefully with no key. */
export async function suggestTrackTags(input: SuggestTrackTagsInput): Promise<SuggestTrackTagsResult> {
  const title = (input.title ?? '').trim()
  if (!title) return { ok: false, error: 'A track title is needed to suggest tags.' }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'The tagging assistant is offline right now.' }
  }

  const anthropic = new Anthropic({ apiKey })
  let parsed: Record<string, unknown> | null
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: buildPrompt(title, (input.text ?? '').trim()) }],
    })
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
    parsed = extractJson(text)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Tag suggestion failed'
    return { ok: false, error: msg }
  }

  return { ok: true, suggestion: coerceSuggestion(parsed) }
}
