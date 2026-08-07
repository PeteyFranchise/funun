---
phase: 19-profile-identity-model-cleanup
plan: 01
subsystem: database
tags: [typescript, jest, profile, split-sheets, migration-twin]

# Dependency graph
requires:
  - phase: 18-split-sheet-home
    provides: resolvePartyIdentity() live-link resolver + freeze boundary (lib/split-sheets/live-identity.ts), the Phase 18-04 coverage-fixtures.ts pure-twin/structural-proxy precedent this plan follows
provides:
  - "lib/profile/semantic-blank.ts — pure semantic-blank + field-mapping twin migration 071 mirrors"
  - "lib/profile/claim-prefill.ts — pure conflict-resolution + idempotency twin migration 072's reverse pre-fill mirrors, exporting the shared claim_prefill JSONB entry shape"
  - "Regression coverage confirming lib/split-sheets/live-identity.ts's esign_pending/executed freeze boundary is unchanged (test already existed from Phase 18-05; re-verified green, zero source changes)"
affects: [19-03-migrations-rescue, 19-04-migrations-repoint, 19-05-settings-confirm-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SQL-parity pure-TS twin: Jest cannot execute PL/pgSQL, so migration logic (semantic-blank rescue, claim-prefill conflict/idempotency) is extracted into a pure, dependency-free TS module the migration's SQL is written to match exactly — same approach as Phase 18-04's coverage-fixtures.ts"

key-files:
  created:
    - lib/profile/semantic-blank.ts
    - lib/profile/claim-prefill.ts
    - __tests__/rescue-semantic-blank.test.ts
    - __tests__/claim-prefill.test.ts
  modified: []

key-decisions:
  - "lib/split-sheets/live-identity.test.ts already existed (committed in Phase 18-05, commit 71cce12) and already fully covers the R3 freeze-boundary acceptance criteria — no new file or commit was needed for Task 3; re-ran it green and confirmed live-identity.ts is byte-unchanged via git diff"
  - "rescueValue()/shouldPrefill() take an explicit RescueKind ('text'|'json') parameter rather than type-detecting canonical/stranded values, so the same predicate machinery serves both the plain-text fields (pro/ipi/publisher/phone/display_name/bio) and the JSONB mailing_address field without a generic isEmpty() utility (per 19-RESEARCH's Don't-Hand-Roll guidance)"
  - "ClaimPrefillCandidate<T> is an open (index-signature) type carrying only {value, updated_at, ...} rather than a closed shape requiring source_collaborator_id/source_name on every candidate — pickWinningSource() only needs updated_at to resolve conflicts; the full ClaimPrefillEntry provenance shape is built separately by buildClaimPrefillEntry() once a winner is chosen"

patterns-established:
  - "Pattern: SQL-migration parity twin — a small, dependency-free TS module exporting the exact blank/conflict/idempotency predicates a forthcoming SQL migration will implement, tested in isolation before the migration is authored, giving downstream migration plans a machine-checked contract to match"

requirements-completed: [R1, R2, R3]

coverage:
  - id: D1
    description: "Semantic-blank detection (isSemanticBlankText/isSemanticBlankJson) treats NULL, trimmed-empty text, and empty-JSON {} as blank; rescueValue() is canonical-wins; RESCUE_FIELD_MAP covers phone->contact_phone, display_name->artist_name, bio->bio, pro/ipi/publisher/mailing_address"
    requirement: R1
    verification:
      - kind: unit
        ref: "__tests__/rescue-semantic-blank.test.ts (14 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Claim pre-fill idempotency guard (shouldPrefill) never overwrites a confirmed or non-blank field, re-fills a still-blank unconfirmed field; pickWinningSource resolves source conflicts to most-recent by updated_at; buildClaimPrefillEntry produces an unconfirmed entry with the inviting-artist source_name (D-03)"
    requirement: R2
    verification:
      - kind: unit
        ref: "__tests__/claim-prefill.test.ts (11 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "resolvePartyIdentity() freeze boundary (esign_pending/executed return the frozen snapshot even with a differing claimed profile; draft/pending_approval/approved/countered live-resolve) is unchanged — regression coverage confirmed, no source modification"
    requirement: R3
    verification:
      - kind: unit
        ref: "lib/split-sheets/live-identity.test.ts (20 tests, pre-existing from Phase 18-05)"
        status: pass
    human_judgment: false

# Metrics
duration: 5min
completed: 2026-07-24
status: complete
---

# Phase 19 Plan 01: Semantic-Blank + Claim-Prefill Parity Twins Summary

**Two pure-TypeScript SQL-parity twins (semantic-blank rescue + claim-prefill conflict/idempotency) plus a re-verified R3 freeze-boundary regression test, giving Phase 19's forthcoming migrations (071/072) a machine-checked contract before any SQL is written**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-07-24
- **Tasks:** 3 (2 executed as new TDD RED/GREEN pairs; 1 found already satisfied)
- **Files modified:** 4 (2 new modules + 2 new tests; 0 modified)

## Accomplishments
- `lib/profile/semantic-blank.ts` — `isSemanticBlankText()`, `isSemanticBlankJson()`, `rescueValue()` (canonical-wins), and `RESCUE_FIELD_MAP` (the exact source→target column mapping migration 071's rescue UPDATE will implement, including the `{}`-address and `''`-PRO cases from the SPEC)
- `lib/profile/claim-prefill.ts` — the shared `ClaimPrefillEntry` shape, `pickWinningSource()` (most-recent-by-`updated_at` conflict resolution), `shouldPrefill()` (idempotency guard), and `buildClaimPrefillEntry()` — the single contract migration 072's reverse pre-fill and the 19-05 confirm UI both build against
- Confirmed `lib/split-sheets/live-identity.ts`'s R3 freeze boundary already has full regression coverage (pre-existing from Phase 18-05) and remains green with zero source changes

## Task Commits

Each task was committed atomically (TDD RED/GREEN pairs for Tasks 1-2):

1. **Task 1: Semantic-blank rescue twin (R1)**
   - `8db5d01` (test) — failing test for `lib/profile/semantic-blank.ts`
   - `a0cbaef` (feat) — implementation, green
2. **Task 2: Claim pre-fill conflict + idempotency twin (R2)**
   - `3a06891` (test) — failing test for `lib/profile/claim-prefill.ts`
   - `3b403a4` (feat) — implementation, green
3. **Task 3: R3 freeze-boundary regression test** — no new commit; `lib/split-sheets/live-identity.test.ts` already existed and passed (Phase 18-05, `71cce12`) — see Deviations below

_TDD tasks used the RED-then-GREEN two-commit pattern per this plan's `tdd="true"` tasks._

## Files Created/Modified
- `lib/profile/semantic-blank.ts` - Pure semantic-blank predicates + canonical-wins rescue + field mapping (migration 071's TS twin)
- `lib/profile/claim-prefill.ts` - Pure conflict-resolution + idempotency twin + shared claim_prefill entry shape (migration 072's TS twin)
- `__tests__/rescue-semantic-blank.test.ts` - 14 tests covering text/JSON blank detection, canonical-wins rescue, field map
- `__tests__/claim-prefill.test.ts` - 11 tests covering idempotency guard, conflict resolution, provenance shape

## Decisions Made
- `rescueValue()`/`shouldPrefill()` take an explicit `RescueKind` parameter (`'text' | 'json'`) rather than runtime type-detecting the canonical/stranded values, so one predicate pair serves both plain-text fields and the JSONB `mailing_address` field without a generic `isEmpty()` utility (per 19-RESEARCH.md's "Don't Hand-Roll" guidance)
- `ClaimPrefillCandidate<T>` is an open shape (`{ value, updated_at, [key: string]: unknown }`) rather than requiring full provenance fields on every conflict candidate — `pickWinningSource()` only needs `updated_at` to resolve conflicts; `buildClaimPrefillEntry()` separately produces the full `ClaimPrefillEntry` once a winner is chosen

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, in the plan's premise] Task 3's stated gap ("currently NO test for this load-bearing module") was stale — the file already existed and already passed**
- **Found during:** Task 3 (R3 freeze-boundary regression test)
- **Issue:** 19-RESEARCH.md and this plan's Task 3 both stated `lib/split-sheets/live-identity.test.ts` did not exist. A repo check showed it was already created and committed in Phase 18-05 (`71cce12 feat(18-05): pure live-identity resolver (resolvePartyIdentity)`), and it already covers exactly the assertions Task 3 specifies: `esign_pending`/`executed` return the frozen snapshot even with a conflicting claimed profile; `draft`/`pending_approval`/`approved`/`countered` live-resolve; unclaimed parties always return frozen; the resolver never mutates its input.
- **Fix:** No file was written. Ran `npx jest lib/split-sheets/live-identity.test.ts` (20 tests, all pass) and `git diff --stat` against `lib/split-sheets/live-identity.ts` across the relevant commit range (empty diff) to confirm the source is untouched and the regression guard is genuinely in place.
- **Files modified:** none
- **Verification:** `npx jest lib/split-sheets/live-identity.test.ts` — 20/20 passing; `git log --oneline -- lib/split-sheets/live-identity.test.ts` shows it originates from `71cce12`, predating this plan
- **Committed in:** n/a (no new commit required)

---

**Total deviations:** 1 (a stale plan/research premise, not a code issue)
**Impact on plan:** None on scope or correctness — R3's acceptance criteria were already machine-locked one phase earlier than this plan's research anticipated. No rework, no risk introduced.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. This plan is pure TypeScript logic with zero I/O; no migration was pushed (per this plan's explicit "no migration push" scope — that happens in 19-03/19-04/19-07).

## Next Phase Readiness
- `lib/profile/semantic-blank.ts` and `lib/profile/claim-prefill.ts` are ready for 19-03 (rescue migration) and 19-04 (function re-point + `claim_prefill` column) to mirror exactly — both modules are the machine-checked SQL-parity contract those migrations must match.
- `ClaimPrefillEntry`'s shape is locked for 19-05's Settings confirm-and-lock UI to consume without drift.
- R3's freeze boundary has verified, unchanged regression coverage — 19-03/19-04's table changes are free to proceed without re-litigating this behavior.
- No blockers.

---
*Phase: 19-profile-identity-model-cleanup*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: lib/profile/semantic-blank.ts
- FOUND: lib/profile/claim-prefill.ts
- FOUND: __tests__/rescue-semantic-blank.test.ts
- FOUND: __tests__/claim-prefill.test.ts
- FOUND: lib/split-sheets/live-identity.test.ts
- FOUND: commit 8db5d01 (test: semantic-blank RED)
- FOUND: commit a0cbaef (feat: semantic-blank GREEN)
- FOUND: commit 3a06891 (test: claim-prefill RED)
- FOUND: commit 3b403a4 (feat: claim-prefill GREEN)
