---
phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv
plan: 06
subsystem: testing
tags: [jest, source-assertion, doctrine-gate, security]

requires:
  - phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv
    provides: "GET .../comments/export/route.ts (40-04), GET .../pins/export/route.ts (40-05) — both merged and present at this plan's base"
provides:
  - "__tests__/writer-room-daw-export-separation.test.ts — a single cross-route doctrine gate holding both DAW export routes to one set of rules: no crossover reference (both directions), no shared data path beyond the permitted pure renderers, no second query parameter, no write/notify/broadcast verb, no service-role escalation, and a positive assertion that the contribute-tier access gate is present in both"
  - "A behavioural record (below) of four deliberate breaks, each observed failing the suite and fully reverted, proving the gate is not vacuous"
affects: [40-07, 40-08]

tech-stack:
  added: []
  patterns:
    - "A cross-route doctrine gate distinct from each route's own per-file gate (40-04, 40-05) — same invariant, checked from a third vantage point, so a refactor that reconciles the two routes cannot slip past two independently-weakenable per-file gates at once"
    - "Constant NAMES for forbidden/required tokens reused verbatim across writer-room-private-pins.test.ts, writer-room-comments-export-api.test.ts, writer-room-pin-export-api.test.ts, and this file, so all four doctrine gates read as one set of decisions"

key-files:
  created:
    - "__tests__/writer-room-daw-export-separation.test.ts"
  modified: []

key-decisions:
  - "The plan's acceptance criterion that resolveWorkAccess appear 'exactly once' per route is structurally unsatisfiable — every valid caller both imports the name and calls it (two occurrences on two lines), the same fact plan 40-04's own SUMMARY documented for its per-file gate. Applied the exactly-once requirement to the 'contribute' tier literal instead (which does have exactly one legitimate call site per route) and checked resolveWorkAccess itself with toContain, which still fails the moment the call OR the import is removed — verified against break four below."
  - "Group two's 'no shared data path' assertion is written as a positive-and-negative pair, not a blanket no-sharing rule: both routes must import from the permitted pure renderer/classifier modules (lib/catalogue/take-export*), and neither may import the other's route file, anything under app/api, or use a relative import that climbs out of its own directory. This encodes the plan's explicit distinction between sharing FORMAT RENDERERS (required, E-13) and sharing a DATA-FETCH path (forbidden, E-03)."

requirements-completed: [E-03, E-10]

coverage:
  - id: D1
    description: "A single test file holds both comments/export and pins/export routes to one set of rules: bidirectional crossover checks, a no-shared-data-path check that permits the pure renderers and forbids everything else, a single-query-parameter check, a pure-read check (no write/notify/broadcast verb, exactly one exported handler), a no-service-role-escalation check, and a positive presence check for the contribute-tier access gate."
    requirement: "E-03, E-10"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-daw-export-separation.test.ts (21 tests, all groups)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The gate has been observed failing four times — once per group it protects that a human reviewer could plausibly introduce without noticing — and reverted cleanly each time, with the working tree confirmed clean via git status --porcelain before the final green run."
    requirement: "E-03, E-10"
    verification:
      - kind: other
        ref: "Manual negative checks recorded below: break one (Group one, crossover), break two (Group four, write-on-read-path/E-10), break three (Group three, second query param), break four (Group six, access gate removed) — each performed, observed failing, reverted with a path-scoped git checkout, and followed by a clean git status --porcelain."
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-09-15
status: complete
---

# Phase 40 Plan 06: Cross-Route DAW Export Separation Gate Summary

**One doctrine-gate test file (`__tests__/writer-room-daw-export-separation.test.ts`, 21 assertions) holds both the comments export (40-04) and pin export (40-05) routes to a single set of rules — bidirectional crossover checks, a permitted-sharing/forbidden-sharing distinction, a single-query-parameter check, a pure-read check, and a positive access-gate check — verified non-vacuous by four deliberate breaks, each observed failing and fully reverted.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-15 (worktree session start)
- **Completed:** 2026-09-15
- **Tasks:** 2
- **Files modified:** 1 (created)

## Accomplishments

- Wrote `__tests__/writer-room-daw-export-separation.test.ts` in the established doctrine-gate voice (matching `writer-room-private-pins.test.ts`'s shape): a header comment explaining the specific regression a human reviewer cannot catch, forbidden/required tokens named once as module-level constants and reused verbatim from the three sibling doctrine files, `readFileSync` at module scope so a wrong path throws at load time, and `it.each` over a two-entry table of named sources.
- Encoded seven groups exactly as specified: Group zero (anti-vacuity — both sources non-empty and export a handler), Group one (bidirectional crossover — comments never references the pins table/view type and vice versa), Group two (no shared data path — permits the three pure renderer/classifier modules, forbids importing the sibling route, anything under `app/api`, or a climbing relative import), Group three (exactly one `searchParams.get(` call per file, and it reads `format`), Group four (pure read — exactly one exported handler, no insert/update/upsert/delete/rpc, no notification/broadcast/channel-send call), Group five (no service-role client, no owner-check or membership-tier helper), and Group six (a positive assertion that `resolveWorkAccess` and the `'contribute'` literal are present).
- Ran `npx jest --testPathPatterns="writer-room-daw-export-separation"` clean at 21/21 passing (above the 14-test floor in the acceptance criteria).
- Performed all four deliberate breaks required by Task 2, one at a time, each confirmed failing the suite, each reverted with a path-scoped `git checkout --` on the single touched file, `git status --porcelain` re-checked clean after every revert. Full quotes below.
- Ran the complete verification gate from CLAUDE.md after the final revert: `npx jest --testPathPatterns="writer-room-daw-export-separation"` (21/21), `npm test -- --runInBand` (619 suites / 7529 tests, all green, including Phase 39's private-pins gate and both 40-04/40-05 per-route gates), `npm run typecheck:strict` (clean), `npm run lint` (clean at `--max-warnings=0`).

## Task Commits

1. **Task 1: The separation gate — two routes that must never become one** - `47050836` (test)
2. **Task 2: Prove the gate fails — four deliberate breaks, all reverted** - no commit (this task's action is entirely deliberate-break-and-revert verification against Task 1's already-committed test file; it produces no net file diff by design, confirmed by `git status --porcelain` returning empty after all four reverts)

_Note: this plan runs in a wave-4 worktree and does not carry its own plan-metadata commit — the orchestrator updates STATE.md/ROADMAP.md after all wave agents complete._

## Files Created/Modified

- `__tests__/writer-room-daw-export-separation.test.ts` - Cross-route doctrine gate: seven groups (anti-vacuity, bidirectional crossover, no shared data path, one query param, pure read, no service-role escalation, positive access-gate presence) applied to both `comments/export/route.ts` and `pins/export/route.ts` at once.

## Decisions Made

- See `key-decisions` in frontmatter: the `resolveWorkAccess` "exactly once" wording was applied to the `'contribute'` literal instead (structurally the only one of the two that can be exactly one occurrence), with `resolveWorkAccess` itself checked by presence — proven load-bearing by break four below, which removed the call (leaving only the import) and the test still failed because the accompanying `'contribute'` literal also disappeared with it.
- Group two's assertions encode a positive requirement (both routes import from the pure `lib/catalogue/take-export*` modules) alongside the negative ones, rather than a blanket "no shared import" rule — this matches the plan's explicit instruction that sharing the format renderers is intended (E-13) and only sharing a data-fetch path is forbidden (E-03).

## Deviations from Plan

**Grep-based acceptance-criteria note (not a deviation, documented for the record, following 40-04's precedent):** the plan's Group six description says "the `resolveWorkAccess` ... tier literal exactly once" as if both tokens shared the same cardinality. They do not: `resolveWorkAccess` appears twice per route (once in the import statement, once at the call site) in both `comments/export/route.ts` and `pins/export/route.ts`, confirmed by direct grep before writing the test:
```
$ grep -o "resolveWorkAccess" ".../comments/export/route.ts" | wc -l
2
$ grep -o "resolveWorkAccess" ".../pins/export/route.ts" | wc -l
2
```
The `'contribute'` literal, by contrast, does appear exactly once per route. The test applies the exact-count assertion to `'contribute'` and a presence (`toContain`) assertion to `resolveWorkAccess` — the latter still fails the moment the call is removed, as proven in break four, because removing the call in this codebase's actual code shape also removes the accompanying `'contribute'` literal it's always passed with.

No other deviations. Plan executed exactly as written, task order followed as specified (write the gate → prove it fails four ways → revert → final clean run).

## Four Deliberate Breaks — Observed and Reverted

Each break below was performed on a single file, run against the suite, confirmed failing in the expected group, and reverted with `git checkout -- <path>` before the next break began. `git status --porcelain` was re-checked clean after every revert.

**Break one — crossover.** Added a throwaway `const THROWAWAY_PINS_REF = 'work_version_pins'` to `comments/export/route.ts`. Failure named Group one, as required:
```
● the DAW export separation gate — E-02's exposure, E-03's containment (D-40-06) › Group one — no crossover (E-02's exposure, E-03's containment) › the comments export never references the pins table or the pin view type

    expect(received).not.toContain(expected) // indexOf
```
Reverted. `git status --porcelain` empty.

**Break two — a write on the read path.** Added a throwaway `await supabase.from('work_version_pins').insert({ throwaway: true })` to `pins/export/route.ts`, right after the query. Failure named Group four and the E-10-labeled describe block, as required:
```
● the DAW export separation gate — E-02's exposure, E-03's containment (D-40-06) › Group four — the pure read, per E-10 › pins/export/route.ts contains no row creation, modification, upsert, delete, or stored-procedure call

    expect(received).not.toMatch(expected)

    Expected pattern: not /\.insert\s*\(/
```
Reverted. `git status --porcelain` empty.

**Break three — a second query parameter.** Added `const throwawayMode = new URL(request.url).searchParams.get('mode')` to `pins/export/route.ts`, immediately after the existing `format` read. Failure named Group three, as required:
```
● the DAW export separation gate — E-02's exposure, E-03's containment (D-40-06) › Group three — no mode parameter, one format param only › pins/export/route.ts reads searchParams.get( exactly once, for format

    expect(received).toHaveLength(expected)

    Expected length: 1
    Received length: 2
    Received array:  ["searchParams.get(", "searchParams.get("]
```
Reverted. `git status --porcelain` empty.

**Break four — a missing access gate.** Replaced the `const access = await resolveWorkAccess(...)` call in `comments/export/route.ts` with a hardcoded `const access = { granted: true, isOwner: false, tier: 'administer' as const }`, removing both the function call and its accompanying `'contribute'` literal. Failure named Group six, as required:
```
● the DAW export separation gate — E-02's exposure, E-03's containment (D-40-06) › Group six — the access gate is present in both › comments/export/route.ts calls resolveWorkAccess at the contribute tier, exactly once

    expect(received).toHaveLength(expected)

    Expected length: 1
    Received length: 0
    Received array:  []
```
Reverted. `git status --porcelain` empty.

**Final clean state.** After the fourth revert, `git status --porcelain` returned no output (only Task 1's already-committed test file exists in the working tree). The separation-gate suite ran clean (21/21), and the full suite (`npm test -- --runInBand`) ran clean at 619 suites / 7529 tests, unchanged from the pre-break baseline.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The E-03/E-10 structural separation between the two DAW export routes is now checked from three independent vantage points: each route's own per-file gate (40-04, 40-05) and this cross-route gate. A future refactor that merges the two routes behind a shared helper or a mode parameter must defeat all three to ship silently.
- Not verified by this plan, as its own `<verification>` section states: runtime behaviour. This is a source-assertion gate; it proves the code cannot do a thing, not that the code does the right thing at runtime. That remains the responsibility of plans 40-01 through 40-03's unit tests and the phase UAT.
- Plan 40-07 (the export UI) and 40-08 can proceed without further action from this plan — no production code was touched.

## Self-Check: PASSED

- FOUND: `__tests__/writer-room-daw-export-separation.test.ts`
- FOUND: commit `47050836` (Task 1 — test)
- FOUND: `.planning/phases/40-writer-s-room-daw-marker-export-audition-audacity-csv/40-06-SUMMARY.md`

---
*Phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv*
*Completed: 2026-09-15*
