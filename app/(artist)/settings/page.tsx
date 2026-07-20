import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import type { ArtistProfile } from '@/types'
import { ProfileForm } from '@/components/profile/ProfileForm'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const DEMO_PROFILE: ArtistProfile = {
  id: '00000000-0000-0000-0000-000000000000',
  artist_name: 'Demo Artist',
  genre: 'R&B',
  genres: ['r&b'],
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
  allow_resharing: true,
  member_type: 'artist',
  search_vector: null,
  profile_visibility: 'public',
  open_to_visibility: 'public',
  verified_at: null,
  legal_first_name: null,
  legal_middle_name: null,
  legal_last_name: null,
  legal_name_suffix: null,
  contact_phone: null,
  mailing_address: null,
  industry_roles: [],
  pro: null,
  ipi: null,
  publisher: null,
  administrator: null,
  mlc_id: null,
  soundexchange_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

// Shape of user_profiles row returned from GET /api/user-profiles
export type UserProfile = {
  id: string
  pro: string | null
  ipi: string | null
  publisher: string | null
  phone: string | null
  mailing_address: Record<string, unknown> | null
  display_name: string | null
  bio: string | null
  created_at: string
  updated_at: string
}

export default async function SettingsPage() {
  let profile: ArtistProfile | null = null
  let userProfile: UserProfile | null = null

  if (DEMO) {
    profile = DEMO_PROFILE
  } else {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      // Ownership is established above via the session-bound client's
      // auth.getUser(); the actual read runs on the service-role client
      // (bypasses RLS + migration 040's column grants entirely) filtered
      // by the verified user.id, never client input — mirrors the
      // project's "admin routes independently re-verify is_admin
      // server-side" pattern, applied here to self-service ownership (D-19).
      const service = createServiceClient()
      const { data } = await service
        .from('artist_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
      profile = (data as ArtistProfile | null) ?? null

      // user_profiles is a separate table (migration 026) — not touched by
      // migration 040's column-privilege lockdown, so this session-bound
      // select is unaffected by D-19. Its RLS policy already scopes reads
      // to auth.uid() = id, so no service-client swap is required here.
      const { data: userProfileData } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
      userProfile = (userProfileData as UserProfile | null) ?? null
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-white">Settings</h1>
      <p className="mt-1 text-sm text-white/50">Manage your legal and artist profile and links.</p>

      <div className="mt-8">
        {profile ? (
          <ProfileForm profile={profile} userProfile={userProfile} />
        ) : (
          <p className="text-sm text-white/50">
            We couldn't load your profile. Try signing out and back in.
          </p>
        )}
      </div>
    </div>
  )
}
