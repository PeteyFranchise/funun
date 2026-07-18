import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PROFILE_ROLES,
  PROFILE_ROLE_LABELS,
  OPEN_TO_VALUES,
  type OpenTo,
  type ProfileRole,
  type ProfileRoleSlug,
} from '@/types'
import { ALL_INDUSTRY_ROLE_SLUGS, industryRoleLabel } from '@/lib/industry-roles'
import {
  isProfileVisibleTo,
  isOpenToVisibleTo,
  isValidProfileVisibility,
  isValidOpenToVisibility,
  type ProfileVisibility,
  type OpenToVisibility,
} from '@/lib/trust-safety/contracts'

// ─────────────────────────────────────────────────────────────────────────
// People Search / Discover (Plan 12-09)
//
// The discovery spine for the Green Room. Reads run on the session-bound
// Supabase client so RLS stays authoritative, but because artist_profiles'
// SELECT policy is `USING (true)` (migration 040) and only column-limited,
// this layer is solely responsible for:
//   - excluding non-public profiles   (.eq('is_public', true))
//   - excluding self
//   - excluding blocked profiles in BOTH directions
//   - selecting ONLY public-safe columns (never PII / private fields)
//
// It never exposes email, legal name, contact fields, private onboarding
// answers, admin notes, or unpublished capability state — only columns that
// already render on the public profile.
// ─────────────────────────────────────────────────────────────────────────

// Explicit public-safe column list. Deliberately excludes every private /
// PII column (legal_*, contact_phone, mailing_address, pro, ipi, publisher,
// mlc_id, soundexchange_id) and private activity fields. Kept as a string so
// callers pass it straight to `.select()`.
export const DISCOVER_PUBLIC_COLUMNS =
  'id, artist_name, handle, avatar_url, bio, genre, genres, location, industry_roles, roles, open_to, member_type, verified, is_public, profile_visibility, open_to_visibility, created_at'

export const DISCOVER_PAGE_SIZE = 20
export const DISCOVER_MAX_LIMIT = 40
export const DISCOVER_MAX_QUERY_LENGTH = 120

export const DISCOVER_RELATIONSHIP_VALUES = ['following', 'connected', 'outside_network'] as const
export type DiscoverRelationship = (typeof DISCOVER_RELATIONSHIP_VALUES)[number]

export const DISCOVER_CAPABILITY_VALUES = ['artist', 'industry', 'both'] as const
export type DiscoverCapability = (typeof DISCOVER_CAPABILITY_VALUES)[number]

// Union of every role slug a filter may target: public profile lead roles +
// the full industry-role master list. Used to validate the `role` filter so
// an attacker-controlled value never reaches an array-contains filter.
const KNOWN_ROLE_SLUGS = new Set<string>([...PROFILE_ROLES, ...ALL_INDUSTRY_ROLE_SLUGS])
const PROFILE_ROLE_SLUGS = new Set<string>(PROFILE_ROLES)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DiscoverFilters = {
  q: string | null
  role: string | null
  openTo: OpenTo | null
  genre: string | null
  location: string | null
  relationship: DiscoverRelationship | null
  capability: DiscoverCapability | null
}

export type DiscoverCursor = {
  createdAt: string
  id: string
}

export type GreenRoomPersonResult = {
  id: string
  handle: string | null
  displayName: string
  avatarUrl: string | null
  headline: string | null
  roles: string[]
  genre: string | null
  location: string | null
  openTo: string[]
  verified: boolean
  memberType: 'artist' | 'industry'
  relationship: 'self' | 'following' | 'connected' | 'outside_network'
  reasonLabel: string
  profileHref: string
}

type DiscoverProfileRow = {
  id: string
  artist_name: string | null
  handle: string | null
  avatar_url: string | null
  bio: string | null
  genre: string | null
  genres: string[] | null
  location: string | null
  industry_roles: string[] | null
  roles: unknown
  open_to: unknown
  member_type: 'artist' | 'industry'
  verified: boolean | null
  is_public: boolean | null
  profile_visibility: string | null
  open_to_visibility: string | null
  created_at: string
}

type RelationshipState = {
  followingIds: Set<string>
  connectedIds: Set<string>
}

// ─── Guards ──────────────────────────────────────────────────────────────

export function isDiscoverRelationship(value: unknown): value is DiscoverRelationship {
  return typeof value === 'string' && (DISCOVER_RELATIONSHIP_VALUES as readonly string[]).includes(value)
}

export function isDiscoverCapability(value: unknown): value is DiscoverCapability {
  return typeof value === 'string' && (DISCOVER_CAPABILITY_VALUES as readonly string[]).includes(value)
}

export function clampDiscoverLimit(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return DISCOVER_PAGE_SIZE
  return Math.max(1, Math.min(DISCOVER_MAX_LIMIT, Math.floor(parsed)))
}

// ─── Filter parsing (validates + normalizes; never throws) ───────────────
// Unknown enum values are dropped (treated as "no filter") rather than
// rejected, so a stale bookmarked URL degrades gracefully. Free-text inputs
// are trimmed and length-capped. Nothing here is interpolated into a raw
// PostgREST filter — enum filters use validated slugs, free text uses the
// parameterized builder (.ilike / .textSearch).
export function parseDiscoverFilters(params: URLSearchParams): DiscoverFilters {
  const text = (key: string): string | null => {
    const raw = params.get(key)
    if (raw == null) return null
    const trimmed = raw.trim().slice(0, DISCOVER_MAX_QUERY_LENGTH)
    return trimmed.length > 0 ? trimmed : null
  }

  const rawRole = text('role')
  const role = rawRole && KNOWN_ROLE_SLUGS.has(rawRole) ? rawRole : null

  const rawOpenTo = params.get('openTo')?.trim() ?? ''
  const openTo = (OPEN_TO_VALUES as readonly string[]).includes(rawOpenTo) ? (rawOpenTo as OpenTo) : null

  const rawRelationship = params.get('relationship')?.trim() ?? ''
  const relationship = isDiscoverRelationship(rawRelationship) ? rawRelationship : null

  const rawCapability = params.get('capability')?.trim() ?? ''
  const capability = isDiscoverCapability(rawCapability) ? rawCapability : null

  return {
    q: text('q'),
    role,
    openTo,
    genre: text('genre'),
    location: text('location'),
    relationship,
    capability,
  }
}

// ─── Cursor (keyset on created_at, id) ───────────────────────────────────

export function encodeDiscoverCursor(cursor: DiscoverCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

export function parseDiscoverCursor(value: string): DiscoverCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null
    const createdAt = new Date(parsed.createdAt)
    if (Number.isNaN(createdAt.getTime()) || !UUID_RE.test(parsed.id)) return null
    return { createdAt: createdAt.toISOString(), id: parsed.id }
  } catch {
    return null
  }
}

export function buildDiscoverCursorPredicate(cursor: DiscoverCursor): string {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
}

// ─── Relationship + reason labels (pure) ─────────────────────────────────

export function deriveRelationship(
  viewerId: string,
  candidateId: string,
  relationships: RelationshipState
): GreenRoomPersonResult['relationship'] {
  if (candidateId === viewerId) return 'self'
  if (relationships.connectedIds.has(candidateId)) return 'connected'
  if (relationships.followingIds.has(candidateId)) return 'following'
  return 'outside_network'
}

// Which actions a viewer may take on a result card, derived purely from the
// relationship. Message is offered for everyone except your own card; Follow
// is offered only for people outside your graph (you already follow/connect
// with the others, and you cannot follow yourself). Extracted here so the
// gating is unit-verifiable rather than buried inline in the component.
export type PersonActionFlags = {
  canMessage: boolean
  canFollow: boolean
  alreadyFollowing: boolean
}

export function personActionFlags(
  relationship: GreenRoomPersonResult['relationship']
): PersonActionFlags {
  return {
    canMessage: relationship !== 'self',
    canFollow: relationship === 'outside_network',
    alreadyFollowing: relationship === 'following',
  }
}

function roleLabelsFromRow(row: DiscoverProfileRow): string[] {
  const labels: string[] = []
  const roles = Array.isArray(row.roles) ? (row.roles as ProfileRole[]) : []
  for (const role of roles) {
    if (role && typeof role === 'object' && 'kind' in role) {
      if (role.kind === 'preset' && PROFILE_ROLE_LABELS[role.slug as ProfileRoleSlug]) {
        labels.push(PROFILE_ROLE_LABELS[role.slug as ProfileRoleSlug])
      } else if (role.kind === 'custom' && typeof role.label === 'string') {
        labels.push(role.label)
      }
    }
  }
  for (const slug of row.industry_roles ?? []) {
    const label = industryRoleLabel(slug)
    if (label && !labels.includes(label)) labels.push(label)
  }
  return labels.slice(0, 4)
}

export function profileMatchesRole(row: Pick<DiscoverProfileRow, 'roles' | 'industry_roles'>, role: string | null): boolean {
  if (!role) return true
  if ((row.industry_roles ?? []).includes(role)) return true

  if (!PROFILE_ROLE_SLUGS.has(role)) return false
  const roles = Array.isArray(row.roles) ? (row.roles as ProfileRole[]) : []
  return roles.some(item => item?.kind === 'preset' && item.slug === role)
}

// ─── SAFETY-04: profile/open-to visibility (People Search) ──────────────
// Discover results reuse isProfileVisibleTo/isOpenToVisibleTo (13-01's
// contracts) rather than re-deriving visibility rules — same helpers the
// public profile route (app/u/[handle]/page.tsx) enforces. The searching
// viewer is never the row's owner (self is excluded via `.neq('id', viewerId)`
// in the query below), so `viewerIsOwner` is always false here.
function rowProfileVisibility(row: DiscoverProfileRow): ProfileVisibility {
  return row.profile_visibility != null && isValidProfileVisibility(row.profile_visibility)
    ? row.profile_visibility
    : 'public'
}

function rowOpenToVisibility(row: DiscoverProfileRow): OpenToVisibility {
  return row.open_to_visibility != null && isValidOpenToVisibility(row.open_to_visibility)
    ? row.open_to_visibility
    : 'public'
}

/** True when this row should appear in People Search results at all for a non-owner viewer. */
export function isDiscoverRowVisible(row: DiscoverProfileRow, isConnected: boolean): boolean {
  return isProfileVisibleTo(rowProfileVisibility(row), false, isConnected)
}

function isRowOpenToVisible(row: DiscoverProfileRow, isConnected: boolean): boolean {
  return isOpenToVisibleTo(rowOpenToVisibility(row), false, isConnected)
}

function openToLabels(row: DiscoverProfileRow, isConnected: boolean): string[] {
  if (!isRowOpenToVisible(row, isConnected)) return []
  const raw = Array.isArray(row.open_to) ? (row.open_to as unknown[]) : []
  return raw.filter((v): v is string => typeof v === 'string')
}

// A short human explanation of why this person is in the result set. Order of
// precedence mirrors the ranking rules in the execution notes: relationship
// first, then the matched filter, then a generic fallback.
export function reasonLabel(
  row: DiscoverProfileRow,
  relationship: GreenRoomPersonResult['relationship'],
  filters: DiscoverFilters,
  roleLabels: string[]
): string {
  if (relationship === 'connected') return 'Connected with you'
  if (relationship === 'following') return 'You follow this member'

  if (filters.openTo) {
    // relationship is never 'connected' here — that case already returned
    // above — so this viewer is never treated as a connection for the
    // open_to_visibility check.
    const openToSet = new Set(openToLabels(row, false))
    if (openToSet.has(filters.openTo)) return `Open to ${OPEN_TO_DISPLAY[filters.openTo]}`
  }
  if (filters.role && roleLabels.length > 0) {
    return `${roleLabels[0]}${filters.genre && row.genre ? ` in ${row.genre}` : ''}`
  }
  if (filters.genre && row.genre) return `${row.genre} artist`
  if (filters.location && row.location) return `Based in ${row.location}`
  if (row.member_type === 'industry') return 'Industry member'
  return 'New to your network'
}

const OPEN_TO_DISPLAY: Record<OpenTo, string> = {
  collabs: 'collaboration',
  sync: 'sync',
  features: 'features',
  production: 'production',
  writing: 'writing',
  management: 'management',
  booking: 'booking',
}

export function toPersonResult(
  row: DiscoverProfileRow,
  viewerId: string,
  relationships: RelationshipState,
  filters: DiscoverFilters
): GreenRoomPersonResult {
  const relationship = deriveRelationship(viewerId, row.id, relationships)
  const isConnected = relationship === 'connected'
  const roleLabels = roleLabelsFromRow(row)
  const headline = row.bio ? row.bio.trim().slice(0, 140) || null : null
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.artist_name?.trim() || 'Funun member',
    avatarUrl: row.avatar_url ?? null,
    headline,
    roles: roleLabels,
    genre: row.genre ?? null,
    location: row.location ?? null,
    openTo: openToLabels(row, isConnected),
    verified: row.verified === true,
    memberType: row.member_type,
    relationship,
    reasonLabel: reasonLabel(row, relationship, filters, roleLabels),
    profileHref: row.handle ? `/u/${row.handle}` : `/u/${row.id}`,
  }
}

// ─── Data access ─────────────────────────────────────────────────────────

async function loadRelationships(supabase: SupabaseClient, viewerId: string): Promise<RelationshipState> {
  const [{ data: follows }, { data: connections }] = await Promise.all([
    supabase.from('follows').select('followee_id').eq('follower_id', viewerId),
    supabase
      .from('connections')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`),
  ])

  const followingIds = new Set(((follows ?? []) as { followee_id: string }[]).map(r => r.followee_id))
  const connectedIds = new Set<string>()
  for (const row of (connections ?? []) as { requester_id: string; addressee_id: string }[]) {
    connectedIds.add(row.requester_id === viewerId ? row.addressee_id : row.requester_id)
  }
  return { followingIds, connectedIds }
}

// Bidirectional block set. Uses the SERVICE client because the `blocks` RLS
// policy only exposes rows where blocker_id = auth.uid() (so a viewer can
// never learn "who blocked me" through the session client). The union is
// computed server-side and used ONLY to exclude rows from the result — it is
// never returned to the client, so block state stays invisible to both sides.
export async function loadBlockedIds(service: SupabaseClient, viewerId: string): Promise<Set<string>> {
  const { data } = await service
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`)

  const ids = new Set<string>()
  for (const row of (data ?? []) as { blocker_id: string; blocked_id: string }[]) {
    ids.add(row.blocker_id === viewerId ? row.blocked_id : row.blocker_id)
  }
  return ids
}

export async function loadDiscoverResults(
  supabase: SupabaseClient,
  service: SupabaseClient,
  viewerId: string,
  filters: DiscoverFilters,
  cursor: DiscoverCursor | null,
  limit: number
): Promise<{ results: GreenRoomPersonResult[]; nextCursor: string | null }> {
  const [relationships, blockedIds] = await Promise.all([
    loadRelationships(supabase, viewerId),
    loadBlockedIds(service, viewerId),
  ])

  // Relationship filter narrows the candidate id set up front where possible.
  let restrictIds: string[] | null = null
  if (filters.relationship === 'following') {
    restrictIds = Array.from(relationships.followingIds)
    if (restrictIds.length === 0) return { results: [], nextCursor: null }
  } else if (filters.relationship === 'connected') {
    restrictIds = Array.from(relationships.connectedIds)
    if (restrictIds.length === 0) return { results: [], nextCursor: null }
  }

  const queryLimit = filters.role ? Math.min(200, limit * 5 + 1) : limit + 1
  let query = supabase
    .from('artist_profiles')
    .select(DISCOVER_PUBLIC_COLUMNS)
    .eq('is_public', true)
    .neq('id', viewerId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(queryLimit)

  if (restrictIds) query = query.in('id', restrictIds)

  // Exclude blocked ids (both directions). For 'outside_network', also exclude
  // everyone the viewer follows/connects with so the branch is exhaustive.
  const excludeIds = new Set<string>(blockedIds)
  if (filters.relationship === 'outside_network') {
    for (const id of relationships.followingIds) excludeIds.add(id)
    for (const id of relationships.connectedIds) excludeIds.add(id)
  }
  if (excludeIds.size > 0) {
    query = query.not('id', 'in', `(${Array.from(excludeIds).join(',')})`)
  }

  if (filters.q) query = query.textSearch('search_vector', filters.q, { type: 'websearch', config: 'english' })
  // open_to is a JSONB column (migration 034). Passing an array would emit the
  // PG array literal cs.{collabs}, which Postgres rejects as invalid JSON for a
  // jsonb @>. Pass a JSON string so PostgREST emits jsonb containment
  // (cs.["collabs"]) instead.
  if (filters.openTo) query = query.contains('open_to', JSON.stringify([filters.openTo]))
  if (filters.genre) query = query.ilike('genre', `%${filters.genre}%`)
  if (filters.location) query = query.ilike('location', `%${filters.location}%`)
  if (filters.capability === 'artist') query = query.eq('member_type', 'artist')
  if (filters.capability === 'industry') query = query.eq('member_type', 'industry')

  if (cursor) query = query.or(buildDiscoverCursorPredicate(cursor))

  const { data, error } = await query
  if (error) throw new Error(`Failed to search people: ${error.message}`)

  const rawRows = (data ?? []) as DiscoverProfileRow[]
  // SAFETY-04: connections_only profiles are excluded from People Search
  // entirely for non-connections (mirrors the public profile route's
  // notFound() gate). A hidden open_to that matched the DB-level
  // `.contains('open_to', ...)` filter above is also excluded here — a row
  // matching an openTo filter only because of a field it hides from this
  // viewer must not surface at all, not just render with the badge blanked.
  const rows = rawRows.filter(row => {
    if (!profileMatchesRole(row, filters.role)) return false
    const isConnected = relationships.connectedIds.has(row.id)
    if (!isDiscoverRowVisible(row, isConnected)) return false
    if (filters.openTo && !isRowOpenToVisible(row, isConnected)) return false
    return true
  })
  const pageRows = rows.slice(0, limit)
  const results = pageRows.map(row => toPersonResult(row, viewerId, relationships, filters))
  const lastRow = pageRows[pageRows.length - 1]
  const cursorRow = rows.length > limit ? lastRow : rawRows[rawRows.length - 1]
  const hasMore = (rows.length > limit || rawRows.length >= queryLimit) && cursorRow

  return {
    results,
    nextCursor: hasMore ? encodeDiscoverCursor({ createdAt: cursorRow.created_at, id: cursorRow.id }) : null,
  }
}
