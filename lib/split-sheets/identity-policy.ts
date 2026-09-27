// ─── Split-sheet party identity policy (Ruling 2, pure) ────────────────
// Replaces lib/split-sheets/live-identity.ts (deleted 260926-v1w), whose
// resolvePartyIdentity() treated all five identity fields identically —
// a claimed party's CURRENT profile value overwrote the party row
// outright, field by field. That is correct for a PERSON-scoped fact
// (legal name, PRO, IPI: these describe the person, and their current
// Settings value should win) and WRONG for a WORK-specific one
// (publishing designee, administrator: these describe a choice made FOR
// THIS SONG, not a fact about the person). The old resolver let a
// profile default silently replace a work-specific choice a party had
// already made for this sheet — the defect this module fixes.
//
// TWO FIELD CLASSES, NOT ONE (the owner ruling, 2026-09-26):
//   Person-scoped  legal_name, pro, ipi
//     -> a claimed party's CURRENT profile value wins pre-mint. A blank
//        live value never blanks a real stored one.
//   Work-specific  publishing_designee, administrator
//     -> the PARTY ROW wins, always. A profile value is used ONLY to
//        fill a blank party-row field — it never overwrites a value
//        already recorded on this sheet, even a differing one.
//
// Post-mint (esign_pending, executed): nothing is live-linked. The party
// row is returned unchanged regardless of any live profile — the freeze
// boundary (lib/split-sheets/lifecycle.ts) already blocks writes past
// this point, and this function must never re-animate a signed or
// minting document's identity, nor invent identity for an unclaimed
// party (liveProfile === null always short-circuits to the party row).
//
// PURE, NO I/O — no Supabase import, same discipline
// lib/split-sheets/project-sync.ts states for itself, so the policy, the
// digest and the gate predicate are unit-testable without mocks. All I/O
// (the artist_profiles read, the collaborators.claimed_by lookup) is
// lib/split-sheets/resolve-party-identities.server.ts's job.
//
// FINDING C NAMING (label-integrity-funun): identity_digest_at_approval
// is named for exactly what the write site guarantees — the resolved
// identity at the instant a party's approve/counter was recorded — and
// NOT "the identity they approved". Claim 7 (18-SPEC review) established
// that a party approves a SPLIT, not an identity; the correction UI is
// optional and collapsed. Gate copy must say "changed since they last
// responded", never "they approved a different identity".
//
// identity_source ('unknown' | 'inviter_supplied' | 'token_holder_submitted',
// migration 228) is read here but NEVER branched on by
// identityDriftSinceLastAction below — 'unknown' (the backfill value for
// every pre-228 row) grants no special power, and the predicate treats
// every provenance value identically today. The column exists anyway,
// because the gate will eventually need to distinguish a roster copy
// from a token-holder submission once the deferred authority/provenance
// model lands (explicitly out of scope for this fix) — recording it now
// means that model does not need a second migration to add it.

import { createHash } from 'node:crypto'
import type { SplitSheetStatus } from './lifecycle'

export type { SplitSheetStatus }

/** Person-scoped: a claimed party's CURRENT profile value wins pre-mint. */
export const PERSON_SCOPED_FIELDS = ['legal_name', 'pro', 'ipi'] as const

/** Work-specific: the party row wins, always. A profile default never
 * overwrites a value already recorded on this sheet (Ruling 2). */
export const WORK_SPECIFIC_FIELDS = ['publishing_designee', 'administrator'] as const

/** The five identity fields, in the fixed order identityDigest hashes them. */
const IDENTITY_FIELD_ORDER = [
  'legal_name',
  'pro',
  'ipi',
  'publishing_designee',
  'administrator',
] as const

export type IdentityField = (typeof IDENTITY_FIELD_ORDER)[number]

export type PartyIdentityFields = {
  legal_name: string | null
  pro: string | null
  ipi: string | null
  publishing_designee: string | null
  administrator: string | null
}

declare const RESOLVED_PARTY_IDENTITY_BRAND: unique symbol

/**
 * A PartyIdentityFields value that has been through resolveIdentityFields.
 * Branding is DEFENSE IN DEPTH ONLY, never the primary control — the
 * primary control is __tests__/split-sheet-identity-boundary.test.ts, which
 * pins the exact set of files permitted to read identity columns. The
 * brand exists so a plain object literal built by hand cannot be passed to
 * the PDF sink (lib/vault/pdf/split-sheet.tsx) without going through this
 * module first.
 */
export type ResolvedPartyIdentity = PartyIdentityFields & {
  readonly [RESOLVED_PARTY_IDENTITY_BRAND]: true
}

function brand(fields: PartyIdentityFields): ResolvedPartyIdentity {
  return fields as ResolvedPartyIdentity
}

function isPreMintStatus(status: SplitSheetStatus): boolean {
  return status !== 'esign_pending' && status !== 'executed'
}

/** Trims and normalizes: null, undefined and whitespace-only all become
 * null — a blank live value must never blank a real stored one. */
function nonBlank(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Resolves one party's identity fields per Ruling 2's two field classes.
 * See this module's header for the full rationale.
 */
export function resolveIdentityFields(
  partyRow: PartyIdentityFields,
  liveProfile: PartyIdentityFields | null,
  sheetStatus: SplitSheetStatus
): ResolvedPartyIdentity {
  if (!isPreMintStatus(sheetStatus) || liveProfile === null) {
    return brand({ ...partyRow })
  }

  const resolved: PartyIdentityFields = { ...partyRow }

  for (const field of PERSON_SCOPED_FIELDS) {
    const live = nonBlank(liveProfile[field])
    if (live !== null) resolved[field] = live
  }

  for (const field of WORK_SPECIFIC_FIELDS) {
    // The party row wins ALWAYS when it already carries a value — a
    // profile default is used only to fill a blank field, never to
    // overwrite a work-specific choice already made for this sheet.
    if (nonBlank(partyRow[field]) !== null) continue
    const live = nonBlank(liveProfile[field])
    if (live !== null) resolved[field] = live
  }

  return brand(resolved)
}

/**
 * A stable sha256 hex digest over the five identity fields, in the fixed
 * order above, with null and '' normalized to the SAME token — a
 * whitespace-only value and an explicit clear must digest identically, or
 * a party who typed a space into a field they meant to clear would trip
 * the drift gate against a baseline that never meaningfully differed.
 *
 * node:crypto is a Node built-in — no new dependency (threat model T-v1w-SC).
 */
export function identityDigest(fields: PartyIdentityFields): string {
  // '\u0001' is a field separator, not a character any real identity
  // value contains -- without one, {legal_name:'AB', pro:''} and
  // {legal_name:'A', pro:'B'} would concatenate to the same string and
  // digest identically. '\u0000' stands in for a blank field so an
  // entirely-empty PartyIdentityFields does not digest to the empty string.
  const canonical = IDENTITY_FIELD_ORDER.map(field => nonBlank(fields[field]) ?? '\u0000').join(
    '\u0001'
  )
  return createHash('sha256').update(canonical).digest('hex')
}

export type IdentityDrift = {
  partyId: string
  partyName: string
  field: IdentityField
  valueWhenTheyResponded: string | null
  valueNow: string | null
}

/**
 * The shape identityDriftSinceLastAction needs from a party row: its
 * current identity fields (the frozen values a display would show absent
 * any live override — the best available proxy for "what they saw when
 * they responded", since person-scoped fields are never written back to
 * this row and work-specific fields only change via an explicit edit),
 * plus its approval-time baseline digest.
 */
export type PartyForDriftCheck = PartyIdentityFields & {
  partyId: string
  partyName: string
  /**
   * The resolved identity's digest at the instant this party last
   * approved or countered (Finding C — NOT "the identity they approved").
   * Null means no baseline exists — nobody has responded yet, or this row
   * predates migration 228 — and a mint proceeds unchanged, exactly as it
   * did before this gate existed (T-v1w-06, accepted DoS disposition: no
   * baseline means no possible block).
   */
  identityDigestAtApproval: string | null
}

/**
 * Ruling 1's gate predicate: has this party's identity drifted since the
 * digest recorded in identity_digest_at_approval? Returns an empty array
 * when there is nothing to block on — no baseline, or the freshly-resolved
 * digest still matches it.
 *
 * FIELD-LEVEL DETAIL IS AN APPROXIMATION, DOCUMENTED HONESTLY: only a
 * digest is persisted at approval time (not a full field snapshot — see
 * migration 228's header for why), so the exact approval-time VALUES are
 * not recoverable. The field-level entries below compare the freshly
 * resolved identity against the party row's OWN current fields (the best
 * available proxy for "what they saw"), which correctly surfaces the
 * common case (a claimed party's live profile changed since they
 * responded). In the rare case where that comparison shows no per-field
 * difference despite a digest mismatch (a value changed and reverted
 * between responses, or a work-specific edit whose current party-row
 * value already reflects the edit), every identity field is listed rather
 * than none — erring toward showing more than toward silently blocking
 * with an empty, uninformative conflicts array. This never affects
 * WHETHER the gate blocks (that is decided by the digest alone); it only
 * affects what the 409 body can tell the initiator about why.
 */
export function identityDriftSinceLastAction(
  party: PartyForDriftCheck,
  resolved: PartyIdentityFields
): IdentityDrift[] {
  if (party.identityDigestAtApproval === null) return []

  const resolvedDigest = identityDigest(resolved)
  if (resolvedDigest === party.identityDigestAtApproval) return []

  const partyFields: PartyIdentityFields = {
    legal_name: party.legal_name,
    pro: party.pro,
    ipi: party.ipi,
    publishing_designee: party.publishing_designee,
    administrator: party.administrator,
  }

  const changedFields = IDENTITY_FIELD_ORDER.filter(
    field => nonBlank(partyFields[field]) !== nonBlank(resolved[field])
  )
  const fieldsToReport = changedFields.length > 0 ? changedFields : IDENTITY_FIELD_ORDER

  return fieldsToReport.map(field => ({
    partyId: party.partyId,
    partyName: party.partyName,
    field,
    valueWhenTheyResponded: nonBlank(partyFields[field]),
    valueNow: nonBlank(resolved[field]),
  }))
}
