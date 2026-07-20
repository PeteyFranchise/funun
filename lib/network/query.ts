import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type NetworkListItem,
  type BlockedListItem,
} from '@/lib/trust-safety/contracts'
import { DISCOVER_PUBLIC_COLUMNS } from '@/lib/green-room/discover'
import { PROFILE_ROLE_LABELS, type ProfileRole, type ProfileRoleSlug } from '@/types'
import { industryRoleLabel } from '@/lib/industry-roles'

// ─────────────────────────────────────────────────────────────────────────
// Network tab data access (Plan 13-02, DISCOVER-04).
//
// Reuses lib/trust-safety/contracts.ts's NetworkListItem/BlockedListItem
// shapes (13-01) rather than redefining them, and reuses
// lib/green-room/discover.ts's DISCOVER_PUBLIC_COLUMNS so the Network tab,
// public profile, People Search, and Green Room feed all read the exact
// same public-safe column projection (one privacy doctrine).
//
// Every read here runs on the SESSION-bound client only:
//   - follows_select_all is USING(true) (migration 012) — safe to read any
//     row, we scope with .eq() ourselves.
//   - connections_select_participant scopes to requester/addressee = viewer
//     (migration 035).
//   - blocks_select_own scopes to blocker_id = viewer (migration 035) — this
//     is the viewer's OWN blocklist only. There is no bidirectional lookup
//     anywhere in this module: it is architecturally impossible for this
//     code to answer "who blocked the viewer."
// No service client is used or needed.
// ─────────────────────────────────────────────────────────────────────────

export type NetworkPerson = {
  id: string
  handle: string | null
  displayName: string
  avatarUrl: string | null
  primaryRole: string | null
  memberType: 'artist' | 'industry'
  verified: boolean
  profileHref: string
}

export type NetworkEntry = NetworkListItem & {
  profile: NetworkPerson
  // Only meaningful on 'follower' rows: whether the viewer also follows this
  // person back (independent of the connection-exclusion rule below).
  viewerFollowsBack?: boolean
}

export type BlockedEntry = BlockedListItem & { profile: NetworkPerson }

export type NetworkData = {
  connections: NetworkEntry[]
  following: NetworkEntry[]
  followers: NetworkEntry[]
  pendingOutgoing: NetworkEntry[]
  pendingIncoming: NetworkEntry[]
  blocked: BlockedEntry[]
}

type ConnectionRow = {
  id: string
  requester_id: string
  addressee_id: string
  status: string
  created_at: string
  updated_at: string
}

type FollowRow = { follower_id: string; followee_id: string; created_at: string }
type BlockRow = { blocked_id: string; created_at: string }

type ProfileRow = {
  id: string
  artist_name: string | null
  handle: string | null
  avatar_url: string | null
  roles: unknown
  industry_roles: string[] | null
  member_type: 'artist' | 'industry'
  verified: boolean | null
}

function primaryRoleLabel(row: Pick<ProfileRow, 'roles' | 'industry_roles'>): string | null {
  const roles = Array.isArray(row.roles) ? (row.roles as ProfileRole[]) : []
  const first = roles[0]
  if (first && typeof first === 'object' && 'kind' in first) {
    if (first.kind === 'preset' && PROFILE_ROLE_LABELS[first.slug as ProfileRoleSlug]) {
      return PROFILE_ROLE_LABELS[first.slug as ProfileRoleSlug]
    }
    if (first.kind === 'custom' && typeof first.label === 'string' && first.label.trim()) {
      return first.label.trim()
    }
  }
  const industrySlug = (row.industry_roles ?? [])[0]
  if (industrySlug) return industryRoleLabel(industrySlug)
  return null
}

function fallbackPerson(id: string): NetworkPerson {
  return {
    id,
    handle: null,
    displayName: 'Funūn member',
    avatarUrl: null,
    primaryRole: null,
    memberType: 'artist',
    verified: false,
    profileHref: `/u/${id}`,
  }
}

function toPerson(row: ProfileRow): NetworkPerson {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.artist_name?.trim() || 'Funūn member',
    avatarUrl: row.avatar_url ?? null,
    primaryRole: primaryRoleLabel(row),
    memberType: row.member_type,
    verified: row.verified === true,
    profileHref: row.handle ? `/u/${row.handle}` : `/u/${row.id}`,
  }
}

export async function loadNetworkData(supabase: SupabaseClient, viewerId: string): Promise<NetworkData> {
  const [{ data: connRows }, { data: followRows }, { data: blockRows }] = await Promise.all([
    supabase
      .from('connections')
      .select('id, requester_id, addressee_id, status, created_at, updated_at')
      .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`)
      .in('status', ['pending', 'accepted']),
    supabase
      .from('follows')
      .select('follower_id, followee_id, created_at')
      .or(`follower_id.eq.${viewerId},followee_id.eq.${viewerId}`),
    // Viewer's OWN blocklist only — RLS blocks_select_own already scopes
    // this to blocker_id = auth.uid(); the explicit .eq() below is a
    // belt-and-suspenders match of that same scope, not a widening of it.
    supabase.from('blocks').select('blocked_id, created_at').eq('blocker_id', viewerId),
  ])

  const connections = (connRows ?? []) as ConnectionRow[]
  const follows = (followRows ?? []) as FollowRow[]
  const blocks = (blockRows ?? []) as BlockRow[]

  const blockedIds = new Set(blocks.map(b => b.blocked_id))

  const acceptedConnectionIds = new Set<string>()
  const connectionByOtherId = new Map<string, ConnectionRow>()
  const pendingOutgoing: ConnectionRow[] = []
  const pendingIncoming: ConnectionRow[] = []

  for (const row of connections) {
    const otherId = row.requester_id === viewerId ? row.addressee_id : row.requester_id
    if (blockedIds.has(otherId)) continue // never surface someone the viewer has blocked in another tab
    if (row.status === 'accepted') {
      acceptedConnectionIds.add(otherId)
      connectionByOtherId.set(otherId, row)
    } else if (row.status === 'pending') {
      if (row.requester_id === viewerId) pendingOutgoing.push(row)
      else pendingIncoming.push(row)
    }
  }

  const followingIds = new Set(
    follows.filter(r => r.follower_id === viewerId).map(r => r.followee_id)
  )

  // Following/followers: an accepted connection takes relationship priority
  // over the auto-follow-seed rows migration 044's trigger creates on
  // accept, mirroring lib/green-room/discover.ts's deriveRelationship
  // precedent — a mutual connection isn't ALSO listed as plain
  // following/follower noise. Blocked ids are excluded from every category.
  const followingRows = follows.filter(
    r => r.follower_id === viewerId && !acceptedConnectionIds.has(r.followee_id) && !blockedIds.has(r.followee_id)
  )
  const followerRows = follows.filter(
    r => r.followee_id === viewerId && !acceptedConnectionIds.has(r.follower_id) && !blockedIds.has(r.follower_id)
  )

  const allIds = new Set<string>()
  for (const id of acceptedConnectionIds) allIds.add(id)
  for (const row of pendingOutgoing) allIds.add(row.addressee_id)
  for (const row of pendingIncoming) allIds.add(row.requester_id)
  for (const row of followingRows) allIds.add(row.followee_id)
  for (const row of followerRows) allIds.add(row.follower_id)
  for (const id of blockedIds) allIds.add(id)

  const profileById = new Map<string, ProfileRow>()
  if (allIds.size > 0) {
    const { data: profileRows } = await supabase
      .from('artist_profiles')
      .select(DISCOVER_PUBLIC_COLUMNS)
      .in('id', Array.from(allIds))
    for (const row of (profileRows ?? []) as unknown as ProfileRow[]) {
      profileById.set(row.id, row)
    }
  }

  function personFor(id: string): NetworkPerson {
    const row = profileById.get(id)
    return row ? toPerson(row) : fallbackPerson(id)
  }

  const connectionsList: NetworkEntry[] = Array.from(acceptedConnectionIds).map(id => {
    const row = connectionByOtherId.get(id)
    return {
      profileId: id,
      relationship: 'connection',
      connectionId: null,
      since: row?.updated_at ?? row?.created_at ?? new Date(0).toISOString(),
      profile: personFor(id),
    }
  })

  const followingList: NetworkEntry[] = followingRows.map(row => ({
    profileId: row.followee_id,
    relationship: 'following',
    connectionId: null,
    since: row.created_at,
    profile: personFor(row.followee_id),
  }))

  const followersList: NetworkEntry[] = followerRows.map(row => ({
    profileId: row.follower_id,
    relationship: 'follower',
    connectionId: null,
    since: row.created_at,
    profile: personFor(row.follower_id),
    viewerFollowsBack: followingIds.has(row.follower_id),
  }))

  const pendingOutgoingList: NetworkEntry[] = pendingOutgoing.map(row => ({
    profileId: row.addressee_id,
    relationship: 'pending_outgoing',
    connectionId: row.id,
    since: row.created_at,
    profile: personFor(row.addressee_id),
  }))

  const pendingIncomingList: NetworkEntry[] = pendingIncoming.map(row => ({
    profileId: row.requester_id,
    relationship: 'pending_incoming',
    connectionId: row.id,
    since: row.created_at,
    profile: personFor(row.requester_id),
  }))

  const blockedList: BlockedEntry[] = blocks.map(row => ({
    blockedProfileId: row.blocked_id,
    createdAt: row.created_at,
    profile: personFor(row.blocked_id),
  }))

  return {
    connections: connectionsList,
    following: followingList,
    followers: followersList,
    pendingOutgoing: pendingOutgoingList,
    pendingIncoming: pendingIncomingList,
    blocked: blockedList,
  }
}
