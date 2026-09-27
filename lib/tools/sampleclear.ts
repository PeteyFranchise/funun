// ─── SampleClear ─────────────────────────────────────────────────────
// Assesses a sampled track: identifies master vs publishing rights
// holders (usually different), drafts a clearance request to each, and
// offers legal alternatives if clearance is unlikely. Per track.
import type { UserProfile } from '@/types'

export type SampleClearOutput = {
  assessment: string
  master_rights: { likely_holder: string; how_to_contact: string }
  publishing_rights: { likely_holder: string; how_to_contact: string }
  master_request_letter: string
  publishing_request_letter: string
  alternatives: string[]
  risk_level: 'low' | 'medium' | 'high'
}

export const SAMPLECLEAR_META = {
  slug: 'sampleclear' as const,
  name: 'SampleClear',
  documentType: 'sample_clearance' as const,
}

export type SampleClearInput = {
  song_name: string
  sample_details: string
  project_title: string
}

export function buildSampleClearPrompt(
  profile: UserProfile,
  input: SampleClearInput
): string {
  const artist = profile.artist_name || 'the artist'
  return `You are a sample-clearance specialist helping an independent artist clear a sample before release.

ARTIST
Name: ${artist}

TRACK CONTAINING THE SAMPLE
Song: ${input.song_name}
Project: ${input.project_title}
Sample described by the artist: ${input.sample_details || 'No details provided — ask the artist to specify the source recording, artist, and what portion is used.'}

Assess what it takes to clear this sample. Crucially, explain that TWO separate rights must be cleared — the MASTER (the specific recording, usually controlled by a record label) and the PUBLISHING/COMPOSITION (the underlying song, controlled by the songwriters/publishers) — and that these are almost always different companies. Draft a clearance request letter to each rights holder. If the sample details are vague, base the letters on placeholders the artist fills in, and say what information is still needed. Do not fabricate specific company names, contacts, or fees as if confirmed — frame likely holders as "likely" and direct the artist to verify. Provide legal alternatives (interpolation/re-recording, royalty-free libraries, removing the sample) in case clearance is denied.

Respond with ONLY a JSON object (no markdown, no preamble) matching exactly this shape:
{
  "assessment": "1-2 paragraph assessment of what clearing this sample involves",
  "master_rights": { "likely_holder": "who likely controls the master", "how_to_contact": "how to reach them" },
  "publishing_rights": { "likely_holder": "who likely controls the publishing", "how_to_contact": "how to reach them" },
  "master_request_letter": "a clearance request letter to the master rights holder, with \\n between paragraphs and [PLACEHOLDERS] where needed",
  "publishing_request_letter": "a clearance request letter to the publishing rights holder, with \\n between paragraphs and [PLACEHOLDERS] where needed",
  "alternatives": ["3-4 legal alternatives if clearance is denied or too expensive"],
  "risk_level": "low | medium | high — the release risk if this ships uncleared"
}`
}

// ─── Reading the model's output safely ──────────────────────────────
// The route persists this as an untyped record because it is parsed out of
// model text: SampleClearOutput above is an aspiration about what a
// well-behaved response looks like, not a guarantee about what arrived. Any
// field may be missing, empty, or the wrong shape. This reader is what makes
// it safe to render — every slot is optional in the view, nothing is
// coerced into a string, and a value that carries nothing usable at all
// becomes null so the caller can fall back to a generic renderer instead of
// showing an empty or half-fabricated panel.

const RISK_LEVELS = ['low', 'medium', 'high'] as const
type SampleClearRiskLevel = (typeof RISK_LEVELS)[number]

export type SampleClearView = {
  assessment: string | null
  master: { holder: string | null; contact: string | null }
  publishing: { holder: string | null; contact: string | null }
  masterLetter: string | null
  publishingLetter: string | null
  alternatives: string[]
  riskLevel: SampleClearRiskLevel | null
}

function readOptionalString(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed ? trimmed : null
}

function readRightsBlock(raw: unknown): { holder: string | null; contact: string | null } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { holder: null, contact: null }
  const o = raw as Record<string, unknown>
  return {
    holder: readOptionalString(o.likely_holder),
    contact: readOptionalString(o.how_to_contact),
  }
}

function readAlternatives(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const entry of raw) {
    const s = readOptionalString(entry)
    if (s) out.push(s)
  }
  return out
}

function readRiskLevel(raw: unknown): SampleClearRiskLevel | null {
  if (typeof raw !== 'string') return null
  const normalized = raw.trim().toLowerCase()
  return (RISK_LEVELS as readonly string[]).includes(normalized)
    ? (normalized as SampleClearRiskLevel)
    : null
}

/** Read a rendered SampleClearView out of the loosely-typed generate-route
 * payload, or null if nothing usable survived (the signal to fall back to
 * the generic renderer). */
export function readSampleClearOutput(raw: unknown): SampleClearView | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>

  const assessment = readOptionalString(o.assessment)
  const master = readRightsBlock(o.master_rights)
  const publishing = readRightsBlock(o.publishing_rights)
  const masterLetter = readOptionalString(o.master_request_letter)
  const publishingLetter = readOptionalString(o.publishing_request_letter)
  const alternatives = readAlternatives(o.alternatives)
  const riskLevel = readRiskLevel(o.risk_level)

  const hasAnything =
    assessment !== null ||
    master.holder !== null ||
    master.contact !== null ||
    publishing.holder !== null ||
    publishing.contact !== null ||
    masterLetter !== null ||
    publishingLetter !== null ||
    alternatives.length > 0 ||
    riskLevel !== null

  if (!hasAnything) return null

  return { assessment, master, publishing, masterLetter, publishingLetter, alternatives, riskLevel }
}
