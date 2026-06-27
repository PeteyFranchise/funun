// ─── Split-sheet approval helpers ────────────────────────────────────
// Token generation, split-total validation, and even-split pre-fill.
// No external dependencies — uses Node built-in crypto only.
// Used by the CRUD API (Plans 03) and the send-for-approval route (Plan 04).

import { randomBytes } from 'crypto'

/** Days an approval token stays valid (same window as collaborator invites). */
export const APPROVAL_TOKEN_EXPIRY_DAYS = 30

// ─── Types ────────────────────────────────────────────────────────────

/** Shape of a single party row as submitted from the client. */
export type SplitSheetParty = {
  name: string
  email?: string | null
  pro?: string | null
  ipi?: string | null
  role?: string | null
  split_percentage: number
  collaborator_id?: string | null
}

// ─── Token helpers ────────────────────────────────────────────────────

/**
 * Generates a cryptographically secure 64-char hex approval token.
 * Uses crypto.randomBytes(32) — 256 bits of entropy.
 */
export function generateApprovalToken(): string {
  return randomBytes(32).toString('hex')
}

// ─── Split validation ─────────────────────────────────────────────────

/**
 * Returns true only when the sum of all split percentages rounds to exactly
 * 100.000 (three decimal places). Handles floating-point imprecision.
 */
export function validateApprovalTotal(splits: number[]): boolean {
  if (splits.length === 0) return false
  const total = splits.reduce((acc, n) => acc + n, 0)
  return Math.round(total * 1000) / 1000 === 100
}

// ─── Even-split helper ────────────────────────────────────────────────

/**
 * Returns the even split percentage for a given number of parties,
 * rounded to 3 decimal places. Example: evenSplit(3) → 33.333.
 */
export function evenSplit(count: number): number {
  if (count <= 0) return 0
  return Math.round((100 / count) * 1000) / 1000
}
