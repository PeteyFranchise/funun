// ─── Splits reconciliation diff ──────────────────────────────────────
// Compares split_sheet_parties against a track's tracks.metadata.composers[]
// and returns a structured diff — NEVER a mutation. There is no
// collaborator_id/party_id link on Composer (RESEARCH Pitfall 4), so
// matching is by normalized (trim + case-fold) name only, treated as a
// suggestion the artist confirms — the write-back this powers is OFFERED,
// never silent (P17-07, ESIGN-12).

import type { Composer } from '@/lib/metadata/schema'

/** The minimal split_sheet_parties shape reconciliation needs. */
export type ReconciliationParty = {
  name: string
  split_percentage: number
}

export type ReconciliationMatchRow = {
  kind: 'matched'
  name: string
  partyPercent: number
  composerPercent: number
  /** false when the matched pair's percentages differ — drives the mismatch warning. */
  equal: boolean
}

export type ReconciliationUnmatchedPartyRow = {
  kind: 'party_no_composer'
  name: string
  partyPercent: number
}

export type ReconciliationExtraComposerRow = {
  kind: 'composer_no_party'
  name: string
  composerPercent: number
}

export type ReconciliationRow =
  | ReconciliationMatchRow
  | ReconciliationUnmatchedPartyRow
  | ReconciliationExtraComposerRow

export type ReconciliationResult = {
  rows: ReconciliationRow[]
  /** True when any row is a mismatch, an unmatched party, or an extra composer —
   * signals the artist should be offered a write-back / mismatch warning. */
  needsWriteBack: boolean
}

/** trim + case-fold — the only identity signal available across the two systems. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/** Rounds to 2 decimal places to avoid float-imprecision false mismatches. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Diffs split_sheet_parties against composers[] read via readComposers()
 * (lib/metadata/schema.ts — reused, not re-derived). Returns a structured
 * diff only; the caller (a future confirm-or-dismiss UI) decides whether to
 * actually write anything back into composers[]. This function itself never
 * touches its inputs.
 */
export function reconcileSplits(
  parties: ReconciliationParty[],
  composers: Composer[]
): ReconciliationResult {
  const composerByName = new Map<string, Composer>()
  for (const c of composers) {
    const key = normalizeName(c.name)
    if (key) composerByName.set(key, c)
  }

  const matchedKeys = new Set<string>()
  const rows: ReconciliationRow[] = []
  let needsWriteBack = false

  for (const party of parties) {
    const key = normalizeName(party.name)
    const composer = key ? composerByName.get(key) : undefined

    if (composer) {
      matchedKeys.add(key)
      const equal = round2(party.split_percentage) === round2(composer.split)
      if (!equal) needsWriteBack = true
      rows.push({
        kind: 'matched',
        name: party.name,
        partyPercent: party.split_percentage,
        composerPercent: composer.split,
        equal,
      })
    } else {
      needsWriteBack = true
      rows.push({ kind: 'party_no_composer', name: party.name, partyPercent: party.split_percentage })
    }
  }

  for (const composer of composers) {
    const key = normalizeName(composer.name)
    if (key && !matchedKeys.has(key)) {
      needsWriteBack = true
      rows.push({ kind: 'composer_no_party', name: composer.name, composerPercent: composer.split })
    }
  }

  return { rows, needsWriteBack }
}
