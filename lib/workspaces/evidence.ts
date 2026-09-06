import type { RosterRelationshipState, WorkspaceAuthorityTier } from '@/lib/workspaces/types'

// Compute-on-read agreement evidence ladder and authority tier (D-16, D-36,
// D-37, D-39). Pure, zero-I/O module -- no Supabase client, no side
// effects (style precedent: lib/client-partners/health.ts's compute-on-read
// resolver with an injectable clock).
//
// Funun never parses, interprets, or validates the file contents of an
// attached agreement. The rights holder declares the scope of authority
// they are granting; the document is supporting evidence for that
// declaration, not something Funun checks against the file (D-36).
//
// The final user-facing labels below are counsel-gated. The two strings
// this module emits are placeholders a later plan may replace under
// counsel review, matching how custody D-02 flagged its own state labels
// for review. Do not introduce a third label anywhere in this module, and
// do not describe anything Funun stored as having been reviewed or
// approved -- Funun only observed and stored it (D-37).
//
// Authority lapse is compute-on-read: resolveAuthorityTier is called on
// every read with an injected clock. There is no stored tier column to go
// stale and no scheduled job whose failure would leave stale authority
// live (D-39, 38-RESEARCH.md Open Question 2).

// ─── Agreement evidence facts ───────────────────────────────────────────
// Already-fetched, already-normalized facts about one attached agreement
// row. This module performs no lookups of its own -- the caller resolves
// these from the DB before calling resolveAuthorityTier/describeProvenance.
export type AgreementEvidenceFacts = {
  declaredScope: string | null
  effectiveFrom: string | null
  expiresAt: string | null
  supersededAt: string | null
  uploadedBy: string
  uploadedAt: string
  witnessedBySignature: boolean
}

function isLiveQualifyingEvidence(row: AgreementEvidenceFacts, now: number): boolean {
  // An attached file with no declared scope is not a grant of authority --
  // the rights holder's declaration is the grant, the file is only proof
  // of why (D-36).
  if (!row.declaredScope || row.declaredScope.trim().length === 0) return false

  // Expiry demotes authority automatically; it never keeps the tier at
  // 'authority' past its own declared window (D-39).
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= now) return false

  // A superseded row (replaced by a newer agreement) no longer qualifies.
  if (row.supersededAt && new Date(row.supersededAt).getTime() <= now) return false

  return true
}

/**
 * Resolves a relationship's authority tier from its state plus live
 * evidence, recomputed on every call -- nothing is stored, nothing is
 * scheduled. Returns 'none' for any relationship that is not accepted.
 * Returns 'authority' only when the accepted relationship has at least one
 * evidence row with a non-empty declared scope that is neither expired nor
 * superseded as of `now`. Otherwise returns 'operational' -- including when
 * there is no evidence at all, when the only evidence has expired, and when
 * the only evidence has no declared scope. Expiry demotes to 'operational';
 * it never demotes all the way to 'none' (D-39) -- day-to-day operational
 * access survives a lapsed document.
 */
export function resolveAuthorityTier(args: {
  relationshipState: RosterRelationshipState
  evidence: readonly AgreementEvidenceFacts[]
  now?: number
}): WorkspaceAuthorityTier {
  if (args.relationshipState !== 'accepted') return 'none'

  const now = args.now ?? Date.now()
  const hasQualifyingEvidence = args.evidence.some((row) => isLiveQualifyingEvidence(row, now))

  return hasQualifyingEvidence ? 'authority' : 'operational'
}

// Describes what Funun observed about one evidence row, never a judgement
// about the row's validity. stateLabel is one of exactly two neutral,
// observation-shaped phrasings, per the forbidden-vocabulary rule stated
// in this module's header comment (D-37).
export function describeProvenance(evidence: AgreementEvidenceFacts): {
  uploadedBy: string
  uploadedAt: string
  declaredScope: string | null
  witnessedBySignature: boolean
  stateLabel: string
} {
  return {
    uploadedBy: evidence.uploadedBy,
    uploadedAt: evidence.uploadedAt,
    declaredScope: evidence.declaredScope,
    witnessedBySignature: evidence.witnessedBySignature,
    stateLabel: evidence.witnessedBySignature
      ? 'Signature witnessed by Funun'
      : 'Uploaded by the rights holder',
  }
}
