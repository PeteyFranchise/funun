import { industryRoleLabel, ALL_INDUSTRY_ROLE_SLUGS } from '@/lib/industry-roles'
import type { ProfileRole, ProfileRoleSlug } from '@/types'

// ─── Industry role slug -> profile role mapping (D-08 / RESEARCH Pitfall 4) ──
// ProfileView.tsx renders badges from artist_profiles.roles (JSONB), not
// industry_roles (TEXT[]). createIndustryMember() populates BOTH columns at
// creation so an invited member's profile shows a real badge on day one.
// Slugs with a matching PROFILE_ROLES preset map to that preset; everything
// else becomes a custom badge carrying the industry-role label.
const SLUG_TO_PRESET: Record<string, ProfileRoleSlug> = {
  music_supervisor: 'music_supervisor',
  ar_executive: 'anr',
  producer: 'producer',
  songwriter: 'songwriter',
  recording_artist: 'artist',
  featured_artist: 'artist',
  vocalist: 'artist',
}

/**
 * Maps INDUSTRY_ROLE_GROUPS slugs to ProfileRole[] entries for the `roles`
 * JSONB column. Slugs sharing a preset (e.g. recording_artist/vocalist ->
 * 'artist') are deduped so the resulting badge list has no duplicate preset
 * entries. Unmapped slugs become a custom badge using industryRoleLabel().
 */
export function mapSlugsToProfileRoles(slugs: string[]): ProfileRole[] {
  const roles: ProfileRole[] = []
  const seenPresets = new Set<ProfileRoleSlug>()

  for (const slug of slugs) {
    const preset = SLUG_TO_PRESET[slug]
    if (preset) {
      if (seenPresets.has(preset)) continue
      seenPresets.add(preset)
      roles.push({ kind: 'preset', slug: preset })
      continue
    }
    roles.push({ kind: 'custom', label: industryRoleLabel(slug) })
  }

  return roles
}

/** True if every slug in the list is a recognized INDUSTRY_ROLE_GROUPS slug. */
export function isValidRoleSlugList(slugs: unknown): slugs is string[] {
  if (!Array.isArray(slugs) || slugs.length === 0) return false
  return slugs.every(s => typeof s === 'string' && ALL_INDUSTRY_ROLE_SLUGS.includes(s))
}
