---
phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
plan: 03
subsystem: api
tags: [typescript, next.js, supabase, handles, jest]

# Dependency graph
requires:
  - phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
    provides: "lib/handles/validate.ts (isValidHandle/normalizeHandleForCompare/handleFormatError) from 36-01; migration 133's handle_history table, its unique index on lower(old_handle), and the reserved/retired guard from 36-02"
provides:
  - "app/api/profile/handle/route.ts — PATCH, the only write path for handle_history in the whole codebase"
  - "lib/handles/change-form.ts — handleChangeSubmitState(), the pure settings-form submit decision"
  - "components/profile/HandleSettingsForm.tsx — its own form, its own endpoint, its own request"
  - "app/(artist)/settings/profile/page.tsx now server-reads the caller's current handle and mounts the form"
affects: [36-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedicated PATCH route for a field needing atomic secondary-table logic, mirroring /api/profile/visibility rather than joining the generic EDITABLE_FIELDS allowlist"
    - "Database-rejection-is-the-authority error mapping: 23505 -> 409, any other update error (the guard's plain-message raise) -> 400, both surfaced as one non-specific message"
    - "Best-effort secondary write via try/catch swallow, matching lib/social/activity-emit.ts's established idiom"
    - "Pure submit-decision module tested directly (no jsdom in this repo) with the component staying a thin shell around it"

key-files:
  created:
    - app/api/profile/handle/route.ts
    - __tests__/profile-handle-route.test.ts
    - lib/handles/change-form.ts
    - lib/handles/change-form.test.ts
    - components/profile/HandleSettingsForm.tsx
  modified:
    - app/(artist)/settings/profile/page.tsx

key-decisions:
  - "The 429 rate limit uses an explicit 24h/5-attempt window (not the default 15min/5), justified in a route comment: D-08 makes every change permanently burn a name, so the window has to be wide enough to rule out a name-exhaustion loop rather than just deterring brute force."
  - "handleChangeSubmitState()'s 'unchanged' check is byte-equality after trim, not lowered equality, so a casing-only edit (D-04) is still submitted — the route itself is what decides whether that submission also writes a history row."
  - "The settings page reads the current handle with its own service-client select('handle') rather than pulling it off SettingsFormProvider's context, mirroring how PrivacySettingsForm already sits on this same page independent of the shared form-tab machinery."

patterns-established:
  - "A field that needs atomic secondary-table logic gets its own PATCH route outside EDITABLE_FIELDS, never a special-cased branch inside the generic profile route — this is now the third instance (visibility, and now handle) of that split."

requirements-completed: [D-07, D-08, D-14]

coverage:
  - id: D1
    description: "PATCH /api/profile/handle rejects an unauthenticated caller with 401 and never touches the database"
    requirement: "D-14"
    verification:
      - kind: unit
        ref: "__tests__/profile-handle-route.test.ts#requires authentication — 401, no database call"
        status: pass
    human_judgment: false
  - id: D2
    description: "A malformed handle returns 400 with the shared lib/handles/validate.ts message and no update is attempted"
    requirement: "D-14"
    verification:
      - kind: unit
        ref: "__tests__/profile-handle-route.test.ts#rejects a malformed handle"
        status: pass
    human_judgment: false
  - id: D3
    description: "A casing-only change persists the new casing and writes no handle_history row"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "__tests__/profile-handle-route.test.ts#a casing-only change persists the new casing and writes no history row"
        status: pass
    human_judgment: false
  - id: D4
    description: "A genuinely new handle updates and writes exactly one handle_history row carrying the OLD handle and the caller's profile id"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "__tests__/profile-handle-route.test.ts#a genuinely new handle updates and writes exactly one history row"
        status: pass
    human_judgment: false
  - id: D5
    description: "No prior handle at all — 200, no history row (nothing to retire)"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "__tests__/profile-handle-route.test.ts#no prior handle at all"
        status: pass
    human_judgment: false
  - id: D6
    description: "A Postgres unique-violation (23505) from the update maps to 409 with no history row written"
    requirement: "D-14"
    verification:
      - kind: unit
        ref: "__tests__/profile-handle-route.test.ts#unique-violation from the update — 409"
        status: pass
    human_judgment: false
  - id: D7
    description: "The reserved/retired guard's raise maps to 400 with no history row written, decided by the database, not an earlier check"
    requirement: "D-14"
    verification:
      - kind: unit
        ref: "__tests__/profile-handle-route.test.ts#the guard's reserved/retired raise — 400"
        status: pass
    human_judgment: false
  - id: D8
    description: "A rejecting handle_history insert still returns 200 — the handle change itself is never rolled back or surfaced as an error"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "__tests__/profile-handle-route.test.ts#a rejecting history insert still returns 200"
        status: pass
    human_judgment: false
  - id: D9
    description: "Exceeding the per-user 5-per-24h rate limit returns 429 before any database write"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "__tests__/profile-handle-route.test.ts#exceeding the per-user rate limit"
        status: pass
    human_judgment: false
  - id: D10
    description: "handleChangeSubmitState() covers unchanged/casing-change-is-still-ready/invalid/no-current-handle/trim cases"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "lib/handles/change-form.test.ts"
        status: pass
    human_judgment: false
  - id: D11
    description: "The generic app/api/profile/route.ts EDITABLE_FIELDS allowlist is untouched — handle stays absent from it"
    requirement: "D-14"
    verification:
      - kind: unit
        ref: "grep -c \"'handle',\" app/api/profile/route.ts (returns 0)"
        status: pass
    human_judgment: false
  - id: D12
    description: "The settings form actually renders on the Public profile tab, wired to the new route, with a plain-language warning that a change permanently burns the old handle"
    verification: []
    human_judgment: true
    rationale: "Visual/interactive verification of a client-side form with a live fetch to a session-authenticated route needs a signed-in browser session — no automated harness in this repo exercises a real PATCH round trip end to end."

# Metrics
duration: ~25min
completed: 2026-08-30
status: complete
---

# Phase 36 Plan 03: Handle Write Path + Settings Field Summary

**`PATCH /api/profile/handle` is the only place in the codebase that writes `handle_history`, and it treats every database rejection — 23505 or the reserved/retired guard's raise — as the sole authority on availability, never an earlier check.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-30T05:15:00Z (approx, continuation of same session as 36-01/36-02)
- **Completed:** 2026-08-30T05:48:00Z
- **Tasks:** 2
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments
- `app/api/profile/handle/route.ts` — the dedicated `PATCH` route D-07's "handles are changeable" decision needed to be exercisable at all. Auth check, a 5-per-24h rate limit ahead of any write, format validation via the shared `lib/handles/validate.ts` authority, a casing-only short-circuit that writes without retiring anything (D-04), and an error-mapping step that treats the database's rejection — never an availability pre-check — as the only source of truth (D-14): `23505` → 409, the guard's plain-message raise → 400, one non-specific message for both (T-36-15).
- `lib/handles/change-form.ts`'s pure `handleChangeSubmitState()` — the settings form's submit decision, tested directly since this repo has no jsdom. `unchanged` is byte-equality after trim (not lowered equality), so a casing-only edit is still a submit.
- `components/profile/HandleSettingsForm.tsx` — its own form, its own endpoint, its own request, mounted on the Public profile settings tab above the existing Privacy form, with plain-language copy stating the permanent consequence (old link redirects, old handle can never be reclaimed by anyone) before the person commits.

## Task Commits

Each task was committed atomically:

1. **Task 1: PATCH /api/profile/handle — the dedicated handle write route (D-07, D-08, D-14)** - `0cd547a` (feat)
2. **Task 2: Handle-change settings field (D-07 entry point)** - `002db2f` (feat)

_Both tasks were TDD-style: test file written alongside the implementation, both landed in the same commit per task._

## Files Created/Modified
- `app/api/profile/handle/route.ts` - `PATCH` handler: auth → rate limit → format check → casing-vs-identity comparison → update → database-authoritative error mapping → best-effort history insert
- `__tests__/profile-handle-route.test.ts` - 9 tests, one per behavior line in the plan, including both "no history row was written" negative assertions
- `lib/handles/change-form.ts` - `handleChangeSubmitState()`
- `lib/handles/change-form.test.ts` - 6 tests covering the full behavior block
- `components/profile/HandleSettingsForm.tsx` - client component, its own local state and `fetch`, not wired into `useSettingsForm()`
- `app/(artist)/settings/profile/page.tsx` - now an async server component that reads the caller's current handle (mirroring the layout's existing profile-fetch pattern and demo-mode branch) and mounts `HandleSettingsForm`

## Decisions Made
- The rate-limit window for handle changes is explicitly `{ windowMs: 24h, maxAttempts: 5 }`, not the module's default 15-minute/5-attempt shape — justified in a route comment tying it to D-08's permanent-burn consequence rather than treating it as generic abuse throttling.
- `handleChangeSubmitState()`'s exact-equality short circuit intentionally does NOT lower-compare, so the route (not the form) is the single place that decides whether a submission is a true identity change (writes history) or a casing touch-up (does not) — keeping that judgment call in one place rather than duplicating it client-side.
- The settings page fetches the current handle independently rather than reading it off `SettingsFormProvider`'s context, matching the existing `PrivacySettingsForm` precedent already on this same page of a form that deliberately stays outside the shared tab-save machinery.

## Deviations from Plan

None that change an owner decision.

**1. [Process — shared working tree, not a plan deviation] Two commits initially over-staged files belonging to concurrent 36-04/36-05 agents.**
- **Found during:** Task 1's first commit attempt (`git add` for my two files, followed immediately by `git commit`) picked up `lib/handles/resolve.ts` and `lib/handles/resolve.test.ts` — files a concurrent 36-05 agent had staged in the same shared git index between my `add` and my `commit`.
- **Fix:** `git reset --soft HEAD~1` (keeps the index, does not touch the working tree) followed by `git reset HEAD -- lib/handles/resolve.ts lib/handles/resolve.test.ts` to unstage exactly those two files back to their pre-existing untracked state, then re-committed with only my two files. Verified via `git show --stat HEAD` that the resulting commit contained exactly `app/api/profile/handle/route.ts` and `__tests__/profile-handle-route.test.ts`, and that the two sibling-agent files were untouched (line counts confirmed identical before/after).
- **Files affected:** None of my own files were modified by this fix — it only corrected which commit owned two files that were never mine. No content was created, deleted, or altered.
- **Root cause noted for the orchestrator:** parallel plan-executor agents in this run share a single git working directory and index rather than isolated worktrees, so a `git add <specific files>` immediately followed by `git commit` is not atomic against a concurrent agent's `git add` landing in between. Every subsequent commit in this plan was verified post-hoc with `git show --stat HEAD` to catch this before moving on. Task 2's commit was staged and verified clean on the first attempt.
- Did not touch `lib/handles/availability.ts`, `lib/handles/availability.test.ts`, `app/u/[handle]/page.tsx`, or `__tests__/handle-available-route.test.ts` at any point — all confirmed out of `files_modified` scope and left for 36-04/36-05.

**2. [Transient, self-resolved — not a fix] `npx tsc --noEmit` briefly reported one error in an unrelated file mid-session.**
- **Found during:** Task 2's gate run, immediately after committing.
- **Issue:** `__tests__/handle-available-route.test.ts` (36-04's TDD red-phase test file, not in this plan's `files_modified`) referenced `app/api/handles/available/route.ts` before that sibling plan had created it — a normal mid-flight state of a concurrent agent, not something this plan caused or is permitted to touch.
- **Resolution:** Not fixed by this plan (out of scope per wave discipline). Re-ran `npx tsc --noEmit` after a short interval and it was clean — the 36-04 agent had landed the route file in the meantime. Final gate run (reported below) is 0 errors.

## Threat Mitigations Applied

| Threat ID | Disposition | How it landed |
|-----------|-------------|---------------|
| T-36-12 | mitigate | The update is scoped `.eq('id', user.id)` with the id taken from `auth.getUser()` on the session-bound client, never the request body. Test asserts the service client is never reached without a session. |
| T-36-13 | mitigate | The route performs no reserved/retired check of its own — migration 133's trigger is the sole enforcement, surfaced as a plain 400. |
| T-36-14 | mitigate | 5 changes per 24 hours via `checkRateLimit`, applied before any write; test asserts 429 with zero database calls. |
| T-36-15 | mitigate | One non-specific `'That handle is not available'` message for both the 409 and 400 branches — the response never distinguishes taken from reserved from retired. |
| T-36-16 | accept | Update runs before the history insert, per the plan's explicit ordering rationale; documented in the route's own comment. |
| T-36-SC | accept | Zero new dependencies; no package-manager install in this plan. |

## Known Stubs

None. Both new UI/API surfaces are fully wired: the form posts to a real route, the route performs a real database write, and the settings page reads a real value server-side (with an explicit demo-mode branch mirroring the rest of that page).

## Issues Encountered

None beyond the two documented above (both process/timing artifacts of running inside a shared, non-worktree-isolated repository alongside concurrent 36-04/36-05 agents — neither affected the correctness of this plan's own files).

## User Setup Required

None — no external service configuration required. Everything in this plan runs against migration 133, already live in production per this plan's brief.

## Next Phase Readiness
- `PATCH /api/profile/handle` is ready for plan 06's `ChooseHandleGate` to post to as the same server-side write path a handle-less account and a rebranding account both share.
- `lib/handles/change-form.ts`'s `handleChangeSubmitState()` is exported and available if plan 06's gate wants the same unchanged/invalid/ready decision shape for its own first-time-claim flow (that flow has no "current handle," so it would call this with `current: null`).
- Full suite: 3100/3100 passing (this plan's own baseline entry point was 3055; 3100 reflects 15 new tests from this plan plus tests landed concurrently by 36-04/36-05/36-01/36-02 in the same shared repo during this session). `npx tsc --noEmit` clean. `npm run lint -- --max-warnings=0` clean. `npm run build` was never run.

---
*Phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d*
*Completed: 2026-08-30*

## Self-Check: PASSED

All 6 created/modified source files and the SUMMARY.md itself verified present on disk; both task commit hashes (`0cd547a`, `002db2f`) verified present in `git log`.
