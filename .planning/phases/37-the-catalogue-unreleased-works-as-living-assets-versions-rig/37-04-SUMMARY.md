---
phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig
plan: 04
subsystem: api
tags: [typescript, supabase, rls, access-control, pure-functions, catalogue]

requires:
  - phase: 37-01
    provides: "migrations 135-138 (works/work_versions/lyric_blocks/work_members/ai_entries/work_diary_events), the is_work_owner/work_member_tier RPC pair, and the diary trigger payload shapes this plan types against"
provides:
  - "types/catalogue.ts — the row vocabulary every wave-2+ route and wave-3+ component imports"
  - "lib/catalogue/membership.ts — the contribute/administer tier predicates"
  - "lib/catalogue/access.ts — decideWorkAccess/resolveWorkAccess, the single access decision every work route calls first"
  - "lib/catalogue/diary.ts — describeDiaryEvent, the three-part entry every diary kind renders through"
affects: [37-05, 37-06, 37-07, 37-08, 37-09, 37-10, 37-11, 37-12, 37-13]

tech-stack:
  added: []
  patterns:
    - "Decision/wrapper split for authorization (lib/catalogue/access.ts): a pure decision function tested with injected fakes, plus a thin I/O wrapper with no branching beyond awaiting — mirrors lib/handles/resolve.ts's 'extract the decision, inject the dependency' shape"
    - "404-not-403 for unproven membership, 403 only once membership is proven (T-37-22)"
    - "Discriminated union keyed on a DB column (work_diary_events.kind) via a mapped type over a payload-per-kind Record, narrowing payload from kind"

key-files:
  created:
    - types/catalogue.ts
    - lib/catalogue/membership.ts
    - lib/catalogue/membership.test.ts
    - lib/catalogue/access.ts
    - lib/catalogue/access.test.ts
    - lib/catalogue/diary.ts
    - lib/catalogue/diary.test.ts
  modified: []

key-decisions:
  - "Diary kind/payload discriminated union lives in types/catalogue.ts (not lib/catalogue/diary.ts) so Task 1's own tsc gate does not forward-reference a module (diary.ts) that Task 3 creates later in the same plan; diary.ts imports the type from types/catalogue.ts instead of the reverse"
  - "resolveWorkAccess always calls both fact-getters, even for a null userId — the null-short-circuit lives in createWorkAccessDeps (the real factory), not in the wrapper, so resolveWorkAccess itself truly contains no branching beyond awaiting"
  - "Diary payload field names were reconciled against migration 138's actual jsonb_build_object(...) calls after 37-01 landed those files mid-plan (parallel wave) — not left as the earlier RESEARCH.md guess"

requirements-completed: [S-02, S-01, S-03]

coverage:
  - id: D1
    description: "types/catalogue.ts declares Work/WorkVersion/LyricBlock/WorkMember/AiEntry/WorkDiaryEvent row types matching migrations 135-138 exactly, including the two deliberately absent columns (no version/block numeral, no works.split_sheet_id)"
    requirement: S-03
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (structural conformance — no dedicated schema-diff test; verified manually against supabase/migrations/135-138 column-by-column)"
        status: pass
    human_judgment: false
  - id: D2
    description: "lib/catalogue/membership.ts — WORK_TIER_VALUES byte-identical to migration 136's CHECK, plus canContribute/canAdminister/canManageMembership/canOpenMoneyOrReleaseDoors predicates, each covering the unrecognized-value case"
    requirement: S-02
    verification:
      - kind: unit
        ref: "lib/catalogue/membership.test.ts (10 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "decideWorkAccess — pure, returns 401 (no session), 404 (proven non-member, never 403 — anti-enumeration), 403 (proven member, insufficient tier), and grants the owner the administer tier without a membership row"
    requirement: S-02
    verification:
      - kind: unit
        ref: "lib/catalogue/access.test.ts (17 tests covering all four statuses plus the owner-without-row case)"
        status: pass
    human_judgment: false
  - id: D4
    description: "resolveWorkAccess — thin wrapper over injected fact-getters, no Supabase import in the test file; createWorkAccessDeps builds the real deps from migration 136's is_work_owner/work_member_tier RPCs"
    requirement: S-02
    verification:
      - kind: unit
        ref: "lib/catalogue/access.test.ts (resolveWorkAccess + createWorkAccessDeps describe blocks)"
        status: pass
    human_judgment: false
  - id: D5
    description: "describeDiaryEvent renders all nine diary kinds as headline/consequence/date; AI entry consequence is the stored citation verbatim; unknown/future kind degrades instead of throwing; isTriggerSourced marks exactly one kind (note) as app-authored"
    requirement: S-01
    verification:
      - kind: unit
        ref: "lib/catalogue/diary.test.ts (15 tests, including a character-identical citation fixture and the nine-kind sweep)"
        status: pass
    human_judgment: false

duration: ~10min
completed: 2026-08-30
status: complete
---

# Phase 37 Plan 04: Access, Types, and Diary Describe Logic Summary

**Row vocabulary, the contribute/administer tier matrix, `resolveWorkAccess()` as the one work-route authorization gate, and `describeDiaryEvent()` mapping all nine diary kinds to a headline/consequence/date — all pure, all tested without a database.**

## Performance

- **Duration:** ~10 min (first commit to last, 07:29:15–07:39:12 local)
- **Started:** 2026-08-30T07:29:15-04:00
- **Completed:** 2026-08-30T07:39:12-04:00
- **Tasks:** 3 (plus one reconciliation follow-up)
- **Files modified:** 7 created

## Accomplishments

- `types/catalogue.ts` declares the row vocabulary for all six new tables (`works`, `work_versions`, `lyric_blocks`, `work_members`, `ai_entries`, `work_diary_events`), including the two columns that deliberately do not exist (no stored version/block numeral, no `works.split_sheet_id`), and the nine-kind diary payload discriminated union.
- `lib/catalogue/membership.ts` mirrors `lib/vault/membership.ts`'s shape for the two-tier `contribute`/`administer` vocabulary, including `canOpenMoneyOrReleaseDoors` — the 37.2 money/release-door seam, typed and tested today even though no route wires it until then.
- `lib/catalogue/access.ts` — `decideWorkAccess` is the single pure implementation of "may this person write into this song?": 401 with no session, 404 (never 403) for a proven stranger, 403 once membership is proven but insufficient, and the owner always resolves to `administer` without needing a `work_members` row. `resolveWorkAccess` is the thin wrapper (no branching beyond awaiting); `createWorkAccessDeps` builds the real fact-getters from migration 136's `is_work_owner`/`work_member_tier` RPCs.
- `lib/catalogue/diary.ts` — `describeDiaryEvent` maps every one of the nine `work_diary_events` kinds to sketch 001's three-part entry shape. An AI entry's consequence is the stored citation rendered verbatim, never recomposed. `isTriggerSourced()` encodes the CAT-Q1 contract: eight kinds are trigger-sourced, `note` is the one deliberate app-authored exception.

## Task Commits

Each task was committed atomically:

1. **Task 1: types/catalogue.ts and lib/catalogue/membership.ts** — `3dd7e86` (feat)
2. **Task 2: lib/catalogue/access.ts — resolveWorkAccess** — `5705e06` (feat)
3. **Task 3: lib/catalogue/diary.ts — describeDiaryEvent** — `590c21d` (feat)
4. **Reconciliation: diary payload shapes vs. 37-01's landed migration 138** — `8d735a4` (fix)

_Note: the reconciliation commit is documented as a deviation below — it is not a plan task, but a required correction discovered because 37-01's migrations landed on the shared branch mid-plan._

## Files Created/Modified

- `types/catalogue.ts` — row vocabulary for all six new tables + the diary payload discriminated union
- `lib/catalogue/membership.ts` — `WorkTier`, `WORK_TIER_LABELS`, `WORK_TIER_VALUES`, four capability predicates
- `lib/catalogue/membership.test.ts` — 10 tests covering every predicate including the unrecognized-value case
- `lib/catalogue/access.ts` — `decideWorkAccess`, `resolveWorkAccess`, `createWorkAccessDeps`
- `lib/catalogue/access.test.ts` — 17 tests, pure decision + injected-fake wrapper + fake-RPC-client factory
- `lib/catalogue/diary.ts` — `describeDiaryEvent`, `isTriggerSourced`, `DIARY_KIND_ACCENT`
- `lib/catalogue/diary.test.ts` — 15 tests covering all nine kinds, the citation-verbatim fixture, and the unknown-kind degrade

## Decisions Made

- **Diary union ownership inverted from the plan's literal wording.** The plan text said the payload union is "declared in task 3's module [diary.ts] and re-exported [in types/catalogue.ts]." Declaring it in diary.ts first would have made Task 1's own `tsc --noEmit` gate fail (diary.ts doesn't exist until Task 3, and each task's `<verify>` block runs immediately after that task). Declared it in `types/catalogue.ts` (Task 1) instead, with `diary.ts` importing from there — every task's own verify gate stays green in commit order, and the "one row vocabulary" file still owns every JSONB shape, which is consistent with its stated purpose.
- **`resolveWorkAccess` calls both fact-getters unconditionally**, including for a null `userId`, rather than short-circuiting on null. This keeps the wrapper's own body branch-free ("no branching beyond awaiting," per the plan). The null-short-circuit (skip the RPC round-trip) lives in `createWorkAccessDeps`, the real I/O factory, where a guard clause is ordinary and expected.
- **Accent tokens for the diary feed** (`DIARY_KIND_ACCENT`) extend sketch 001's four documented accents (version/sheet/roster/AI) with a documented, non-arbitrary choice: `roster` takes `emerald-400` (the sketch's "good" family, used elsewhere for positive/people chips) since the sketch itself doesn't assign roster its own color in isolation. The remaining five kinds share a neutral `lavdim` token. All values are Tailwind token names, never raw hex.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Reconciled diary payload field names against migration 138 after it landed mid-plan**
- **Found during:** Post-Task-3 full verification pass (`npx tsc --noEmit` / `npx jest`)
- **Issue:** This plan runs in parallel with sibling plan 37-01, which authors migrations 135-138. Task 3's diary payload shapes were written from `37-RESEARCH.md`'s DDL sketch (the only source available at the time) as a documented "considered proposal, coordinate once 138 lands." 37-01 landed `supabase/migrations/138_work_diary_events.sql` on the shared branch partway through this plan's execution. Comparing field-by-field against the actual `jsonb_build_object(...)` calls found six real drifts: `version` also carries `label`; `roster` also carries `memberUserId`; `ai_entry` also carries `humanSourceVersionId`; `rename`'s fields are `previousTitle`/`title`, not `oldTitle`/`newTitle`; `sheet` carries `collaboratorId`/`operation`, not a `splitPercentage` that 138 never writes; `detach` carries `detachedFromBlockId` and has no `customLabel` at all.
- **Fix:** Updated `DiaryEventPayloadMap` in `types/catalogue.ts` to match 138 exactly (verified line-by-line against the trigger functions), updated `describeDiaryEvent`'s `sheet`/`rename`/`detach` cases in `lib/catalogue/diary.ts` to read the correct fields (the `sheet` headline drops the split-percentage figure it can no longer read; the `detach` headline falls back to the generic block-type label since no custom-section name is available in that payload), and updated `lib/catalogue/diary.test.ts`'s fixtures to the real field names.
- **Files modified:** `types/catalogue.ts`, `lib/catalogue/diary.ts`, `lib/catalogue/diary.test.ts`
- **Verification:** `npx jest lib/catalogue` (130 tests), full `npx jest` (300 suites / 3435 tests), `npx tsc --noEmit` (0 errors), `npm run lint --max-warnings=0` (clean) — all green after the fix.
- **Committed in:** `8d735a4`

---

**Total deviations:** 1 auto-fixed (1 blocking — cross-plan schema reconciliation, required by the plan's own coordination instruction).
**Impact on plan:** Necessary correctness fix; no scope creep. The plan explicitly anticipated this ("coordinate with 37-01's committed SQL if it lands before you — read, don't edit, its files") and this is exactly that coordination.

## Issues Encountered

- A transient `npx tsc --noEmit` failure appeared mid-session in `__tests__/migration-137.test.ts` — a sibling plan's (37-01) file, uncommitted at the time (`git status` showed it untracked), being actively written by a concurrent agent process in this shared checkout. Re-running `tsc` after that agent's commit landed showed 0 errors; no action was needed or taken on that file (out of this plan's scope per the parallel-wave git discipline instructions).
- A `git commit -m "$(cat <<'EOF' ... EOF)"` heredoc-via-command-substitution invocation for the first task's commit message produced a mangled message (missing closing content, a stray literal `EOF` and `)` appended to the message body) — a Bash-tool formatting artifact, not a content error. Fixed with `git commit --amend -F <file>` immediately (no other commits existed yet, so nothing else was affected) using a plain heredoc-to-file plus `-F` for every subsequent commit to avoid recurrence.

## User Setup Required

None — no external service configuration required. This plan is pure TypeScript logic with no database access.

## Next Phase Readiness

- `types/catalogue.ts`, `lib/catalogue/membership.ts`, `lib/catalogue/access.ts`, and `lib/catalogue/diary.ts` are ready for every wave-2+ `/api/works` route (plans 05+) to import — `resolveWorkAccess()` as each route's first statement, `describeDiaryEvent()` as plan 12's DiaryFeed data-loader's sole formatter.
- `canOpenMoneyOrReleaseDoors` and `ai_entries.mode`/`level` typing are in place ahead of the 37.2 door plans, per this plan's explicit purpose.
- No blockers. Migrations 135-138 are landed (by 37-01) but not yet pushed to prod — that push remains 37-01's own human-gated checkpoint, unaffected by this plan.

---
*Phase: 37-the-catalogue-unreleased-works-as-living-assets-versions-rig*
*Completed: 2026-08-30*

## Self-Check: PASSED

All 7 created source files plus this SUMMARY.md verified present on disk; all 4 commit hashes (`3dd7e86`, `5705e06`, `590c21d`, `8d735a4`) verified present in `git log`.
