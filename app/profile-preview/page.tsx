// Dev-only preview of the artist Settings form. Renders the REAL
// <ProfileForm> against a mock profile so the page can be reviewed — copy,
// spacing, disclosure toggles — without signing in and without touching a
// real account.
//
// Why it exists: verifying a Settings change otherwise costs a login, and a
// logged-in session is exactly what you lose when a dev server restarts or a
// cookie jar is cleared. This route makes the page reviewable unconditionally.
//
// Two guards, both deliberate:
//   1. Always on in development; in PRODUCTION it 404s unless
//      ENABLE_UI_PREVIEW === 'true'. Beta testing happens in production, so a
//      dev-only gate would put this tool everywhere except where it is needed
//      — but an auth-free route rendering account UI should not stand open on
//      funun.studio by default either. Off unless deliberately switched on in
//      Vercel, then switched back off. It leaks nothing when open (the profile
//      below is fabricated); the flag limits the window, not the blast radius.
//      NOTE: this page prerenders statically, so the flag is read at BUILD
//      time — flipping it in Vercel does nothing until you redeploy. That is
//      the same rule every Vercel env var follows, so no extra step; just do
//      not expect the toggle alone to open the route.
//   2. The path avoids the `/settings` prefix, which middleware.ts gates. Name
//      it `/settings-preview` and middleware bounces it to sign-in, defeating
//      the point.
import { notFound } from 'next/navigation'
import { ProfileForm } from '@/components/profile/ProfileForm'
import type { UserProfile } from '@/types'

const MOCK: UserProfile = {
  id: '00000000-0000-0000-0000-000000000000',
  artist_name: 'Preview Artist',
  genre: null,
  location: null,
  bio: null,
  career_stage: 2,
  instagram_handle: null,
  threads_handle: null,
  tiktok_handle: null,
  spotify_url: null,
  monthly_listeners: null,
  total_streams: null,
  sound_identity: null,
  isrc_country_code: null,
  isrc_registrant_code: null,
  isrc_year_counters: null,
  legal_first_name: 'Jane',
  legal_middle_name: 'Marie',
  legal_last_name: 'Doe',
  legal_name_suffix: null,
  legal_name_locked_at: null,
  claim_prefill: null,
  contact_phone: null,
  mailing_address: null,
  industry_roles: [],
  genres: [],
  pro: null,
  ipi: null,
  publisher: null,
  administrator: null,
  mlc_id: null,
  soundexchange_id: null,
  isni: null,
  gs1_company_prefix: null,
  grid_issuer_code: null,
  catalog_number_prefix: null,
  identifier_counters: null,
  handle: null,
  is_public: false,
  avatar_url: null,
  banner_url: null,
  pronouns: null,
  verified: false,
  roles: [],
  open_to: [],
  featured_project_id: null,
  allow_resharing: true,
  member_type: 'artist',
  search_vector: null,
  profile_visibility: 'public',
  open_to_visibility: 'public',
  verified_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

export default function ProfilePreviewPage() {
  const enabled =
    process.env.NODE_ENV !== 'production' || process.env.ENABLE_UI_PREVIEW === 'true'
  if (!enabled) notFound()

  return (
    <div className="min-h-screen bg-ink px-6 py-8">
      <p className="mb-6 text-[11px] font-bold uppercase tracking-[.14em] text-lav">
        Local preview · artist Settings (no auth)
      </p>
      <div className="mx-auto max-w-3xl">
        <ProfileForm profile={MOCK} />
      </div>
    </div>
  )
}
