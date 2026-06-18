import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import type { ArtistProfile } from '@/types'
import { getDemoProjects } from '@/lib/vault/demo-store'
import { buildProfileData, DEMO_PROFILE, type ProfileProjectRow } from '@/lib/profile/load'
import { ProfileView } from '@/components/profile/ProfileView'
import type { WallState } from '@/components/profile/Wall'
import type { EndorsementState } from '@/components/profile/Endorsements'
import type { ReleaseCommentsState } from '@/components/profile/ReleaseComments'
import { loadWall } from '@/lib/social/wall'
import { loadEndorsements } from '@/lib/social/endorsements'
import { loadReleaseComments } from '@/lib/social/comments'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

function initialsOf(name: string | null): string {
  return (name ?? 'You').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

export default async function OwnerProfilePage() {
  let profile: ArtistProfile | null = null
  let projects: ProfileProjectRow[] = []
  let followerCount: number | null = null
  let wall: WallState | undefined
  let endorsements: EndorsementState | undefined
  let comments: ReleaseCommentsState | undefined

  if (DEMO) {
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
    wall = {
      profileUserId: profile.id,
      ownerName: profile.artist_name ?? 'You',
      canPost: true,
      viewerInitials: initialsOf(profile.artist_name),
      posts: [
        { id: 'w1', body: 'Loved the new single. Are you taking meetings this month?', createdAt: new Date(Date.now() - 5 * 3600_000).toISOString(), authorName: 'Adaeze Okafor', authorAvatarUrl: null, authorRole: 'A&R' },
        { id: 'w2', body: 'That topline on “Paper” is unreal — would love to send a beat pack.', createdAt: new Date(Date.now() - 48 * 3600_000).toISOString(), authorName: 'Diego Vega', authorAvatarUrl: null, authorRole: 'Producer' },
      ],
    }
    endorsements = {
      profileUserId: profile.id,
      ownerName: profile.artist_name ?? 'You',
      canEndorse: false,
      viewerHasEndorsed: false,
      endorsements: [
        { id: 'e1', body: 'Delivers broadcast-ready stems and clean splits every time — the first call when I need emotive vocal-led cues on a deadline.', createdAt: new Date(Date.now() - 72 * 3600_000).toISOString(), authorName: 'Rina Tan', authorAvatarUrl: null, authorRole: 'Music supervisor · Crescent Pictures' },
        { id: 'e2', body: 'One of the most prepared independent artists I’ve worked with — every session ends with the paperwork already sorted.', createdAt: new Date(Date.now() - 200 * 3600_000).toISOString(), authorName: 'Jonah Cole', authorAvatarUrl: null, authorRole: 'Producer · co-writer' },
      ],
    }
    {
      const feat = [...projects].sort((a, b) => b.vault_readiness_score - a.vault_readiness_score)[0]
      if (feat) {
        comments = {
          projectId: feat.id,
          releaseTitle: feat.title,
          canComment: true,
          viewerInitials: initialsOf(profile.artist_name),
          items: [
            { id: 'c1', parentId: null, body: 'The low-end on the title track is so clean — translates great on the car system 🔥', createdAt: new Date(Date.now() - 48 * 3600_000).toISOString(), authorName: 'Jonah Cole', authorAvatarUrl: null, authorRole: 'Producer' },
            { id: 'c2', parentId: 'c1', body: 'That means a lot — thank you for the master pass!', createdAt: new Date(Date.now() - 24 * 3600_000).toISOString(), authorName: profile.artist_name ?? 'You', authorAvatarUrl: null, authorRole: 'Artist' },
          ],
        }
      }
    }
  } else {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect('/signin')

    const [{ data: prof }, { data: projs }, { count }] = await Promise.all([
      supabase.from('artist_profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase
        .from('vault_projects')
        .select('id, title, type, cover_art_url, vault_readiness_score, release_date, is_public')
        .eq('user_id', user.id)
        .order('vault_readiness_score', { ascending: false }),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', user.id),
    ])
    profile = (prof as ArtistProfile) ?? null
    projects = (projs ?? []) as ProfileProjectRow[]
    followerCount = count ?? 0
    wall = {
      profileUserId: user.id,
      ownerName: profile?.artist_name ?? 'You',
      canPost: true,
      viewerInitials: initialsOf(profile?.artist_name ?? null),
      posts: await loadWall(supabase, user.id),
    }
    const endo = await loadEndorsements(supabase, user.id, user.id)
    endorsements = {
      profileUserId: user.id,
      ownerName: profile?.artist_name ?? 'You',
      canEndorse: false, // can't endorse yourself
      viewerHasEndorsed: false,
      endorsements: endo.items,
    }

    const featProj =
      projects.find(p => p.id === profile?.featured_project_id) ??
      [...projects].sort((a, b) => b.vault_readiness_score - a.vault_readiness_score)[0]
    if (featProj) {
      comments = {
        projectId: featProj.id,
        releaseTitle: featProj.title,
        canComment: true,
        viewerInitials: initialsOf(profile?.artist_name ?? null),
        items: await loadReleaseComments(supabase, featProj.id),
      }
    }
  }

  if (!profile) redirect('/settings')

  const data = buildProfileData(profile, projects, { publicOnly: false, followerCount })
  return <ProfileView data={data} mode="owner" wall={wall} endorsements={endorsements} comments={comments} />
}
