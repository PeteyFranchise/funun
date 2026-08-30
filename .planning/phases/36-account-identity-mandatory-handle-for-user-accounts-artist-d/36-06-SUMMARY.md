---
phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
plan: 06
subsystem: auth
tags: [nextjs, app-router, react, handles, gate, account-types, security]

# Dependency graph
requires:
  - phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
    provides: "PATCH /api/profile/handle (plan 03) — the single validated server-side handle write path"
  - phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
    provides: "GET /api/handles/available + handleFieldState() (plan 04) — the shared courtesy availability check and field-state derivation"
  - phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
    provides: "lib/handles/validate.ts (plan 01) — the single handle format authority"
provides:
  - "lib/handles/gate.ts — shouldGateForHandle() + resolveHandleGate<T>(), the profile-row-keyed gate decision with injected loader and renderer"
  - "components/handles/ChooseHandleGate.tsx — D-09's unskippable choose-a-handle screen"
  - "app/(artist)/layout.tsx — the gate mount; a handle-less User Account now sees the screen instead of the app"
  - "The draining mechanism plan 07's NOT NULL constraint depends on (D-13)"
affects: [36-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injected render callback as the unit of proof: resolveHandleGate takes renderGate as a parameter so a test can assert the gate was NEVER CONSTRUCTED for an excluded identity (not merely that a boolean was false) — the same machine-verified shape lib/admin/gate.test.ts uses for leadership-only loaders"
    - "renderToStaticMarkup + negative string assertions to machine-verify the ABSENCE of a UI affordance (no skip / dismiss / later), under testEnvironment: 'node' with no jsdom"

key-files:
  created:
    - lib/handles/gate.ts
    - lib/handles/gate.test.ts
    - components/handles/ChooseHandleGate.tsx
    - components/handles/ChooseHandleGate.test.tsx
  modified:
    - app/(artist)/layout.tsx

key-decisions:
  - "The gate decision lives in a pure, import-free module (no Supabase, no React) with BOTH the profile loader and the gate renderer injected. That is the only reason the staff and buyer exclusions are machine-verifiable at all: a Team Member and a Client Partner identity are near-impossible to construct in a running app, but trivial as fixtures against a pure function — and the never-called assertion on renderGate proves the blocking screen is never even built for them, which a boolean assertion would not."
  - "The prop `userId` on ChooseHandleGate is rendered only as a `data-gate-user-id` attribute for support/debugging and is NEVER sent with the PATCH. The write authorises from the session server-side; a client-supplied id is not identity (T-04-01 precedent)."
  - "A whitespace-only or empty-string handle counts as NO handle, not as a handle. lib/handles/validate would reject both, so neither is a public identity, and leaving either ungated would leave a row that plan 07's NOT NULL constraint technically accepts but that renders as an empty profile URL."
  - "Added ChooseHandleGate.test.tsx beyond the plan's task list: D-09's 'no skip, no dismiss' is a prohibition, and a prohibition that is only enforced by code review is one refactor away from being violated. Asserted as absent strings in the rendered markup."

patterns-established:
  - "When a gate excludes an account type, assert the exclusion by proving the excluded branch's callback was never invoked — not by asserting a return value. A return-value assertion passes against a gate that computes the right answer for the wrong reason; a never-called assertion does not."
  - "The absence of a user_profiles row is the structural signal for 'not a User Account' and must always mean DO NOT ACT, never DO BLOCK (D-10b). Any future profile-shaped gate in this codebase should copy the `profile !== null` guard verbatim."

requirements-completed: [D-09, D-10, D-10a, D-10b, D-10c]

coverage:
  - id: D1
    description: "A Team Member identity never triggers the gate — the blocking screen is never constructed for a staff session (D-10c case 1, T-36-28)"
    requirement: "D-10c"
    verification:
      - kind: unit
        ref: "lib/handles/gate.test.ts#never calls renderGate for a Team Member, and returns null"
        status: pass
      - kind: unit
        ref: "lib/handles/gate.test.ts#is false for a Team Member — a staff identity has no user_profiles row"
        status: pass
    human_judgment: false
  - id: D2
    description: "A Client Partner identity never triggers the gate — and this covers a REACHABLE path, since middleware's isProtected tests only !user and never checks role (D-10a correction, D-10c case 2, T-36-29)"
    requirement: "D-10c"
    verification:
      - kind: unit
        ref: "lib/handles/gate.test.ts#never calls renderGate for a Client Partner, and returns null"
        status: pass
      - kind: unit
        ref: "lib/handles/gate.test.ts#is false for a Client Partner — a buyer identity has no user_profiles row"
        status: pass
    human_judgment: false
  - id: D3
    description: "A User Account that already has a handle passes straight through (D-10c case 3)"
    requirement: "D-10c"
    verification:
      - kind: unit
        ref: "lib/handles/gate.test.ts#never calls renderGate for a User Account that already has a handle"
        status: pass
    human_judgment: false
  - id: D4
    description: "A User Account with a profile row and no handle is gated, exactly once, for its own id (D-10c case 4)"
    requirement: "D-09"
    verification:
      - kind: unit
        ref: "lib/handles/gate.test.ts#calls renderGate exactly once with the user id for a handle-less User Account"
        status: pass
      - kind: unit
        ref: "lib/handles/gate.test.ts#is true for a User Account with a profile row and a null handle"
        status: pass
    human_judgment: false
  - id: D5
    description: "An empty or whitespace-only handle is treated as no handle"
    requirement: "D-09"
    verification:
      - kind: unit
        ref: "lib/handles/gate.test.ts#is true for an empty-string handle — an empty column is not a handle"
        status: pass
      - kind: unit
        ref: "lib/handles/gate.test.ts#is true for a whitespace-only handle — a blank handle is not a handle"
        status: pass
    human_judgment: false
  - id: D6
    description: "An unauthenticated render spends no database round trip — loadProfile is never called with no session"
    requirement: "D-10"
    verification:
      - kind: unit
        ref: "lib/handles/gate.test.ts#short-circuits with no session — neither loadProfile nor renderGate runs"
        status: pass
    human_judgment: false
  - id: D7
    description: "The gate screen offers no skip, dismiss, close or 'later' affordance (D-09)"
    requirement: "D-09"
    verification:
      - kind: unit
        ref: "components/handles/ChooseHandleGate.test.tsx#offers no skip, dismiss, close or \"later\" affordance"
        status: pass
    human_judgment: false
  - id: D8
    description: "Someone caught by the gate can still sign out — unskippable, not a trap (T-36-30)"
    requirement: "D-09"
    verification:
      - kind: unit
        ref: "components/handles/ChooseHandleGate.test.tsx#offers a sign-out exit — unskippable is the requirement, inescapable is not"
        status: pass
    human_judgment: false
  - id: D9
    description: "The handle-less state resolves through the same PATCH /api/profile/handle a settings change uses — no second write path, no second regex"
    requirement: "D-09"
    verification:
      - kind: unit
        ref: "grep -n '/api/profile/handle' components/handles/ChooseHandleGate.tsx -> exactly 1 fetch call site (line 100)"
        status: pass
      - kind: unit
        ref: "grep -n 'handleFieldState' components/handles/ChooseHandleGate.tsx -> exactly 1 call site (line 44) + the import"
        status: pass
    human_judgment: false
  - id: D10
    description: "The gate is mounted in the artist route-group layout, not in middleware, and returns early without rendering nav/header/children (D-10a, T-36-33)"
    requirement: "D-10a"
    verification:
      - kind: unit
        ref: "grep -n 'resolveHandleGate' app/(artist)/layout.tsx -> import + single call site; `if (handleGate) return handleGate` precedes the body composition"
        status: pass
      - kind: unit
        ref: "middleware.ts unchanged (git diff shows no modification)"
        status: pass
    human_judgment: false
  - id: D11
    description: "The pre-existing capability_grants and sync-library reads, nav props, header, presence tracker and unauthenticated early return are untouched"
    requirement: "D-10a"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit -> 0 errors; npx jest (full suite) -> 3116 passed, 287 suites (baseline 3100/285 + 16 new)"
        status: pass
    human_judgment: false
  - id: D12
    description: "Live end-to-end behaviour: a real Team Member loads /admin untouched, and a real Client Partner navigating directly to /vault sees no handle prompt"
    requirement: "D-10c"
    verification:
      - kind: manual_procedural
        ref: "Owner end-of-phase verification, per the plan's <verification> manual sanity step"
        status: pending
    human_judgment: true
    rationale: "Requires real staff and buyer sessions against production auth; not exercisable in this repo (no jsdom, no live Supabase in CI). The unit-level never-called assertions (D1, D2) are the machine-verified substitute and are the protection that actually holds at runtime."

# Metrics
duration: ~14min
completed: 2026-08-30
status: complete
---

# Phase 36 Plan 06: The Hard Gate Summary

A signed-in User Account with a profile row and no handle now sees one unskippable
choose-a-handle screen instead of the app — and a Team Member or Client Partner provably never
does, because the decision keys on owning a `user_profiles` row rather than on being signed in.

## Performance

- **Duration:** ~14 min (2b6e7b1 to fef9e4d, including baseline verification)
- **Started:** 2026-08-30T01:52:00-04:00
- **Completed:** 2026-08-30T02:04:07-04:00
- **Tasks:** 3/3
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- **`lib/handles/gate.ts`** — `shouldGateForHandle()` requires a non-null profile row before it can
  ever return true, and `resolveHandleGate<T>()` takes the profile loader and the gate renderer as
  injected callbacks so both can be observed by a test. Pure and import-free (no Supabase, no
  React), which is what keeps it runnable under `testEnvironment: 'node'`.
- **`lib/handles/gate.test.ts`** — 13 assertions, including the four D-10c cases. The staff, buyer
  and has-handle cases each assert `expect(renderGate).not.toHaveBeenCalled()`.
- **`components/handles/ChooseHandleGate.tsx`** — the blocking screen. No skip, no dismiss, no
  close, no "later". Reuses `handleFieldState()`, the shared format authority, the debounced
  `GET /api/handles/available` (behind a monotonic request counter), and `PATCH /api/profile/handle`.
  `router.refresh()` on success. Server error strings rendered verbatim. Sign-out link present.
- **`app/(artist)/layout.tsx`** — the mount, inside the existing `if (user)` block, with a comment
  recording the placement decision *and its correction* so the next reader is not tempted to move it
  to middleware. Returns the gate directly instead of composing it with `children`.

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/handles/gate.ts — the gate decision, with the never-fires proof** — `2b6e7b1` (feat)
2. **Task 2: components/handles/ChooseHandleGate.tsx — the unskippable screen** — `42188ff` (feat)
3. **Task 3: Mount the gate in app/(artist)/layout.tsx** — `fef9e4d` (feat)

## Files Created/Modified

- `lib/handles/gate.ts` — `shouldGateForHandle()`, `resolveHandleGate<T>()`, `HandleGateUser`, `HandleGateProfile`
- `lib/handles/gate.test.ts` — 13 assertions; typed `STAFF` / `BUYER` / `USER_ACCOUNT` fixtures
- `components/handles/ChooseHandleGate.tsx` — the D-09 screen
- `components/handles/ChooseHandleGate.test.tsx` — 3 `renderToStaticMarkup` assertions
- `app/(artist)/layout.tsx` — gate import, net-new `user_profiles` handle read, early return

## How the staff and buyer exclusions were proved

This is the question the plan exists to answer, so it is stated explicitly.

**The mechanism.** `resolveHandleGate` never builds the gate itself — it calls an injected
`renderGate(userId)` and returns whatever that returns. In the test, `renderGate` is a `jest.fn()`.
So "the gate never fires for this identity" is expressible as a fact about a call log, not as a
claim about a return value.

**Staff (T-36-28).** Fixture `STAFF = { id: 'staff-1', app_metadata: { staff_roles: ['ae'] } }` with
a `loadProfile` that resolves to `null` — which is what actually happens, because
`handle_new_user()` never inserts a `user_profiles` row for a Team Member (their identity lives in
`funun_staff`). The test asserts `expect(renderGate).not.toHaveBeenCalled()` and `result === null`.

**Buyer (T-36-29).** Fixture `BUYER = { id: 'buyer-1', app_metadata: { role: 'buyer' } }`, same
`loadProfile → null` — `handle_new_user()` returns early for `role = 'buyer'` before any profile
insert. Same `not.toHaveBeenCalled()` assertion.

**Why a return-value assertion would not have been enough.** `expect(result).toBe(null)` passes
against a gate that reaches the right answer for the wrong reason. `not.toHaveBeenCalled()` proves
the blocking screen is never constructed at all, which is the property that matters when the
failure mode is "a real person is locked out".

**Why these two cases and not an artist case.** An artist account passes every version of this
code, including the broken `!!user` one. The staff and buyer cases are the only ones that
distinguish the correct gate from the lockout, which is why the file carries a comment saying so
directly above them.

**The buyer case is reachable, not hypothetical.** `middleware.ts`'s `isProtected` check is
`if (isProtected && !user)` — it tests only for a signed-in user and never inspects role. A
signed-in Client Partner navigating directly to `/vault` therefore does render
`app/(artist)/layout.tsx`. Verified by reading `middleware.ts` at HEAD; the file was not modified
by this plan. The route group is not a wall — the `profile !== null` branch is (D-10b).

## Decisions Made

- **Empty and whitespace-only handles count as no handle.** `(profile.handle ?? '').trim().length === 0`
  rather than `!profile.handle`. Both would be rejected by `lib/handles/validate`, so neither is a
  public identity, and a row holding `'   '` would satisfy plan 07's `NOT NULL` constraint while
  producing a broken profile URL.
- **`userId` reaches the DOM only as a debug attribute.** The plan requires the prop; the write does
  not need it (the PATCH route authorises from the session). Rendering it as `data-gate-user-id`
  gives a support conversation something to work with without ever letting a client-supplied id
  become identity.
- **Reused `SignOutButton` rather than inventing a sign-out path.** It already does
  `supabase.auth.signOut()` → `/signin` → `router.refresh()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical verification] Added `components/handles/ChooseHandleGate.test.tsx`, not listed in the plan's files**

- **Found during:** Task 2
- **Issue:** D-09's core requirement is a *prohibition* — no skip, no dismiss, no close, no "later".
  The plan's Task 2 `<verify>` block checks only that the component type-checks and reuses the
  shared helpers; nothing machine-verifies the prohibition. A prohibition enforced only by code
  review survives exactly until the first well-meaning "let them do this later" PR, and if it is
  ever violated the handle-less backlog stops draining, which silently breaks plan 07's `NOT NULL`
  constraint.
- **Fix:** Added a 3-assertion `renderToStaticMarkup` test (the technique the owner specified, and
  the same one `components/vault/SharedProjectBadge.test.tsx` already uses) asserting the absence of
  `skip` / `not now` / `dismiss` / `maybe later` / `remind me` in the rendered markup, the presence
  of the sign-out exit, and the core copy.
- **Files modified:** `components/handles/ChooseHandleGate.test.tsx` (created)
- **Verification:** `npx jest components/handles/ChooseHandleGate.test.tsx` → 3 passed
- **Committed in:** `42188ff`

**2. [Rule 3 - Blocking] Three `grep -c ... | grep -qx 1` verify steps are unsatisfiable as written**

- **Found during:** Tasks 2 and 3
- **Issue:** `grep -c` counts matching *lines*, not occurrences. Any TypeScript file that imports a
  named export and calls it necessarily contains the identifier on at least 2 lines. The affected
  checks: `handleFieldState` in `ChooseHandleGate.tsx` (3 lines — import, the plan's own mandated
  explanatory comment, one call site), `/api/profile/handle` in the same file (2 lines — the comment,
  one fetch), and `resolveHandleGate` in `layout.tsx` (3 lines — import, comment, one call).
  `capability_grants | grep -qx 1` fails identically, and demonstrably did so **before this plan
  touched the file** — `git show HEAD~1:"app/(artist)/layout.tsx" | grep -c capability_grants` → 2,
  because a pre-existing comment names the table. This is the same plan-authoring imprecision
  recorded in 36-05-SUMMARY.md deviation 2, so it is a pattern rather than a one-off.
- **Fix:** No code change. Verified the *property* each check was proxying for, with `grep -n`:
  `handleFieldState` has exactly one call site (line 44); `/api/profile/handle` has exactly one fetch
  (line 100); `resolveHandleGate` has exactly one call (line 69); `.from('capability_grants')` still
  appears exactly once (line 32) and is unmodified.
- **Files modified:** none
- **Verification:** `grep -n` output recorded above; `npx tsc --noEmit` → 0 errors;
  `npx jest` → 3116 passed / 287 suites.
- **Committed in:** n/a (no code change)

**3. [Rule 3 - Blocking] TDD RED was verified but not committed as its own `test(...)` commit**

- **Found during:** Task 1
- **Issue:** Task 1 is `tdd="true"`, whose normal flow is a red `test(...)` commit followed by a
  green `feat(...)` commit. The owner's execution gates require `npx tsc --noEmit` to report 0 errors
  before *every* commit and explicitly forbid committing red. A RED commit is by definition red —
  `lib/handles/gate.test.ts` importing a not-yet-existent `@/lib/handles/gate` fails both `tsc` and
  `jest`.
- **Fix:** The RED phase was still executed and observed — the test file was written first and run
  before any implementation existed, failing with
  `Cannot find module '@/lib/handles/gate' from 'lib/handles/gate.test.ts'`. The implementation was
  then written and both files committed together in `2b6e7b1`. The owner's never-commit-red gate
  takes precedence over the TDD commit-granularity convention.
- **Files modified:** none beyond the plan's own
- **Verification:** RED observed (`Test Suites: 1 failed`, module not found); GREEN observed after
  implementation (`13 passed`).
- **Committed in:** `2b6e7b1`

---

**Total deviations:** 3 auto-fixed (1 added verification, 2 blocking plan/gate conflicts resolved
without code change). **No deviation touched an owner decision (D-01..D-15).**
**Impact on plan:** No scope creep, no architectural change, no behaviour outside the plan's intent.

## Issues Encountered

- None blocking. Note for the verifier: the gate's runtime behaviour against real staff and buyer
  sessions is the one thing this repo cannot exercise (no jsdom, no live Supabase in CI). It is
  recorded as coverage item D12 with `status: pending` and is the plan's own listed manual sanity
  step.

## TDD Gate Compliance

Task 1 ran RED → GREEN, but as a single commit rather than a `test(...)` + `feat(...)` pair — see
Deviations item 3. The RED phase was observed (module-not-found failure with the test written and
the implementation absent) before any implementation was authored; it was not committed because the
owner's execution gates forbid committing a red tree.

## User Setup Required

None — no new dependencies, no environment variables, no migration. The gate depends only on
already-shipped work from plans 01–04.

## Next Phase Readiness

- The draining mechanism D-13 requires is now in place: every handle-less User Account is asked for
  a handle on next sign-in with no way to skip. **Plan 07's `NOT NULL` constraint must not be applied
  until the remaining handle-less rows have actually drained** — the gate makes that possible, it does
  not make it instantaneous. Per 36-CONTEXT.md's D-09 count, that is ~3 real humans plus 5 fixture
  rows (`demo@`, `epktest-`, `droptest-`, two `codex-064-*`), and the fixture rows will never sign in,
  so plan 07 needs a backfill or a cleanup for them regardless.
- Full suite green at HEAD: `npx tsc --noEmit` 0 errors, `npm run lint -- --max-warnings=0` clean,
  `npx jest` 3116 passed / 287 suites (baseline 3100 / 285).
- `npm run build` was NOT run, per the owner's standing constraint (dev server on :3000).

---
*Phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d*
*Completed: 2026-08-30*

## Self-Check: PASSED

- FOUND: lib/handles/gate.ts
- FOUND: lib/handles/gate.test.ts
- FOUND: components/handles/ChooseHandleGate.tsx
- FOUND: components/handles/ChooseHandleGate.test.tsx
- FOUND: app/(artist)/layout.tsx
- FOUND commit: 2b6e7b1
- FOUND commit: 42188ff
- FOUND commit: fef9e4d
