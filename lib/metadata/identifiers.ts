// ─── Identifier helpers — ISRC & ISWC ────────────────────────────────
// Pure, client-safe functions for the two recording/composition codes.
//
//  • ISRC  is self-assignable: once an artist holds a registrant code they
//    mint their own. So we format + generate these.
//  • ISWC  is NOT self-assignable — it's allocated centrally by CISAC via a
//    PRO. We only validate (incl. its check digit) and format these; there
//    is intentionally no ISWC generator.

// ── ISRC ─────────────────────────────────────────────────────────────

/** 2-letter country code of the registrant (ISO 3166-1 alpha-2-ish). */
export function normalizeCountry(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2)
}

/** 3-char alphanumeric registrant code issued by the national ISRC agency. */
export function normalizeRegistrant(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3)
}

export function isValidCountry(raw: string | null | undefined): boolean {
  return /^[A-Z]{2}$/.test(normalizeCountry(raw))
}

export function isValidRegistrant(raw: string | null | undefined): boolean {
  return /^[A-Z0-9]{3}$/.test(normalizeRegistrant(raw))
}

/**
 * Build a display-formatted ISRC: "US-S1Z-26-00014".
 * `year` is the 2-digit year of assignment; `designation` is 1..99999.
 */
export function formatIsrc(
  country: string,
  registrant: string,
  year: string,
  designation: number
): string {
  const cc = normalizeCountry(country)
  const reg = normalizeRegistrant(registrant)
  const yy = String(year).padStart(2, '0').slice(-2)
  const nnnnn = String(designation).padStart(5, '0')
  return `${cc}-${reg}-${yy}-${nnnnn}`
}

/** 2-digit current year of assignment (UTC) — the ISRC "year of reference". */
export function currentIsrcYear(now: Date = new Date()): string {
  return String(now.getUTCFullYear()).slice(-2)
}

/**
 * Next designation number for a given year, from the per-year counter map
 * stored on the profile (e.g. { "26": 13 } → returns 14). Returns null if
 * the year is exhausted (>99999).
 */
export function nextDesignation(
  counters: Record<string, number> | null | undefined,
  year: string
): number | null {
  const last = Number(counters?.[year] ?? 0)
  const next = (Number.isFinite(last) ? last : 0) + 1
  return next > 99999 ? null : next
}

// ── ISWC ─────────────────────────────────────────────────────────────

/** Strip to canonical form: "T" + 10 digits (9 body + 1 check). */
export function normalizeIswc(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[\s.\-]/g, '').toUpperCase()
}

/**
 * CISAC check digit for the 9-digit ISWC body.
 * Algorithm (ISO 15707): start the sum at 1 for the leading 'T', then add
 * each body digit multiplied by its 1-based position (1..9); take mod 10;
 * the check digit is (10 - remainder) mod 10.
 *   e.g. T-034524680 → sum 179 → 179 % 10 = 9 → check digit 1.
 */
export function iswcCheckDigit(body: string): number {
  if (!/^\d{9}$/.test(body)) return -1
  let sum = 1 // leading 'T' contributes 1
  for (let i = 0; i < 9; i++) {
    sum += (i + 1) * Number(body[i])
  }
  return (10 - (sum % 10)) % 10
}

/** Format a 9-digit body into a display ISWC, computing the check digit. */
export function formatIswc(body: string): string | null {
  const b = (body ?? '').replace(/\D/g, '')
  if (!/^\d{9}$/.test(b)) return null
  return `T-${b.slice(0, 3)}.${b.slice(3, 6)}.${b.slice(6, 9)}-${iswcCheckDigit(b)}`
}

/** Well-formed shape: T + 10 digits. */
export function isValidIswcShape(raw: string | null | undefined): boolean {
  return /^T\d{10}$/.test(normalizeIswc(raw))
}

/** Shape AND check digit are correct — a provably valid ISWC. */
export function isValidIswc(raw: string | null | undefined): boolean {
  const v = normalizeIswc(raw)
  if (!/^T\d{10}$/.test(v)) return false
  const body = v.slice(1, 10)
  const check = Number(v.slice(10))
  return iswcCheckDigit(body) === check
}
