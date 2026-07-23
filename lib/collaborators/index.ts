// ─── Collaborator profile — shared type + sanitizer ──────────────────
// The global roster entry for a single collaborator. All fields except
// id, user_id, and timestamps are user-controlled. No split % is stored
// here — split is always song-specific (D-17).

export const COLLABORATOR_EDITABLE_FIELDS = [
  'name',
  'first_name',
  'middle_name',
  'last_name',
  'name_suffix',
  'email',
  'phone',
  'pro',
  'ipi',
  'publisher',
  'administrator', // split-sheet Administrator prefill (migration 063, P17-09)
  'mlc_id',
  'soundexchange_id',
  'mailing_address',
  'is_favorite',  // star toggle (D-12)
  'archived_at',  // soft-delete timestamp; set to ISO string or null (D-11)
  // legal_name (migration 066, deliberation §7): distinct from `name`
  // (the professional/display name) — the persisted home for a
  // self-corrected legal name, reused on future sheets without re-entry.
  'legal_name',
  // status (migration 066, deliberation §6): 'pending' | 'confirmed'
  // roster engagement state — validated against the enum below, never
  // accepted as an arbitrary string (mass-assignment defense).
  'status',
  // Note: claimed_by is intentionally excluded — never client-settable (T-04-02)
] as const

/** The only two values collaborators.status may hold (migration 066 CHECK). */
const COLLABORATOR_STATUS_VALUES = ['pending', 'confirmed'] as const
type CollaboratorStatus = (typeof COLLABORATOR_STATUS_VALUES)[number]

export type CollaboratorProfile = {
  id: string
  user_id: string
  name: string
  first_name?: string | null
  middle_name?: string | null
  last_name?: string | null
  name_suffix?: string | null
  email?: string | null
  phone?: string | null
  pro?: string | null
  ipi?: string | null
  publisher?: string | null
  administrator?: string | null // split-sheet Administrator prefill (migration 063, P17-09)
  mlc_id?: string | null
  soundexchange_id?: string | null
  mailing_address?: Record<string, string> | null
  // Phase 4 claim + roster management fields
  claimed_by?: string | null   // auth.users.id of the Funūn member who claimed this row
  archived_at?: string | null  // soft-delete timestamp; null = active in roster (D-11)
  is_favorite?: boolean        // pinned in picker Favorites group (D-12)
  // legal_name (migration 066, deliberation §7) — distinct from `name`,
  // the persisted home for a self-corrected legal name.
  legal_name?: string | null
  // status (migration 066, deliberation §6) — 'pending' until the
  // collaborator claims their account or responds to a sheet; 'confirmed'
  // otherwise (DB DEFAULT). Flips server-side via migration 066's triggers.
  status?: CollaboratorStatus
  created_at: string
  updated_at: string
}

// Assembles a display name from structured parts, falling back to the
// legacy `name` field for existing roster entries that predate 019.
export function assembleDisplayName(c: Partial<CollaboratorProfile>): string {
  const parts = [c.first_name, c.middle_name, c.last_name].filter(Boolean)
  if (parts.length === 0) return c.name ?? ''
  const base = parts.join(' ')
  return c.name_suffix ? `${base}, ${c.name_suffix}` : base
}

// Mass-assignment defense (ASVS V5): only copies keys present in the
// allowlist, so id/user_id/timestamps in the request body are silently dropped.
export function sanitizeCollaborator(
  body: Record<string, unknown>
): Record<string, unknown> {
  const update: Record<string, unknown> = {}
  for (const key of COLLABORATOR_EDITABLE_FIELDS) {
    if (!(key in body)) continue
    const value = body[key]
    if (key === 'mailing_address') {
      // Accept an object value as-is (JSONB column)
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        update[key] = value
      } else if (value === null) {
        update[key] = null
      }
      continue
    }
    if (key === 'is_favorite') {
      // Accept boolean only — ignore other types to prevent mass-assignment
      if (typeof value === 'boolean') {
        update[key] = value
      }
      continue
    }
    if (key === 'status') {
      // Enum allowlist (ASVS V5) — an invalid value is silently dropped
      // rather than written, so the DB's DEFAULT 'confirmed' backstops an
      // absent/invalid value instead of a CHECK-constraint 500.
      if (typeof value === 'string' && COLLABORATOR_STATUS_VALUES.includes(value as CollaboratorStatus)) {
        update[key] = value
      }
      continue
    }
    if (key === 'archived_at') {
      // Server-forced archive timestamp (CR-03): the client's signal is "archive now"
      // but the server owns the actual instant. A non-empty string triggers archive
      // with server now(); null triggers unarchive. Any client-supplied future date
      // (or arbitrary ISO string) is discarded — the timestamp is never trusted.
      if (typeof value === 'string' && value.trim() !== '') {
        update[key] = new Date().toISOString()
      } else if (value === null) {
        update[key] = null
      }
      continue
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      update[key] = trimmed === '' ? null : trimmed
    } else if (value === null) {
      update[key] = null
    }
  }
  return update
}

// Predicate: true when this collaborator row has been claimed by a Funūn member.
// Claimed rows must not be hard-deleted — use archive instead (D-10, T-04-02).
export function isClaimedCollaborator(c: CollaboratorProfile): boolean {
  return Boolean(c.claimed_by)
}
