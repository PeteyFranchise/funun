import type { ArtistProfile } from '@/types'

/**
 * PitchPlug — artist-initiated cold-pitch email generator.
 *
 * Generates a tailored outreach email per selected curator/contact type from
 * the artist's vault project + profile. Unlike the generic studio tools
 * (registry.ts), PitchPlug takes a curator-type selection, so it has its own
 * route (app/api/tools/pitchplug) and prompt builder here.
 */

export type CuratorType =
  | 'spotify_mood_curator'
  | 'submithub_blog'
  | 'hiphop_rnb_blog'
  | 'youtube_channel'
  | 'college_radio'
  | 'tiktok_discovery'
  | 'sync_platform'
  | 'venue_booker'

export type CuratorDef = {
  type: CuratorType
  name: string
  blurb: string
  /** What the recipient cares about — steers the generated angle. */
  angle: string
}

export const CURATORS: CuratorDef[] = [
  {
    type: 'spotify_mood_curator',
    name: 'Spotify / mood playlist curator',
    blurb: 'Independent playlist curators on Spotify',
    angle: 'why the track fits a specific mood/vibe and listener context',
  },
  {
    type: 'submithub_blog',
    name: 'SubmitHub blog / curator',
    blurb: 'Music blogs and curators on SubmitHub',
    angle: 'a tight, respectful pitch that fits a 1-credit submission window',
  },
  {
    type: 'hiphop_rnb_blog',
    name: 'Hip-Hop / R&B blog',
    blurb: 'Genre blogs covering new hip-hop and R&B',
    angle: 'the story and culture angle a writer could build a post around',
  },
  {
    type: 'youtube_channel',
    name: 'YouTube channel / promoter',
    blurb: 'Promo channels that premiere or feature tracks',
    angle: 'why this would perform with their audience and a clean asset handoff',
  },
  {
    type: 'college_radio',
    name: 'College radio',
    blurb: 'College and community radio music directors',
    angle: 'format fit, clean version availability, and a short artist bio',
  },
  {
    type: 'tiktok_discovery',
    name: 'TikTok discovery / sound page',
    blurb: 'TikTok accounts that break sounds',
    angle: 'the hook moment and a ready-to-use sound concept',
  },
  {
    type: 'sync_platform',
    name: 'Sync / licensing platform',
    blurb: 'Sync agents and licensing libraries',
    angle: 'mood, tempo, stems/instrumental availability, and clearance status',
  },
  {
    type: 'venue_booker',
    name: 'Venue / talent booker',
    blurb: 'Local venue and event bookers',
    angle: 'draw, live readiness, and a concrete ask for a slot',
  },
]

export function getCurator(type: string): CuratorDef | undefined {
  return CURATORS.find(c => c.type === type)
}

export type PitchPlugProjectContext = {
  title: string
  type: string
  genre: string | null
  sub_genre: string | null
  release_date: string | null
  notes: string | null
  trackTitles: string[]
}

export type GeneratedPitch = { subject: string; body: string }
export type PitchPlugOutput = Partial<Record<CuratorType, GeneratedPitch>>

const PITCHPLUG_SYSTEM = `You are a music outreach specialist with 15 years of experience pitching independent artists to curators, blogs, radio, sync libraries and bookers. You write the kind of short, human cold emails that actually get replies.

Hard rules:
- Sound like the artist wrote it themselves at 11pm — direct, warm, a little understated. Never like a publicist or a press release.
- NEVER use these phrases or anything like them: "I hope this email finds you well", "I am reaching out", "I wanted to share", "check out my latest", "blessed", "grind", "fire", "this is a movement", "don't sleep", "game-changer", "next level", "passionate about music".
- No exclamation-mark spam. At most one.
- Be specific and honest. Use only the facts provided. Do NOT invent streaming numbers, press, co-signs, chart positions, or collaborators.
- Respect the recipient's time: every email is 3–4 short paragraphs and under 180 words of body text.
- Each subject line is under 60 characters, lowercase-leaning, and not clickbait.
- Make one clear, low-pressure ask appropriate to the recipient type.`

export function buildPitchPlugPrompt(
  profile: ArtistProfile,
  project: PitchPlugProjectContext,
  curatorTypes: CuratorType[]
): string {
  const artist = profile.artist_name || 'the artist'
  const facts = [
    profile.genre && `Genre: ${profile.genre}`,
    profile.location && `Based in: ${profile.location}`,
    profile.monthly_listeners != null && `Monthly listeners: ${profile.monthly_listeners}`,
    profile.bio && `Bio: ${profile.bio}`,
    profile.spotify_url && `Spotify: ${profile.spotify_url}`,
    profile.instagram_handle && `Instagram: ${profile.instagram_handle}`,
    profile.tiktok_handle && `TikTok: ${profile.tiktok_handle}`,
  ].filter(Boolean)

  const selected = curatorTypes
    .map(t => CURATORS.find(c => c.type === t))
    .filter((c): c is CuratorDef => Boolean(c))

  const recipientLines = selected
    .map(c => `- "${c.type}" (${c.name}): focus on ${c.angle}.`)
    .join('\n')

  return `${PITCHPLUG_SYSTEM}

ARTIST
Name: ${artist}
${facts.length ? facts.join('\n') : 'No additional profile details provided.'}

RELEASE (the track/project being pitched)
Title: ${project.title}
Type: ${project.type}
${project.genre ? `Genre: ${project.genre}` : ''}
${project.sub_genre ? `Sub-genre: ${project.sub_genre}` : ''}
${project.release_date ? `Release date: ${project.release_date}` : 'Release date: TBA'}
${project.trackTitles.length ? `Tracks: ${project.trackTitles.join(', ')}` : ''}
${project.notes ? `Artist notes: ${project.notes}` : ''}

Write one cold-outreach email for EACH of these recipient types:
${recipientLines}

Respond with ONLY a JSON object (no markdown, no preamble). The keys are the recipient type strings above and each value is an object with "subject" and "body". Example shape:
{
  "${selected[0]?.type ?? 'spotify_mood_curator'}": { "subject": "…", "body": "…" }
}
The "body" must use real line breaks between paragraphs (\\n\\n) and must not include a subject line inside it.`
}
