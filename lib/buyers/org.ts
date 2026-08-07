import { BUYER_ROLE_VALUES, type BuyerRole } from './schema'

// ─── Pure buyer-org helpers (D-13 solo-buyer personal org) ────────────────
// Account-creation side effects (admin.createUser, generateLink, Resend)
// stay OUT of this file — those belong in the provisioning routes built in
// plan 16-03. This file stays pure and importable by tests, mirroring
// lib/buyers/permissions.ts.

/**
 * Builds the auto-created personal org name for a solo buyer (D-13: one
 * data model, no special cases — a solo buyer still gets a real buyer_org
 * row, just a single-member one where they are admin).
 */
export function buildPersonalOrgName(displayName: string): string {
  const trimmed = displayName.trim()
  return trimmed ? `${trimmed} (Personal)` : 'Personal Buyer Org'
}

/**
 * Coerces untrusted input to a valid BuyerRole, defaulting to the least
 * privilege ('requester') for anything unrecognized. Never throws.
 */
export function normalizeBuyerRole(raw: unknown): BuyerRole {
  return typeof raw === 'string' && (BUYER_ROLE_VALUES as readonly string[]).includes(raw)
    ? (raw as BuyerRole)
    : 'requester'
}
