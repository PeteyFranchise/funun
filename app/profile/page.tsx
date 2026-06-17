import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import type { ArtistProfile } from '@/types'
import { getDemoProjects } from '@/lib/vault/demo-store'
import { buildProfileData, DEMO_PROFILE, type ProfileProjectRow } from '@/lib/profile/load'
import { ProfileView } from '@/components/profile/ProfileView'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

export default async function OwnerProfilePage() {
  let profile: ArtistProfile | null = null
  let projects: ProfileProjectRow[] = []
  let followerCount: number | null = null

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
  }

  if (!profile) redirect('/settings')

  const data = buildProfileData(profile, projects, { publicOnly: false, followerCount })
  return <ProfileView data={data} mode="owner" />
}
