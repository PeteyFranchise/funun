// ─── Claim pre-fill conflict + idempotency twin (R2) ───────────────────
// Pure-TypeScript parity twin for migration 072's reverse pre-fill: when
// a newly-claimed user's canonical artist_profiles field is semantically
// blank, it is pre-filled from the claimed collaborators records, with
// per-field provenance and an "unconfirmed" flag (D-01..D-04). This
// module defines the shared claim_prefill JSONB entry shape AND the two
// decisions the SQL must implement identically:
//   - which source wins when multiple claimed collaborator rows conflict
//     on the same field (most-recent by collaborators.updated_at)
//   - whether a field should be (re-)pre-filled at all (idempotency guard
//     — never overwrite a confirmed, edited, or pre-existing non-blank
//     value)
// This is the single source of truth for the claim_prefill entry shape
// consumed by BOTH migration 072 (19-04) and the R2 confirm UI (19-05) —
// they must not drift. No Supabase I/O — this is the parity anchor.

import { isSemanticBlankText, isSemanticBlankJson, type RescueKind } from './semantic-blank'

/**
 * Per-field claim pre-fill provenance, keyed by canonical field name on
 * artist_profiles.claim_prefill (JSONB). source_name is the display name
 * of THE PERSON WHO ADDED YOU (the inviting artist, D-03) — NOT the song
 * or project title (resolves 19-RESEARCH.md Open Question 1 / A2).
 */
export type ClaimPrefillEntry = {
  confirmed: boolean
  source_collaborator_id: string
  source_name: string
  filled_at: string
}

export type ClaimPrefillCandidate<T> = {
  value: T
  updated_at: string
  [key: string]: unknown
}

/**
 * Source conflict resolution (Edge: Source conflict, R2): given claimed-
 * collaborator source rows each carrying a field value and an
 * updated_at, returns the candidate from the most-recent row. Returns
 * null for an empty candidate list. Order-independent.
 */
export function pickWinningSource<T>(
  candidates: ClaimPrefillCandidate<T>[]
): ClaimPrefillCandidate<T> | null {
  if (candidates.length === 0) return null
  return candidates.reduce((latest, candidate) =>
    new Date(candidate.updated_at).getTime() > new Date(latest.updated_at).getTime()
      ? candidate
      : latest
  )
}

/**
 * Idempotency guard (Edge: Idempotency/re-run, R2): a field should be
 * (re-)pre-filled only when the canonical value is still semantic-blank
 * AND no existing entry has been confirmed. A non-blank canonical value
 * is always owned (either always was, or was edited since the last
 * fill) and is never overwritten. A confirmed entry locks the field —
 * re-running the claim never overwrites it, even if the canonical value
 * somehow reads blank again. An unconfirmed entry over a still-blank
 * canonical value is safely re-filled (idempotent, not a permanent
 * one-shot lock).
 */
export function shouldPrefill(
  canonicalValue: string | Record<string, unknown> | null | undefined,
  existingEntry: ClaimPrefillEntry | null | undefined,
  kind: RescueKind = 'text'
): boolean {
  if (existingEntry?.confirmed) return false
  const isBlank =
    kind === 'text'
      ? isSemanticBlankText(canonicalValue as string | null | undefined)
      : isSemanticBlankJson(canonicalValue as Record<string, unknown> | null | undefined)
  return isBlank
}

/**
 * Builds a fresh, unconfirmed provenance entry for a field the claim
 * just pre-filled. Never presents pre-filled data as authoritative —
 * confirmed always starts false; the Settings confirm-and-lock UI (R2
 * D-01/D-02) is the only path that flips it to true.
 */
export function buildClaimPrefillEntry(
  sourceCollaboratorId: string,
  sourceName: string,
  filledAt: string = new Date().toISOString()
): ClaimPrefillEntry {
  return {
    confirmed: false,
    source_collaborator_id: sourceCollaboratorId,
    source_name: sourceName,
    filled_at: filledAt,
  }
}
