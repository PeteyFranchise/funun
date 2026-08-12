// ─── Brief Builder — AI draft ────────────────────────────────────────────
// Turns a buyer's free-text project description into a structured Brief.
// Server-only: constructs the Anthropic client inline (like lib/contracts/
// verify.ts) so a missing key degrades gracefully instead of throwing at
// import. Follows the repo's prompt-for-JSON + tolerant-extract convention
// (see app/api/tools/pitchplug/route.ts), then coerces the result against the
// known vocab in lib/buyer/brief.ts so the UI only ever sees valid values.
import Anthropic from '@anthropic-ai/sdk'
import {
  coerceBrief,
  BRIEF_MOODS,
  BRIEF_GENRES,
  BRIEF_ENERGY,
  BRIEF_VOCALS,
  BRIEF_USES,
  BRIEF_TERRITORIES,
  BRIEF_TERMS,
  BRIEF_EXCLUSIVITY,
  type Brief,
} from '@/lib/buyer/brief'

const MODEL = 'claude-sonnet-4-6'
export const BRIEF_PROSE_MAX = 1500

export type BriefDraftResult = { ok: true; brief: Brief } | { ok: false; error: string }

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

function buildPrompt(prose: string): string {
  return `A buyer wants to license music for a project and described it in their own words. Turn their description into a structured brief for a sync-licensing catalogue.

Their description:
"""
${prose}
"""

Respond with ONLY a JSON object in exactly this shape:
{
  "creative": {
    "mood": [],        // zero or more of: ${list(BRIEF_MOODS)}
    "genre": [],       // zero or more of: ${list(BRIEF_GENRES)}
    "energy": [],      // zero or more of: ${list(BRIEF_ENERGY)}
    "vocals": ""       // one of: ${list(BRIEF_VOCALS)}
  },
  "deal": {
    "use": "",         // one of: ${list(BRIEF_USES)} — or "" if unclear
    "territory": "",   // one of: ${list(BRIEF_TERRITORIES)} — or "" if unclear
    "term": "",        // one of: ${list(BRIEF_TERMS)} — or "" if unclear
    "exclusivity": "", // one of: ${list(BRIEF_EXCLUSIVITY)} — or "" if unclear
    "budget": ""       // a short range or figure exactly as they said it, e.g. "$8,000–12,000", or "" if none
  },
  "notes": ""          // one or two sentences capturing anything useful that did not fit a field above (tempo, instrumentation, reference tracks, edit length, deadline, mood nuance). "" if nothing.
}

Rules:
- Use ONLY the allowed values above, copied exactly. If the description does not indicate a field, use "" (or [] for a list) — do not guess wildly.
- "vocals": "Instrumental" if they want no vocals, "Vocal" if they want vocals, "Either" if unstated.
- Put anything you inferred but could not map to a field into "notes" — never invent a field value to force a fit.
- Output JSON only, with no prose before or after.`
}

export async function draftBriefFromProse(prose: string): Promise<BriefDraftResult> {
  const trimmed = prose.trim()
  if (!trimmed) return { ok: false, error: 'Tell us a bit about your project first.' }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'The brief assistant is offline right now — you can still fill this in by hand.' }
  }

  const anthropic = new Anthropic({ apiKey })
  let parsed: Record<string, unknown> | null
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      messages: [{ role: 'user', content: buildPrompt(trimmed.slice(0, BRIEF_PROSE_MAX)) }],
    })
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
    parsed = extractJson(text)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Draft failed'
    return { ok: false, error: msg }
  }

  if (!parsed) {
    return { ok: false, error: 'Could not quite read that back — try describing it a different way.' }
  }
  return { ok: true, brief: coerceBrief(parsed) }
}
