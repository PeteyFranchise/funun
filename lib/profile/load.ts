import type { ArtistProfile, OpenTo, ProfileRole } from '@/types'
import { VAULT_PROJECT_TYPE_LABELS, type VaultProjectType } from '@/types'
import type { ProfileData, ProfileRelease } from '@/components/profile/ProfileView'

export type ProfileProjectRow = {
  id: string
  title: string
  type: VaultProjectType
  cover_art_url: string | null
  vault_readiness_score: number
  release_date: string | null
  is_public?: boolean
}

// Shared demo profile used by the owner (/profile) and public (/u/[handle])
// pages when NEXT_PUBLIC_VAULT_DEMO is on.
export const DEMO_PROFILE: ArtistProfile = {
  id: '00000000-0000-0000-0000-000000000000',
  artist_name: 'Maya Reyes',
  genre: 'R&B',
  location: 'Los Angeles, CA',
  bio: 'Independent R&B and alt-pop artist out of LA. I write and top-line my own records and produce with a small circle of collaborators. Looking for placements in film, TV and brand campaigns, plus co-writes in the moody-electronic and cinematic-pop space.',
  career_stage: 2,
  instagram_handle: '@mayareyes',
  threads_handle: null,
  tiktok_handle: '@mayareyes',
  spotify_url: null,
  monthly_listeners: 248000,
  total_streams: 4200000,
  sound_identity: { mood_tags: ['Cinematic', 'Moody electronic'] } as ArtistProfile['sound_identity'],
  isrc_country_code: null,
  isrc_registrant_code: null,
  isrc_year_counters: null,
  handle: 'maya-reyes',
  is_public: true,
  avatar_url: null,
  banner_url: null,
  pronouns: 'she/her',
  verified: true,
  roles: [
    { kind: 'preset', slug: 'artist' },
    { kind: 'custom', label: 'Singer-songwriter' },
    { kind: 'custom', label: 'Topline writer' },
  ],
  open_to: ['sync', 'collabs', 'features'],
  featured_project_id: null,
  allow_resharing: true,
  member_type: 'artist',
  search_vector: null,
  legal_first_name: null,
  legal_middle_name: null,
  legal_last_name: null,
  legal_name_suffix: null,
  contact_phone: null,
  mailing_address: null,
  industry_roles: [],
  genres: [],
  pro: null,
  ipi: null,
  publisher: null,
  mlc_id: null,
  soundexchange_id: null,
  created_at: '2024-03-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function yearOf(iso: string | null): string | null {
  if (!iso) return null
  const y = new Date(iso).getUTCFullYear()
  return Number.isFinite(y) ? String(y) : null
}

function toRelease(p: ProfileProjectRow): ProfileRelease {
  return {
    id: p.id,
    title: p.title,
    typeLabel: VAULT_PROJECT_TYPE_LABELS[p.type],
    year: yearOf(p.release_date),
    score: p.vault_readiness_score,
    coverUrl: p.cover_art_url,
  }
}

/**
 * Map an artist profile + their projects into the showcase ProfileData.
 * `publicOnly` filters releases to is_public ones (for the public page).
 */
export function buildProfileData(
  profile: ArtistProfile,
  projects: ProfileProjectRow[],
  {
    publicOnly,
    followerCount = null,
    placementsCount = null,
  }: { publicOnly: boolean; followerCount?: number | null; placementsCount?: number | null }
): ProfileData {
  const visible = publicOnly ? projects.filter(p => p.is_public) : projects
  const releases = visible.map(toRelease)

  const featuredRow =
    visible.find(p => p.id === profile.featured_project_id) ??
    [...visible].sort((a, b) => b.vault_readiness_score - a.vault_readiness_score)[0] ??
    null

  const avgReadiness =
    releases.length > 0
      ? Math.round(releases.reduce((s, r) => s + r.score, 0) / releases.length)
      : null

  const moodTags = (profile.sound_identity?.mood_tags ?? []) as string[]
  const tags = Array.from(new Set([profile.genre, ...moodTags].filter(Boolean))) as string[]

  return {
    id: profile.id,
    name: profile.artist_name || 'Unnamed artist',
    handle: profile.handle,
    pronouns: profile.pronouns,
    verified: profile.verified,
    avatarUrl: profile.avatar_url,
    bannerUrl: profile.banner_url,
    location: profile.location,
    since: yearOf(profile.created_at),
    bio: profile.bio,
    roles: (profile.roles ?? []) as ProfileRole[],
    openTo: (profile.open_to ?? []) as OpenTo[],
    tags,
    monthlyListeners: profile.monthly_listeners,
    totalStreams: profile.total_streams,
    avgReadiness,
    followerCount,
    placementsCount,
    featured: featuredRow ? toRelease(featuredRow) : null,
    releases,
  }
}
