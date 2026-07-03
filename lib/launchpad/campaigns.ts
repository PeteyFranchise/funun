// ─── Social campaign types + JSONB read/sanitize helpers ─────────────────────
// Mirrors lib/metadata/schema.ts's readComposers/sanitizeComposers pattern:
// readPosts() defensively coerces every field and drops invalid rows;
// sanitizeSlotEdit() is the sole allowlisted write path for a client-supplied
// slot edit. Neither function ever returns/accepts a full posts array from
// an untrusted source — callers load current posts, apply the sanitized
// edit to the target slot by id, then re-save the whole array server-side.

import { randomUUID } from 'crypto'

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

// ─── Default posting-time computation (D-15) ──────────────────────────────
// Grounded in 07-RESEARCH.md's "Per-Platform Posting Defaults" table.
// weekday follows JS Date#getDay() semantics (0=Sunday..6=Saturday).

export const PLATFORM_POSTING_DEFAULTS: Record<Platform, { weekday: number; hour: number; minute: number }> = {
  instagram: { weekday: 3, hour: 12, minute: 0 }, // Wednesday 12:00 PM
  tiktok: { weekday: 2, hour: 19, minute: 0 }, // Tuesday 7:00 PM
  x: { weekday: 3, hour: 13, minute: 0 }, // Wednesday 1:00 PM
  youtube_shorts: { weekday: 4, hour: 18, minute: 0 }, // Thursday 6:00 PM
  facebook: { weekday: 3, hour: 13, minute: 0 }, // Wednesday 1:00 PM
  threads: { weekday: 4, hour: 9, minute: 0 }, // Thursday 9:00 AM
}

/**
 * Parse a `YYYY-MM-DD`-prefixed date string into a local-midnight Date without
 * the UTC/local-timezone day-shift that `new Date('YYYY-MM-DD')` introduces
 * (that form is parsed as UTC midnight, which can roll back a day once
 * converted to a negative-offset local timezone). Falls back to the native
 * `Date` constructor for any other parseable string shape.
 */
function parseLocalDate(input: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input)
  if (match) {
    const [, y, m, d] = match
    return new Date(Number(y), Number(m) - 1, Number(d))
  }
  const parsed = new Date(input)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Compute the default posting-time timestamp for a calendar slot.
 * Window for `week` is [release_date + (week-1)*7, release_date + week*7 - 1];
 * lands on the platform's default weekday+time within that window. When
 * `sameWeekIndex > 0` (a later slot for the same platform+week), offsets the
 * date forward by `sameWeekIndex * 2` days purely for calendar-UI legibility
 * (per RESEARCH.md's same-week-collision discretion note, D-15).
 */
export function computeDefaultPostingTime(
  releaseDate: string | null,
  week: 1 | 2 | 3 | 4,
  platform: Platform,
  sameWeekIndex = 0
): string {
  const base = (releaseDate ? parseLocalDate(releaseDate) : null) ?? new Date()
  base.setHours(0, 0, 0, 0)

  const windowStart = new Date(base)
  windowStart.setDate(windowStart.getDate() + (week - 1) * 7)

  const defaults = PLATFORM_POSTING_DEFAULTS[platform]
  let target = new Date(windowStart)
  for (let i = 0; i < 7; i++) {
    const candidate = new Date(windowStart)
    candidate.setDate(candidate.getDate() + i)
    if (candidate.getDay() === defaults.weekday) {
      target = candidate
      break
    }
  }

  if (sameWeekIndex > 0) target.setDate(target.getDate() + sameWeekIndex * 2)
  target.setHours(defaults.hour, defaults.minute, 0, 0)

  return target.toISOString()
}

/**
 * Turn raw AI-generated calendar JSON (a `posts` array or a bare array of
 * slot-shaped objects) into a validated `SocialPost[]`: assigns each surviving
 * slot a stable id and a computed default `posting_time`, marks it
 * `completed: false` / `source: 'ai'`, then routes the enriched rows through
 * `readPosts()` so the same enum/range validation drops any hallucinated
 * platform/content_type/week before it can become a stored slot.
 */
export function readCalendarPosts(raw: unknown, releaseDate: string | null): SocialPost[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Record<string, unknown> | null)?.posts)
      ? ((raw as Record<string, unknown>).posts as unknown[])
      : []

  const sameWeekPlatformCounts = new Map<string, number>()

  const enriched = list.map(r => {
    const o = (r ?? {}) as Record<string, unknown>
    const platform = PLATFORM_VALUES.includes(o.platform as Platform) ? (o.platform as Platform) : 'instagram'
    const weekNum = Number(o.week)
    const week = ([1, 2, 3, 4] as number[]).includes(weekNum) ? (weekNum as 1 | 2 | 3 | 4) : 1

    const key = `${platform}:${week}`
    const sameWeekIndex = sameWeekPlatformCounts.get(key) ?? 0
    sameWeekPlatformCounts.set(key, sameWeekIndex + 1)

    return {
      ...o,
      id: randomUUID(),
      completed: false,
      completed_at: null,
      source: 'ai',
      posting_time: computeDefaultPostingTime(releaseDate, week, platform, sameWeekIndex),
    }
  })

  return readPosts(enriched)
}
