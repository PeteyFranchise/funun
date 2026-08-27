// ─── Phone formatting + validation ─────────────────────────────────────────
// Two audiences share this module, and they do NOT share a country:
//
//   • Staff (lib/staff/phone.ts re-exports the three NANP helpers) — Funūn's
//     own team, all US, entered by an admin. NANP-only is correct there.
//   • Artists (formatContactPhone) — can be anywhere on earth, and the value
//     they type feeds contracts and split sheets.
//
// Pure, client-safe, never throws.

// ─── NANP (US/Canada) ──────────────────────────────────────────────────────

// Strip to digits, drop a leading US country code (11 digits starting with 1 —
// a US area code never starts with 1, so this is unambiguous), cap at 10.
export function phoneDigits(raw: string): string {
  let d = (raw || '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  return d.slice(0, 10)
}

// Progressive mask → "(", "(313", "(313) 555", "(313) 555-0142".
export function formatPhone(raw: string): string {
  const d = phoneDigits(raw)
  if (d.length === 0) return ''
  if (d.length < 4) return `(${d}`
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

// A phone is valid only as exactly 10 digits. (Empty is handled by the caller —
// phone is optional; this checks a non-empty value.)
export function isValidPhone(raw: string): boolean {
  return phoneDigits(raw).length === 10
}

// ─── International-safe contact phone ──────────────────────────────────────

// "+1" (with any spacing/punctuation) followed by at least one more digit.
// The trailing digit requirement matters: without it, the instant someone
// types the "1" of "+1" the value would mask to "" and the field would appear
// to eat their keystroke.
const NANP_COUNTRY_CODE = /^\+\s*1\D*\d/

/**
 * Format an artist-entered contact phone as they type.
 *
 * The NANP helpers above are destructive by design — they strip to digits and
 * cap at 10. Handed "+44 20 7946 0958" they return "(207) 946-0958": a
 * plausible-looking, silently WRONG number with no error surfaced. That is
 * acceptable for a US-only staff roster and NOT acceptable for artists, whose
 * phone number lands in contracts. So: anything the artist types with a "+"
 * country code other than +1 is returned exactly as typed — never reformatted,
 * re-spaced, or truncated.
 *
 * Idempotent, safe on empty input, never throws.
 */
export function formatContactPhone(raw: string): string {
  // trimStart, not trim: a trailing space is a separator the artist is in the
  // middle of typing ("+44 20 " → "+44 20 7946"). Eating it would make an
  // international number impossible to space out in a controlled input.
  const value = (raw || '').trimStart()
  if (!value) return ''

  if (value.startsWith('+')) {
    if (!NANP_COUNTRY_CODE.test(value)) return value
    // Drop the explicit "+1" before masking. phoneDigits' country-code rule
    // only fires on a complete 11-digit string, so a mid-type "+1 31" would
    // otherwise strip to "131" and mask as "(131)".
    return formatPhone(value.replace(/^\+\s*1/, ''))
  }

  return formatPhone(value)
}
