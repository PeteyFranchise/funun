import { notFound } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import type { ArtistProfile } from '@/types'
import { VAULT_PROJECT_TYPE_LABELS } from '@/types'
import { getDemoProjects } from '@/lib/vault/demo-store'
import { buildProfileData, DEMO_PROFILE, type ProfileProjectRow } from '@/lib/profile/load'
import { ProfileView, type FollowState, type ConnectState } from '@/components/profile/ProfileView'
import type { WallState } from '@/components/profile/Wall'
import type { EndorsementState } from '@/components/profile/Endorsements'
import type { ReleaseCommentsState } from '@/components/profile/ReleaseComments'
import type { ActivityState } from '@/components/profile/ActivityFeed'
import type { FeaturedPickerRelease } from '@/components/profile/FeaturedPicker'
import { loadWall } from '@/lib/social/wall'
import { loadEndorsements } from '@/lib/social/endorsements'
import { loadReleaseComments } from '@/lib/social/comments'
import { loadActivity } from '@/lib/social/activity'
import { loadBlockedIds } from '@/lib/green-room/discover'
import {
  isProfileVisibleTo,
  isOpenToVisibleTo,
  isValidProfileVisibility,
  isValidOpenToVisibility,
} from '@/lib/trust-safety/contracts'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

function ago(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString()
}

function releaseYear(iso: string | null): string | null {
  if (!iso) return null
  const y = new Date(iso).getUTCFullYear()
  return Number.isFinite(y) ? String(y) : null
}

function toFeaturedPickerRelease(p: ProfileProjectRow): FeaturedPickerRelease {
  return {
    id: p.id,
    title: p.title,
    typeLabel: VAULT_PROJECT_TYPE_LABELS[p.type],
    year: releaseYear(p.release_date),
    coverUrl: p.cover_art_url,
    isPublic: Boolean(p.is_public),
  }
}

export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params

  // Absolute base URL, resolved server-side. This page has no `req` object
  // (App Router), so the origin must come from configured env, never a
  // relative-path fallback or client-side guess (RESEARCH Pitfall 5 — the
  // Share/ProfileMoreMenu click handlers need an already-absolute URL to
  // call navigator.share() synchronously with no intervening await).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL is not configured — profile share links require an absolute base URL')
  }
  const profileUrl = `${appUrl}/u/${handle}`

  let profile: ArtistProfile | null = null
  let projects: ProfileProjectRow[] = []
  let followerCount: number | null = null
  let placementsCount: number | null = null
  let follow: FollowState | undefined
  let connect: ConnectState | undefined
  let wall: WallState | undefined
  let endorsements: EndorsementState | undefined
  let comments: ReleaseCommentsState | undefined
  let activity: ActivityState | undefined
  // SAFETY-04: whether `open_to` is visible to THIS viewer. Defaults true
  // for the DEMO branch (always fully visible showcase data); the real
  // branch below recomputes it from open_to_visibility + viewer relationship.
  let openToVisible = true

  if (DEMO) {
    if (handle !== DEMO_PROFILE.handle) notFound()
    profile = DEMO_PROFILE
    projects = (await getDemoProjects()).map(p => ({
      id: p.id,
      title: p.title,
      type: p.type,
      cover_art_url: p.cover_art_url,
      vault_readiness_score: p.vault_readiness_score,
      release_date: p.release_date,
      is_public: true,
    }))
    followerCount = 12800
    placementsCount = 1
    follow = { profileUserId: profile.id, isFollowing: false, canFollow: true }
    connect = { profileUserId: profile.id, connectionId: null, state: 'none', note: null, canConnect: true }
    wall = {
      profileUserId: profile.id,
      ownerName: profile.artist_name ?? 'this artist',
      canPost: true,
      viewerInitials: 'YOU',
      posts: [
        { id: 'w1', body: 'Loved the new single. Are you taking meetings this month?', createdAt: ago(5), authorName: 'Adaeze Okafor', authorAvatarUrl: null, authorRole: 'A&R' },
        { id: 'w2', body: 'That topline on “Paper” is unreal — would love to send a beat pack for the next project.', createdAt: ago(48), authorName: 'Diego Vega', authorAvatarUrl: null, authorRole: 'Producer' },
      ],
    }
    endorsements = {
      profileUserId: profile.id,
      ownerName: profile.artist_name ?? 'this artist',
      canEndorse: true,
      viewerHasEndorsed: false,
      endorsements: [
        { id: 'e1', body: 'Delivers broadcast-ready stems and clean splits every time — the first call when I need emotive vocal-led cues on a deadline.', createdAt: ago(72), authorName: 'Rina Tan', authorAvatarUrl: null, authorRole: 'Music supervisor · Crescent Pictures' },
        { id: 'e2', body: 'One of the most prepared independent artists I’ve worked with — every session ends with the paperwork and metadata already sorted.', createdAt: ago(200), authorName: 'Jonah Cole', authorAvatarUrl: null, authorRole: 'Producer · co-writer' },
      ],
    }
    {
      const feat = [...projects].sort((a, b) => b.vault_readiness_score - a.vault_readiness_score)[0]
      if (feat) {
        comments = {
          projectId: feat.id,
          releaseTitle: feat.title,
          canComment: true,
          viewerInitials: 'YOU',
          items: [
            { id: 'c1', parentId: null, body: 'The low-end on the title track is so clean — translates great on the car system 🔥', createdAt: ago(48), authorName: 'Jonah Cole', authorAvatarUrl: null, authorRole: 'Producer' },
            { id: 'c2', parentId: 'c1', body: 'That means a lot coming from you — thank you for the master pass!', createdAt: ago(24), authorName: profile.artist_name ?? 'Artist', authorAvatarUrl: null, authorRole: 'Artist' },
            { id: 'c3', parentId: null, body: 'Adding this to my shortlist for the indie drama we’re scoring. Will reach out via Funūn.', createdAt: ago(20), authorName: 'Rina Tan', authorAvatarUrl: null, authorRole: 'Music supervisor' },
          ],
        }
      }
    }
    activity = {
      items: [
        { id: 'a1', kind: 'placement', body: 'Landed a sync placement — “Slow Burn” featured in a national lifestyle-brand campaign.', createdAt: ago(72) },
        { id: 'a2', kind: 'release', body: 'Released a new single — “Paper” is out now and cleared for sync.', createdAt: ago(6) },
        { id: 'a3', kind: 'readiness', body: 'Hit readiness 92 on “Midnight Ride” — now deal-ready and visible to supervisors.', createdAt: ago(168) },
      ],
    }
  } else {
    const supabase = await createServerClient()
    // Explicit PUBLIC column list (D-11) — must stay identical to migration
    // 040's GRANT SELECT list so the app-layer projection and the DB-layer
    // grant never drift. Includes `genre` and `sound_identity` (legacy
    // fields, not in the original D-11 draft) because buildProfileData()
    // reads both to build the profile's `tags` display (see 08-05-SUMMARY.md).
    // profile_visibility/open_to_visibility (migration 058, SAFETY-04) carry
    // their own explicit column-level SELECT grant to authenticated/anon —
    // needed here to decide what to render, enforced below.
    const { data: prof } = await supabase
      .from('artist_profiles')
      .select('id, artist_name, genre, genres, sound_identity, location, bio, career_stage, instagram_handle, threads_handle, tiktok_handle, spotify_url, monthly_listeners, total_streams, industry_roles, handle, member_type, pronouns, banner_url, open_to, featured_project_id, allow_resharing, search_vector, avatar_url, verified, roles, is_public, profile_visibility, open_to_visibility, created_at, updated_at')
      .eq('handle', handle)
      .maybeSingle()

    // App-level gate: only public profiles render.
    if (!prof || !(prof as ArtistProfile).is_public) notFound()
    profile = prof as ArtistProfile

    const {
      data: { user: viewerUser },
    } = await supabase.auth.getUser()
    const viewerId = viewerUser?.id ?? null

    // ── SAFETY-01: hard block enforcement (13-03 audit) ──────────────────
    // A block in EITHER direction between the viewer and this profile must
    // render the exact same notFound() as a nonexistent/private profile — no
    // distinguishable "you are blocked" state. loadBlockedIds (session read
    // scoped to blocks_select_own, unioned server-side via the SERVICE
    // client so it also sees blocks placed against the viewer) is reused
    // verbatim from lib/green-room/discover.ts rather than re-derived here —
    // the same bidirectional-exclusion doctrine People Search already
    // enforces. Runs before every other query below (connections, wall,
    // endorsements, comments, activity) so a blocked pair's profile visit
    // never fetches — or exposes via timing — any of that data. blockedIds
    // is also reused further down to filter wall/endorsement/comment
    // authors the viewer is blocked with, independent of the profile owner.
    const blockedIds = viewerId ? await loadBlockedIds(createServiceClient(), viewerId) : new Set<string>()
    if (blockedIds.has(profile.id)) notFound()

    // Derive connect state from the connections table for the viewer<->profile
    // pair. connections_select_participant RLS (migration 035) returns only
    // rows the viewer participates in, so a forged .or() filter can never
    // leak a non-participant's connection (T-10-19). Only an active row
    // (pending/accepted) matters — declined/withdrawn are terminal and read
    // as `none` (re-request allowed via the partial unique index). Hoisted
    // above the projects/follower/placements load so its `connected` result
    // can also gate SAFETY-04's profile_visibility check below, without a
    // second query.
    const canConnect = Boolean(viewerId) && viewerId !== profile.id
    let connectState: ConnectState['state'] = 'none'
    let connectionId: string | null = null
    let connectNote: string | null = null
    if (viewerId && viewerId !== profile.id) {
      const { data: conn } = await supabase
        .from('connections')
        .select('id, requester_id, addressee_id, status, note')
        .or(
          `and(requester_id.eq.${viewerId},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${viewerId})`
        )
        .in('status', ['pending', 'accepted'])
        .maybeSingle()
      if (conn) {
        const row = conn as { id: string; requester_id: string; addressee_id: string; status: string; note: string | null }
        connectionId = row.id
        if (row.status === 'accepted') {
          connectState = 'connected'
        } else if (row.requester_id === viewerId) {
          connectState = 'pending_out'
        } else {
          connectState = 'pending_in'
          connectNote = row.note // note only meaningful for the addressee's inline view
        }
      }
    }

    // ── SAFETY-04: server-side profile/open-to visibility enforcement ──
    // A connections_only profile renders the same notFound() as a
    // nonexistent/private one for any non-owner, non-connection viewer — no
    // distinguishable "this profile is connections-only" teaser (13-UI-SPEC.md
    // has no teaser state for this). Runs before the wall/endorsements/
    // comments/activity loads below so a hidden profile never fetches (or
    // exposes via timing) any of that data.
    const viewerIsOwner = Boolean(viewerId) && viewerId === profile.id
    const viewerIsConnection = connectState === 'connected'
    const profileVisibility = isValidProfileVisibility(profile.profile_visibility)
      ? profile.profile_visibility
      : 'public'
    if (!isProfileVisibleTo(profileVisibility, viewerIsOwner, viewerIsConnection)) {
      notFound()
    }
    const openToVisibility = isValidOpenToVisibility(profile.open_to_visibility)
      ? profile.open_to_visibility
      : 'public'
    openToVisible = isOpenToVisibleTo(openToVisibility, viewerIsOwner, viewerIsConnection)

    connect = {
      profileUserId: profile.id,
      connectionId,
      state: connectState,
      note: connectNote,
      canConnect,
    }

    const [{ data: projs }, { count }, { count: placementsCountResult }] = await Promise.all([
      supabase
        .from('vault_projects')
        .select('id, title, type, cover_art_url, vault_readiness_score, release_date, is_public')
        .eq('user_id', profile.id)
        .order('vault_readiness_score', { ascending: false }),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', profile.id),
      supabase
        .from('activity_events')
        .select('*', { count: 'exact', head: true })
        .eq('profile_id', profile.id)
        .eq('kind', 'placement'),
    ])
    projects = (projs ?? []) as ProfileProjectRow[]
    followerCount = count ?? 0
    placementsCount = placementsCountResult ?? 0

    let isFollowing = false
    if (viewerId && viewerId !== profile.id) {
      const { data: rel } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', viewerId)
        .eq('followee_id', profile.id)
        .maybeSingle()
      isFollowing = Boolean(rel)
    }
    follow = {
      profileUserId: profile.id,
      isFollowing,
      canFollow: Boolean(viewerId) && viewerId !== profile.id,
    }

    wall = {
      profileUserId: profile.id,
      ownerName: profile.artist_name ?? 'this artist',
      canPost: Boolean(viewerId),
      viewerInitials: '',
      posts: await loadWall(supabase, profile.id, blockedIds),
    }

    const endo = await loadEndorsements(supabase, profile.id, viewerId, blockedIds)
    endorsements = {
      profileUserId: profile.id,
      ownerName: profile.artist_name ?? 'this artist',
      canEndorse: Boolean(viewerId) && viewerId !== profile.id,
      viewerHasEndorsed: endo.viewerHasEndorsed,
      endorsements: endo.items,
    }

    const featuredId = profile.featured_project_id
    const featProj =
      projects.find(p => p.id === featuredId) ??
      [...projects].sort((a, b) => b.vault_readiness_score - a.vault_readiness_score)[0]
    if (featProj) {
      comments = {
        projectId: featProj.id,
        releaseTitle: featProj.title,
        canComment: Boolean(viewerId),
        viewerInitials: '',
        items: await loadReleaseComments(supabase, featProj.id, blockedIds),
      }
    }

    activity = { items: await loadActivity(supabase, profile.id) }
  }

  // SAFETY-04: hide `open_to` from the rendered data (not the stored value —
  // the DB row is untouched) when open_to_visibility says this viewer
  // shouldn't see it. A public profile can still hide its open-to status.
  const profileForData = openToVisible ? profile : { ...profile, open_to: [] }
  const data = buildProfileData(profileForData, projects, { publicOnly: true, followerCount, placementsCount })
  const allowResharing = Boolean(profile.allow_resharing)
  const ownerReleases = projects.map(toFeaturedPickerRelease)
  return (
    <ProfileView
      data={data}
      mode="public"
      profileUrl={profileUrl}
      allowResharing={allowResharing}
      ownerReleases={ownerReleases}
      currentFeaturedId={profile.featured_project_id}
      connect={connect}
      follow={follow}
      wall={wall}
      endorsements={endorsements}
      comments={comments}
      activity={activity}
    />
  )
}
