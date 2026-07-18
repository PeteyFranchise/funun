import type { SupabaseClient } from '@supabase/supabase-js'
import {
  explainFeedCard,
  scoreFeedCard,
  type GreenRoomPlacementKind,
  type GreenRoomPostType,
  type GreenRoomTab,
} from '@/lib/green-room/feed'
import { isDestinationVisible, type PlacementDestinationType } from '@/lib/green-room/placements-admin'
import { PROFILE_ROLE_LABELS, type ProfileRole } from '@/types'
import { industryRoleLabel } from '@/lib/industry-roles'

export const GREEN_ROOM_FEED_PAGE_SIZE = 20
export const GREEN_ROOM_FEED_MAX_LIMIT = 50
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type GreenRoomFeedCursor = {
  publishedAt: string
  id: string
}

export type GreenRoomFeedActor = {
  id: string
  name: string
  handle: string | null
  avatarUrl: string | null
  primaryRole: string | null
}

export type GreenRoomPostCard = {
  kind: 'post'
  id: string
  actor: GreenRoomFeedActor
  postType: GreenRoomPostType
  body: string
  visibility: string
  linkedObject: { type: string; id: string } | null
  allowResharing: boolean
  publishedAt: string
  createdAt: string
  counts: {
    comments: number
    reactions: number
    reposts: number
  }
  viewerReaction: string | null
  explanationLabel: string
  score: number
}

export type GreenRoomPlacementCard = {
  kind: 'placement'
  id: string
  placementKind: Exclude<GreenRoomPlacementKind, 'organic'> | 'opportunity'
  label: string
  title: string
  body: string | null
  destination: {
    type: string
    id: string | null
    url: string | null
  }
  explanationLabel: string
}

export type GreenRoomFeedCard = GreenRoomPostCard | GreenRoomPlacementCard

type FeedPostRow = {
  id: string
  author_id: string
  post_type: GreenRoomPostType
  body: string
  visibility: string
  linked_object_type: string | null
  linked_object_id: string | null
  allow_resharing: boolean
  published_at: string
  created_at: string
}

type AuthorRow = {
  id: string
  artist_name: string | null
  handle: string | null
  avatar_url: string | null
  roles: unknown
  industry_roles: string[] | null
  is_public: boolean | null
}

type PlacementRow = {
  id: string
  placement_kind: GreenRoomPlacementCard['placementKind']
  label: string
  title: string
  body: string | null
  destination_type: PlacementDestinationType
  destination_id: string | null
  destination_url: string | null
}

type ReactionRow = {
  post_id: string
  reaction_type: string
  user_id: string
}

type CountRow = {
  post_id: string
}

type RelationshipState = {
  followingIds: Set<string>
  connectedIds: Set<string>
}

type FeedQueryOptions = {
  tab: GreenRoomTab
  cursor?: GreenRoomFeedCursor | null
  limit?: number
}

export function encodeFeedCursor(cursor: GreenRoomFeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function parseFeedCursor(value: string): GreenRoomFeedCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>
    if (typeof parsed.publishedAt !== 'string' || typeof parsed.id !== 'string') return null
    const publishedAt = new Date(parsed.publishedAt)
    if (Number.isNaN(publishedAt.getTime()) || !UUID_RE.test(parsed.id)) return null
    return { publishedAt: publishedAt.toISOString(), id: parsed.id }
  } catch {
    return null
  }
}

export function clampFeedLimit(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return GREEN_ROOM_FEED_PAGE_SIZE
  return Math.max(1, Math.min(GREEN_ROOM_FEED_MAX_LIMIT, Math.floor(parsed)))
}

export function buildFeedCursorPredicate(cursor: GreenRoomFeedCursor): string {
  return `published_at.lt.${cursor.publishedAt},and(published_at.eq.${cursor.publishedAt},id.lt.${cursor.id})`
}

export function buildPlacementWindowPredicate(nowIso: string): string {
  return `ends_at.is.null,ends_at.gt.${nowIso}`
}

export function insertPlacementCards(
  posts: GreenRoomPostCard[],
  placements: GreenRoomPlacementCard[],
  limit: number
): GreenRoomFeedCard[] {
  if (placements.length === 0) return posts.slice(0, limit)

  const cards: GreenRoomFeedCard[] = []
  let placementIndex = 0

  for (const post of posts) {
    if (cards.length >= limit) break
    cards.push(post)
    if (cards.length === 2 && placementIndex < placements.length && cards.length < limit) {
      cards.push(placements[placementIndex])
      placementIndex += 1
    }
  }

  while (cards.length < limit && placementIndex < placements.length) {
    cards.push(placements[placementIndex])
    placementIndex += 1
  }

  return cards
}

export async function loadGreenRoomFeed(
  supabase: SupabaseClient,
  viewerId: string,
  options: FeedQueryOptions
): Promise<{ cards: GreenRoomFeedCard[]; nextCursor: string | null }> {
  const limit = clampFeedLimit(options.limit)
  const relationships = await loadRelationships(supabase, viewerId)
  const rawPosts = await loadVisiblePosts(supabase, options, relationships, limit)
  const filteredPosts = filterPostsForTab(rawPosts, viewerId, relationships, options.tab)
  const candidatePosts = filteredPosts.slice(0, limit)
  const authors = await loadAuthors(supabase, candidatePosts.map(post => post.author_id))
  const pagePosts = candidatePosts.filter(post => post.author_id === viewerId || authors.has(post.author_id))
  const counts = await loadInteractionCounts(supabase, viewerId, pagePosts.map(post => post.id))
  const postCards = pagePosts.map(post =>
    toPostCard(post, viewerId, relationships, authors.get(post.author_id), counts)
  )
  const placements = await loadPlacementCards(supabase, viewerId, options.tab)
  const cards = insertPlacementCards(postCards, placements, limit)
  const lastPost = pagePosts[pagePosts.length - 1]
  const hasMore = filteredPosts.length > limit || rawPosts.length > limit * 3

  return {
    cards,
    nextCursor: hasMore && lastPost
      ? encodeFeedCursor({ publishedAt: lastPost.published_at, id: lastPost.id })
      : null,
  }
}

async function loadVisiblePosts(
  supabase: SupabaseClient,
  options: FeedQueryOptions,
  relationships: RelationshipState,
  limit: number
): Promise<FeedPostRow[]> {
  const queryLimit = limit * 3 + 1
  let query = supabase
    .from('green_room_posts')
    .select('id, author_id, post_type, body, visibility, linked_object_type, linked_object_id, allow_resharing, published_at, created_at')
    .eq('status', 'published')
    .is('deleted_at', null)
    .eq('moderation_status', 'visible')
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(queryLimit)

  if (options.cursor) query = query.or(buildFeedCursorPredicate(options.cursor))
  if (options.tab === 'opportunities') query = query.eq('post_type', 'opportunity_need')
  if (options.tab === 'discover') query = query.eq('visibility', 'public')
  if (options.tab === 'following') {
    const relatedIds = Array.from(new Set([...relationships.followingIds, ...relationships.connectedIds]))
    if (relatedIds.length === 0) return []
    query = query.in('author_id', relatedIds)
  }

  const { data, error } = await query
  if (error) throw new Error(`Failed to load Green Room feed: ${error.message}`)
  return (data ?? []) as FeedPostRow[]
}

async function loadRelationships(supabase: SupabaseClient, viewerId: string): Promise<RelationshipState> {
  const [{ data: follows }, { data: connections }] = await Promise.all([
    supabase.from('follows').select('followee_id').eq('follower_id', viewerId),
    supabase
      .from('connections')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`),
  ])

  const followingIds = new Set(
    ((follows ?? []) as { followee_id: string }[]).map(row => row.followee_id)
  )
  const connectedIds = new Set<string>()
  for (const row of (connections ?? []) as { requester_id: string; addressee_id: string }[]) {
    connectedIds.add(row.requester_id === viewerId ? row.addressee_id : row.requester_id)
  }

  return { followingIds, connectedIds }
}

function filterPostsForTab(
  posts: FeedPostRow[],
  viewerId: string,
  relationships: RelationshipState,
  tab: GreenRoomTab
): FeedPostRow[] {
  if (tab === 'following') return posts
  if (tab === 'opportunities') return posts
  if (tab === 'discover') {
    return posts.filter(post =>
      post.author_id !== viewerId &&
      !relationships.followingIds.has(post.author_id) &&
      !relationships.connectedIds.has(post.author_id)
    )
  }
  return posts
}

async function loadAuthors(supabase: SupabaseClient, authorIds: string[]): Promise<Map<string, AuthorRow>> {
  const ids = Array.from(new Set(authorIds))
  if (ids.length === 0) return new Map()

  const { data, error } = await supabase
    .from('artist_profiles')
    .select('id, artist_name, handle, avatar_url, roles, industry_roles, is_public')
    .in('id', ids)
    .eq('is_public', true)

  if (error) throw new Error(`Failed to load Green Room authors: ${error.message}`)
  return new Map(((data ?? []) as AuthorRow[]).map(row => [row.id, row]))
}

async function loadInteractionCounts(
  supabase: SupabaseClient,
  viewerId: string,
  postIds: string[]
): Promise<{
  commentCounts: Map<string, number>
  reactionCounts: Map<string, number>
  repostCounts: Map<string, number>
  viewerReactions: Map<string, string>
}> {
  if (postIds.length === 0) {
    return {
      commentCounts: new Map(),
      reactionCounts: new Map(),
      repostCounts: new Map(),
      viewerReactions: new Map(),
    }
  }

  const [comments, reactions, reposts] = await Promise.all([
    supabase.from('green_room_comments').select('post_id').in('post_id', postIds),
    supabase.from('green_room_reactions').select('post_id, reaction_type, user_id').in('post_id', postIds),
    supabase.from('green_room_reposts').select('post_id:original_post_id').in('original_post_id', postIds),
  ])

  const commentCounts = countByPost((comments.data ?? []) as CountRow[])
  const reactionRows = (reactions.data ?? []) as ReactionRow[]
  const reactionCounts = countByPost(reactionRows)
  const repostCounts = countByPost((reposts.data ?? []) as CountRow[])
  const viewerReactions = new Map<string, string>()

  for (const reaction of reactionRows) {
    if (reaction.user_id === viewerId && !viewerReactions.has(reaction.post_id)) {
      viewerReactions.set(reaction.post_id, reaction.reaction_type)
    }
  }

  return { commentCounts, reactionCounts, repostCounts, viewerReactions }
}

function countByPost(rows: CountRow[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.post_id, (counts.get(row.post_id) ?? 0) + 1)
  }
  return counts
}

async function loadPlacementCards(
  supabase: SupabaseClient,
  viewerId: string,
  tab: GreenRoomTab
): Promise<GreenRoomPlacementCard[]> {
  const nowIso = new Date().toISOString()
  let query = supabase
    .from('green_room_placements')
    .select('id, placement_kind, label, title, body, destination_type, destination_id, destination_url')
    .eq('status', 'active')
    .lte('starts_at', nowIso)
    .or(buildPlacementWindowPredicate(nowIso))
    .order('priority', { ascending: false })
    .order('starts_at', { ascending: false })
    .limit(3)

  if (tab === 'opportunities') query = query.eq('placement_kind', 'opportunity')

  const { data, error } = await query
  if (error) throw new Error(`Failed to load Green Room placements: ${error.message}`)

  const visibleRows = await filterVisiblePlacementRows(supabase, viewerId, (data ?? []) as PlacementRow[])

  return visibleRows.map(row => ({
    kind: 'placement',
    id: row.id,
    placementKind: row.placement_kind,
    label: row.label,
    title: row.title,
    body: row.body,
    destination: {
      type: row.destination_type,
      id: row.destination_id,
      url: row.destination_url,
    },
    explanationLabel: placementExplanation(row.placement_kind),
  }))
}

export async function filterVisiblePlacementRows(
  supabase: SupabaseClient,
  viewerId: string,
  rows: PlacementRow[]
): Promise<PlacementRow[]> {
  const decisions = await Promise.all(
    rows.map(row =>
      isDestinationVisible(supabase, row.destination_type, row.destination_id, row.destination_url, viewerId)
    )
  )
  return rows.filter((_row, index) => decisions[index])
}

function toPostCard(
  post: FeedPostRow,
  viewerId: string,
  relationships: RelationshipState,
  author: AuthorRow | undefined,
  counts: Awaited<ReturnType<typeof loadInteractionCounts>>
): GreenRoomPostCard {
  const relationship = post.author_id === viewerId
    ? 'self'
    : relationships.connectedIds.has(post.author_id)
      ? 'connected'
      : relationships.followingIds.has(post.author_id)
        ? 'following'
        : 'outside_network'

  const rankInput = {
    relationship,
    postType: post.post_type,
    createdAt: post.published_at,
  } as const

  return {
    kind: 'post',
    id: post.id,
    actor: toActor(author, post.author_id),
    postType: post.post_type,
    body: post.body,
    visibility: post.visibility,
    linkedObject: post.linked_object_type && post.linked_object_id
      ? { type: post.linked_object_type, id: post.linked_object_id }
      : null,
    allowResharing: post.allow_resharing,
    publishedAt: post.published_at,
    createdAt: post.created_at,
    counts: {
      comments: counts.commentCounts.get(post.id) ?? 0,
      reactions: counts.reactionCounts.get(post.id) ?? 0,
      reposts: counts.repostCounts.get(post.id) ?? 0,
    },
    viewerReaction: counts.viewerReactions.get(post.id) ?? null,
    explanationLabel: explainFeedCard(rankInput),
    score: scoreFeedCard(rankInput),
  }
}

function toActor(author: AuthorRow | undefined, authorId: string): GreenRoomFeedActor {
  return {
    id: authorId,
    name: author?.artist_name?.trim() || 'Funun member',
    handle: author?.handle ?? null,
    avatarUrl: author?.avatar_url ?? null,
    primaryRole: primaryRoleLabel(author),
  }
}

function primaryRoleLabel(author: AuthorRow | undefined): string | null {
  const firstRole = Array.isArray(author?.roles) ? (author?.roles[0] as ProfileRole | undefined) : undefined
  if (firstRole?.kind === 'preset') return PROFILE_ROLE_LABELS[firstRole.slug]
  if (firstRole?.kind === 'custom') return firstRole.label
  const firstIndustryRole = author?.industry_roles?.[0]
  return firstIndustryRole ? industryRoleLabel(firstIndustryRole) : null
}

function placementExplanation(kind: GreenRoomPlacementCard['placementKind']): string {
  if (kind === 'sponsored') return 'Sponsored placement'
  if (kind === 'featured') return 'Featured by Funun'
  if (kind === 'partner') return 'Partner spotlight'
  if (kind === 'program') return 'Curated program'
  return 'Featured opportunity'
}
