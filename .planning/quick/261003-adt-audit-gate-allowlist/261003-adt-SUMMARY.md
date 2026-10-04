---
phase: quick-261003-adt
plan: 01
subsystem: ci
tags: [npm-audit, supply-chain, security, ci, dated-deferral]

requires: []
provides:
  - "scripts/audit-gate.ts — dependency-free CI gate with self-expiring, dated advisory deferrals"
  - "npm run audit:gate script"
  - "quality.yml validate job no longer blocked repo-wide by the unpatchable braces/GHSA-vfj7-8cjw-p6xm chain"
affects: [ci, npm-audit, security-gate]

tech-stack:
  added: []
  patterns:
    - "Dated, self-expiring deferral records (not a permanent allowlist) for unpatchable dev-only advisories"
    - "Severity threshold applied in-process rather than via an npm CLI flag, for unit-testability"
    - "Recursive resolution of npm audit's mixed `via` array (string refs + advisory objects) with a cycle guard"

key-files:
  created:
    - scripts/audit-gate.ts
    - scripts/audit-gate.test.ts
  modified:
    - package.json
    - .github/workflows/quality.yml
    - .claude/CLAUDE.md

key-decisions:
  - "Named the concept a DEFERRAL, not an allowlist — the name is only honest because expiry is enforced (label-integrity-funun)"
  - "An expired deferral fails the build (D-02); a stale one (advisory already fixed) only warns (D-03); an unparseable expires date fails closed (D-04)"
  - "Suppression requires ALL of a package's resolved advisories to be covered, not any one (D-07)"
  - "Severity threshold applied in our own code with no --audit-level flag on npm audit, so it is directly unit-testable (D-06)"
  - "Zero new npm dependencies; package-lock.json is byte-unchanged (D-09)"

requirements-completed: [QUICK-261003-adt]

coverage:
  - id: D1
    description: "npm run audit:gate exits 0 today, with all 7 advisories in the braces chain suppressed by the single dated deferral (not just braces)"
    requirement: QUICK-261003-adt
    verification:
      - kind: unit
        ref: "scripts/audit-gate.test.ts#evaluate > suppresses all 7 packages with one active deferral for the shared GHSA"
        status: pass
      - kind: other
        ref: "npx tsx scripts/audit-gate.ts (live run against this tree) -> exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "resolveAdvisories walks npm audit's mixed via array recursively with a cycle guard, so eslint-config-next resolves to GHSA-vfj7-8cjw-p6xm through the 5-hop string chain"
    requirement: QUICK-261003-adt
    verification:
      - kind: unit
        ref: "scripts/audit-gate.test.ts#resolveAdvisories > resolves eslint-config-next to the braces advisory through the 5-hop string chain"
        status: pass
      - kind: unit
        ref: "scripts/audit-gate.test.ts#resolveAdvisories > terminates on a cyclic via graph instead of exhausting the stack"
        status: pass
    human_judgment: false
  - id: D3
    description: "Expired deferral stops suppressing (7 failures) and is reported with its lapse date; stale deferral warns and exits 0; malformed expires date fails closed; unparseable npm audit output is a hard failure"
    requirement: QUICK-261003-adt
    verification:
      - kind: unit
        ref: "scripts/audit-gate.test.ts#evaluate > fails all 7 packages once the deferral has expired, and lists it as expired"
        status: pass
      - kind: unit
        ref: "scripts/audit-gate.test.ts#evaluate > reports a deferral matching nothing in the report as stale, with zero failures"
        status: pass
      - kind: unit
        ref: "scripts/audit-gate.test.ts#evaluate > reports an unparseable expires as invalid and suppresses nothing"
        status: pass
      - kind: unit
        ref: "scripts/audit-gate.test.ts#evaluate > throws when the report has no vulnerabilities key (D-05)"
        status: pass
    human_judgment: false
  - id: D4
    description: "npm audit --omit=dev --audit-level=moderate stays byte-identical in quality.yml with no deferral path; package-lock.json unchanged; CLAUDE.md Verification Gate matches the workflow, locked by a guard test"
    requirement: QUICK-261003-adt
    verification:
      - kind: unit
        ref: "scripts/audit-gate.test.ts#Verification Gate doc/workflow drift guard > lists every npm-invoking validate-job step, with none missing and none left over"
        status: pass
      - kind: unit
        ref: "scripts/audit-gate.test.ts#Verification Gate doc/workflow drift guard > keeps the production audit line byte-identical in both files, with no deferral path"
        status: pass
      - kind: other
        ref: "git diff --stat package-lock.json (empty output, confirmed byte-unchanged)"
        status: pass
    human_judgment: false

duration: ~55min
completed: 2026-10-03
status: complete
---

# Quick Task 261003-adt: Dated Audit Deferral Gate Summary

**Replaced the CI-wide-blocking `npm audit --audit-level=high` step with `scripts/audit-gate.ts` — a dependency-free gate that recursively resolves npm audit's mixed `via` array so a single dated, self-expiring deferral correctly suppresses all 7 advisories in the unpatchable `braces` chain, not just the one package that happens to carry the advisory object.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-10-03
- **Tasks:** 3/3 completed
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Built `scripts/audit-gate.ts`: pure, exported, unit-testable functions (`resolveAdvisories`, `advisoryId`, `classifyDeferral`, `evaluate`) plus a `runNpmAudit()` CLI wrapper and `main()`. Exports `AUDIT_DEFERRALS: readonly AuditDeferral[]` with one entry (advisory `GHSA-vfj7-8cjw-p6xm`, package `braces`, approved `2026-10-03`, expires `2026-11-02`).
- `resolveAdvisories` walks npm audit's mixed `via` array recursively with a visited-set cycle guard. Verified directly (not just through the aggregate) that `eslint-config-next` resolves to `GHSA-vfj7-8cjw-p6xm` across the full 5-hop string chain (`eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces -> GHSA-vfj7-8cjw-p6xm`).
- `evaluate()` requires ALL of a package's resolved advisories to be covered by an active deferral before suppressing it (D-07) — a package with a second, undeferred advisory still fails.
- Wrote `scripts/audit-gate.test.ts`: 21 fixture-driven tests against a hand-built, shape-faithful reproduction of the real 7-entry `via` graph measured from this tree's live `npm audit --json`. No network, no clock dependence — every case passes `now` explicitly.
- Wired `audit:gate` into `package.json` (`tsx scripts/audit-gate.ts`), swapped the CI step in `.github/workflows/quality.yml`, and updated the `.claude/CLAUDE.md` Verification Gate section to reference the new command.
- Added a guard test (appended to `scripts/audit-gate.test.ts`) that reads both `quality.yml` and `CLAUDE.md` off disk and fails if the Verification Gate command list ever drifts from the actual `validate` job steps, and asserts the production `--omit=dev` audit line stays byte-identical in both files.

## Task Commits

1. **Task 1: Build the dependency-free audit gate with self-expiring deferrals** — `360772c6` (feat)
2. **Task 2: Fixture-driven unit tests for the gate's pure logic** — `8f7ecd3b` (test)
3. **Task 3: Wire the gate into package.json, CI, and the Verification Gate doc** — `e3c9146e` (chore)

_Note: Task 2's commit contains the pure fixture tests only; Task 3's commit appends the Verification Gate drift-guard test to the same file, matching the plan's task-to-file ownership._

**Plan metadata:** committed separately by the orchestrator (not by this executor, per branch instructions).

## Files Created/Modified

- `scripts/audit-gate.ts` — the gate: types, `AUDIT_DEFERRALS`, `resolveAdvisories`, `advisoryId`, `classifyDeferral`, `evaluate`, `runNpmAudit`, `main`.
- `scripts/audit-gate.test.ts` — 21 tests: pure-function cases (Task 2) plus the Verification Gate drift guard (Task 3).
- `package.json` — added `"audit:gate": "tsx scripts/audit-gate.ts"` to `scripts`. No dependency added to either dependency block.
- `.github/workflows/quality.yml` — line 32 (`- run: npm audit --audit-level=high`) replaced with a named `npm run audit:gate` step. Line 31 (`npm audit --omit=dev --audit-level=moderate`) is untouched.
- `.claude/CLAUDE.md` — Verification Gate fenced command block's sixth line now reads `npm run audit:gate`, annotated inline; added one `Notes:` bullet stating that a lapsed deferral going red is the mechanism working as designed, not something to silence by pushing the date out.

## Decisions Made

- **"Deferral", never "allowlist" or "allow list"** — per `label-integrity-funun`, confirmed zero case-insensitive occurrences of "allowlist" in the committed script (including in explanatory comments, which initially used the word as a contrast and were rewritten to avoid it entirely).
- **Severity threshold applied in-process** (`SEVERITY_ORDER`), with `npm audit --json` called with no `--audit-level` flag, per D-06.
- **Stale deferrals warn, do not fail** (D-03) — a stale entry means the advisory was fixed, and failing CI on a successful dependency upgrade teaches bypass.
- **Expired and invalid-date deferrals both hard-fail** (D-02, D-04) — expiry and date-format are correctness gates, not decoration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Initial draft used the word "allowlist" in explanatory comments, failing the plan's own verify step**
- **Found during:** Task 1, self-verification against the plan's automated check `grep -v '^#' scripts/audit-gate.ts | grep -ci 'allowlist' | grep -qx 0`
- **Issue:** Comments contrasting "deferral" against "allowlist" (to explain D-01's reasoning) contained the literal word "allowlist" 4 times, which the plan's own verify gate forbids — the file must never use a term that asserts permanent permission, even in prose explaining why it doesn't.
- **Fix:** Rewrote the two comment blocks to state the same reasoning (time-bounded suspension vs. permanent permission) without using the word "allowlist" anywhere in the file.
- **Files modified:** `scripts/audit-gate.ts`
- **Verification:** `grep -v '^#' scripts/audit-gate.ts | grep -ci 'allowlist'` now returns `0`. Re-ran typecheck, lint, and `npx tsx scripts/audit-gate.ts` (still exits 0) after the edit.
- **Committed in:** `360772c6` (part of Task 1's commit — caught before any commit was made)

**2. [Rule 3 - Blocking] Drift-guard test's step-extraction regex initially missed named CI steps**
- **Found during:** Task 3, first run of the new guard test
- **Issue:** The guard test's regex (`/- run: npm .../`) only matched inline `- run: npm foo` steps. Two steps in `quality.yml` are named (`- name: ...` followed by `run: npm foo` on its own line, unindented by `- `): `Verify security migration package` and the new `Audit gate (dated, self-expiring deferrals)` step. The regex silently excluded both, so the guard would have passed even if the doc dropped `security:migrations:verify` or `audit:gate` entirely — exactly the vacuous-check trap the guard exists to prevent.
- **Fix:** Changed the extraction regex to `/run:\s*(npm [^\n]+)/g` (matching `run:` regardless of leading `- `), with an explicit filter excluding `npm ci` (a setup step, not a verification command the doc documents).
- **Files modified:** `scripts/audit-gate.test.ts`
- **Verification:** Re-ran the guard test; it now correctly extracts all 6 `validate`-job verification commands and matches them 1:1 against the `CLAUDE.md` Verification Gate block.
- **Committed in:** `e3c9146e` (part of Task 3's commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 3)
**Impact on plan:** Both were caught and fixed during self-verification, before any commit referencing the broken state. No scope creep — both fixes were necessary for the plan's own stated correctness bar (D-01's naming constraint; the guard test not being vacuous).

## Issues Encountered

None beyond the two deviations above.

## User Setup Required

None — no external service configuration required. This is a pure CI/tooling change.

## Verification Evidence

All claims below were measured directly against this working tree, not assumed from the plan:

- **Live `npm audit --json` structure matches F1-F6 exactly**, re-verified independently: `auditReportVersion: 2`, the same 7 packages, the same mixed `via` shapes, `braces`'s `fixAvailable` naming `tailwindcss@4.3.3` with `isSemVerMajor: true`.
- **Gate exits 0 on this tree today**: `npm run audit:gate` -> `audit-gate: clean -- 1 active deferral(s), earliest expiry 2026-11-02.`
- **All 7 advisories resolve to `GHSA-vfj7-8cjw-p6xm`**, confirmed both via the unit test (`resolveAdvisories` tested directly on `eslint-config-next`) and via an ad hoc run of `evaluate()` against the live audit report: `evaluate({ deferrals: AUDIT_DEFERRALS, ... }).failures.length === 0` while `evaluate({ deferrals: [], ... }).failures` lists all 7 package names.
- **Gate is not vacuous**: removing the deferral (passing `deferrals: []`) against the same live report produces 7 failures, confirmed by direct `tsx` invocation reported in the session transcript.
- **Expired / stale / invalid / unparseable all demonstrated** against the live report with an injected `now` (never by editing the committed const): expired (`now` past 2026-11-02) -> 7 failures + 1 expired deferral listed; stale (a deferral for a non-existent advisory, coexisting with the real active one) -> 0 failures, 1 stale deferral warned, exit would be 0; invalid (`expires: "soon"`) -> 7 failures (suppresses nothing) + 1 invalid deferral listed; unparseable report (`evaluate({ report: {} })`) throws, and `JSON.parse` on garbage output confirms the parse-guard path in `runNpmAudit` is reachable.
- **`package-lock.json` byte-unchanged**: `git diff --stat package-lock.json` produces no output. No dependency added to either `dependencies` or `devDependencies` in `package.json`.
- **Full Verification Gate, with the sixth command substituted, all green**: `security:migrations:verify` PASS; `typecheck:strict` clean (0 errors); `lint` clean (`--max-warnings=0`, 0 output); `test -- --runInBand` -> **641 suites / 8001 tests, all passed**; `npm audit --omit=dev --audit-level=moderate` -> 0 vulnerabilities; `npm run audit:gate` (replacing `npm audit --audit-level=high`) -> clean, 1 active deferral, earliest expiry 2026-11-02.
- **Working tree baseline intact**: re-measured after all commits — `git diff --name-only | wc -l` = **10** (the parallel session's files, unchanged); `git ls-files --others --exclude-standard | wc -l` = **11** (the parallel session's 10 untracked files plus this plan's own `261003-adt-PLAN.md`, which was already untracked before this session started). This plan's own new files (`scripts/audit-gate.ts`, `scripts/audit-gate.test.ts`) are committed, not untracked.

## Next Phase Readiness

The `validate` CI job is unblocked repo-wide as of this branch. The deferral expires 2026-11-02 — at that point `npm run audit:gate` will start failing again by design until either a patched `braces` becomes available or the deferral is re-evaluated and re-approved with a fresh reason and date. No other phase depends on this change; it is purely a CI-gate fix carried on top of unpushed `756ce68d` (PR #134), which this branch's merge will also close.

---
*Quick task: 261003-adt*
*Completed: 2026-10-03*

## Self-Check: PASSED

- All 5 files confirmed present on disk: `scripts/audit-gate.ts`, `scripts/audit-gate.test.ts`, `package.json`, `.github/workflows/quality.yml`, `.claude/CLAUDE.md`.
- All 3 task commit hashes confirmed in `git log --oneline --all`: `360772c6`, `8f7ecd3b`, `e3c9146e`.
