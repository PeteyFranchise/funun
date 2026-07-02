// ─── Curator + pitch token helpers ───────────────────────────────────
// Single owner of both token shapes used across the playlist-pitching
// surface: the curator claim link (06-05) and the pitch response links —
// accept/decline/unsubscribe (06-06). No JWT, no third-party lib — same
// crypto.randomBytes(32) shape as lib/split-sheets/approval.ts's
// generateApprovalToken().

import { randomBytes } from 'crypto'

/** Hours a curator claim token stays valid (D-18). */
export const CLAIM_TOKEN_EXPIRY_HOURS = 72

/**
 * Generates a cryptographically secure 64-char hex claim token.
 * Uses crypto.randomBytes(32) — 256 bits of entropy. Consumed by 06-05's
 * curator claim portal (issued on curator creation / admin action).
 */
export function generateClaimToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Generates a cryptographically secure 64-char hex response token.
 * Uses crypto.randomBytes(32) — 256 bits of entropy. Generated per
 * pitch_history row by THIS plan's send route; consumed by 06-06's
 * accept/decline/unsubscribe routes.
 */
export function generateResponseToken(): string {
  return randomBytes(32).toString('hex')
}
