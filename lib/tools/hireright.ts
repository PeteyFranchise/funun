// ─── HireRight ───────────────────────────────────────────────────────
// Generates a work-for-hire agreement tailored to the collaborator type.
// Producer, mixing-engineer, and mastering-engineer agreements transfer
// different rights, so the prompt branches on role.
import type { ArtistProfile } from '@/types'

export type HireRightOutput = {
  agreement_title: string
  agreement_text: string
  rights_transferred: string[]
  signature_blocks: string[]
  notes: string[]
}

export const HIRERIGHT_META = {
  slug: 'hireright' as const,
  name: 'HireRight',
  documentType: 'hire_right' as const,
}

export type HireRightInput = {
  collaborator: string
  role: string
  track_titles: string[]
  project_title: string
}

export function buildHireRightPrompt(profile: ArtistProfile, input: HireRightInput): string {
  const artist = profile.artist_name || 'the Artist'
  return `You are a music-business attorney drafting a plain-English work-for-hire agreement for an independent artist to send to a hired collaborator.

ARTIST (the commissioning party / owner)
Name: ${artist}
${profile.location ? `Based in: ${profile.location}` : ''}

HIRED COLLABORATOR
Name: ${input.collaborator}
Role: ${input.role}
Work performed on: ${input.track_titles.join(', ') || input.project_title}
Project: ${input.project_title}

Draft a work-for-hire agreement appropriate to a ${input.role}. Use rights-transfer language specific to that role:
- A producer agreement assigns the producer's contribution to the sound recording (and any production elements) to the Artist, with the Artist owning 100% of the master.
- A mixing or mastering engineer agreement confirms the engineer performed a service for hire and holds no ownership of the recording.
The agreement must state that the Artist owns 100% of the sound recording and that ${input.collaborator} waives all ownership claims to the master. Keep it readable for non-lawyers. Do not invent payment amounts, dates, or terms that were not provided — use clearly marked placeholders like [FEE], [DATE] where specifics are needed. Add a short disclaimer that this is a template, not legal advice, and both parties should review before signing.

Respond with ONLY a JSON object (no markdown, no preamble) matching exactly this shape:
{
  "agreement_title": "title of the agreement, naming the role",
  "agreement_text": "the full agreement body with clauses and [PLACEHOLDERS], using \\n between paragraphs",
  "rights_transferred": ["3-5 bullet points summarizing exactly what rights transfer to the Artist"],
  "signature_blocks": ["signature lines needed, e.g. 'Artist: ____  Date: ____'"],
  "notes": ["2-3 short notes on filling in placeholders or what to confirm before signing"]
}`
}
