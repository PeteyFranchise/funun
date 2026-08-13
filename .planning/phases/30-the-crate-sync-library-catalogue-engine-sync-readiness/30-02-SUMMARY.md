---
phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness
plan: 02
subsystem: layered-tagging
tags: [tagging, ai, schema, provenance, jest]
dependency-graph:
  requires: []
  provides:
    - "lib/metadata/schema.ts: INSTRUMENT_VALUES/INSTRUMENT_LABELS/Instrument, descriptor v2 (instruments/ai_suggested/staff_refined_by/pending), exported coerceMoods/coerceEnergy/coerceVocal/coerceInstruments"
    - "lib/tagging/ai-tag.ts: suggestTrackTags()/coerceSuggestion()"
    - "lib/tagging/tag-merge.ts: mergeAiSuggestion()/applyStaffRefinement()/proposeStaffRefinement()/approvePendingTags()/rejectPendingTags()/isTagApprover()/TAG_APPROVER_ROLES"
  affects:
    - "30-06 (AI tag-suggest / tag-propose / tag-approve routes) — consumes all three modules directly"
    - "30-03 (owner-run migration) — widens StaffRole to include 'anr', which TAG_APPROVER_ROLES/isTagApprover already anticipate"
tech-stack:
  added: []
  patterns:
    - "Server-only Anthropic client constructed inline per-call (never the eager lib/anthropic/index.ts singleton) so a missing ANTHROPIC_API_KEY degrades gracefully instead of throwing at import"
    - "Shared *_VALUES.includes() vocab coercion, single-sourced in lib/metadata/schema.ts and reused by lib/tagging/ai-tag.ts + lib/tagging/tag-merge.ts, so every write path (artist, AI, staff) drops off-vocabulary values identically"
key-files:
  created:
    - lib/tagging/ai-tag.ts
    - lib/tagging/ai-tag.test.ts
    - lib/tagging/tag-merge.ts
    - lib/tagging/tag-merge.test.ts
  modified:
    - lib/metadata/schema.ts
    - lib/metadata/descriptors.test.ts
decisions:
  - "INSTRUMENT_VALUES seeded from CatalogBrowserLight's existing fixture (piano/strings/guitar/synth/brass) plus a modest superset (drums/bass/keys/vocals/percussion/woodwinds) — lowercase tokens, same registry pattern as MOOD/ENERGY/VOCAL"
  - "ai-tag.ts re-declares MODEL = 'claude-sonnet-4-20250514' (matching lib/anthropic/index.ts's id) rather than importing it, since importing that module throws at import time with no key set — no third model id introduced"
  - "TagSuggestion (ai-tag.ts) carries an extra genres: string[] field beyond descriptors.ai_suggested's moods/energy/vocal/instruments/suggested_at/model shape — genres live at project level (vault_projects.genre), not on TrackDescriptors, so this is informational output for a future caller, not written to ai_suggested directly"
  - "applyStaffRefinement uses partial-update semantics: a field is only overwritten when the caller explicitly supplies it (key present, even as an empty array); an omitted key preserves the prior confirmed value"
metrics:
  duration: "~35 min"
  completed: 2026-08-13
status: complete
---

# Phase 30 Plan 02: Layered-Tagging Foundation Summary

Built the pure-logic foundation for layered tagging: a real shared INSTRUMENT controlled vocabulary, an additive descriptor v2 shape carrying AI-suggested and AE-pending tag layers alongside (never on top of) the artist-confirmed values, a vocab-constrained AI tag-suggest module reusing the brief-ai.ts prompt-for-JSON pattern, and a pure provenance-preserving merge module implementing the pending→approved tag-approval workflow.

## What Was Built

**Task 1 — `lib/metadata/schema.ts` (extended, TDD RED→GREEN):**
- `INSTRUMENT_LABELS`/`INSTRUMENT_VALUES`/`Instrument` — new controlled vocab (11 terms), following the exact `MOOD_LABELS`/`MOOD_VALUES` pattern.
- `TrackDescriptors` gained four optional fields, additive only: `instruments?`, `ai_suggested?` (`AiSuggestedTags`), `staff_refined_by?`, `pending?` (`PendingTagProposal`). Existing `moods`/`energy`/`vocal` fields and their read/write byte-shape are unchanged.
- `readDescriptors`/`sanitizeDescriptors` refactored onto four newly-exported, shared coercion helpers — `coerceMoods`/`coerceEnergy`/`coerceVocal`/`coerceInstruments` — so every write path (artist input, AI suggestion, staff refinement) drops off-vocabulary values through the identical logic. `sanitizeDescriptors` never emits `ai_suggested`/`pending` even if present in the raw client input.

**Task 2 — `lib/tagging/ai-tag.ts` (new):**
- `suggestTrackTags({ title, text? })` — constructs the Anthropic client inline from `process.env.ANTHROPIC_API_KEY`; returns `{ ok: false, error: 'The tagging assistant is offline right now.' }` when the key is absent (never throws at import or call). Reuses the fenced-code-tolerant `extractJson()` idiom from `brief-ai.ts` verbatim.
- `coerceSuggestion(parsed)` — pure, exported, network-free helper that keeps only controlled-vocab members (`MOOD_VALUES`/`ENERGY_VALUES`/`VOCAL_VALUES`/`INSTRUMENT_VALUES`/`ALL_GENRE_SLUGS`), dedupes, caps counts, drops everything else silently, and stamps `suggested_at`/`model`.
- `MODEL` is re-declared locally (`'claude-sonnet-4-20250514'`) rather than imported from `lib/anthropic/index.ts`, since that module throws at import when no key is set — importing it here would break the graceful-degradation contract. No third model id was introduced (matches the existing id, per 30-RESEARCH Open Q #5).

**Task 3 — `lib/tagging/tag-merge.ts` (new):**
- `mergeAiSuggestion(current, suggestion)` — sets `ai_suggested` only; confirmed tags untouched.
- `applyStaffRefinement(current, refined, staffUserId)` — the confirmed-write primitive; partial update (only overwrites fields explicitly supplied), stamps `staff_refined_by`, preserves any `ai_suggested`, clears `pending`.
- `proposeStaffRefinement(current, refined, staffUserId, role)` — branches on `isTagApprover(role)`: leadership/A&R auto-confirm via `applyStaffRefinement`; an AE's proposal writes a vocab-coerced `pending` sub-object (`proposed_by`/`proposed_at`) and the confirmed tags are **never** touched.
- `approvePendingTags(current, approverUserId)` — promotes `pending` → confirmed (via `applyStaffRefinement`), clears `pending`.
- `rejectPendingTags(current)` — clears `pending`, confirmed tags unchanged.
- `TAG_APPROVER_ROLES = ['leadership', 'anr']` + `isTagApprover(role)` — the approver set 30-06's approve route will gate on.
- All functions are pure (no I/O) and never mutate their inputs (verified by explicit non-mutation test cases using deep-equality snapshots).

## Verification

| Check | Result |
|---|---|
| `npx jest lib/metadata/descriptors.test.ts` | 22 tests passed (14 pre-existing + 8 new descriptor-v2 cases) |
| `npx jest lib/tagging/ai-tag.test.ts` | 7 tests passed (coercion + no-key/empty-title branches; no live API calls) |
| `npx jest lib/tagging/tag-merge.test.ts` | 17 tests passed (incl. pending→approved, auto-confirm-for-leadership/anr, AE-never-auto-confirms, non-mutation) |
| `npx jest lib/tagging lib/metadata/descriptors.test.ts` (combined) | 46 tests passed |
| `npx tsc --noEmit` | Clean (0 errors) — confirms `lib/deals/catalog.ts` and all other schema.ts importers still type-check |
| `npm test` (full suite, wave boundary) | 175 suites / 2100 tests passed |

**Threat-model grep checks:**
- `lib/tagging/ai-tag.ts` does NOT `import` `lib/anthropic/index.ts` (only referenced in comments) — confirmed via `grep -n "lib/anthropic" lib/tagging/ai-tag.ts`.
- All coercion routes through `*_VALUES.includes(...)` in both `lib/metadata/schema.ts` and `lib/tagging/ai-tag.ts` — confirmed via grep.

## TDD Gate Compliance

Task 1 (`tdd="true"`) followed the full RED→GREEN cycle:
- `test(30-02): add failing test for INSTRUMENT vocab + descriptor v2 (additive)` — committed first; confirmed RED by temporarily reverting `schema.ts` to its pre-30-02 HEAD content and re-running the extended test file (4 of 22 cases failed as expected: instruments/ai_suggested/pending cases).
- `feat(30-02): add INSTRUMENT controlled vocab + descriptor v2 (additive)` — committed after restoring the implementation; confirmed GREEN (22/22 passed) + `tsc --noEmit` clean.

Tasks 2 and 3 (`type="auto"`, no `tdd="true"` flag) followed the plan's "write the test first" instruction internally (test files authored before their corresponding implementation modules existed, so the initial `npx jest` run would have failed to resolve the module) but were committed as single atomic `feat(...)` commits per the standard `type="auto"` protocol, each already green at commit time.

## Deviations from Plan

None — plan executed exactly as written. One clarifying implementation choice not explicitly specified by the plan (documented above under `decisions`): `TagSuggestion`'s extra `genres` field, since the plan's prompt spec asked for a `genres` suggestion but `TrackDescriptors.ai_suggested` (as defined in Task 1) does not carry a `genres` field — genres live at the project level (`vault_projects.genre`), not per-track descriptors. `coerceSuggestion`'s output is still structurally compatible with `descriptors.ai_suggested` (all of moods/energy/vocal/instruments/suggested_at/model match); `genres` is additional informational output for whichever future caller (30-06) decides where a suggested genre should land.

## What the Next Executor/Owner Should Know

- **30-06** (AI tag-suggest / tag-propose / tag-approve routes) is the direct consumer of all three modules built here. It will need to resolve the caller's `StaffRole` server-side and pass the plain role string into `isTagApprover`/`proposeStaffRefinement` — no `StaffRole` import was added here since `'anr'` doesn't exist on that union yet.
- **30-03** (owner-run migration) must widen `funun_staff.staff_role`'s CHECK constraint and `lib/admin/staff-role.ts`'s `StaffRole` union + `ALL_STAFF_ROLES` to include `'anr'`. `TAG_APPROVER_ROLES`/`isTagApprover` in `tag-merge.ts` already anticipate this (they accept a plain `string`, not the `StaffRole` type, precisely so this plan doesn't need to depend on 30-03).
- No migration was needed or run in this plan — `tracks.metadata` is unconstrained JSONB, so the descriptor v2 shape (`instruments`/`ai_suggested`/`staff_refined_by`/`pending`) is purely additive at the TypeScript layer.
- `INSTRUMENT_VALUES` in `lib/metadata/schema.ts` and `CatalogBrowserLight.tsx`'s `FILTER_OPTIONS.Instruments` fixture (`['Piano', 'Strings', 'Guitar', 'Synth', 'Brass']`) are NOT yet unified — the fixture uses capitalized display strings, the new vocab uses lowercase tokens (`piano`, `strings`, ...). Wiring the buyer-facing filter UI onto the shared vocab (and/or live catalogue rows) is out of this plan's scope; flagged here so 30-07/30-08/22-05-adjacent work doesn't silently duplicate a second instrument list.

## Known Stubs

None — this plan ships pure logic + Jest coverage only, no UI or routes with placeholder data.

## Threat Flags

None beyond what the plan's `<threat_model>` already covers (T-30-04, T-30-08, T-30-14 all directly mitigated by the modules built here; no new network endpoints, auth paths, or schema changes were introduced).

## Self-Check: PASSED

- `lib/tagging/ai-tag.ts` — FOUND
- `lib/tagging/ai-tag.test.ts` — FOUND
- `lib/tagging/tag-merge.ts` — FOUND
- `lib/tagging/tag-merge.test.ts` — FOUND
- `lib/metadata/schema.ts` (modified) — FOUND
- `lib/metadata/descriptors.test.ts` (modified) — FOUND
- Commit `454025e` (test: descriptor v2 RED) — FOUND in `git log`
- Commit `2d4c3f1` (feat: descriptor v2 GREEN) — FOUND in `git log`
- Commit `d876714` (feat: ai-tag.ts) — FOUND in `git log`
- Commit `857da77` (feat: tag-merge.ts) — FOUND in `git log`
