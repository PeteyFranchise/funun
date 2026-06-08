// ─── ContentID Command ───────────────────────────────────────────────
// Personalized YouTube Content ID setup guide based on the artist's
// distributor, plus a ready-to-use DMCA takedown template. Recommended
// (not a hard gate); confirming setup flips project.content_id_registered.
import type { ArtistProfile } from '@/types'

export type ContentIdOutput = {
  distributor: string
  setup_steps: string[]
  claiming_guide: string
  dmca_template: string
  caveats: string[]
}

export const CONTENTID_META = {
  slug: 'contentid' as const,
  name: 'ContentID Command',
  // No vault_documents type — tracked via project.content_id_registered.
  documentType: null,
}

export type ContentIdInput = {
  project_title: string
  distributor: string | null
}

export function buildContentIdPrompt(profile: ArtistProfile, input: ContentIdInput): string {
  const artist = profile.artist_name || 'the artist'
  const distributor = input.distributor || 'their distributor'
  return `You are a YouTube rights and monetization expert helping an independent artist set up Content ID for a release.

ARTIST
Name: ${artist}
Distributor: ${input.distributor || 'unknown — give general guidance and name the common options (DistroKid, TuneCore, CD Baby, UnitedMasters)'}

RELEASE
Title: ${input.project_title}

Explain exactly how this artist claims their music through Content ID via ${distributor}. Content ID is accessed through a distributor or a dedicated administrator — an independent artist cannot apply directly. Give concrete, current steps for the named distributor (or the common ones if unknown). Also draft a DMCA takedown notice the artist can send immediately if someone has already used their music without permission. Be accurate; do not invent dashboard URLs or features that may not exist — describe where to look. Note the risk of double-claiming if the music is registered with more than one Content ID administrator.

Respond with ONLY a JSON object (no markdown, no preamble) matching exactly this shape:
{
  "distributor": "the distributor this guide is written for",
  "setup_steps": ["5-7 ordered steps to enable Content ID for this release"],
  "claiming_guide": "1 paragraph on how claims and matches work once it's live",
  "dmca_template": "a fill-in-the-blank DMCA takedown notice with \\n between sections and [PLACEHOLDERS]",
  "caveats": ["3-4 cautions, including double-claim risk and what NOT to claim"]
}`
}
