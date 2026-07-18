import {
  isValidProfileVisibility,
  isValidOpenToVisibility,
  type ProfileVisibility,
  type OpenToVisibility,
} from './contracts'

// ─────────────────────────────────────────────────────────────────────────
// Owner-facing profile/open-to visibility settings (SAFETY-04, Plan 13-05
// Task 2). Pure validation only — the write itself always goes through the
// service-role client after this validation + an ownership check, mirroring
// migration 058's design note: profile_visibility/open_to_visibility get no
// authenticated UPDATE grant at all (same precedent as legal/PII columns in
// app/api/profile/route.ts), so a dedicated route is required rather than
// adding these to that route's EDITABLE_FIELDS allowlist.
// ─────────────────────────────────────────────────────────────────────────

export type ProfileVisibilityUpdate = Partial<{
  profile_visibility: ProfileVisibility
  open_to_visibility: OpenToVisibility
}>

export type VisibilityValidation =
  | { ok: true; value: ProfileVisibilityUpdate }
  | { ok: false; error: string }

/** Validates a PATCH /api/profile/visibility body: `{ profileVisibility?, openToVisibility? }`. */
export function validateProfileVisibilityUpdate(body: Record<string, unknown>): VisibilityValidation {
  const update: ProfileVisibilityUpdate = {}

  if ('profileVisibility' in body && body.profileVisibility != null) {
    if (typeof body.profileVisibility !== 'string' || !isValidProfileVisibility(body.profileVisibility)) {
      return { ok: false, error: 'profileVisibility must be one of: public, connections_only' }
    }
    update.profile_visibility = body.profileVisibility
  }

  if ('openToVisibility' in body && body.openToVisibility != null) {
    if (typeof body.openToVisibility !== 'string' || !isValidOpenToVisibility(body.openToVisibility)) {
      return { ok: false, error: 'openToVisibility must be one of: public, connections, hidden' }
    }
    update.open_to_visibility = body.openToVisibility
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: 'No valid fields to update' }
  }

  return { ok: true, value: update }
}
