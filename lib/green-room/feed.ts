// ─── Green Room Feed Contracts ───────────────────────────────────────────
// Pure helpers for Phase 12. These functions intentionally do not import
// Supabase or Next.js so schema/API/UI work can share one safety contract.

export const GREEN_ROOM_POST_TYPE_VALUES = [
  'general_update',
  'collab_request',
  'release_announcement',
  'question',
  'win_milestone',
  'feedback_request',
  'opportunity_need',
] as const

export const GREEN_ROOM_VISIBILITY_VALUES = [
  'public',
  'followers',
  'connections',
  'draft',
  'custom',
] as const

export const GREEN_ROOM_REACTION_VALUES = [
  'like',
  'love',
  'fire',
  'congrats',
  'inspired',
  'helpful',
  'interested',
] as const

export const GREEN_ROOM_LINKED_OBJECT_VALUES = [
  'profile',
  'project',
  'track',
  'opportunity',
] as const

export const GREEN_ROOM_TAB_VALUES = [
  'for_you',
  'following',
  'discover',
  'opportunities',
] as const

export const GREEN_ROOM_AUDIENCE_RELATIONSHIP_VALUES = [
  'followers',
  'connections',
  'outside_network',
] as const

export type GreenRoomPostType = (typeof GREEN_ROOM_POST_TYPE_VALUES)[number]
export type GreenRoomVisibility = (typeof GREEN_ROOM_VISIBILITY_VALUES)[number]
export type GreenRoomReaction = (typeof GREEN_ROOM_REACTION_VALUES)[number]
export type GreenRoomLinkedObjectType = (typeof GREEN_ROOM_LINKED_OBJECT_VALUES)[number]
export type GreenRoomTab = (typeof GREEN_ROOM_TAB_VALUES)[number]
export type GreenRoomAudienceRelationship =
  (typeof GREEN_ROOM_AUDIENCE_RELATIONSHIP_VALUES)[number]

export type GreenRoomCustomAudience = {
  relationships: GreenRoomAudienceRelationship[]
  roles: string[]
  genres: string[]
  locations: string[]
  people: string[]
}

export type GreenRoomRelationshipContext = {
  followsAuthor?: boolean
  connectedToAuthor?: boolean
  blockedEitherDirection?: boolean
}

export type GreenRoomViewerProfile = {
  id: string | null
  roles?: string[]
  genres?: string[]
  location?: string | null
}

export type GreenRoomPlacementKind = 'organic' | 'featured' | 'sponsored' | 'partner' | 'program'

export type GreenRoomRankInput = {
  relationship: 'self' | 'connected' | 'following' | 'outside_network'
  postType: GreenRoomPostType
  createdAt: string
  now?: string
  sameGenre?: boolean
  sameLocation?: boolean
  roleRelevant?: boolean
  engagementCount?: number
  placementKind?: GreenRoomPlacementKind
}

type AudienceResult =
  | { ok: true; audience: GreenRoomCustomAudience }
  | { ok: false; error: string }

const MAX_AUDIENCE_RELATIONSHIPS = 3
const MAX_AUDIENCE_ROLES = 8
const MAX_AUDIENCE_GENRES = 8
const MAX_AUDIENCE_LOCATIONS = 8
const MAX_AUDIENCE_PEOPLE = 50
const MAX_TOTAL_AUDIENCE_TERMS = 60

function includesValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number])
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().replace(/\s+/g, ' ')
  return cleaned.length > 0 ? cleaned : null
}

function normalizeTokenList(value: unknown, max: number): { ok: true; values: string[] } | { ok: false; error: string } {
  if (value == null) return { ok: true, values: [] }
  if (!Array.isArray(value)) return { ok: false, error: 'Audience values must be arrays' }

  const values = Array.from(new Set(value.map(normalizeToken).filter((v): v is string => !!v)))
  if (values.length > max) return { ok: false, error: `Audience list exceeds ${max} items` }
  return { ok: true, values }
}

function normalizeLowerList(values: string[]): string[] {
  return values.map(value => value.toLowerCase())
}

function overlaps(left: string[] | undefined, right: string[]): boolean {
  const normalizedLeft = normalizeLowerList(left ?? [])
  const normalizedRight = normalizeLowerList(right)
  return normalizedLeft.some(value => normalizedRight.includes(value))
}

export function isGreenRoomPostType(value: unknown): value is GreenRoomPostType {
  return includesValue(GREEN_ROOM_POST_TYPE_VALUES, value)
}

export function isGreenRoomVisibility(value: unknown): value is GreenRoomVisibility {
  return includesValue(GREEN_ROOM_VISIBILITY_VALUES, value)
}

export function isGreenRoomReaction(value: unknown): value is GreenRoomReaction {
  return includesValue(GREEN_ROOM_REACTION_VALUES, value)
}

export function isGreenRoomLinkedObjectType(value: unknown): value is GreenRoomLinkedObjectType {
  return includesValue(GREEN_ROOM_LINKED_OBJECT_VALUES, value)
}

export function isGreenRoomTab(value: unknown): value is GreenRoomTab {
  return includesValue(GREEN_ROOM_TAB_VALUES, value)
}

export function normalizeCustomAudience(raw: unknown): AudienceResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Custom audience must be an object' }
  }

  const input = raw as Record<string, unknown>
  const relationshipValues = normalizeTokenList(input.relationships, MAX_AUDIENCE_RELATIONSHIPS)
  if (!relationshipValues.ok) return relationshipValues

  const relationships: GreenRoomAudienceRelationship[] = []
  for (const value of relationshipValues.values) {
    if (!includesValue(GREEN_ROOM_AUDIENCE_RELATIONSHIP_VALUES, value)) {
      return { ok: false, error: `Unknown audience relationship: ${value}` }
    }
    relationships.push(value)
  }

  const roles = normalizeTokenList(input.roles, MAX_AUDIENCE_ROLES)
  if (!roles.ok) return roles
  const genres = normalizeTokenList(input.genres, MAX_AUDIENCE_GENRES)
  if (!genres.ok) return genres
  const locations = normalizeTokenList(input.locations, MAX_AUDIENCE_LOCATIONS)
  if (!locations.ok) return locations
  const people = normalizeTokenList(input.people, MAX_AUDIENCE_PEOPLE)
  if (!people.ok) return people

  const totalTerms =
    relationships.length +
    roles.values.length +
    genres.values.length +
    locations.values.length +
    people.values.length

  if (totalTerms === 0) {
    return { ok: false, error: 'Custom audience must include at least one target' }
  }

  if (totalTerms > MAX_TOTAL_AUDIENCE_TERMS) {
    return { ok: false, error: `Custom audience exceeds ${MAX_TOTAL_AUDIENCE_TERMS} total terms` }
  }

  return {
    ok: true,
    audience: {
      relationships,
      roles: roles.values,
      genres: genres.values,
      locations: locations.values,
      people: people.values,
    },
  }
}

export function summarizeAudience(audience: GreenRoomCustomAudience): string {
  const parts: string[] = []
  if (audience.relationships.length > 0) parts.push(audience.relationships.join(', '))
  if (audience.roles.length > 0) parts.push(`${audience.roles.length} role${audience.roles.length === 1 ? '' : 's'}`)
  if (audience.genres.length > 0) parts.push(`${audience.genres.length} genre${audience.genres.length === 1 ? '' : 's'}`)
  if (audience.locations.length > 0) parts.push(`${audience.locations.length} location${audience.locations.length === 1 ? '' : 's'}`)
  if (audience.people.length > 0) parts.push(`${audience.people.length} person${audience.people.length === 1 ? '' : 's'}`)
  return parts.length === 0 ? 'No audience selected' : parts.join(' + ')
}

export function matchesCustomAudience(args: {
  audience: GreenRoomCustomAudience
  viewer: GreenRoomViewerProfile
  relationship?: GreenRoomRelationshipContext
}): boolean {
  const { audience, viewer, relationship = {} } = args
  const viewerId = viewer.id

  if (viewerId && audience.people.includes(viewerId)) return true
  if (audience.roles.length > 0 && overlaps(viewer.roles, audience.roles)) return true
  if (audience.genres.length > 0 && overlaps(viewer.genres, audience.genres)) return true

  if (viewer.location && audience.locations.length > 0) {
    const location = viewer.location.trim().toLowerCase()
    if (normalizeLowerList(audience.locations).includes(location)) return true
  }

  if (audience.relationships.includes('followers') && relationship.followsAuthor) return true
  if (audience.relationships.includes('connections') && relationship.connectedToAuthor) return true
  if (
    audience.relationships.includes('outside_network') &&
    !relationship.followsAuthor &&
    !relationship.connectedToAuthor
  ) {
    return true
  }

  return false
}

export function canViewerSeePost(args: {
  viewerId: string | null
  authorId: string
  visibility: GreenRoomVisibility
  audience?: GreenRoomCustomAudience | null
  relationship?: GreenRoomRelationshipContext
  viewer?: Omit<GreenRoomViewerProfile, 'id'>
}): boolean {
  const { viewerId, authorId, visibility, audience = null, relationship = {}, viewer = {} } = args

  if (relationship.blockedEitherDirection) return false
  if (viewerId === authorId) return true
  if (visibility === 'draft') return false
  if (visibility === 'public') return true
  if (!viewerId) return false
  if (visibility === 'followers') return !!relationship.followsAuthor
  if (visibility === 'connections') return !!relationship.connectedToAuthor
  if (visibility === 'custom' && audience) {
    return matchesCustomAudience({
      audience,
      viewer: { id: viewerId, ...viewer },
      relationship,
    })
  }

  return false
}

export function canRepost(args: {
  viewerId: string | null
  authorId: string
  visibility: GreenRoomVisibility
  allowResharing: boolean
  originalAvailable: boolean
  audience?: GreenRoomCustomAudience | null
  relationship?: GreenRoomRelationshipContext
}): { ok: true } | { ok: false; reason: string } {
  const { viewerId, authorId, visibility, allowResharing, originalAvailable, audience = null, relationship } = args

  if (!viewerId) return { ok: false, reason: 'Sign in to repost' }
  if (!originalAvailable) return { ok: false, reason: 'Original post is unavailable' }
  if (!allowResharing) return { ok: false, reason: 'Resharing is disabled' }
  if (visibility === 'draft' || visibility === 'custom') {
    return { ok: false, reason: 'This post cannot be reshared' }
  }

  const canSee = canViewerSeePost({
    viewerId,
    authorId,
    visibility,
    audience,
    relationship,
  })

  return canSee ? { ok: true } : { ok: false, reason: 'You cannot see this post' }
}

export function scoreFeedCard(input: GreenRoomRankInput): number {
  const now = input.now ? new Date(input.now).getTime() : Date.now()
  const createdAt = new Date(input.createdAt).getTime()
  const ageHours = Number.isFinite(createdAt) ? Math.max(0, (now - createdAt) / (60 * 60 * 1000)) : 168

  let score = 0
  if (input.relationship === 'self') score += 40
  if (input.relationship === 'connected') score += 32
  if (input.relationship === 'following') score += 24
  if (input.relationship === 'outside_network') score += 8
  if (input.sameGenre) score += 10
  if (input.sameLocation) score += 6
  if (input.roleRelevant) score += 12
  if (input.postType === 'opportunity_need') score += 8
  if (input.postType === 'collab_request') score += 6
  if (input.placementKind && input.placementKind !== 'organic') score += 20

  score += Math.max(0, 24 - ageHours / 2)
  score += Math.min(18, Math.max(0, input.engagementCount ?? 0) * 1.5)

  return Math.round(score * 10) / 10
}

export function explainFeedCard(input: GreenRoomRankInput): string {
  if (input.placementKind === 'sponsored') return 'Sponsored placement'
  if (input.placementKind === 'featured') return 'Featured by Funun'
  if (input.placementKind === 'partner') return 'Partner spotlight'
  if (input.placementKind === 'program') return 'Curated program'
  if (input.relationship === 'connected') return 'From your connections'
  if (input.relationship === 'following') return 'Because you follow this artist'
  if (input.postType === 'opportunity_need') return 'Opportunity you may fit'
  if (input.roleRelevant) return 'Relevant to your role'
  if (input.sameGenre) return 'Popular in your genre'
  if (input.sameLocation) return 'Near your scene'
  return 'Recommended for discovery'
}

