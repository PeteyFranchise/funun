// ─── R4 identity-correction flag: shared field allowlist (19-SPEC.md D-07) ──
// The single source of truth for the flaggable-identity-field closed set —
// mirrored by two DB-adjacent artifacts that must stay identical if this
// set ever changes: migration 074's `field` CHECK constraint and
// app/api/split-sheets/[id]/correction-flag/route.ts's FLAGGABLE_FIELDS.
// Both the claimed-user flag entry (components/contracts/ContractLocker.tsx,
// D-05) and the owner's staged-panel display
// (components/split-sheets/StagedFlagPanel.tsx, D-08) import this instead
// of re-declaring the set, so the copies can never drift.

export const FLAGGABLE_FIELDS = ['pro', 'ipi', 'publisher', 'administrator', 'legal_name'] as const
export type FlaggableField = (typeof FLAGGABLE_FIELDS)[number]

export const FLAGGABLE_FIELD_LABELS: Record<FlaggableField, string> = {
  pro: 'PRO',
  ipi: 'IPI number',
  publisher: 'Publisher',
  administrator: 'Administrator',
  legal_name: 'Legal name',
}

/**
 * A frozen split_sheet_parties row, scoped to exactly the columns a flag
 * can target. Note `publisher` (the route/migration's field name) maps to
 * the party table's `publishing_designee` column — the underlying column
 * predates that naming (see split-sheets/[id]/page.tsx's PartyDbRow).
 */
export type FlaggablePartySnapshot = {
  pro: string | null
  ipi: string | null
  publishing_designee: string | null
  administrator: string | null
  legal_name: string | null
}

/**
 * The frozen party's current value for a flagged field — used by the
 * owner's staged-correction panel (D-08) to show "current -> suggested".
 * Never used to write anything; read-only display support.
 */
export function currentValueForFlaggedField(
  field: FlaggableField,
  party: FlaggablePartySnapshot
): string | null {
  if (field === 'publisher') return party.publishing_designee
  return party[field]
}
