---
phase: 32-production-observability-capacity-incident-readiness
plan: 03
subsystem: api
tags: [health-check, supabase, nextjs, observability, r4]

# Dependency graph
requires: []
provides:
  - "GET /api/health — read-only, timeout-bounded, secret-safe health endpoint (R4)"
  - "SUPABASE_CHECK_TIMEOUT_MS (2000ms) exported constant for downstream reference"
affects: [32-05-daily-observability-cron, 32-07-better-stack-monitor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise.race(queryPromise, timeoutPromise) belt-and-suspenders timeout, layered on AbortController, so a hung/never-resolving Supabase call cannot hang the route regardless of transport abort-signal support"
    - "Self-guarded unauthenticated /api route (no auth.getUser(), single cheap bounded read, minimal response body) — mirrors app/api/waitlist/route.ts's compensating-controls-instead-of-auth shape"

key-files:
  created:
    - app/api/health/route.ts
    - app/api/health/route.test.ts
  modified: []

key-decisions:
  - "Degraded Supabase check returns HTTP 503 (not 200 with a body flag) so Better Stack's status-code check treats it as down — resolves RESEARCH's Open Question #1."
  - "Timeout is enforced via Promise.race against a timer promise in addition to AbortController, because the jest mock (and potentially some real transports) don't guarantee an aborted fetch always rejects/settles the awaited promise — the race guarantees bounded resolution regardless."
  - "Response body is a fixed 3-key shape (status, checkedAt, durationMs) with no pass-through of the Supabase error object, message, or any env value — verified by an explicit key-set assertion in the redaction test, not just a substring-absence check."

requirements-completed: [R4]

coverage:
  - id: D1
    description: "GET /api/health returns healthy/200 when the single Supabase read succeeds"
    requirement: "R4"
    verification:
      - kind: unit
        ref: "app/api/health/route.test.ts#returns healthy / 200 when the Supabase check succeeds"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/health returns degraded/503 (never 500/crash) when the Supabase check errors"
    requirement: "R4"
    verification:
      - kind: unit
        ref: "app/api/health/route.test.ts#returns degraded / 503 (never 500) when the Supabase check errors"
        status: pass
    human_judgment: false
  - id: D3
    description: "A hung Supabase check resolves degraded within the strict timeout budget instead of hanging the route"
    requirement: "R4"
    verification:
      - kind: unit
        ref: "app/api/health/route.test.ts#resolves degraded within the timeout budget when the check hangs (never hangs the route)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Response body never leaks secrets/schema/exception text across healthy and degraded cases (fixed 3-key shape only)"
    requirement: "R4"
    verification:
      - kind: unit
        ref: "app/api/health/route.test.ts#never leaks secrets/schema/exception text in the healthy/degraded body"
        status: pass
    human_judgment: false
  - id: D5
    description: "The route issues exactly one read-only select per request and never invokes insert/update/delete/rpc"
    requirement: "R4"
    verification:
      - kind: unit
        ref: "app/api/health/route.test.ts#issues exactly one read-only select per request and never writes"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-08-13
status: complete
---

# Phase 32 Plan 3: Read-only, timeout-bounded /api/health endpoint Summary

**GET /api/health with a single AbortController+Promise.race-bounded Supabase read, 200/503 status contract, and a fixed-shape secret-safe body — the self-guarded surface Better Stack and the daily cron will poll.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-13T17:07:26Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2 (both created)

## Accomplishments
- `GET /api/health` implemented: single cheap read-only Supabase check (`select id from artist_invites limit 1`), never writes, never calls `auth.getUser()`/reads a session (middleware excludes `/api`, so this route is its own full security boundary).
- Strict timeout enforced two ways — `AbortController` (aborts the underlying fetch) raced via `Promise.race` against a plain timer promise — guaranteeing the route resolves within `SUPABASE_CHECK_TIMEOUT_MS` (2000ms) even if a transport/mock never settles the aborted call on its own.
- Status-code contract landed per RESEARCH Open Question #1: 200 = healthy, 503 = degraded (never an unhandled 500/crash) — any exception (timeout, network, unexpected) is caught and degrades gracefully.
- Response body is a minimal fixed 3-key shape (`status`, `checkedAt`, `durationMs`) — no Supabase error object, message, env value, or schema/table name is ever echoed.
- 6 Jest tests covering healthy, degraded, timeout (bounded resolution, not indefinite hang), secret-redaction (parameterized across healthy/degraded + explicit key-set assertion), and single-read/no-write enforcement.

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1 (RED): failing test for /api/health** - `a9b4806` (test) — confirmed failing (`Cannot find module './route'`) before the implementation existed.
2. **Task 1 (GREEN): implement /api/health route** - `32d2d6a` (feat) — all 6 tests pass, `tsc --noEmit` and `eslint` clean.

**Plan metadata:** (this commit) — `docs(32-03): complete read-only /api/health plan`

## Files Created/Modified
- `app/api/health/route.ts` - `GET` handler: single bounded Supabase read, timeout race, 200/503 contract, secret-safe body, `SUPABASE_CHECK_TIMEOUT_MS` export.
- `app/api/health/route.test.ts` - 6 tests: healthy, degraded, timeout, redaction (parameterized x2 cases + key-set assertion), no-write/single-read.

## Decisions Made
- Degraded → HTTP 503 (resolves RESEARCH Open Question #1) so Better Stack's status-code check treats it as down without needing to parse the body.
- Timeout enforcement is belt-and-suspenders: `AbortController.abort()` plus a raced timer-promise resolution, rather than relying solely on the aborted fetch to reject/settle — this makes the timeout behavior deterministic and testable independent of transport-specific abort semantics.
- Redaction test asserts both substring-absence (URL/key/table-name/error-text fragments) AND an exact `Object.keys(...).sort()` equality — stronger guarantee than substring checks alone against any future field creep.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added a raced timeout-promise alongside AbortController**
- **Found during:** Task 1, GREEN phase — the plan's PATTERNS.md code example passed `AbortController.signal` to the query and relied on the abort causing the awaited call to settle. Under the planned test setup (and potentially some real transports), a query that never observes/honors the abort signal would hang indefinitely, violating the "never hangs" truth and the timeout acceptance criterion.
- **Issue:** `await service.from(...).select(...).abortSignal(...).limit(1)` alone does not guarantee bounded resolution if the underlying call doesn't reject on abort.
- **Fix:** Added `Promise.race([queryPromise, timeoutPromise])` where `timeoutPromise` resolves with a synthetic `{ error }` outcome on the same `setTimeout` that fires `controller.abort()` — the route now provably resolves within `SUPABASE_CHECK_TIMEOUT_MS` regardless of transport-specific abort behavior.
- **Files modified:** `app/api/health/route.ts`
- **Verification:** Timeout test (`hang: true` mock, a promise that never resolves on its own) passes, asserting `res.status === 503` and elapsed time `< SUPABASE_CHECK_TIMEOUT_MS * 2`.
- **Committed in:** `32d2d6a` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug/robustness fix)
**Impact on plan:** Strengthens the plan's timeout requirement into a testable, transport-independent guarantee. No scope creep — same files, same behavior contract.

## Issues Encountered
- Initial TypeScript compile failed (`TS2739`) because the PostgREST query builder returns a thenable, not a real `Promise`, which can't satisfy `Promise.race`'s typed array directly. Resolved by wrapping the builder chain in `Promise.resolve(...)` before racing — `tsc --noEmit` now clean.

## User Setup Required
None - no external service configuration required. (Better Stack's actual polling configuration is Plan 07's scope.)

## Next Phase Readiness
- `/api/health` is live and tested; Plan 05 (daily observability cron) and Plan 07 (Better Stack monitor) can both poll it against the documented 200/503 contract.
- No blockers for downstream plans in this wave.

---
*Phase: 32-production-observability-capacity-incident-readiness*
*Completed: 2026-08-13*

## Self-Check: PASSED

- FOUND: app/api/health/route.ts
- FOUND: app/api/health/route.test.ts
- FOUND: .planning/phases/32-production-observability-capacity-incident-readiness/32-03-SUMMARY.md
- FOUND commit: a9b4806
- FOUND commit: 32d2d6a
