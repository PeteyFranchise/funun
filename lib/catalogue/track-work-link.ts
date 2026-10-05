// ─── Track → work AI-provenance resolution — null-safe by construction ───
// Pure module in the style of lib/catalogue/ai-entries.ts: no Supabase
// client, no framework import, no I/O.
//
// THE READ PATH a future caller must follow (none wires this in yet --
// see .planning/todos/pending/2026-10-04-work-track-link-followups.md):
//
//   1. Resolve tracks.work_id with a plain
//      `SELECT work_id FROM tracks WHERE id = :trackId`.
//   2. If that value is null, call this function with `workId: null` --
//      it returns `{ status: 'unresolved' }` WITHOUT the caller ever
//      needing to query ai_entries at all.
//   3. If present, fetch that work's ai_entries rows (at minimum every
//      `level = 'work'` row; a caller that also has the graduated
//      master's work_version_id on hand may additionally scope
//      `level = 'version'` rows to it, but passing EVERY version-level
//      row for the work when that identifier is unavailable is the safe
//      direction -- it can only ever surface MORE disqualifiers, never
//      fewer) and map each row to an AiEntryInput before calling this
//      function.
//
// No code in this module fetches anything itself -- that responsibility,
// and the RLS/ownership gating that comes with it, belongs to whichever
// future caller wires this in. 261004-wtl's own scope stops at this
// resolver; wiring it into an admit decision is a deliberately deferred
// product decision (see the todo above).
//
// NULL-SAFETY, proven by test, not by convention
// (lib/catalogue/track-work-link.test.ts): a falsy workId short-circuits
// to 'unresolved' BEFORE any entry is inspected. There is no code path in
// this module -- now or after any future edit that keeps this contract --
// by which a null workId can reach 'clear'. The owner's constraint is
// explicit: null means "we do not know", never "no work", and a reader
// must never treat 'unresolved' as a confident negative.

import { resolveCrateConsequence, type AiEntryInput } from './ai-entries'

export type TrackAiProvenanceVerdict =
  | { status: 'unresolved'; reason: string }
  | { status: 'clear' }
  | { status: 'disqualified'; reasons: string[] }

const UNRESOLVED_REASON =
  'This track has no resolved link to a Catalogue work -- cannot determine AI-provenance eligibility, check by hand.'

/**
 * Resolves a track's AI-provenance verdict from its (possibly unknown)
 * work link and that work's AI disclosures. See module header for the
 * full read path a caller must follow before calling this.
 */
export function resolveTrackAiProvenance(
  workId: string | null,
  aiEntries: AiEntryInput[]
): TrackAiProvenanceVerdict {
  if (!workId) {
    return { status: 'unresolved', reason: UNRESOLVED_REASON }
  }

  const disqualifying = aiEntries
    .map(entry => resolveCrateConsequence(entry))
    .filter(consequence => !consequence.eligible)

  if (disqualifying.length === 0) {
    return { status: 'clear' }
  }

  return {
    status: 'disqualified',
    reasons: disqualifying.map(consequence => consequence.reason),
  }
}
