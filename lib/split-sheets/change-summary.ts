// ─── Consensus-reset change summary (P18-09) ──────────────────────────
// When editing a sheet already out for approval resets consensus back to
// draft (lib/split-sheets/lifecycle.ts's CONSENSUS_RESET_STATUSES), each
// party deserves to be told WHAT changed — who joined, whose share moved
// and from what to what — not merely "please re-approve." This module is
// the single place that diff gets computed and worded.
//
// Deliberately compares id/name and split percentage ONLY. A party's
// identity fields (PRO/IPI/publishing designee/administrator/legal name)
// can change purely because they live-linked from Settings
// (lib/split-sheets/live-identity.ts, deliberation §1) — that is NOT a
// consensus-resetting change (P18-09), so this function is structurally
// incapable of seeing it: the "before"/"after" snapshots it is handed
// must already be the FROZEN split_sheet_parties values, and even then,
// identity fields on those snapshots are never read for the diff.
//
// NO FREE-TEXT PARAMETER, ON PURPOSE (P18-13): this module generates the
// exact words a consensus-reset notification carries and must be
// structurally incapable of carrying anything a user typed. Per
// .planning/phases/17-split-sheet-esign/17-DUAL-ENTRY-DESIGN.md section
// 10c-ii, an open channel that survives a dispute (with the document as
// pretext) is a harassment vector — an optional "note" field is exactly
// that vector, so it is deliberately absent from this module's API and
// must never be added.

import { normalizeName } from './reconciliation'

/** The subset of a party's fields this diff is allowed to look at. */
export type PartyChangeSnapshot = {
  id?: string | null
  name: string
  split_percentage: number
  // Identity fields may be present on the snapshot passed in, but are
  // NEVER read by summarizePartyChanges — see module header (P18-09).
  pro?: string | null
  ipi?: string | null
  publishing_designee?: string | null
  administrator?: string | null
  legal_name?: string | null
}

export type PartyChangeRecord =
  | { kind: 'added'; name: string; to: number }
  | { kind: 'removed'; name: string; from: number }
  | { kind: 'moved'; name: string; from: number; to: number }

/** Rounds to three decimal places — matches the project's split precision. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** Matches by id when present, falling back to normalized (trim+lowercase) name. */
function keyOf(p: PartyChangeSnapshot): string {
  if (p.id) return `id:${p.id}`
  return `name:${normalizeName(p.name)}`
}

/**
 * Diffs two party sets (before/after), matching by id when present or
 * normalized name otherwise, and returns an ordered list of structured
 * change records: 'removed'/'moved' entries in `before`'s order, followed
 * by any 'added' entries in `after`'s order. A party present in both sets
 * with an unchanged split percentage produces no record — including when
 * the ONLY thing that changed was an identity field (P18-09), because
 * identity fields are never compared here.
 */
export function summarizePartyChanges(
  before: PartyChangeSnapshot[],
  after: PartyChangeSnapshot[]
): PartyChangeRecord[] {
  const records: PartyChangeRecord[] = []
  const afterByKey = new Map(after.map(p => [keyOf(p), p]))
  const matchedAfterKeys = new Set<string>()

  for (const b of before) {
    const key = keyOf(b)
    const a = afterByKey.get(key)
    if (!a) {
      records.push({ kind: 'removed', name: b.name, from: round3(b.split_percentage) })
      continue
    }
    matchedAfterKeys.add(key)
    const from = round3(b.split_percentage)
    const to = round3(a.split_percentage)
    if (from !== to) {
      records.push({ kind: 'moved', name: a.name, from, to })
    }
  }

  for (const a of after) {
    const key = keyOf(a)
    if (matchedAfterKeys.has(key)) continue
    records.push({ kind: 'added', name: a.name, to: round3(a.split_percentage) })
  }

  return records
}

/** Renders a single change record as system-worded English (no free text, ever). */
export function formatPartyChange(record: PartyChangeRecord): string {
  switch (record.kind) {
    case 'added':
      return `${record.name} added at ${record.to}%`
    case 'removed':
      return `${record.name} removed (was ${record.from}%)`
    case 'moved':
      return `${record.name}'s share moved from ${record.from}% to ${record.to}%`
  }
}

/** Renders a full change list, in order, as system-worded English lines. */
export function formatPartyChanges(records: PartyChangeRecord[]): string[] {
  return records.map(formatPartyChange)
}
