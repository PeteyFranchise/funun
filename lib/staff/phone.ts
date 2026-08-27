// ─── US phone formatting + validation (re-export) ───────────────────────────
// The implementations moved to @/lib/phone once artist Settings needed live
// masking too — lib/profile importing out of lib/staff would be backwards
// coupling. Semantics here are UNCHANGED and deliberately NANP-only: staff are
// Funūn's own US team, so stripping to 10 digits is right for them. Artist
// contact phones must use formatContactPhone() from @/lib/phone instead.
//
// Shared by the Add/Edit team-member form (live input masking) and the staff
// API (server-side normalize + validate). Pure, client-safe, never throws.

export { phoneDigits, formatPhone, isValidPhone } from '@/lib/phone'
