// ─── tracksNeedingSheet() — the coverage denominator ─────────────────────
// P18-15 (18-CONTEXT.md, resolved after planning — SETTLED, do not
// re-ask): EVERY track needs a split sheet, including songs written by a
// single person. There is no acknowledgment marker for "written alone, no
// sheet needed."
//
// Pete's rationale, recorded verbatim because it should survive into this
// comment: the absence of a split sheet is not proof of sole authorship —
// it is absence of proof. A sync licensor running chain-of-title cannot
// distinguish "written alone" from "undocumented," and that ambiguity is
// what kills placements. A one-party sheet is a dated, executed
// declaration of 100% ownership with an audit trail — precisely the
// "no loose ends" artifact a licensor wants.
//
// Do NOT add an acknowledgment column, flag, or UI affordance anywhere
// that lets an artist mark a track as exempt from needing a sheet. If a
// future policy change ever exempts some tracks, it is a change to THIS
// function's body and nothing else — kept isolated as a single function
// for exactly that reason, even though the current rule makes it trivial.
//
// Reads ONLY the track list — no composer counts, no party counts, no
// acknowledgment field, because none exists.
export function tracksNeedingSheet<T>(tracks: T[]): T[] {
  return tracks
}
