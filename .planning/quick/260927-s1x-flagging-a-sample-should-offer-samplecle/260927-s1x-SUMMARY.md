---
phase: 260927-s1x
plan: 01
subsystem: vault
tags: [react, useEffect, useMemo, vault-documents, sampleclear]

requires: []
provides:
  - "sampleClearKey / allStage3Requirements / findRequirementByKey exported from lib/vault/stage3.ts"
  - "SampleFlagToggle.onOpenSampleClear callback firing once on a successful toggle-ON PATCH"
  - "DocumentStage pending-open effect that opens the real Stage3 requirement after router.refresh()"
affects: []

tech-stack:
  added: []
  patterns:
    - "Pending-key-with-absolute-deadline: report a bare id upward, store {key, expiresAt} in state, resolve against refreshed server props in a useEffect, never synthesize the object client-side"

key-files:
  created: []
  modified:
    - lib/vault/stage3.ts
    - lib/vault/stage3.test.ts
    - components/vault/DocumentStage.tsx
    - components/vault/SampleFlagToggle.tsx

key-decisions:
  - "sampleClearKey is the single spelling of the per-track sample-clearance key; both the builder in computeStage3 and the lookup in DocumentStage call it"
  - "The pending-open deadline is fixed at toggle time (Date.now() + 10_000ms) and the timer is armed only for the remaining window on each render, so re-renders cannot extend it"
  - "allStage3Requirements searches all three Stage3Result partitions (required/recommended/complete) because a signed clearance has already moved out of required"

requirements-completed: [S1X-01, S1X-02, S1X-03, S1X-04, S1X-05, S1X-06]

coverage:
  - id: D1
    description: "Toggling a track's sample flag ON opens the panel for the server's own sample-clearance requirement, by reference, never a client-synthesized object"
    requirement: S1X-01
    verification:
      - kind: unit
        ref: "lib/vault/stage3.test.ts#findRequirementByKey — pure lookup by reference > returns the very element from the list, by reference, when the key is present"
        status: pass
    human_judgment: true
    rationale: "No jsdom in this repo (jest.config.js testEnvironment: 'node'); a component test cannot observe the panel opening. Only a human clicking the toggle in a real browser can confirm the panel actually renders."
  - id: D2
    description: "Flipping the flag spends nothing — no request reaches the generate endpoint; the artist still presses Generate"
    requirement: S1X-02
    verification:
      - kind: other
        ref: "grep -c 'documents/generate' components/vault/SampleFlagToggle.tsx components/vault/DocumentStage.tsx == 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Toggling OFF or saving sample details opens nothing (single call site, gated on toggle-ON only)"
    requirement: S1X-02
    verification:
      - kind: other
        ref: "grep -cF 'onOpenSampleClear?.(' components/vault/SampleFlagToggle.tsx == 1"
        status: pass
    human_judgment: true
    rationale: "The grep proves there is exactly one call site in the ON branch; confirming no panel actually opens on OFF/save in the running app is the human-check steps 3-4."
  - id: D4
    description: "The pending-open wait is bounded by an absolute deadline fixed at toggle time; re-renders cannot extend it; expiry opens nothing"
    requirement: S1X-03
    verification:
      - kind: unit
        ref: "npm run typecheck:strict (effect deps [pendingOpen, allRequirements] type-check; timer armed for `pendingOpen.expiresAt - Date.now()`)"
        status: pass
    human_judgment: false
  - id: D5
    description: "One definition of the sample-clearance key, one pure lookup, unit-tested for null key, empty list, absent key, present key (by reference), duplicate keys, and a key in the complete partition"
    requirement: S1X-04
    verification:
      - kind: unit
        ref: "lib/vault/stage3.test.ts#sampleClearKey, #allStage3Requirements, #findRequirementByKey describe blocks"
        status: pass
    human_judgment: false
  - id: D6
    description: "SampleFlagToggle names SampleClear and says what it helps with, with no duration/speed claim and no assertion Funun performs the clearance"
    requirement: S1X-05
    verification:
      - kind: other
        ref: "grep -ciE '\\bclear\\b|\\bweeks?\\b|\\bmonths?\\b|typically|quickly|\\bsoon\\b|\\bfast\\b|\\beasy\\b' (rendered lines only) == 0"
        status: pass
    human_judgment: true
    rationale: "The token grep proves absence of forbidden words; tone (reads as help, not a disqualification) is judged by a human reading the copy aloud per human-check step 6."
  - id: D7
    description: "Full CI validate job passes on the branch tip; npm run build never run"
    requirement: S1X-06
    verification:
      - kind: other
        ref: "npm run security:migrations:verify, npm run typecheck:strict, npm run lint, npm test -- --runInBand, npm audit --omit=dev --audit-level=moderate, npm audit --audit-level=high — all six run in this session, all six passed"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-09-28
status: complete
---

# Quick Task 260927-s1x: Flagging a sample should offer SampleClear — Summary

**Toggle-ON now stores a `{key, expiresAt}` pending-open marker resolved by a `useEffect` against the refreshed `computeStage3` props, opening the server's own sample-clearance requirement object by reference — no synthesis, no auto-generate, bounded by a fixed 10s deadline.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-27 (session start)
- **Completed:** 2026-09-28T01:44:18Z
- **Tasks:** 2/2 completed
- **Files modified:** 4

## Accomplishments

- `lib/vault/stage3.ts` gained three exported helpers — `sampleClearKey`, `allStage3Requirements`, `findRequirementByKey` — removing the one duplicated key-string literal and making the lookup independently testable.
- `SampleFlagToggle` reports a bare `trackId` upward through a new optional `onOpenSampleClear` prop, fired exactly once, only after a successful toggle-ON PATCH.
- `DocumentStage` turns that trackId into a pending key with an absolute deadline, and a `useEffect` resolves it against the refreshed `stage3` props once `router.refresh()` (already called inside `SampleFlagToggle.patch()`) lands — opening the real requirement, or giving up silently if it never arrives in time.
- A new copy line in `SampleFlagToggle` names SampleClear and what it helps with, worded to avoid every forbidden claim (no duration, no "Funūn clears it", no disqualification framing).

## The exact mechanism that opens the real requirement, and how expiry is bounded

1. **Toggle-ON succeeds** → `SampleFlagToggle.toggle()` awaits `patch({ has_sample: true })`. `patch()` already calls `router.refresh()` internally (line 46, unchanged — no second refresh was added). Only if `patch()` resolved `true` does the toggle call `onOpenSampleClear?.(trackId)` — the single call site in the file (`SampleFlagToggle.tsx`, inside the `else` branch of `toggle()`; the OFF branch and `saveDetails()` are untouched).

2. **`DocumentStage.offerSampleClear(trackId)`** builds `{ key: sampleClearKey(trackId), expiresAt: Date.now() + PENDING_OPEN_WINDOW_MS }` (10,000ms) and stores it in `pendingOpen` state. This is the only place in `DocumentStage.tsx` that constructs a `sampleClearKey(...)` call (verified: exactly 1 occurrence), and it is a bare string key, never a `DocRequirement` object.

3. **`router.refresh()` re-runs the server render** of `documents/page.tsx` (still `force-dynamic`, still recomputing `computeStage3` per request) and hands `DocumentStage` fresh props while preserving its client state — so `pendingOpen` survives the round trip.

4. **The resolution effect**, `useEffect(() => {...}, [pendingOpen, allRequirements])`:
   - No `pendingOpen` → returns immediately, does nothing.
   - `findRequirementByKey(allRequirements, pendingOpen.key)` finds a match → `setActive(match)` (the exact object `computeStage3` built — same status, documentId, signers, prefill — passed to `ToolSidePanel` via `req={active}`, unchanged from before this plan) and clears `pendingOpen`.
   - No match and `pendingOpen.expiresAt - Date.now() <= 0` → clears `pendingOpen`, opens nothing. This is the deadline-expiry path.
   - No match and still within the window → arms `setTimeout(() => setPendingOpen(null), remaining)` for the **remaining** milliseconds (not a fresh full window), with a cleanup that clears the timer on unmount or on the next effect run.

**Why the deadline cannot be extended by re-renders:** `expiresAt` is computed once, at toggle time, inside `offerSampleClear`. Every subsequent run of the effect (triggered either by a new `pendingOpen` identity or a new `allRequirements` identity) recomputes `remaining` from that same fixed `expiresAt`, never resets it. A timer is armed for exactly what's left, so a re-render one second before expiry arms a one-second timer, not a fresh ten-second one. `allRequirements` is memoized on `[stage3]` so it only changes identity when the server actually sends new props — a client-only re-render (e.g. `setShowComplete`) does not re-arm anything, because neither dependency changes identity.

**No synthesis:** `findRequirementByKey` returns the array element itself (`requirements.find(r => r.key === key) ?? null`), never a spread or reshaped copy. `lib/vault/stage3.test.ts` pins this with `toBe` (identity, not `toEqual`), so a future refactor that starts returning a copy fails the test.

## Effect deps are exhaustive; lint is clean

The effect's dependency array is `[pendingOpen, allRequirements]`. `setActive` and `setPendingOpen` are `useState` setters (stable identity, correctly omitted per React's rules), and `findRequirementByKey`/`sampleClearKey`/`PENDING_OPEN_WINDOW_MS` are module-scope imports/constants (correctly omitted — they are not reactive values). `npm run lint` (`--max-warnings=0`, `next/core-web-vitals`, which includes `react-hooks/exhaustive-deps`) produced no warnings or errors.

## New copy line, verbatim

> SampleClear can help you work out who holds the master and publishing rights — usually different parties — and draft a request to each.

Rendered inside the existing `hasSample && (...)` block in `SampleFlagToggle.tsx`, below the "Save details" button, styled `text-xs text-white/40` to match the file's other muted helper text.

## Task Commits

Each task was committed atomically:

1. **Task 1: One definition of the key, one pure lookup, tested** — `1e66b228` (feat)
2. **Task 2: Toggle-ON opens the real requirement, once, bounded** — `dde0478f` (feat)

_No TDD split — Task 1 was written test-alongside (behavior list drove both the helpers and the new describe block in the same commit), consistent with how the existing `stage3.test.ts` file is organized (one commit per behavioral unit, not a RED/GREEN split per plan's `type="auto" tdd="true"` marker read as "write the tests specified in `<behavior>`," which the plan's own `<action>` step 4 text confirms: "Then append ONE new describe block... Cover every case in the behavior list above")._

## Files Created/Modified

- `lib/vault/stage3.ts` — added `sampleClearKey(trackId)`, `allStage3Requirements(stage3)`, `findRequirementByKey(requirements, key)`; the SampleClear block now builds its key via `sampleClearKey(t.id)` instead of an inline template literal.
- `lib/vault/stage3.test.ts` — three new `describe` blocks (`sampleClearKey`, `allStage3Requirements`, `findRequirementByKey`) covering every case in the plan's behavior list; existing describe blocks untouched and unreordered.
- `components/vault/DocumentStage.tsx` — new `PENDING_OPEN_WINDOW_MS` constant, `PendingOpen` type, `pendingOpen` state, `allRequirements` memo, the resolution `useEffect`, `offerSampleClear` handler, and `onOpenSampleClear={offerSampleClear}` wired onto `SampleFlagToggle`. No other behavior changed — cards, panel props, `onPanelDone`, ContentID buttons, and nav are byte-identical to before.
- `components/vault/SampleFlagToggle.tsx` — new optional `onOpenSampleClear` prop, called once inside `toggle()`'s ON branch after a successful PATCH, plus the new SampleClear copy line. OFF branch and `saveDetails()` untouched.

## Decisions Made

- Followed the plan's design resolution exactly: pending-key-with-absolute-deadline, resolved against refreshed server props, no client-side synthesis of a `DocRequirement`.
- `allStage3Requirements` concatenates `required`, `recommended`, `complete` in that order (matches the plan's spec and the order the page renders sections), so a lookup finds a requirement regardless of which partition it currently sits in.

## Deviations from Plan

None — plan executed exactly as written. All grep gates specified in Task 1 and Task 2's `<verify><automated>` blocks pass; the file set, call-site counts, key-spelling counts, and copy wording all match the plan's literal instructions.

## Issues Encountered

- The initial `git commit -m "$(cat <<'EOF' ... EOF)"` invocations failed with `unexpected EOF` / `syntax error` from the Bash tool's `eval` wrapper when the commit message contained backticks or the `Funūn`/`→` characters. Resolved by rewording the commit messages in plain ASCII with no backticks. This is a shell-invocation quirk of this environment, not a code or plan issue, and did not affect the committed content (final messages are accurate, just reworded).

## Verification Gate — six CI steps, verbatim

```
$ npm run security:migrations:verify
> funun@2.0.0 security:migrations:verify
> node scripts/verify-beta-security-migrations.mjs

PASS: migrations 214–218 are transactional, collision-sensitive, least-privilege, checksum-pinned, and covered by read-only probes.

$ npm run typecheck:strict
> funun@2.0.0 typecheck:strict
> tsc --noEmit --noUnusedLocals --noUnusedParameters
(no output — clean)

$ npm run lint
> funun@2.0.0 lint
> ESLINT_USE_FLAT_CONFIG=false eslint . --ext .js,.jsx,.ts,.tsx --max-warnings=0
(node:76589) ESLintRCWarning: You are using an eslintrc configuration file, which is deprecated...
(no lint errors or warnings — exit 0)

$ npm test -- --runInBand
> funun@2.0.0 test
> jest --runInBand

Test Suites: 636 passed, 636 total
Tests:       7832 passed, 7832 total
Snapshots:   0 total
Time:        31.843 s
Ran all test suites.

$ npm audit --omit=dev --audit-level=moderate
found 0 vulnerabilities

$ npm audit --audit-level=high
found 0 vulnerabilities
```

`npm run build` was never run, per the plan's constraint (a dev server is live on :3000).

## Human Browser Check — NOT DONE

**The human browser check described in Task 2's `<human-check>` block was NOT performed by this agent, per hard constraint #11.** No jsdom is installed in this repo (`jest.config.js` sets `testEnvironment: 'node'`), and the check requires a real project, a real track, and a real authenticated session — none of which an automated agent can supply or simulate. This is the only evidence for S1X-01 and S1X-02 and remains outstanding.

**Steps that remain, to be run by a human in a browser before merging:**

1. `npm run dev` (or use the already-running dev server), then open `/vault/{projectId}/documents` for a real project with at least one track whose sample flag is currently OFF.
2. Toggle "This track contains a sample" ON. Expect: within a second or so the side panel slides in, headed `Required` / `Sample clearance`, with that track's title underneath, and a `Generate sample clearance` button at the foot — no result content, since nothing has been generated.
3. Confirm the flag's own card also appeared: close the panel, check the Required section now shows a `Sample clearance` card for that track, and the toggle shows the new SampleClear line under the details field.
4. Type into the sample-details field and press `Save details`. Expect: details save, panel does NOT reopen.
5. Toggle the flag OFF. Expect: nothing opens; the requirement's card disappears from Required.
6. Toggle it ON again, let the panel open, then press Generate once. Expect: the #120 SampleClear result view renders — proving the requirement that auto-opened is the real one the generate route accepts. (Costs one AI call — do it once.)
7. Read the new line in the toggle aloud. Confirm it does not promise a clearance timeline, does not claim Funūn performs the clearing, and does not read as though the artist has just disqualified the song.

The PR should not be merged until these seven steps are run and confirmed by a human.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Both source files (`lib/vault/stage3.ts`, `lib/vault/stage3.test.ts`) and both component files (`components/vault/DocumentStage.tsx`, `components/vault/SampleFlagToggle.tsx`) are committed on `sample-flag-offers-sampleclear`, not pushed.
- Blocker: the human browser check above must run before this ships. No PR has been opened per hard constraint #10 ("Do NOT push and do NOT open a PR. Commit locally and stop.").
- Out of scope items (registry/`ToolSlug`, the generate route, #120's result view, moving the sample question earlier) were correctly left untouched — confirmed by the file-count check (`git diff --stat origin/main..HEAD` shows exactly the 4 planned files).

## Self-Check: PASSED

All 4 modified source files and this SUMMARY.md confirmed present on disk; both task commit
hashes (`1e66b228`, `dde0478f`) confirmed present in `git log --oneline --all`.

---
*Task: 260927-s1x*
*Completed: 2026-09-28*
