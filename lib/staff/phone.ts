// ─── US phone formatting + validation ──────────────────────────────────────
// Shared by the Add/Edit team-member form (live input masking) and the staff
// API (server-side normalize + validate). Pure, client-safe, never throws.

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
