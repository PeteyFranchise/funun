// ─── Crate artifact roles ────────────────────────────────────────────────
//
// The allowlist for `crate_song_artifacts.role`, deliberately HERE and not in
// the database. Migration 248 declares `role` as open text with no enum and no
// CHECK constraint, because both would require a migration to add an artifact
// kind — which is the thing that design is avoiding. The constraint lives in
// trusted server code instead, and the composite foreign keys still carry `role`
// so a pointer or a manifest cannot claim a role the artifact does not hold.
//
// What is captured at admission is owner decision D-18: the exact file staff
// reviewed is captured as `review_playback` and is REQUIRED; a master or
// instrumental is copied too as a CANDIDATE if one exists, neither required nor
// automatically deliverable; stems are NOT captured at admission, because stems
// are built into the Sound Vault and not into The Crate.

export const CRATE_ARTIFACT_ROLES = [
  'review_playback',
  'delivery_master',
  'instrumental',
  'stems_archive',
  'artwork',
] as const

export type CrateArtifactRole = (typeof CRATE_ARTIFACT_ROLES)[number]

/** The one role every captured song must have, per D-18. */
export const REQUIRED_CAPTURE_ROLE: CrateArtifactRole = 'review_playback'

/**
 * Roles copied opportunistically at admission when a source exists. Deliberately
 * excludes `stems_archive`: it is in the allowlist so a later slice needs no
 * migration, not because admission captures it.
 */
export const CANDIDATE_CAPTURE_ROLES: readonly CrateArtifactRole[] = [
  'delivery_master',
  'instrumental',
]

export function isCrateArtifactRole(value: unknown): value is CrateArtifactRole {
  return typeof value === 'string' && (CRATE_ARTIFACT_ROLES as readonly string[]).includes(value)
}

/**
 * Accepted audio types for a captured artifact, DERIVED from what the Vault
 * uploader accepts (lib/vault/track-audio.ts) rather than restated. A restated
 * list is how `audio/aiff` was once asserted into a design while three real
 * types went missing. __tests__/crate-audio-bucket-mime.test.ts asserts that
 * migration 248's bucket allowlist equals this exact set.
 */
import { EXT_BY_MIME } from '@/lib/vault/track-audio'

export const CRATE_AUDIO_MIME_TYPES: readonly string[] = Object.keys(EXT_BY_MIME)
