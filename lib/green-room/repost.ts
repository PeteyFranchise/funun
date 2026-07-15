import type { SupabaseClient } from '@supabase/supabase-js'
import { canRepost, isGreenRoomVisibility, type GreenRoomVisibility } from '@/lib/green-room/feed'

export type GreenRoomRepost = {
  id: string
  originalPostId: string
  authorId: string
  quoteBody: string | null
  createdAt: string
}

type OriginalPostRow = {
  id: string
  author_id: string
  visibility: string
  allow_resharing: boolean
  status: string
  moderation_status: string
  deleted_at: string | null
}

const QUOTE_MAX = 1000

export function normalizeRepostQuote(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') throw new Error('Quote must be text')
  const quote = value.trim()
  if (!quote) return null
  if (quote.length > QUOTE_MAX) throw new Error(`Quote must be ${QUOTE_MAX} characters or fewer`)
  return quote
}

export async function createGreenRoomRepost(
  supabase: SupabaseClient,
  viewerId: string,
  postId: string,
  rawQuote: unknown
): Promise<{ ok: true; repost: GreenRoomRepost } | { ok: false; error: string; status: number }> {
  let quoteBody: string | null
  try {
    quoteBody = normalizeRepostQuote(rawQuote)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid quote', status: 400 }
  }

  const { data: original, error: originalError } = await supabase
    .from('green_room_posts')
    .select('id, author_id, visibility, allow_resharing, status, moderation_status, deleted_at')
    .eq('id', postId)
    .maybeSingle()

  if (originalError) return { ok: false, error: originalError.message, status: 500 }
  if (!original) return { ok: false, error: 'Original post not found or not visible', status: 404 }

  const post = original as OriginalPostRow
  const visibility: GreenRoomVisibility = isGreenRoomVisibility(post.visibility) ? post.visibility : 'draft'
  const decision = canRepost({
    viewerId,
    authorId: post.author_id,
    visibility,
    allowResharing: post.allow_resharing,
    originalAvailable:
      post.status === 'published' &&
      post.moderation_status === 'visible' &&
      post.deleted_at === null,
  })

  if (!decision.ok) return { ok: false, error: decision.reason, status: 400 }

  const { data, error } = await supabase
    .from('green_room_reposts')
    .insert({ original_post_id: postId, author_id: viewerId, quote_body: quoteBody })
    .select('id, original_post_id, author_id, quote_body, created_at')
    .single()

  if (error) return { ok: false, error: error.message, status: 500 }

  const row = data as {
    id: string
    original_post_id: string
    author_id: string
    quote_body: string | null
    created_at: string
  }

  return {
    ok: true,
    repost: {
      id: row.id,
      originalPostId: row.original_post_id,
      authorId: row.author_id,
      quoteBody: row.quote_body,
      createdAt: row.created_at,
    },
  }
}

