import type { ArtistProfile } from '@/types'

export type ToolSlug =
  | 'epkfyi'
  | 'soundbait'
  | 'dropready'
  | 'distroadvisor'
  | 'royaltyaudit'

export type ToolDef = {
  slug: ToolSlug
  name: string
  tagline: string
  description: string
  /** Readiness item key this tool satisfies (see lib/vault/readiness). */
  readinessItem: string
  available: boolean
}

export const TOOLS: ToolDef[] = [
  {
    slug: 'epkfyi',
    name: 'EPK.fyi',
    tagline: 'Generate a press kit',
    description:
      'Turn your profile and project into a press-ready electronic press kit — bios, a project blurb, key facts, and pitch angles.',
    readinessItem: 'epk',
    available: true,
  },
  {
    slug: 'dropready',
    name: 'DropReady',
    tagline: 'Release-day captions',
    description: 'Platform-ready captions and announcement copy for your release.',
    readinessItem: 'caption_copy',
    available: false,
  },
  {
    slug: 'soundbait',
    name: 'SoundBait',
    tagline: 'TikTok hook strategy',
    description: 'Short-form hooks and a posting plan to seed your release on TikTok.',
    readinessItem: 'tiktok_strategy',
    available: false,
  },
  {
    slug: 'distroadvisor',
    name: 'DistroAdvisor',
    tagline: 'Distribution & metadata',
    description: 'Metadata checks and distribution guidance before you submit.',
    readinessItem: 'metadata',
    available: false,
  },
  {
    slug: 'royaltyaudit',
    name: 'RoyaltyAudit',
    tagline: 'PRO & royalty setup',
    description: 'Make sure your PRO registration and royalty splits are airtight.',
    readinessItem: 'pro_registration',
    available: false,
  },
]

export function getTool(slug: string): ToolDef | undefined {
  return TOOLS.find(t => t.slug === slug)
}

export type ToolProjectContext = {
  title: string
  type: string
  genre: string | null
  sub_genre: string | null
  release_date: string | null
  notes: string | null
  trackTitles: string[]
}

// ─── EPK ──────────────────────────────────────────────────────────────
export type EpkOutput = {
  bio_short: string
  bio_long: string
  project_blurb: string
  key_facts: string[]
  pitch_angles: string[]
  pull_quote: string
}

export function buildEpkPrompt(
  profile: ArtistProfile,
  project: ToolProjectContext
): string {
  const artist = profile.artist_name || 'this artist'
  const facts = [
    profile.genre && `Genre: ${profile.genre}`,
    profile.location && `Based in: ${profile.location}`,
    profile.monthly_listeners != null && `Monthly listeners: ${profile.monthly_listeners}`,
    profile.instagram_handle && `Instagram: ${profile.instagram_handle}`,
    profile.tiktok_handle && `TikTok: ${profile.tiktok_handle}`,
    profile.spotify_url && `Spotify: ${profile.spotify_url}`,
  ].filter(Boolean)

  return `You are a senior music publicist writing an Electronic Press Kit (EPK) for an independent artist.

ARTIST
Name: ${artist}
${profile.bio ? `Existing bio: ${profile.bio}` : 'No existing bio provided.'}
${facts.length ? facts.join('\n') : 'No additional stats provided.'}

PROJECT (the release this EPK supports)
Title: ${project.title}
Type: ${project.type}
${project.genre ? `Genre: ${project.genre}` : ''}
${project.sub_genre ? `Sub-genre: ${project.sub_genre}` : ''}
${project.release_date ? `Release date: ${project.release_date}` : 'Release date: TBA'}
${project.trackTitles.length ? `Tracks: ${project.trackTitles.join(', ')}` : ''}
${project.notes ? `Artist notes: ${project.notes}` : ''}

Write a compelling, professional EPK. Be specific and grounded in the details above — do not invent awards, chart positions, press quotes, or collaborations that were not provided. Where information is missing, write copy that reads naturally without fabricating facts.

Respond with ONLY a JSON object (no markdown, no preamble) matching exactly this shape:
{
  "bio_short": "1-2 sentence bio (under 280 characters)",
  "bio_long": "2-3 paragraph artist bio",
  "project_blurb": "1 paragraph describing this specific release and its mood/themes",
  "key_facts": ["4-6 short bullet facts a journalist could use"],
  "pitch_angles": ["3-4 distinct angles a writer/curator could cover this release from"],
  "pull_quote": "a single punchy line that captures the artist's identity"
}`
}
