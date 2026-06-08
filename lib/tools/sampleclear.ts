// ─── SampleClear ─────────────────────────────────────────────────────
// Assesses a sampled track: identifies master vs publishing rights
// holders (usually different), drafts a clearance request to each, and
// offers legal alternatives if clearance is unlikely. Per track.
import type { ArtistProfile } from '@/types'

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
  profile: ArtistProfile,
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
