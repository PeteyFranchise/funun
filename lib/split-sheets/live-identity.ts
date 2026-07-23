// ─── Live-linked party identity resolver ─────────────────────────────
// The read-time mechanism for deliberation §1 (live-linked identity):
// for any split-sheet party who is a Funūn user, PRO/IPI/publishing
// designee/administrator/legal name stay live-linked to their account —
// resolved from their CURRENT artist_profiles values — right up until
// the sheet is minted for signature (`esign_pending`). The freeze
// boundary (lib/split-sheets/lifecycle.ts) already blocks further writes
// past that point; it IS the snapshot moment, for free — no new
// snapshot mechanism needed.
//
// DELIBERATE OVERWRITE, NOT ADDITIVE — the one genuine divergence from
// this codebase's usual backfill convention: migration 026's
// backfill_claimed_collaborators() is COALESCE/additive-only, because
// it propagates one collaborator's data without ever letting it clobber
// another party's entry. This resolver is different on purpose — it's a
// person's OWN verified identity correcting itself, not one person's
// data overwriting someone else's — so a present claimed value wins
// outright, replacing the frozen value. This module is a brand-new,
// distinct function; it is NEVER a mutation of
// backfill_claimed_collaborators() itself (research Pitfall 5) — that
// function stays additive for its own unrelated callers.
//
// Pure, no I/O: the artist_profiles read that feeds claimedProfile is
// the CALLER's responsibility (18-01's [id]/page.tsx server component),
// scoped server-side via createServiceClient() and a server-verified
// collaborators.claimed_by — never a client-supplied user id (T-18-26/
// T-18-27). This module only resolves values already in hand.

import type { SplitSheetStatus } from './lifecycle'

export type { SplitSheetStatus }

/**
 * A party's rights/identity fields, shared shape between the frozen
 * split_sheet_parties snapshot and a claimed user's live artist_profiles
 * data. legal_name is only meaningfully non-null for a claimed party
 * whose Settings legal name is on file (locked per deliberation §2).
 */
export type LivePartyIdentitySource = {
  pro: string | null
  ipi: string | null
  publishing_designee: string | null
  administrator: string | null
  legal_name: string | null
}

const IDENTITY_FIELDS = [
  'pro',
  'ipi',
  'publishing_designee',
  'administrator',
  'legal_name',
] as const

/**
 * Resolves a party's identity for display, given the frozen snapshot
 * currently persisted on split_sheet_parties, the claimed user's CURRENT
 * artist_profiles-derived identity (or null when unclaimed — no Funūn
 * account), and the sheet's lifecycle status.
 *
 * Pre-esign_pending (draft, pending_approval, approved, countered) AND
 * claimedProfile is non-null: the claimed profile wins field-by-field
 * with OVERWRITE semantics — a present claimed value replaces the frozen
 * value outright. A null/blank claimed field falls back to the frozen
 * value instead (never blank a real frozen value with a missing live
 * one).
 *
 * Post-esign_pending (esign_pending, executed) OR claimedProfile is
 * null: the frozen snapshot is returned unchanged. The freeze boundary
 * already blocks writes once minted; this function must never
 * re-animate a signed or minting document's identity, and must never
 * invent identity for an unclaimed party.
 */
export function resolvePartyIdentity(
  frozenSnapshot: LivePartyIdentitySource,
  claimedProfile: LivePartyIdentitySource | null,
  sheetStatus: SplitSheetStatus
): LivePartyIdentitySource {
  const isPreMint = sheetStatus !== 'esign_pending' && sheetStatus !== 'executed'

  if (!isPreMint || claimedProfile === null) {
    return frozenSnapshot
  }

  const resolved = { ...frozenSnapshot }
  for (const field of IDENTITY_FIELDS) {
    const liveValue = claimedProfile[field]
    if (liveValue !== null && liveValue.trim() !== '') {
      resolved[field] = liveValue
    }
  }
  return resolved
}
