// Wave 0 RED — Phase 9 (rich-member-profile). Defines the contract 09-01b's
// extension of buildProfileData() must satisfy: derive placementsCount from
// the passed option (PROFILE-06) alongside the already-live avgReadiness
// derivation. placementsCount does not exist on ProfileData/buildProfileData's
// options yet — these tests are expected to fail until 09-01b adds it.

import { buildProfileData, DEMO_PROFILE, type ProfileProjectRow } from '@/lib/profile/load'

const projects: ProfileProjectRow[] = [
  {
    id: 'p1',
    title: 'Track One',
    type: 'single',
    cover_art_url: null,
    vault_readiness_score: 80,
    release_date: '2026-01-01',
    is_public: true,
  },
  {
    id: 'p2',
    title: 'Track Two',
    type: 'single',
    cover_art_url: null,
    vault_readiness_score: 60,
    release_date: '2026-02-01',
    is_public: true,
  },
]

describe('buildProfileData', () => {
  it('derives avgReadiness from the fixture release scores', () => {
    const result = buildProfileData(DEMO_PROFILE, projects, { publicOnly: true })
    expect(result.avgReadiness).toBe(70)
  })

  it('derives placementsCount from the passed option', () => {
    const result = buildProfileData(DEMO_PROFILE, projects, { publicOnly: true, placementsCount: 5 })
    expect(result.placementsCount).toBe(5)
  })

  it('derives placementsCount as null when the option is omitted', () => {
    const result = buildProfileData(DEMO_PROFILE, projects, { publicOnly: true })
    expect(result.placementsCount).toBeNull()
  })

  // Phase 36 (D-11/D-12) — the "Unnamed artist" fallback is gone. A
  // nameless profile's title is @handle, never a fabricated stand-in.
  it('renders @handle as the name when the artist name is null', () => {
    const result = buildProfileData(
      { ...DEMO_PROFILE, artist_name: null, handle: 'maya-reyes' },
      projects,
      { publicOnly: true }
    )
    expect(result.name).toBe('@maya-reyes')
  })

  it('renders an empty name — never "Unnamed artist" — when both artist name and handle are null', () => {
    const result = buildProfileData(
      { ...DEMO_PROFILE, artist_name: null, handle: null },
      projects,
      { publicOnly: true }
    )
    expect(result.name).toBe('')
    expect(result.name).not.toMatch(/unnamed/i)
  })
})
