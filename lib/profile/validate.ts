import { z } from 'zod'
import { PROFILE_ROLES, OPEN_TO_VALUES } from '@/types'
import type { ProfileRole, OpenTo } from '@/types'

// ─── Profile roles (PROFILE-02) ────────────────────────────────────────
// A member picks up to 6 roles: known preset slugs, or a free-typed
// custom title (label). Validated with a discriminated union so a
// malformed `kind` can never slip a half-shaped object into the DB.

export const ProfileRoleSchema = z.union([
  z.object({ kind: z.literal('preset'), slug: z.enum(PROFILE_ROLES) }),
  z.object({ kind: z.literal('custom'), label: z.string().trim().min(1).max(40) }),
])

/**
 * Validate + cap a `roles` payload (max 6 entries). Whole-array parse:
 * a single invalid element (unknown preset slug, empty/overlong custom
 * label) or a non-array payload fails the entire parse and the field is
 * dropped, never partially written. Returns `[]` on any rejection —
 * mirrors __tests__/profile-roles-validation.test.ts's exact assertions.
 */
export function sanitizeProfileRoles(value: unknown): ProfileRole[] {
  const parsed = z.array(ProfileRoleSchema).max(6).safeParse(value)
  return parsed.success ? (parsed.data as ProfileRole[]) : []
}

// ─── Open-to chips (PROFILE-04) ─────────────────────────────────────────

/** Keep only strings that are valid OpenTo enum members; drop everything else. */
export function filterOpenTo(value: unknown): OpenTo[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (s): s is OpenTo => typeof s === 'string' && (OPEN_TO_VALUES as readonly string[]).includes(s)
  )
}

// ─── Featured-project pre-check (PROFILE-05) ────────────────────────────
// Pure predicate over a fetched vault_projects row — the API route does
// the DB read, this decides ok/not-found/rejected-not-public so the
// route can return a friendly 404/400 instead of letting migration 034's
// DB trigger exception reach the client raw.

type FeaturableProjectRow = { id: string; user_id: string; is_public: boolean }

export function isFeaturableProjectRow(
  row: FeaturableProjectRow | null | undefined,
  userId: string
): 'ok' | 'not-found' | 'rejected-not-public' {
  if (!row || row.user_id !== userId) return 'not-found'
  if (!row.is_public) return 'rejected-not-public'
  return 'ok'
}
