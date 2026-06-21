import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import type { ArtistProfile } from '@/types'
import { getDemoProjects } from '@/lib/vault/demo-store'
import { buildProfileData, DEMO_PROFILE, type ProfileProjectRow } from '@/lib/profile/load'
import { ProfileView, type FollowState } from '@/components/profile/ProfileView'
import type { WallState } from '@/components/profile/Wall'
import type { EndorsementState } from '@/components/profile/Endorsements'
import type { ReleaseCommentsState } from '@/components/profile/ReleaseComments'
import type { ActivityState } from '@/components/profile/ActivityFeed'
import type { DmState } from '@/components/profile/DmWidget'
import { loadWall } from '@/lib/social/wall'
import { loadEndorsements } from '@/lib/social/endorsements'
import { loadReleaseComments } from '@/lib/social/comments'
import { loadActivity } from '@/lib/social/activity'
import { loadConversation, findThread } from '@/lib/social/dm'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

function ago(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString()
}

export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params

  let profile: ArtistProfile | null = null
  let projects: ProfileProjectRow[] = []
  let followerCount: number | null = null
  let follow: FollowState | undefined
  let wall: WallState | undefined
  let endorsements: EndorsementState | undefined
  let comments: ReleaseCommentsState | undefined
  let activity: ActivityState | undefined
  let dm: DmState | undefined

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
    follow = { profileUserId: profile.id, isFollowing: false, canFollow: true }
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
    dm = {
      ownerId: profile.id,
      ownerName: profile.artist_name ?? 'this artist',
      ownerAvatarUrl: profile.avatar_url,
      canMessage: true,
      viewerId: 'demo-viewer',
      threadId: null,
      initialMessages: [],
    }
  } else {
    const supabase = createServerClient()
    const { data: prof } = await supabase
      .from('artist_profiles')
      .select('*')
      .eq('handle', handle)
      .maybeSingle()

    // App-level gate: only public profiles render.
    if (!prof || !(prof as ArtistProfile).is_public) notFound()
    profile = prof as ArtistProfile

    const [{ data: projs }, { count }, { data: viewer }] = await Promise.all([
      supabase
        .from('vault_projects')
        .select('id, title, type, cover_art_url, vault_readiness_score, release_date, is_public')
        .eq('user_id', profile.id)
        .order('vault_readiness_score', { ascending: false }),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', profile.id),
      supabase.auth.getUser(),
    ])
    projects = (projs ?? []) as ProfileProjectRow[]
    followerCount = count ?? 0

    const viewerId = viewer.user?.id ?? null
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
      posts: await loadWall(supabase, profile.id),
    }

    const endo = await loadEndorsements(supabase, profile.id, viewerId)
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
        items: await loadReleaseComments(supabase, featProj.id),
      }
    }

    activity = { items: await loadActivity(supabase, profile.id) }

    const canMessage = Boolean(viewerId) && viewerId !== profile.id
    const [dmMessages, dmThread] = canMessage && viewerId
      ? await Promise.all([
          loadConversation(supabase, viewerId, profile.id),
          findThread(supabase, viewerId, profile.id),
        ])
      : [[], null]
    dm = {
      ownerId: profile.id,
      ownerName: profile.artist_name ?? 'this artist',
      ownerAvatarUrl: profile.avatar_url,
      canMessage,
      viewerId: viewerId ?? '',
      threadId: dmThread,
      initialMessages: dmMessages,
    }
  }

  const data = buildProfileData(profile, projects, { publicOnly: true, followerCount })
  return (
    <ProfileView
      data={data}
      mode="public"
      follow={follow}
      wall={wall}
      endorsements={endorsements}
      comments={comments}
      activity={activity}
      dm={dm}
    />
  )
}
