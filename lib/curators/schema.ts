import type { CuratorPlatform } from '@/types'

// ─── Platform enum (finalized in 06-UI-SPEC.md) ─────────────────────────
export const PLATFORM_VALUES = [
  'spotify',
  'apple_music',
  'youtube_music',
  'soundcloud',
  'blog_other',
] as const

export const PLATFORM_LABELS: Record<CuratorPlatform, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube_music: 'YouTube Music',
  soundcloud: 'SoundCloud',
  blog_other: 'Blog / Independent',
}

// ─── Field allowlists (mass-assignment protection, T-06-06) ─────────────
// Mirrors the EDITABLE_FIELDS shape in lib/admin/gate.ts.

// Admin can write these via /api/admin/curators/[id] PATCH.
export const ADMIN_EDITABLE_FIELDS = [
  'name',
  'email',
  'platform',
  'playlist_name',
  'playlist_url',
  'genre_focus',
  'submission_notes',
  'flagged_inactive',
] as const

export type AdminEditableField = (typeof ADMIN_EDITABLE_FIELDS)[number]

// Narrower allowlist for the claimed-curator self-serve portal (06-05).
// Deliberately excludes email_valid, flagged_inactive, reach_signal,
// claimed_by — those are admin/system-only fields (T-06-06).
export const CURATOR_SELF_EDITABLE_FIELDS = [
  'genre_focus',
  'platform',
  'playlist_url',
  'playlist_name',
  'submission_notes',
] as const

export type CuratorSelfEditableField = (typeof CURATOR_SELF_EDITABLE_FIELDS)[number]
