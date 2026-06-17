import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import type { ArtistProfile } from '@/types'
import { getDemoProjects } from '@/lib/vault/demo-store'
import { buildProfileData, DEMO_PROFILE, type ProfileProjectRow } from '@/lib/profile/load'
import { ProfileView, type FollowState } from '@/components/profile/ProfileView'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params

  let profile: ArtistProfile | null = null
  let projects: ProfileProjectRow[] = []
  let followerCount: number | null = null
  let follow: FollowState | undefined

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
  }

  const data = buildProfileData(profile, projects, { publicOnly: true, followerCount })
  return <ProfileView data={data} mode="public" follow={follow} />
}
