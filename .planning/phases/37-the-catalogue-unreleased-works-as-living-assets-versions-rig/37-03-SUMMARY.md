---
phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig
plan: 03
subsystem: catalogue
tags: [typescript, pure-functions, ddex, split-sheets, ai-disclosure, jest]

requires:
  - phase: 17-split-sheet-esign
    provides: evenSplit(), validateApprovalTotal() (lib/split-sheets/approval.ts) and LIVING_DRAFT_STATUSES / assertEditable() (lib/split-sheets/lifecycle.ts) — reused, never reimplemented
provides:
  - "resolveCitation()/resolveLevel()/resolveCrateConsequence()/composeReceipt() — the CAT-Q3 AI-entry hygiene logic, structurally incapable of citing generated material as performance"
  - "planWriterPromotion()/planWriterRemoval()/writersMissingFromSheet() — the CAT-Q1a equal-split living-draft redraft, with no contribution-weighted code path anywhere"
  - "resolveGuidingLine() — the single next-best-step resolver with three independent nudge-cadence gates"
affects: [ai-entries-route, members-route, guiding-line-component, split-sheets]

tech-stack:
  added: []
  patterns:
    - "Structural rule enforcement: a doctrine rule (when-in-doubt citation) enforced by making the unsafe code path unreachable, not by a validation check that could be bypassed"
    - "Reuse-not-rewrite: pure hygiene modules import split-sheet primitives (evenSplit, validateApprovalTotal, LIVING_DRAFT_STATUSES, assertEditable) rather than re-deriving them"
    - "Identity-key sharing across modules (lib/catalogue/splits.ts's identityKey(), reused by guiding-line.ts) so two independent pure modules agree on one contributor-identity scheme"

key-files:
  created:
    - lib/catalogue/ai-entries.ts
    - lib/catalogue/ai-entries.test.ts
    - lib/catalogue/splits.ts
    - lib/catalogue/splits.test.ts
    - lib/catalogue/guiding-line.ts
    - lib/catalogue/guiding-line.test.ts
  modified: []

key-decisions:
  - "resolveCitation() has no code path from mode='generate' to the safe citation, and no code path from mode='performance' + hasHumanSource=false to it either — the when-in-doubt rule is unreachable-by-construction, not a runtime check that could be relaxed by a future edit"
  - "Crate eligibility resolves per component: 'full' is never eligible (the whole master is AI-rendered, regardless of mode); 'vocal' eligibility follows hasHumanSource alone per the BGV clause (mode-independent, since swap and generate both reduce to 'can you point to the human take'); instrument/lyric/melody at component level are always eligible+disclosed (only the two named disqualifiers block the Crate, nothing else)"
  - "evenSplit(n) alone does not sum to 100 for n that doesn't divide evenly (evenSplit(3)*3 = 99.999) — lib/catalogue/splits.ts adds a local residue-correction step (equalShares()) on top of evenSplit(), rather than pulling in lib/split-sheets/redistribute.ts, to keep this module's dependency surface exactly as the plan scoped it (approval.ts + lifecycle.ts only)"
  - "Writer-promotion identity matching is id-only (collaboratorId or userId) — never falls back to name matching, since two different humans can share a display name and silently merging them into one party is worse than failing to dedupe a genuine re-promotion"
  - "The 37.1-inert ddex_gap and crate_qualifies guiding-line steps are declared as real resolver functions that always return null (not just placeholders in the priority array), so GUIDING_LINE_PRIORITY's order is provably correct and plan 10's component needs no reshuffle when the 37.2 destination doors land"

patterns-established:
  - "A doctrine rule that must never leak into a component gets enforced in the type/control-flow of a pure lib/ module (e.g. WorkMember has no percentage field at all — a caller cannot construct a nudge that names a number even by mistake)"

requirements-completed: [S-01, S-02]

coverage:
  - id: D1
    description: "resolveCitation() enforces the when-in-doubt rule: the safe/maximal-ownership citation is returned only for mode='performance' with a human source present; mode='generate' and mode='performance' without a human source both route away from it"
    requirement: S-01
    verification:
      - kind: unit
        ref: "lib/catalogue/ai-entries.test.ts#resolveCitation"
        status: pass
    human_judgment: false
  - id: D2
    description: "resolveLevel() places performance entries at version-level and generated lyric/melody entries at work-level per CAT-Q3"
    requirement: S-01
    verification:
      - kind: unit
        ref: "lib/catalogue/ai-entries.test.ts#resolveLevel"
        status: pass
    human_judgment: false
  - id: D3
    description: "resolveCrateConsequence() implements the two disqualifiers (wholly-AI master, AI vocal with no human source) and the disclosure tier, with the one-pass fix surfaced for a refused vocal"
    requirement: S-01
    verification:
      - kind: unit
        ref: "lib/catalogue/ai-entries.test.ts#resolveCrateConsequence"
        status: pass
    human_judgment: false
  - id: D4
    description: "composeReceipt() always returns exactly four statements (citation, splits, release, Crate), with a constant zero-effect splits statement across every mode/component/hasHumanSource combination, and no vendor/tool name in any returned string"
    requirement: S-01
    verification:
      - kind: unit
        ref: "lib/catalogue/ai-entries.test.ts#composeReceipt"
        status: pass
    human_judgment: false
  - id: D5
    description: "isFirstEverAiEntry() routes the account's first-ever AI entry to the conversational flow"
    requirement: S-01
    verification:
      - kind: unit
        ref: "lib/catalogue/ai-entries.test.ts#isFirstEverAiEntry"
        status: pass
    human_judgment: false
  - id: D6
    description: "planWriterPromotion()/planWriterRemoval() redraft the living split sheet to equal shares (evenSplit-based, residue-corrected to pass validateApprovalTotal), are idempotent on an already-present writer, and refuse outside the living-draft states via the existing lifecycle gate"
    requirement: S-02
    verification:
      - kind: unit
        ref: "lib/catalogue/splits.test.ts#planWriterPromotion"
        status: pass
      - kind: unit
        ref: "lib/catalogue/splits.test.ts#planWriterRemoval"
        status: pass
    human_judgment: false
  - id: D7
    description: "writersMissingFromSheet() returns only work members who have contributed and are absent from the sheet, as people with no percentage field on the return type"
    requirement: S-02
    verification:
      - kind: unit
        ref: "lib/catalogue/splits.test.ts#writersMissingFromSheet"
        status: pass
    human_judgment: false
  - id: D8
    description: "resolveGuidingLine() returns at most one step (never an array), following the decided priority rotation, and all three cadence gates (fired-once-per-contributor, dismissible, doors-only silencer) work independently"
    requirement: S-01
    verification:
      - kind: unit
        ref: "lib/catalogue/guiding-line.test.ts#resolveGuidingLine — priority selection"
        status: pass
      - kind: unit
        ref: "lib/catalogue/guiding-line.test.ts#resolveGuidingLine — cadence gates"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-08-30
status: complete
---

# Phase 37 Plan 03: The hygiene + splits pure logic Summary

**Three pure `lib/catalogue/` modules — AI-citation hygiene, equal-split living-draft redraft, and the one-line guiding nudge — that make CAT-Q1a and CAT-Q3's locked rules structurally unbreakable rather than merely UI-enforced.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-30T11:12:00Z
- **Completed:** 2026-08-30T11:34:23Z
- **Tasks:** 3/3 completed
- **Files modified:** 6 created (3 modules + 3 test suites)

## Accomplishments

- `lib/catalogue/ai-entries.ts` — `resolveCitation()` makes the when-in-doubt rule structural: there is no code path through which a generated element, or a performed element with no human source on file, can reach the safe "AI reference vocal — performed a human-written melody, demo only" citation. `resolveLevel()` implements the work/version placement split. `resolveCrateConsequence()` implements the two Crate disqualifiers (wholly-AI master; AI vocal with no traceable human take — the BGV clause) plus the disclosure tier for component-level AI content. `composeReceipt()` always returns the four-statement receipt with a hard-constant zero splits effect.
- `lib/catalogue/splits.ts` — `planWriterPromotion()`/`planWriterRemoval()` redraft the living split sheet to equal shares on every add/remove, reusing `evenSplit()`/`validateApprovalTotal()` (approval.ts) and the living-draft gate (`LIVING_DRAFT_STATUSES` + `assertEditable()`, lifecycle.ts) rather than a new status check. `writersMissingFromSheet()` returns people with no percentage field on the return type — structurally incapable of naming a number.
- `lib/catalogue/guiding-line.ts` — `resolveGuidingLine()` returns a single `GuidingLineStep | null`, following the splits → hum-to-claim → DDEX-gap → Crate-qualifies rotation, with three independent cadence gates (fired-once-per-contributor, per-step dismissal, doors-only global silencer).
- All three modules import only pure logic (no Supabase client, no I/O) and pass `npx tsc --noEmit`, `npm run lint --max-warnings=0`, and the full `npx jest` suite (297 suites / 3311 tests, including every pre-existing `lib/split-sheets/*.test.ts` suite untouched by this plan).

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/catalogue/ai-entries.ts** — `6c9818d` (feat)
2. **Task 2: lib/catalogue/splits.ts** — `3616f79` (feat)
3. **Task 3: lib/catalogue/guiding-line.ts** — `ce0ae61` (feat)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `lib/catalogue/ai-entries.ts` — DDEX component/mode vocabulary, `resolveCitation()`, `resolveLevel()`, `resolveCrateConsequence()`, `composeReceipt()`, `isFirstEverAiEntry()`.
- `lib/catalogue/ai-entries.test.ts` — one describe block per export, plus a full mode×component×hasHumanSource sweep asserting the splits effect is always zero.
- `lib/catalogue/splits.ts` — `PartyIdentity`/`LivingDraftParty`/`WorkMember` types, `identityKey()`, `planWriterPromotion()`, `planWriterRemoval()`, `writersMissingFromSheet()`.
- `lib/catalogue/splits.test.ts` — promotion/removal/no-op/status-gate/missing-writer coverage, including a three-writer redraft asserted against `validateApprovalTotal()`.
- `lib/catalogue/guiding-line.ts` — `GuidingLineStepKey`/`GUIDING_LINE_PRIORITY`/`GuidingLineStep`/`GuidingLineSnapshot` types, `resolveGuidingLine()`.
- `lib/catalogue/guiding-line.test.ts` — priority-selection and cadence-gate describe blocks, including a three-simultaneous-candidate fixture and an explicit "never an array" assertion.

## Decisions Made

- **Crate consequence resolved per component, not per (mode, component) pair.** `full` is never eligible regardless of mode (worked example 2's genre-flip remix — an AI-*performed* whole track is still a wholly-AI-rendered master). `vocal` eligibility follows `hasHumanSource` alone, independent of mode, since the BGV clause's actual test ("can you point to the human take it came from") doesn't distinguish swap from generate. This is a more precise reading than a naive `mode === 'generate'` branch would have produced, and is covered by an explicit test (`resolveCrateConsequence — is not eligible for a whole performed track either`).
- **`splitReminderSetting` and `dismissedStepKeys`/`splitsNudgeFiredFor` shapes were designed, not specified verbatim in the plan** (the plan describes the cadence rule in prose, not a concrete snapshot shape). Chose string-keyed sets (`dismissedStepKeys: string[]`, namespacing the splits dismissal as `` `splits:${identityKey}` `` so a single generic set serves both step-level and per-contributor dismissal) to keep `GuidingLineSnapshot` a single flat, easily-serializable object for plan 12's caller.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `evenSplit(n)` alone fails `validateApprovalTotal()` for the required 3-writer case**
- **Found during:** Task 2 (`lib/catalogue/splits.ts`)
- **Issue:** The plan's behavior spec requires "Promoting a third yields three parties at the value `evenSplit(3)` returns, and their sum passes `validateApprovalTotal()`." `evenSplit(3)` is 33.333; three of those sum to 99.999, which `validateApprovalTotal()` rejects (it requires the sum to round to exactly 100.000). This isn't unique to n=3 — n=7 also fails (14.286 × 7 = 100.002). A literal "every party gets `evenSplit(n)`" implementation would produce an invariant-violating redraft on the very case the plan's own behavior line names.
- **Fix:** Added a local `equalShares(n)` helper that computes `evenSplit(n)` per party and applies the leftover rounding residue to the first party (deterministic on a tie, since every base share is identical). `equalRedraft()` then asserts the result against `validateApprovalTotal()` as a runtime invariant (throws if it ever fails — a bug detector for this module, not a business-logic branch). This mirrors the residue-correction pattern already established in `lib/split-sheets/redistribute.ts`'s `evenDistribution()`, but is implemented locally in `splits.ts` rather than importing `redistribute.ts`, to keep this module's dependency surface exactly as the plan scoped it (`approval.ts` + `lifecycle.ts` only).
- **Files modified:** `lib/catalogue/splits.ts` (within the same task's original file set — no new file).
- **Verification:** `splits.test.ts`'s three-writer test asserts `validateApprovalTotal()` returns `true` and that every share is either `evenSplit(3)` (33.333) or `evenSplit(3)` plus the one-thousandth residue (33.334).
- **Committed in:** `3616f79` (part of Task 2's commit — the fix was applied before the task was ever verified green, not as a follow-up).

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug fix, required for the plan's own stated behavior to be achievable at all).
**Impact on plan:** No scope creep — the fix is contained entirely within the already-scoped `lib/catalogue/splits.ts` file and its own test suite; no additional file was created or imported beyond what the plan's task already listed.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None — no external service configuration required. All three modules are pure TypeScript with zero I/O and zero new dependencies (threat T-37-SC in the plan's threat model: no package-manager install task exists in this plan).

## Next Phase Readiness

- `resolveCitation()`/`composeReceipt()` are ready for plan 06's ai-entries route to call server-side at write time and persist the resulting strings on the `ai_entries` row.
- `planWriterPromotion()` is ready for plan 05's members route to call on an explicit writer-promotion action (never from plain member creation).
- `resolveGuidingLine()` is ready as the single input to plan 10's `GuidingLine` component, once plan 12 assembles a `GuidingLineSnapshot` from its own already-fetched page data.
- No blockers. The `ddex_gap` and `crate_qualifies` guiding-line steps remain intentionally inert until the 37.2 destination doors (sketch 004) exist — `GUIDING_LINE_PRIORITY`'s order is already locked for that day.

---
*Phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig*
*Completed: 2026-08-30*

## Self-Check: PASSED

All 6 created files verified present on disk; all 3 task commits (6c9818d, 3616f79, ce0ae61) verified present in `git log --oneline --all`.
