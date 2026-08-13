// ─── PII / secret scrubber for outbound monitoring events ─────────────
// Pure module, no side effects, no I/O. Shared by Sentry's `beforeSend`
// (R5, Plan 06) and reused wherever an event/payload must be made safe
// before it leaves the process. This is the last gate before egress for
// the arbitrary-shaped exception payloads the Sentry SDK captures — unlike
// lib/logging/logger.ts's structural allowlist guarantee (R6), this module
// defends the path where arbitrary data DOES arrive and must be redacted
// after the fact.
//
// Key-based, not value-based: a field is redacted because its KEY matches
// a known-sensitive pattern, regardless of what the value contains or how
// it's encoded (SPEC R5 encoding edge — a non-ASCII legal name like
// "Funūn Holdings Ltd." under a `legal_name` key is redacted exactly like
// an ASCII one, because the match never inspects the value's own bytes).
// Key comparison normalizes to NFKC before testing so accented/alternate
// Unicode key spellings are not missed — patterns are unanchored substring
// matches, so they are never restricted to ASCII-only key names.

/** Fixed placeholder written in place of any redacted value. Never partial. */
export const REDACTION_PLACEHOLDER = '[redacted]'

/**
 * Case-insensitive, Unicode-aware key matchers for the field families the
 * SPEC's Prohibitions rows name explicitly: auth secrets (password, token,
 * jwt, authorization, cookie, api key, Supabase service/anon key) and
 * rights-sensitive business content (legal name, contract, signature,
 * royalty). Unanchored — a key only needs to CONTAIN a matching substring.
 */
export const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /password/i,
  /passwd/i,
  /token/i,
  /jwt/i,
  /authoriz(e|ation)/i,
  /cookie/i,
  /api[_-]?key/i,
  /supabase/i,
  /secret/i,
  /session/i,
  /legal[_-]?name/i,
  /contract/i,
  /signature/i,
  /royalt/i,
]

/** Top-level request fields that are always fully removed, not redacted-in-place. */
const REQUEST_FIELDS_TO_DELETE = ['cookies', 'headers', 'query_string']

function isSensitiveKey(key: string): boolean {
  const normalized = key.normalize('NFKC')
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function scrubValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(scrubValue)
  if (isPlainObject(value)) return scrubObject(value)
  return value
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTION_PLACEHOLDER
      continue
    }
    result[key] = scrubValue(value)
  }
  return result
}

/**
 * Returns a scrubbed copy of `event`: request.cookies / request.headers /
 * request.query_string are deleted outright when present, and every other
 * nested key (event.extra, event.contexts, or any nested plain object)
 * whose KEY matches SENSITIVE_KEY_PATTERNS has its value replaced with
 * REDACTION_PLACEHOLDER. Null/undefined/absent input is a no-op that
 * returns an empty object rather than throwing.
 */
export function scrubKnownSensitiveKeys(
  event: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!isPlainObject(event)) return {}

  const scrubbed = scrubObject(event)

  if (isPlainObject(scrubbed.request)) {
    const request = { ...(scrubbed.request as Record<string, unknown>) }
    for (const field of REQUEST_FIELDS_TO_DELETE) {
      delete request[field]
    }
    scrubbed.request = request
  }

  return scrubbed
}
