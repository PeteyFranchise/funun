// ─── CopyrightKit ────────────────────────────────────────────────────
// Generates a step-by-step US Copyright Office (eCO) registration
// walkthrough pre-filled with the project's metadata. Project level.
import type { ArtistProfile } from '@/types'

export type CopyrightKitOutput = {
  registration_type: string
  why_it_matters: string
  prefill_checklist: { field: string; value: string }[]
  steps: string[]
  cost_note: string
  after_filing: string[]
}

export const COPYRIGHTKIT_META = {
  slug: 'copyrightkit' as const,
  name: 'CopyrightKit',
  documentType: 'copyright_registration' as const,
}

export type CopyrightKitInput = {
  project_title: string
  writers: string[]
  track_count: number
  registration_mode: 'single' | 'collection'
  release_date: string | null
}

export function buildCopyrightKitPrompt(
  profile: ArtistProfile,
  input: CopyrightKitInput
): string {
  const artist = profile.artist_name || 'the artist'
  return `You are a copyright registration assistant guiding an independent artist through registering their work with the US Copyright Office via the online eCO system at copyright.gov.

ARTIST
Name: ${artist}

PROJECT
Title: ${input.project_title}
Number of tracks: ${input.track_count}
Writers across all tracks: ${input.writers.join(', ') || 'not provided'}
${input.release_date ? `Intended release/publication date: ${input.release_date}` : 'Publication status: unpublished (not yet released)'}
Recommended registration: ${input.registration_mode === 'collection' ? 'group/collection registration (cheaper for 3+ works)' : 'single work registration'}

Produce an accurate, current eCO walkthrough. Explain how to register and what to enter in each key field, pre-filled with the project data above. Be factual about US Copyright Office procedure; do not invent fee amounts precisely — give general ranges and tell them to confirm current fees on copyright.gov. Note that registering before infringement (or within 3 months of publication) preserves the right to statutory damages and attorney's fees.

Respond with ONLY a JSON object (no markdown, no preamble) matching exactly this shape:
{
  "registration_type": "which eCO application type to choose and why",
  "why_it_matters": "1-2 sentences on the legal protection registration provides",
  "prefill_checklist": [
    { "field": "name of an eCO field", "value": "what to enter for this project" }
  ],
  "steps": ["6-9 ordered steps from logging into eCO to submitting payment and the deposit copy"],
  "cost_note": "guidance on current filing fee ranges and how collection vs single affects cost",
  "after_filing": ["3-4 things to expect or do after filing (certificate timing, record-keeping)"]
}`
}
