// ─── Handle format authority (D-04, D-05) ────────────────────────────
// Pure, client-safe functions styled after lib/metadata/identifiers.ts's
// small-pure-function pattern. This is the SINGLE format authority for
// @handles — every caller (signup field, settings form, PATCH route,
// availability route, the D-09 hard gate) imports from here rather than
// re-implementing the regex.

export const HANDLE_MIN_LENGTH = 3
export const HANDLE_MAX_LENGTH = 30

// Letters and digits are the only atoms; hyphen and underscore are
// permitted only as INTERNAL single separators — so a leading separator,
// a trailing separator, and consecutive separators are all rejected.
// This is a strict superset of every one of migration 037's 58 seeded
// reserved values (none contain a separator), so the format rule and the
// reserved list can never disagree. Confirmed against the one live
// production handle: 'maya-reyes' (letters, single internal hyphen, no
// leading/trailing separator) passes.
const HANDLE_PATTERN = /^[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*$/

/**
 * True when `raw` (after trimming) is a well-formed handle. Never throws
 * on empty or whitespace-only input.
 */
export function isValidHandle(raw: string): boolean {
  const value = raw.trim()
  if (value.length < HANDLE_MIN_LENGTH || value.length > HANDLE_MAX_LENGTH) return false
  return HANDLE_PATTERN.test(value)
}

/**
 * Lowercases for COMPARISON ONLY — never use this to decide what gets
 * STORED. D-04: a handle is stored exactly as the person typed it; the
 * case-insensitive unique index from migration 010 (on the lowered
 * column expression) is what enforces uniqueness.
 */
export function normalizeHandleForCompare(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * `null` when `raw` is a valid handle, otherwise a specific, actionable
 * message naming the rejection reason. This is the string the signup
 * field, the settings form, and the API routes all surface, so it is
 * written once here.
 */
export function handleFormatError(raw: string): string | null {
  const value = raw.trim()
  if (value.length === 0) {
    return `Handle must be ${HANDLE_MIN_LENGTH}-${HANDLE_MAX_LENGTH} characters`
  }
  if (value.length < HANDLE_MIN_LENGTH || value.length > HANDLE_MAX_LENGTH) {
    return `Handle must be ${HANDLE_MIN_LENGTH}-${HANDLE_MAX_LENGTH} characters`
  }
  if (/^[_-]/.test(value) || /[_-]$/.test(value)) {
    return 'Handle cannot start or end with a hyphen or underscore'
  }
  if (/[_-]{2,}/.test(value)) {
    return 'Handle cannot contain consecutive hyphens or underscores'
  }
  if (!HANDLE_PATTERN.test(value)) {
    return 'Handle can only contain letters, digits, hyphens, and underscores'
  }
  return null
}
