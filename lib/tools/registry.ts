import type { ArtistProfile } from '@/types'

export type ToolSlug =
  | 'epkfyi'
  | 'soundbait'
  | 'dropready'
  | 'distroadvisor'
  | 'royaltyaudit'
  | 'spotifypitch'

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
    available: true,
  },
  {
    slug: 'soundbait',
    name: 'SoundBait',
    tagline: 'TikTok hook strategy',
    description: 'Short-form hooks and a posting plan to seed your release on TikTok.',
    readinessItem: 'tiktok_strategy',
    available: true,
  },
  {
    slug: 'distroadvisor',
    name: 'DistroAdvisor',
    tagline: 'Distribution & metadata',
    description: 'Metadata checks and distribution guidance before you submit.',
    readinessItem: 'metadata',
    available: true,
  },
  {
    slug: 'royaltyaudit',
    name: 'RoyaltyAudit',
    tagline: 'PRO & royalty setup',
    description: 'Make sure your PRO registration and royalty splits are airtight.',
    readinessItem: 'pro_registration',
    available: true,
  },
  {
    slug: 'spotifypitch',
    name: 'SpotPitch',
    tagline: 'Spotify editorial pitch',
    description: 'A ready-to-paste pitch for Spotify’s playlist editors, plus the genres/moods to tag and timing tips.',
    readinessItem: 'spotify_pitch',
    available: true,
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

// ─── DropReady ────────────────────────────────────────────────────────
export type DropReadyOutput = {
  instagram_caption: string
  tiktok_caption: string
  twitter_post: string
  short_announcement: string
  hashtags: string[]
  posting_tips: string[]
}

export function buildDropReadyPrompt(
  profile: ArtistProfile,
  project: ToolProjectContext
): string {
  const artist = profile.artist_name || 'this artist'
  const handles = [
    profile.instagram_handle && `Instagram: ${profile.instagram_handle}`,
    profile.tiktok_handle && `TikTok: ${profile.tiktok_handle}`,
    profile.spotify_url && `Spotify: ${profile.spotify_url}`,
  ].filter(Boolean)

  return `You are a social media strategist writing release-day announcement copy for an independent artist.

ARTIST
Name: ${artist}
${profile.genre ? `Genre: ${profile.genre}` : ''}
${profile.location ? `Based in: ${profile.location}` : ''}
${handles.length ? handles.join('\n') : 'No social handles provided.'}

RELEASE (the project being announced)
Title: ${project.title}
Type: ${project.type}
${project.genre ? `Genre: ${project.genre}` : ''}
${project.sub_genre ? `Sub-genre: ${project.sub_genre}` : ''}
${project.release_date ? `Release date: ${project.release_date}` : 'Release date: TBA'}
${project.trackTitles.length ? `Tracks: ${project.trackTitles.join(', ')}` : ''}
${project.notes ? `Artist notes: ${project.notes}` : ''}

Write platform-native release-day copy. Match the artist's genre and voice. Be specific and grounded in the details above — do not invent streaming numbers, press quotes, chart positions, or collaborators that were not provided. Keep each caption ready to copy-paste (the Twitter/X post must fit in 280 characters).

Respond with ONLY a JSON object (no markdown, no preamble) matching exactly this shape:
{
  "instagram_caption": "Instagram caption with line breaks and 2-4 relevant emoji",
  "tiktok_caption": "short, punchy TikTok caption (under 150 characters)",
  "twitter_post": "an X/Twitter post under 280 characters including the title",
  "short_announcement": "1-2 sentence neutral announcement reusable anywhere",
  "hashtags": ["6-10 relevant hashtags without the # symbol"],
  "posting_tips": ["3-4 concrete tips for timing and rollout on release day"]
}`
}

// ─── SoundBait ────────────────────────────────────────────────────────
export type SoundBaitOutput = {
  hooks: string[]
  video_concepts: string[]
  posting_plan: string[]
  sound_tips: string[]
  caption_templates: string[]
  hashtags: string[]
}

export function buildSoundBaitPrompt(
  profile: ArtistProfile,
  project: ToolProjectContext
): string {
  const artist = profile.artist_name || 'this artist'

  return `You are a short-form video strategist who specializes in breaking independent music on TikTok and Reels.

ARTIST
Name: ${artist}
${profile.genre ? `Genre: ${profile.genre}` : ''}
${profile.location ? `Based in: ${profile.location}` : ''}
${profile.tiktok_handle ? `TikTok: ${profile.tiktok_handle}` : 'No TikTok handle provided.'}

RELEASE (the project to seed on short-form)
Title: ${project.title}
Type: ${project.type}
${project.genre ? `Genre: ${project.genre}` : ''}
${project.sub_genre ? `Sub-genre: ${project.sub_genre}` : ''}
${project.release_date ? `Release date: ${project.release_date}` : 'Release date: TBA'}
${project.trackTitles.length ? `Tracks: ${project.trackTitles.join(', ')}` : ''}
${project.notes ? `Artist notes: ${project.notes}` : ''}

Design a short-form hook strategy to build momentum before and on release day. Be specific to the artist's genre and the release. Do not invent streaming numbers, trends that don't exist, or collaborators that were not provided. Hooks should be sayable on camera or as on-screen text; concepts should be filmable by a solo independent artist with a phone.

Respond with ONLY a JSON object (no markdown, no preamble) matching exactly this shape:
{
  "hooks": ["5-6 scroll-stopping opening lines or on-screen text hooks"],
  "video_concepts": ["4-5 concrete short-form video concepts tied to this release"],
  "posting_plan": ["4-6 steps describing what to post and when, from teaser through release week"],
  "sound_tips": ["3-4 tips for which clip/section of the song to use and how to leverage the sound"],
  "caption_templates": ["3-4 reusable caption templates"],
  "hashtags": ["6-10 relevant hashtags without the # symbol"]
}`
}

// ─── DistroAdvisor ────────────────────────────────────────────────────
export type DistroAdvisorOutput = {
  metadata_review: { field: string; recommendation: string }[]
  release_timing: string
  platform_priorities: string[]
  pre_save_strategy: string[]
  common_pitfalls: string[]
  submission_checklist: string[]
}

export function buildDistroAdvisorPrompt(
  profile: ArtistProfile,
  project: ToolProjectContext
): string {
  const artist = profile.artist_name || 'this artist'

  return `You are a digital distribution and metadata expert advising an independent artist before they submit a release to a distributor (e.g. DistroKid, TuneCore, CD Baby).

ARTIST
Name: ${artist}
${profile.genre ? `Genre: ${profile.genre}` : ''}
${profile.location ? `Based in: ${profile.location}` : ''}

RELEASE (the project being submitted)
Title: ${project.title}
Type: ${project.type}
${project.genre ? `Genre: ${project.genre}` : ''}
${project.sub_genre ? `Sub-genre: ${project.sub_genre}` : ''}
${project.release_date ? `Release date: ${project.release_date}` : 'Release date: TBA'}
${project.trackTitles.length ? `Tracks: ${project.trackTitles.join(', ')}` : 'No track titles provided.'}
${project.notes ? `Artist notes: ${project.notes}` : ''}

Review the release for distribution readiness. Give practical, current best-practice guidance. Do not invent details about the release that were not provided — where information is missing, frame the recommendation as something the artist should confirm or supply. The metadata_review should cover fields like primary/featured artists, genre, explicit flags, ISRC/UPC, release date lead time, artwork specs, and credits.

Respond with ONLY a JSON object (no markdown, no preamble) matching exactly this shape:
{
  "metadata_review": [
    { "field": "name of a metadata field", "recommendation": "specific guidance for this release" }
  ],
  "release_timing": "1 paragraph on ideal release date/day and lead time before submission",
  "platform_priorities": ["3-4 platforms/DSPs to prioritize and why"],
  "pre_save_strategy": ["3-4 concrete pre-save / pre-add tactics"],
  "common_pitfalls": ["3-4 distribution mistakes to avoid"],
  "submission_checklist": ["5-7 items to confirm before hitting submit"]
}`
}

// ─── RoyaltyAudit ─────────────────────────────────────────────────────
export type RoyaltyAuditOutput = {
  pro_recommendation: string
  registration_steps: string[]
  royalty_types: { type: string; description: string }[]
  split_sheet_guidance: string[]
  collection_setup: string[]
  action_items: string[]
}

export function buildRoyaltyAuditPrompt(
  profile: ArtistProfile,
  project: ToolProjectContext
): string {
  const artist = profile.artist_name || 'this artist'

  return `You are a music publishing and royalties advisor helping an independent artist make sure they collect every royalty they are owed for a release.

ARTIST
Name: ${artist}
${profile.genre ? `Genre: ${profile.genre}` : ''}
${profile.location ? `Based in: ${profile.location}` : ''}

RELEASE (the project to audit for royalty setup)
Title: ${project.title}
Type: ${project.type}
${project.release_date ? `Release date: ${project.release_date}` : 'Release date: TBA'}
${project.trackTitles.length ? `Tracks: ${project.trackTitles.join(', ')}` : ''}
${project.notes ? `Artist notes: ${project.notes}` : ''}

Audit the artist's royalty and PRO setup and explain what to put in place. Give accurate, general guidance about how music royalties work (performance, mechanical, neighbouring/digital, sync) and the organizations that collect them. Tailor the PRO recommendation to the artist's location if provided; if location is unknown, say so and explain how to choose. Do not give personalized legal or financial advice or guarantee specific payouts — frame everything as standard industry setup steps the artist should complete or confirm with the relevant organizations.

Respond with ONLY a JSON object (no markdown, no preamble) matching exactly this shape:
{
  "pro_recommendation": "1 paragraph recommending which PRO to register with (and why), based on location",
  "registration_steps": ["4-6 ordered steps to register works and the songwriter"],
  "royalty_types": [
    { "type": "name of a royalty type", "description": "what it is and who collects it" }
  ],
  "split_sheet_guidance": ["3-4 tips for documenting songwriter/producer splits for this release"],
  "collection_setup": ["3-4 accounts/services to set up to collect all royalties (e.g. publishing admin, SoundExchange, MLC)"],
  "action_items": ["4-6 concrete next steps specific to this release"]
}`
}

// ─── SpotPitch (Spotify editorial pitch) ─────────────────────────────
export type SpotifyPitchOutput = {
  pitch: string
  hook: string
  genres: string[]
  moods: string[]
  instruments: string[]
  submission_tips: string[]
}

export function buildSpotifyPitchPrompt(
  profile: ArtistProfile,
  project: ToolProjectContext
): string {
  const artist = profile.artist_name || 'this artist'

  return `You are a music marketer writing a Spotify editorial pitch — the note an artist submits to Spotify's playlist editors through Spotify for Artists — for an independent artist's upcoming release.

ARTIST
Name: ${artist}
${profile.genre ? `Genre: ${profile.genre}` : ''}
${profile.location ? `Based in: ${profile.location}` : ''}
${profile.monthly_listeners != null ? `Monthly listeners: ${profile.monthly_listeners}` : ''}

RELEASE (the song to pitch)
Title: ${project.title}
Type: ${project.type}
${project.genre ? `Genre: ${project.genre}` : ''}
${project.sub_genre ? `Sub-genre: ${project.sub_genre}` : ''}
${project.release_date ? `Release date: ${project.release_date}` : 'Release date: TBA'}
${project.trackTitles.length ? `Tracks: ${project.trackTitles.join(', ')}` : ''}
${project.notes ? `Artist notes: ${project.notes}` : ''}

Write the pitch. The pitch field in Spotify for Artists is capped at ~500 characters, so "pitch" MUST be 500 characters or fewer. Describe the song's sound, mood, and story, and why it fits editorial playlists — specific and grounded in the details above. Do NOT invent streaming numbers, press quotes, chart positions, awards, or collaborators that were not provided.

Respond with ONLY a JSON object (no markdown, no preamble) matching exactly this shape:
{
  "pitch": "the editorial pitch, 500 characters or fewer, ready to paste into Spotify for Artists",
  "hook": "one punchy sentence on why this song stands out",
  "genres": ["up to 3 genres to tag"],
  "moods": ["up to 3 moods that describe the song"],
  "instruments": ["2-4 notable instruments or sounds in the track"],
  "submission_tips": ["4-5 concrete tips for submitting via Spotify for Artists (pitch one song per release, submit at least a week — ideally a month — ahead, etc.)"]
}`
}

// ─── Prompt dispatcher ────────────────────────────────────────────────
export function buildToolPrompt(
  slug: ToolSlug,
  profile: ArtistProfile,
  project: ToolProjectContext
): string | null {
  switch (slug) {
    case 'epkfyi':
      return buildEpkPrompt(profile, project)
    case 'dropready':
      return buildDropReadyPrompt(profile, project)
    case 'soundbait':
      return buildSoundBaitPrompt(profile, project)
    case 'distroadvisor':
      return buildDistroAdvisorPrompt(profile, project)
    case 'royaltyaudit':
      return buildRoyaltyAuditPrompt(profile, project)
    case 'spotifypitch':
      return buildSpotifyPitchPrompt(profile, project)
    default:
      return null
  }
}
