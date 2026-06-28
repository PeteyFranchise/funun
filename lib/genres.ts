// ─── DSP genre list ──────────────────────────────────────────────────────────
// Covers all major genre categories used by Spotify, Apple Music, Amazon Music,
// Tidal, and other major DSPs. Stored as slugs in artist_profiles.genres (TEXT[]).

export type Genre = {
  slug: string
  label: string
}

export const GENRES: Genre[] = [
  { slug: 'pop',               label: 'Pop' },
  { slug: 'hip_hop_rap',       label: 'Hip-Hop / Rap' },
  { slug: 'rnb_soul',          label: 'R&B / Soul' },
  { slug: 'rock',              label: 'Rock' },
  { slug: 'electronic_dance',  label: 'Electronic / Dance' },
  { slug: 'country',           label: 'Country' },
  { slug: 'latin',             label: 'Latin' },
  { slug: 'jazz',              label: 'Jazz' },
  { slug: 'classical',         label: 'Classical' },
  { slug: 'folk_americana',    label: 'Folk / Americana' },
  { slug: 'reggae',            label: 'Reggae' },
  { slug: 'gospel_christian',  label: 'Gospel / Christian' },
  { slug: 'metal',             label: 'Metal' },
  { slug: 'alternative',       label: 'Alternative' },
  { slug: 'indie',             label: 'Indie' },
  { slug: 'blues',             label: 'Blues' },
  { slug: 'funk',              label: 'Funk' },
  { slug: 'afrobeats',         label: 'Afrobeats' },
  { slug: 'k_pop',             label: 'K-Pop' },
  { slug: 'world_global',      label: 'World / Global' },
]

export const ALL_GENRE_SLUGS = GENRES.map(g => g.slug)
