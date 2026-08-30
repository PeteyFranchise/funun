---
phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
plan: 04
subsystem: auth
tags: [nextjs, supabase, rate-limiting, signup, handles]

requires:
  - phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
    provides: "lib/handles/validate.ts (isValidHandle, normalizeHandleForCompare, handleFormatError) from 36-01; migration 133 (handle_new_user() atomic handle write, resolve_profile_by_handle() RPC, INSERT-time reserved/retired guard) from 36-02, live in prod"
provides:
  - "GET /api/handles/available — public, rate-limited-on-its-own-keyspace courtesy availability check spanning live/retired/reserved handles"
  - "lib/handles/availability.ts — handleFieldState(), the pure field-state derivation reused by plan 06's ChooseHandleGate"
  - "The signup allowed-branch handle field, wired to signUp({ options: { data: { handle } } })"
affects: [36-06-choose-handle-gate, 36-account-identity-follow-on-phases]

tech-stack:
  added: []
  patterns:
    - "Courtesy-only availability endpoint: unique index + trigger are the authority (D-14); the route can only ever say 'unknown', never a false verdict, on a DB error"
    - "Own rate-limit keyspace per distinct-budget concern (handle-check:ip: vs check-invite's ip:) — see lib/security/rate-limit.ts's key-prefix namespacing convention"
    - "Pure field-state derivation function (no jsdom) consumed by a thin client-component shell, with a monotonic ref counter guarding out-of-order debounced responses"

key-files:
  created:
    - app/api/handles/available/route.ts
    - lib/handles/availability.ts
    - __tests__/handle-available-route.test.ts
    - lib/handles/availability.test.ts
  modified:
    - "app/(auth)/signup/page.tsx"

key-decisions:
  - "D-14 enforcement boundary: the availability route can report available/unavailable/unknown but never claims or denies a handle — the DB unique index + migration 133's guard are the sole authority, and a lost race falls back to a NULL handle (D-15), never an aborted signUp"
  - "Separate handle-check:ip: rate-limit keyspace, ~60 attempts/5min, distinct from check-invite's ip: prefix — a debounced typing session must never exhaust signup admission's budget (T-36-18)"
  - "Taken, reserved, and retired handles collapse into one 'unavailable' reason — the endpoint never discloses which case applies (T-36-19), matching 36-03's PATCH route posture"
  - "checking and unknown states never block the signup submit button; only unavailable does, and only as UX convenience, never enforcement"

patterns-established:
  - "GET availability routes for uniqueness-adjacent UX checks: rate-limited on a dedicated keyspace, fail-safe to null/unknown on any DB error, never the enforcement layer"

requirements-completed: [D-02, D-03, D-04, D-05, D-14]

coverage:
  - id: D1
    description: "GET /api/handles/available reports invalid/unavailable/available/unknown correctly across format, live-handle, retired-handle, reserved-handle, and DB-error cases, and never queries the database for a rate-limited or format-invalid request"
    requirement: "D-14"
    verification:
      - kind: unit
        ref: "__tests__/handle-available-route.test.ts (12 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The route uses its own handle-check:ip: rate-limit keyspace, never check-invite's ip: prefix"
    requirement: "D-14"
    verification:
      - kind: unit
        ref: "__tests__/handle-available-route.test.ts#uses its own handle-check rate-limit keyspace, never the invite pre-check ip: prefix"
        status: pass
    human_judgment: false
  - id: D3
    description: "handleFieldState() derives status/message/blocksSubmit correctly for idle, invalid, checking, available, unavailable, and unknown, with format evaluated before any remote verdict"
    verification:
      - kind: unit
        ref: "lib/handles/availability.test.ts (8 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The signup allowed-branch renders a handle field between email and password, debounces the availability check, and carries the trimmed (never lowercased) handle through signUp()'s options.data.handle — while the invite gate and the form/existing-account/denied/invite-expired branches (including Turnstile/waitlist) remain byte-for-byte unchanged"
    requirement: "D-02, D-03, D-04"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (0 errors); grep -c 'data: { handle' == 1; grep -c 'handleFieldState' == 3; git diff of the four untouched gate branches contains zero invite/Turnstile/waitlist lines"
        status: pass
      - kind: manual_procedural
        ref: "Live signup flow through Supabase against prod migration 133 — not exercised in this session (no dev-server browser pass performed)"
        status: unknown
    human_judgment: true
    rationale: "The field's client-side wiring is typechecked and grep-verified, and the pure logic it depends on is unit-tested, but no browser/UAT pass against a running dev server was performed in this execution — a human should click through /signup once against a real (or seeded) Supabase project to confirm the field renders, the debounce fires, and signUp() succeeds end-to-end."

duration: ~10min (commit-span; excludes context/research reading)
completed: 2026-08-30
status: complete
---

# Phase 36 Plan 04: Signup Handle Field Summary

**GET /api/handles/available (own rate-limit keyspace, courtesy-only per D-14) plus the signup form's new handle field, wired to `signUp({ options: { data: { handle } } })` so migration 133's trigger writes it atomically with the profile row.**

## Performance

- **Duration:** ~10 min across four commits (91a1178 → 0e57b51)
- **Started:** 2026-08-30T01:45:07-04:00 (RED commit)
- **Completed:** 2026-08-30T01:52:21-04:00 (final GREEN commit)
- **Tasks:** 3
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- `GET /api/handles/available` — public, unauthenticated, reads live handles + retired handles (via migration 133's `resolve_profile_by_handle()` RPC) and `reserved_handles` in parallel, rate-limited on its own `handle-check:ip:` keyspace so a debounced typing session can never exhaust the invite pre-check's budget.
- `lib/handles/availability.ts` — `handleFieldState()`, a pure function turning `{ raw, checking, remote }` into `{ status, message, blocksSubmit }`, with format always evaluated before any remote verdict.
- The signup form's `allowed` branch now asks for a handle as the second of three fields (email → handle → password), debounced ~400ms, guarded against out-of-order responses with a monotonic ref counter, and carrying the trimmed value through `signUp()`'s `options.data.handle`.

## Task Commits

Executed with a proper RED/GREEN TDD split across Tasks 1 and 2 (both `tdd="true"`):

1. **RED — both Task 1 and Task 2 tests** - `91a1178` (test) — nine behavior cases for the route, eight for the pure module, written before either module existed; confirmed both failed to resolve their import.
2. **Task 2 GREEN: `lib/handles/availability.ts`** - `790715e` (feat)
3. **Task 1 GREEN: `GET /api/handles/available`** - `a4e98f6` (feat) — also tightened two of the RED test's own assertions (see Deviations)
4. **Task 3: the signup handle field** - `0e57b51` (feat)

_Note: interleaved with these are commits `c623ecc` (36-05, corrective — see Deviations) and other agents' 36-03/36-05 commits from the same wave; only the four above belong to this plan._

## Files Created/Modified
- `app/api/handles/available/route.ts` - public GET route, D-14 courtesy availability check
- `lib/handles/availability.ts` - `handleFieldState()` pure derivation, shared with plan 06
- `__tests__/handle-available-route.test.ts` - 12 cases covering every behavior line
- `lib/handles/availability.test.ts` - 8 cases covering every behavior line
- `app/(auth)/signup/page.tsx` - handle field in the `allowed` branch; `signUp()` now carries `options.data.handle`

## Decisions Made
- Followed the plan's D-14 posture exactly: the route can say available/unavailable/unknown, never a claim. Confirmed via test that a DB error on either read returns `{ available: null, reason: null }`, not a false negative.
- Collapsed taken/reserved/retired into one `'unavailable'` reason, matching 36-03's PATCH route and T-36-19's disposition (accepted: handle-taken status is inherently public via `/u/<handle>`).
- Used `handleFormatError()` directly (not the composed `handleFieldState()`) as the debounce-fire guard in the signup component, to avoid the effect's fire condition depending on its own `checking`/`remote` state — documented inline as functionally equivalent to `handleFieldState()`'s format gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two RED-test assertions were too strict for the missing/empty-handle case**
- **Found during:** Task 1 GREEN verification
- **Issue:** The RED test asserted `body` deep-equals `{ available: false, reason: 'invalid' }` for missing/empty handle input, but the route (correctly, per the shared `handleFormatError()`) also returns a `message` field for that case — the plan's behavior spec only explicitly requires the message for the *malformed* case, but doesn't forbid it for missing/empty, and including it is more useful to the caller (no reason to special-case suppressing it).
- **Fix:** Relaxed those two assertions to check `body.available`/`body.reason` individually rather than deep-equality, rather than adding special-case logic to the route to omit the message conditionally.
- **Files modified:** `__tests__/handle-available-route.test.ts`
- **Verification:** `npx jest __tests__/handle-available-route.test.ts` — 12/12 passing
- **Committed in:** `a4e98f6` (Task 1 GREEN commit)

**2. [Process — not a Rule 1-4 deviation] Wave-2 git-index collision with plan 36-05**
- **Found during:** Attempting to commit Task 2's GREEN implementation
- **Issue:** This session's plans (36-03, 36-04, 36-05) all execute in the SAME working directory (not isolated git worktrees — `.git` is a real directory, not a worktree file). Plan 36-05's agent ran a broad `git add` that staged and committed my then-untracked `lib/handles/availability.ts` alongside its own `resolve.ts`/`resolve.test.ts`, under its own commit `00d2f4b`.
- **Fix:** No action needed from this side — the 36-05 agent self-corrected with `c623ecc` (`fix(36-05): drop lib/handles/availability.ts from the 36-05 commit`), untracking the file from its commit while leaving it correct on disk. I then re-verified the content was byte-identical to what I'd tested (`diff` confirmed), staged it explicitly, and committed it properly under `790715e`.
- **Files affected:** `lib/handles/availability.ts` (content never changed, only its commit attribution was corrected)
- **Verification:** `git log --oneline -- lib/handles/availability.ts` shows a clean history: created in `790715e` under this plan, after `c623ecc` untracked it from `00d2f4b`.
- **Committed in:** `790715e`
- **Not an architectural deviation (Rule 4 not applicable):** this is a session/tooling artifact of shared-directory parallel execution, not a plan or code decision. Flagging it here per the plan's "record deviations" instruction, and because a future reader of `git log` should understand why `00d2f4b`'s diff and its current tree state differ.

---

**Total deviations:** 1 auto-fixed test correction (Rule 1), 1 process note (wave-2 git-index collision, self-corrected by the other agent, no owner-decision impact).
**Impact on plan:** No scope creep, no change to any owner decision (D-01..D-15). All three tasks match the plan's behavior specs exactly.

## Issues Encountered
- The shared (non-worktree-isolated) execution directory across this wave's three plans (36-03/36-04/36-05) created a real risk of one agent's `git add` sweeping up another's untracked files — see Deviation #2 above. Mitigated in this session by staging files individually and re-checking `git status` immediately before every commit, per the executor's task-commit protocol. Worth flagging to the orchestrator for future waves: true git-worktree isolation per parallel agent would remove this class of risk entirely.

## User Setup Required
None - no external service configuration required. Migration 133 (the DB layer this plan depends on) is already live in prod per 36-02's blocking checkpoint.

## Next Phase Readiness
- Plan 06's `ChooseHandleGate` can import `handleFieldState()` from `lib/handles/availability.ts` directly — it is written generically (no signup-specific state) for exactly that reuse.
- Signup end-to-end (`/signup` → handle field → `signUp()` → prod migration 133) has NOT been exercised in a browser in this session — see coverage item D4's `human_judgment: true` rationale. Recommend one manual click-through before considering Phase 36 fully done.
- The invite gate, Turnstile/waitlist flow, and the `existing-account`/`denied`/`invite-expired` branches were verified untouched via `git diff` — confirmed no admission-path regression risk from this plan.

---
*Phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d*
*Completed: 2026-08-30*

## Self-Check: PASSED

All 5 created/modified files confirmed present on disk; all 4 plan commits
(91a1178, 790715e, a4e98f6, 0e57b51) confirmed present in `git log --all`.
