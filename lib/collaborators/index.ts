// ─── Collaborator profile — shared type + sanitizer ──────────────────
// The global roster entry for a single collaborator. All fields except
// id, user_id, and timestamps are user-controlled. No split % is stored
// here — split is always song-specific (D-17).

export const COLLABORATOR_EDITABLE_FIELDS = [
  'name',
  'email',
  'phone',
  'pro',
  'ipi',
  'publisher',
  'mlc_id',
  'soundexchange_id',
  'mailing_address',
] as const

export type CollaboratorProfile = {
  id: string
  user_id: string
  name: string
  email?: string | null
  phone?: string | null
  pro?: string | null
  ipi?: string | null
  publisher?: string | null
  mlc_id?: string | null
  soundexchange_id?: string | null
  mailing_address?: Record<string, string> | null
  created_at: string
  updated_at: string
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
    if (typeof value === 'string') {
      const trimmed = value.trim()
      update[key] = trimmed === '' ? null : trimmed
    } else if (value === null) {
      update[key] = null
    }
  }
  return update
}
