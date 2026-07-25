import { createServerClient, createServiceClient } from '@/lib/supabase/server'
import type { UserProfile } from '@/types'
import { ProfileForm } from '@/components/profile/ProfileForm'

export const dynamic = 'force-dynamic'

const DEMO = process.env.NEXT_PUBLIC_VAULT_DEMO === 'true'

const DEMO_PROFILE: UserProfile = {
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
  legal_name_locked_at: null,
  claim_prefill: null,
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

export default async function SettingsPage() {
  let profile: UserProfile | null = null

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
      profile = (data as UserProfile | null) ?? null
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-white">Settings</h1>
      <p className="mt-1 text-sm text-white/50">Manage your legal and artist profile and links.</p>

      <div className="mt-8">
        {profile ? (
          <ProfileForm profile={profile} />
        ) : (
          <p className="text-sm text-white/50">
            We couldn't load your profile. Try signing out and back in.
          </p>
        )}
      </div>
    </div>
  )
}
