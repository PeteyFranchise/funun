// ─── Selects — AI draft (D-11) ───────────────────────────────────────────
// "AI drafts, AE curates": turns a buyer's Brief (lib/buyer/brief.ts) into a
// ~10-track reviewable starter (tracklist + cover note + per-track "why it
// fits") for a draft Selects. Server-only: constructs the Anthropic client
// inline exactly like lib/buyer/brief-ai.ts (new Anthropic({apiKey}), model
// claude-sonnet-4-6, response.content.filter(TextBlock).map(text).join(''),
// tolerant JSON extraction) — no second prompt-scaffolding copy.
//
// D-11 explicitly rejects a hard rights-ready-only filter: the candidate
// pool is ordered rights-ready-first (via lib/deals/catalog.ts's single
// isRightsReady authority) so the model sees cleared tracks first, but a
// near-rights-ready track is never dropped from its view — the AE reviews
// and curates the draft before send.
import Anthropic from '@anthropic-ai/sdk'
import type { Stage3Result } from '@/lib/vault/stage3'
import { isRightsReady, type CatalogProjectLike } from '@/lib/deals/catalog'
import { type Brief } from '@/lib/buyer/brief'

const MODEL = 'claude-sonnet-4-6'

// How many tracks the starter draft targets (D-11: "~10-track reviewable
// starter"). The model may return fewer if the brief is narrow.
export const AI_DRAFT_TRACK_TARGET = 10

// Bound on how many candidates are handed to the model per draft (cost +
// latency guard, mirrors lib/buyer/brief.ts's RERANK_CAND_CAP). The route's
// rights-ready-first ordering runs BEFORE this cap is applied, so cleared
// tracks are never pushed out by a large near-ready tail.
export const AI_DRAFT_CANDIDATE_CAP = 60

// A single catalogue track as a draft candidate. Carries the raw project +
// stage3 shapes (not a precomputed boolean) so orderCandidatesRightsReadyFirst
// calls the single isRightsReady authority itself, rather than trusting a
// caller-computed flag.
export type AiDraftCandidate = {
  trackId: string
  projectId: string
  title: string
  artist: string
  genre: string
  mood: string
  energy: string
  vocal: string
  instruments: string[]
  project: CatalogProjectLike
  stage3: Stage3Result
}

export type DraftedTrack = { trackId: string; reason: string; rightsReady: boolean }
export type SelectsDraft = { coverNote: string; tracks: DraftedTrack[] }
export type SelectsDraftResult = { ok: true; draft: SelectsDraft } | { ok: false; error: string }

// ─── Ordering (D-11) ───────────────────────────────────────────────────────
// Stable rights-ready-first sort: candidates that pass the single
// isRightsReady authority sort ahead of the rest, but nothing is dropped —
// ties keep their original (e.g. most-recent-first) order.
export function orderCandidatesRightsReadyFirst(
  candidates: AiDraftCandidate[]
): AiDraftCandidate[] {
  return candidates
    .map((c, index) => ({ c, index, ready: isRightsReady(c.project, c.stage3) }))
    .sort((a, b) => {
      if (a.ready !== b.ready) return a.ready ? -1 : 1
      return a.index - b.index
    })
    .map(x => x.c)
}

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

function briefSummary(b: Brief): string {
  const parts: string[] = []
  if (b.creative.mood.length) parts.push(`Mood: ${b.creative.mood.join(', ')}`)
  if (b.creative.genre.length) parts.push(`Genre: ${b.creative.genre.join(', ')}`)
  if (b.creative.energy.length) parts.push(`Energy: ${b.creative.energy.join(', ')}`)
  if (b.creative.vocals) parts.push(`Vocals: ${b.creative.vocals}`)
  if (b.deal.use) parts.push(`Use: ${b.deal.use}`)
  if (b.deal.budget) parts.push(`Budget: ${b.deal.budget}`)
  if (b.notes) parts.push(`Notes: ${b.notes}`)
  return parts.length ? parts.join('\n') : '(no specifics given)'
}

function buildPrompt(brief: Brief, orderedCandidates: AiDraftCandidate[]): string {
  const compact = orderedCandidates.slice(0, AI_DRAFT_CANDIDATE_CAP).map(c => ({
    id: c.trackId,
    title: c.title,
    artist: c.artist,
    genre: c.genre,
    mood: c.mood,
    energy: c.energy,
    vocal: c.vocal,
    instruments: c.instruments,
  }))

  return `An Account Executive is building a "Selects" — a curated starter shortlist of tracks to send a client — based on the client's brief.

Client brief:
${briefSummary(brief)}

Candidate tracks, rights-ready-cleared tracks listed FIRST, as JSON:
${JSON.stringify(compact)}

Pick up to ${AI_DRAFT_TRACK_TARGET} tracks that best fit the brief, best fit first, and write a short cover note to the client. Respond with ONLY a JSON object in exactly this shape:
{
  "coverNote": "<1-3 sentences to the client, warm and specific to the brief>",
  "tracks": [ { "id": "<candidate id>", "reason": "<why it fits, 12 words max>" } ]
}

Rules:
- Choose at most ${AI_DRAFT_TRACK_TARGET} tracks from the candidates given, best fit first.
- Use only the ids provided; never invent a track.
- Prefer the rights-ready tracks (listed earlier) when fit is comparable, but pick the best creative fit even if a track is not yet rights-ready — the AE reviews and curates before sending, this is a starting point, not a final send.
- "reason" must be concrete and specific to that track, 12 words max.
- "coverNote" must be specific to the brief, not generic boilerplate.
- Output JSON only, with no prose before or after.`
}

// ─── draftSelectsFromBrief (D-11) ──────────────────────────────────────────
// Never throws. Returns a typed ok/error result so a model failure degrades
// to "build the Selects by hand from The Crate" rather than losing the
// draft Selects the caller already created.
export async function draftSelectsFromBrief(
  brief: Brief,
  candidatePool: AiDraftCandidate[],
  signal?: AbortSignal
): Promise<SelectsDraftResult> {
  if (candidatePool.length === 0) {
    return { ok: false, error: 'No candidate tracks are available for this brief yet.' }
  }

  const ordered = orderCandidatesRightsReadyFirst(candidatePool)
  const readyById = new Map(ordered.map(c => [c.trackId, isRightsReady(c.project, c.stage3)]))
  const byId = new Map(ordered.map(c => [c.trackId, c]))

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      error: 'The AI draft assistant is offline right now — build the Selects by hand from The Crate.',
    }
  }

  const anthropic = new Anthropic({ apiKey })
  let parsed: Record<string, unknown> | null
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1400,
      messages: [{ role: 'user', content: buildPrompt(brief, ordered) }],
    }, { signal })
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
    parsed = extractJson(text)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'AI draft failed'
    return { ok: false, error: msg }
  }

  if (!parsed) {
    return {
      ok: false,
      error: 'Could not draft a starter from that brief — build the Selects by hand from The Crate.',
    }
  }

  const rawTracks = Array.isArray((parsed as { tracks?: unknown }).tracks)
    ? (parsed as { tracks: unknown[] }).tracks
    : []
  const seen = new Set<string>()
  const tracks: DraftedTrack[] = []
  for (const item of rawTracks) {
    if (tracks.length >= AI_DRAFT_TRACK_TARGET) break
    const o = (item ?? {}) as Record<string, unknown>
    const id = String(o.id ?? '')
    if (!byId.has(id) || seen.has(id)) continue
    seen.add(id)
    tracks.push({
      trackId: id,
      reason: typeof o.reason === 'string' ? o.reason.slice(0, 160) : '',
      rightsReady: readyById.get(id) ?? false,
    })
  }

  if (tracks.length === 0) {
    return {
      ok: false,
      error: 'Could not draft a starter from that brief — build the Selects by hand from The Crate.',
    }
  }

  const coverNote =
    typeof (parsed as { coverNote?: unknown }).coverNote === 'string'
      ? (parsed as { coverNote: string }).coverNote.slice(0, 800)
      : ''

  return { ok: true, draft: { coverNote, tracks } }
}
