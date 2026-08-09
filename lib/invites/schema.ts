// ─── Artist invites/waitlist — shared schema ─────────────────────────────
// Single TypeScript source of truth for the invite/waitlist field
// vocabulary (Phase 27, artist-invite-only-onboarding). Every consumer
// (the check-invite/waitlist routes, the admin console, migration 097's
// CHECK constraints) must agree with the value arrays below — mirrors
// lib/metadata/schema.ts's `_VALUES` export convention. Pure, no I/O, safe
// to import on the client.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NOTE_MAX_LENGTH = 1000

// Where an artist_invites row came from — must match migration 097's
// `source` CHECK constraint exactly.
export const ARTIST_INVITE_SOURCE_VALUES = [
  'collaborator',
  'staff',
  'waitlist_conversion',
  'owner_seed',
] as const

export type ArtistInviteSource = (typeof ARTIST_INVITE_SOURCE_VALUES)[number]

// Lifecycle state of an artist_invites row — must match migration 097's
// `status` CHECK constraint exactly.
export const ARTIST_INVITE_STATUS_VALUES = ['pending', 'accepted', 'expired'] as const

export type ArtistInviteStatus = (typeof ARTIST_INVITE_STATUS_VALUES)[number]

export type WaitlistEntry = {
  email: string
  name: string
  note: string
}

export type SanitizeWaitlistEntryResult =
  | { ok: true; value: WaitlistEntry }
  | { ok: false; error: string }

// Mass-assignment defense (ASVS V5): reads only email/name/note off an
// unknown input, trims/lowercases/caps them, and returns a discriminated
// result rather than throwing — mirrors lib/buyers/register.ts's
// buildRegisterPayload() convention. Any other key on the input (status,
// unsubscribed_at, id, ...) is silently dropped since it is never read.
export function sanitizeWaitlistEntry(input: unknown): SanitizeWaitlistEntryResult {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>

  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : ''
  if (!email || !EMAIL_REGEX.test(email)) {
    return { ok: false, error: 'A valid email is required.' }
  }

  const name = typeof raw.name === 'string' ? raw.name.trim() : ''

  const rawNote = raw.note
  const note =
    rawNote === undefined || rawNote === null
      ? ''
      : String(rawNote).trim().slice(0, NOTE_MAX_LENGTH)

  return { ok: true, value: { email, name, note } }
}
