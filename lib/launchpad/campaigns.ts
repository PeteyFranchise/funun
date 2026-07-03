// ─── Social campaign types + JSONB read/sanitize helpers ─────────────────────
// Mirrors lib/metadata/schema.ts's readComposers/sanitizeComposers pattern:
// readPosts() defensively coerces every field and drops invalid rows;
// sanitizeSlotEdit() is the sole allowlisted write path for a client-supplied
// slot edit. Neither function ever returns/accepts a full posts array from
// an untrusted source — callers load current posts, apply the sanitized
// edit to the target slot by id, then re-save the whole array server-side.

export type Platform = 'instagram' | 'tiktok' | 'x' | 'youtube_shorts' | 'facebook' | 'threads'

export const PLATFORM_VALUES: Platform[] = [
  'instagram',
  'tiktok',
  'x',
  'youtube_shorts',
  'facebook',
  'threads',
]

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  x: 'X',
  youtube_shorts: 'YouTube Shorts',
  facebook: 'Facebook',
  threads: 'Threads',
}

export type ContentType = 'short_form_video' | 'static_image' | 'lyric_graphic' | 'text' | 'stories'

export const CONTENT_TYPE_VALUES: ContentType[] = [
  'short_form_video',
  'static_image',
  'lyric_graphic',
  'text',
  'stories',
]

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  short_form_video: 'Short-form video',
  static_image: 'Static image',
  lyric_graphic: 'Lyric graphic',
  text: 'Text',
  stories: 'Stories',
}

export type SocialPost = {
  id: string
  platform: Platform
  week: 1 | 2 | 3 | 4
  content_type: ContentType
  caption: string
  posting_time: string // ISO 8601 timestamptz
  completed: boolean
  completed_at: string | null
  source: 'ai' | 'manual'
}

export type SocialCampaign = {
  id: string
  project_id: string
  user_id: string
  name: string
  platforms: Platform[]
  is_active: boolean
  posts: SocialPost[]
  created_at: string
  updated_at: string
}

/** Read a typed posts array out of a loose social_campaigns.posts JSONB blob. */
export function readPosts(posts: unknown): SocialPost[] {
  if (!Array.isArray(posts)) return []
  return posts
    .map(r => {
      const o = (r ?? {}) as Record<string, unknown>
      const platform = PLATFORM_VALUES.includes(o.platform as Platform) ? (o.platform as Platform) : null
      const contentType = CONTENT_TYPE_VALUES.includes(o.content_type as ContentType)
        ? (o.content_type as ContentType)
        : null
      const weekNum = Number(o.week)
      const week = ([1, 2, 3, 4] as number[]).includes(weekNum) ? (weekNum as 1 | 2 | 3 | 4) : null
      if (!platform || !contentType || !week) return null
      const id = String(o.id ?? '').trim()
      if (!id) return null
      return {
        id,
        platform,
        week,
        content_type: contentType,
        caption: String(o.caption ?? ''),
        posting_time: typeof o.posting_time === 'string' ? o.posting_time : new Date().toISOString(),
        completed: o.completed === true,
        completed_at: typeof o.completed_at === 'string' ? o.completed_at : null,
        source: o.source === 'manual' ? 'manual' : 'ai',
      } satisfies SocialPost
    })
    .filter((p): p is SocialPost => p !== null)
}

/** Validate + normalize a single-field slot edit from the client (allowlisted fields only). */
export function sanitizeSlotEdit(
  input: unknown
): Partial<Pick<SocialPost, 'caption' | 'posting_time' | 'completed'>> {
  const o = (input ?? {}) as Record<string, unknown>
  const out: Partial<Pick<SocialPost, 'caption' | 'posting_time' | 'completed'>> = {}
  if (typeof o.caption === 'string') out.caption = o.caption.slice(0, 2200) // Instagram's own cap is the practical ceiling
  if (typeof o.posting_time === 'string' && !Number.isNaN(Date.parse(o.posting_time))) out.posting_time = o.posting_time
  if (typeof o.completed === 'boolean') out.completed = o.completed
  return out
}
