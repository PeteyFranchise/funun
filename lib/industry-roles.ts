// ─── Industry roles — grouped master list ────────────────────────────────
// Defines every role a music industry professional might fill.
// Stored as slugs in artist_profiles.industry_roles (TEXT[]).
// Groups shown in Settings; per-collaboration subset picked on split sheets.

export type IndustryRole = {
  slug: string
  label: string
}

export type IndustryRoleGroup = {
  group: string
  roles: IndustryRole[]
}

export const INDUSTRY_ROLE_GROUPS: IndustryRoleGroup[] = [
  {
    group: 'Creative',
    roles: [
      { slug: 'songwriter',   label: 'Songwriter' },
      { slug: 'co_writer',    label: 'Co-Writer' },
      { slug: 'lyricist',     label: 'Lyricist' },
      { slug: 'topliner',     label: 'Topliner' },
      { slug: 'composer',     label: 'Composer' },
      { slug: 'producer',     label: 'Producer' },
      { slug: 'beatmaker',    label: 'Beatmaker' },
      { slug: 'arranger',     label: 'Arranger' },
      { slug: 'vocal_coach',  label: 'Vocal Coach' },
    ],
  },
  {
    group: 'Performance',
    roles: [
      { slug: 'recording_artist',  label: 'Recording Artist' },
      { slug: 'featured_artist',   label: 'Featured Artist' },
      { slug: 'vocalist',          label: 'Vocalist' },
      { slug: 'rapper_mc',         label: 'Rapper / MC' },
      { slug: 'session_musician',  label: 'Session Musician' },
    ],
  },
  {
    group: 'Technical',
    roles: [
      { slug: 'recording_engineer',  label: 'Recording Engineer' },
      { slug: 'mixing_engineer',     label: 'Mixing Engineer' },
      { slug: 'mastering_engineer',  label: 'Mastering Engineer' },
      { slug: 'programmer',          label: 'Programmer' },
    ],
  },
  {
    group: 'Business',
    roles: [
      { slug: 'manager',           label: 'Manager' },
      { slug: 'ar_executive',      label: 'A&R Executive' },
      { slug: 'publisher',         label: 'Publisher' },
      { slug: 'tour_manager',      label: 'Tour Manager' },
      { slug: 'music_supervisor',  label: 'Music Supervisor' },
    ],
  },
]

// Flat list of all slugs — useful for validation
export const ALL_INDUSTRY_ROLE_SLUGS = INDUSTRY_ROLE_GROUPS.flatMap(g =>
  g.roles.map(r => r.slug)
)

// Look up a label by slug
export function industryRoleLabel(slug: string): string {
  for (const group of INDUSTRY_ROLE_GROUPS) {
    const found = group.roles.find(r => r.slug === slug)
    if (found) return found.label
  }
  return slug
}
