import { createServerClient } from '@/lib/supabase/server'
import type { ArtistProfile } from '@/types'
import { ProfileForm } from '@/components/profile/ProfileForm'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const DEMO_PROFILE: ArtistProfile = {
  id: '00000000-0000-0000-0000-000000000000',
  artist_name: 'Demo Artist',
  genre: 'R&B',
  location: 'Los Angeles, USA',
  bio: 'Demo profile — sign in with a real account to edit your own.',
  career_stage: 2,
  instagram_handle: '@demo',
  threads_handle: null,
  tiktok_handle: '@demo',
  spotify_url: null,
  monthly_listeners: 12500,
  total_streams: null,
  sound_identity: null,
  isrc_country_code: 'US',
  isrc_registrant_code: 'D3M',
  isrc_year_counters: { '26': 3 },
  handle: 'demo-artist',
  is_public: true,
  avatar_url: null,
  banner_url: null,
  pronouns: null,
  verified: false,
  roles: [{ kind: 'preset', slug: 'artist' }],
  open_to: ['collabs', 'sync'],
  featured_project_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

export default async function SettingsPage() {
  let profile: ArtistProfile | null = null

  if (DEMO) {
    profile = DEMO_PROFILE
  } else {
    const supabase = createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const { data } = await supabase
        .from('artist_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
      profile = (data as ArtistProfile | null) ?? null
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-white">Settings</h1>
      <p className="mt-1 text-sm text-white/50">Manage your artist profile and links.</p>

      <div className="mt-8">
        {profile ? (
          <ProfileForm profile={profile} />
        ) : (
          <p className="text-sm text-white/50">
            We couldn’t load your profile. Try signing out and back in.
          </p>
        )}
      </div>
    </div>
  )
}
