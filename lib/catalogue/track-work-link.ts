// ─── Track → work AI-provenance resolution — null-safe by construction ───
// Pure module in the style of lib/catalogue/ai-entries.ts: no Supabase
// client, no framework import, no I/O.
//
// RED-FIRST STUB. This file intentionally does not implement
// resolveTrackAiProvenance() yet -- see lib/catalogue/track-work-link.test.ts,
// committed first against this stub to prove every assertion fails before
// any implementation exists (261004-wtl Task 2).
export type TrackAiProvenanceVerdict =
  | { status: 'unresolved'; reason: string }
  | { status: 'clear' }
  | { status: 'disqualified'; reasons: string[] }
