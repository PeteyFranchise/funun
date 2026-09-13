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
  // Optional (not just nullable): `describeProvenance` below accepts the
  // same `AgreementEvidenceFacts` type but must stay byte-unchanged and
  // does not read either field, so its one existing caller
  // (app/api/workspaces/[workspaceId]/roster/evidence/route.ts's GET,
  // outside this plan's declared file scope) can keep constructing a
  // literal without them. A missing key here is read identically to an
  // explicit `null` by every check below -- fail-closed either way.
  confirmedBySubjectAt?: string | null
  documentId?: string | null
}

export type WorkspaceAuthorityStatusReason =
  | 'relationship_inactive'
  | 'supported'
  | 'no_evidence'
  | 'awaiting_member_confirmation'
  | 'document_not_linked'
  | 'not_yet_effective'
  | 'expired'
  | 'superseded'
  | 'scope_not_declared'
  | 'record_issue'

export type WorkspaceAuthorityStatus = {
  tier: WorkspaceAuthorityTier
  reason: WorkspaceAuthorityStatusReason
  changesAt: string | null
}

function parsedDate(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function isLiveQualifyingEvidence(row: AgreementEvidenceFacts, now: number): boolean {
  // An attached file with no declared scope is not a grant of authority --
  // the rights holder's declaration is the grant, the file is only proof
  // of why (D-36).
  if (!row.declaredScope || row.declaredScope.trim().length === 0) return false

  // The workspace may draft evidence naming a scope -- that is genuine
  // admin help -- but a draft confers nothing until the relationship's own
  // named Member has confirmed it. A null confirmedBySubjectAt means the
  // subject has not acted, so the row stays inert no matter how complete
  // its declared scope (D-36, R-08, finding F8).
  if (!row.confirmedBySubjectAt) return false

  // A document is mandatory for anything reaching authority tier (WSR-14).
  // Funun never opens or interprets the document's contents -- it is
  // required as provenance for the declaration, not as something checked
  // (D-36, D-37).
  if (!row.documentId) return false

  // effective_from has been stored since migration 183 and read by nobody
  // until now. A row whose declared window has not started yet is not
  // live today, even when every other condition is met. A null
  // effectiveFrom means "effective immediately."
  if (row.effectiveFrom) {
    const effectiveFromMs = new Date(row.effectiveFrom).getTime()
    // A malformed effectiveFrom parses to NaN. Any numeric comparison
    // against NaN is false, which would silently read as "no constraint"
    // -- treat a NaN parse as not-live instead, so a corrupt date can
    // never grant authority.
    if (Number.isNaN(effectiveFromMs) || effectiveFromMs > now) return false
  }

  // Expiry demotes authority automatically; it never keeps the tier at
  // 'authority' past its own declared window (D-39).
  if (row.expiresAt) {
    const expiresAtMs = new Date(row.expiresAt).getTime()
    // Same NaN guard as above -- a malformed expiry must not be read as
    // never-expiring.
    if (Number.isNaN(expiresAtMs) || expiresAtMs <= now) return false
  }

  // A superseded row (replaced by a newer agreement) no longer qualifies.
  if (row.supersededAt) {
    const supersededAtMs = new Date(row.supersededAt).getTime()
    // Same NaN guard -- a malformed supersededAt must not be read as
    // "never superseded."
    if (Number.isNaN(supersededAtMs) || supersededAtMs <= now) return false
  }

  return true
}

/**
 * Resolves a relationship's authority tier from its state plus live
 * evidence, recomputed on every call -- nothing is stored, nothing is
 * scheduled. Returns 'none' for any relationship that is not accepted.
 * Returns 'authority' only when the accepted relationship has at least one
 * evidence row that is: non-empty declared scope, confirmed by the
 * relationship's own subject Member (`confirmedBySubjectAt` non-null,
 * R-08/WSR-14, finding F8), backed by a document (`documentId` non-null,
 * WSR-14), currently effective (`effectiveFrom` null or not in the future,
 * WSR-15), and neither expired nor superseded as of `now`. Otherwise
 * returns 'operational' -- including when there is no evidence at all,
 * when the only evidence has expired, when the only evidence has no
 * declared scope, when the only evidence is unconfirmed, undocumented, or
 * not yet effective, and when a date field is malformed. None of these
 * conditions demotes all the way to 'none' (D-39) -- day-to-day
 * operational access survives a lapsed, unconfirmed, undocumented, or
 * not-yet-effective agreement.
 */
export function resolveAuthorityTier(args: {
  relationshipState: RosterRelationshipState
  evidence: readonly AgreementEvidenceFacts[]
  now?: number
}): WorkspaceAuthorityTier {
  return resolveAuthorityStatus(args).tier
}

/**
 * Returns the same fail-closed tier as `resolveAuthorityTier` plus a
 * presentation-safe reason. The reason is explanatory only; callers must
 * continue to authorize through the tier and the uncached grant resolver.
 */
export function resolveAuthorityStatus(args: {
  relationshipState: RosterRelationshipState
  evidence: readonly AgreementEvidenceFacts[]
  now?: number
}): WorkspaceAuthorityStatus {
  if (args.relationshipState !== 'accepted') {
    return { tier: 'none', reason: 'relationship_inactive', changesAt: null }
  }

  const now = args.now ?? Date.now()
  const qualifying = args.evidence.filter(row => isLiveQualifyingEvidence(row, now))
  if (qualifying.length > 0) {
    const expiries = qualifying
      .map(row => ({ timestamp: parsedDate(row.expiresAt), value: row.expiresAt }))
      .filter((item): item is { timestamp: number; value: string } => item.timestamp !== null)
      .sort((a, b) => a.timestamp - b.timestamp)
    return { tier: 'authority', reason: 'supported', changesAt: expiries[0]?.value ?? null }
  }

  if (args.evidence.length === 0) {
    return { tier: 'operational', reason: 'no_evidence', changesAt: null }
  }

  // Pick the most actionable explanation. Corrupt dates win so the surface
  // never presents a corrupt record as merely late; then confirmation and
  // document gaps, time-window states, supersession, and scope.
  if (args.evidence.some(row =>
    (row.effectiveFrom && parsedDate(row.effectiveFrom) === null) ||
    (row.expiresAt && parsedDate(row.expiresAt) === null) ||
    (row.supersededAt && parsedDate(row.supersededAt) === null)
  )) return { tier: 'operational', reason: 'record_issue', changesAt: null }

  if (args.evidence.some(row => !row.confirmedBySubjectAt)) {
    return { tier: 'operational', reason: 'awaiting_member_confirmation', changesAt: null }
  }
  if (args.evidence.some(row => !row.documentId)) {
    return { tier: 'operational', reason: 'document_not_linked', changesAt: null }
  }

  const future = args.evidence
    .map(row => ({ timestamp: parsedDate(row.effectiveFrom), value: row.effectiveFrom }))
    .filter((item): item is { timestamp: number; value: string } =>
      item.timestamp !== null && item.timestamp > now
    )
    .sort((a, b) => a.timestamp - b.timestamp)
  if (future.length > 0) {
    return { tier: 'operational', reason: 'not_yet_effective', changesAt: future[0].value }
  }

  const expired = args.evidence
    .map(row => ({ timestamp: parsedDate(row.expiresAt), value: row.expiresAt }))
    .filter((item): item is { timestamp: number; value: string } =>
      item.timestamp !== null && item.timestamp <= now
    )
    .sort((a, b) => b.timestamp - a.timestamp)
  if (expired.length > 0) {
    return { tier: 'operational', reason: 'expired', changesAt: expired[0].value }
  }

  if (args.evidence.some(row => {
    const value = parsedDate(row.supersededAt)
    return value !== null && value <= now
  })) return { tier: 'operational', reason: 'superseded', changesAt: null }

  if (args.evidence.some(row => !row.declaredScope?.trim())) {
    return { tier: 'operational', reason: 'scope_not_declared', changesAt: null }
  }

  return { tier: 'operational', reason: 'record_issue', changesAt: null }
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
