---
phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
plan: 05
subsystem: api
tags: [supabase, row-level-security, nextjs-route-handlers, zod, jest]

# Dependency graph
requires:
  - phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
    provides: "migration 224's work_version_pins table and its single author-only RLS policy (plan 39-01); WorkVersionPin/WorkVersionPinView types (plan 39-01)"
provides:
  - "GET/POST /api/works/[workId]/versions/[versionId]/pins — list and create a private, wordless pin"
  - "DELETE /api/works/[workId]/versions/[versionId]/pins/[pinId] — author-only delete with a neutral 404"
  - "A doctrine test (__tests__/writer-room-private-pins.test.ts) that fails the build if a pin route ever gains a realtime call, a notification, a service-role client, or a membership-widened read"
affects: ["39-09 (promote a pin to a comment)", "39-11 (RLS cross-account smoke)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Author-only RLS as the sole visibility enforcement point, with an explicitly-commented redundant application-layer filter that documents (rather than substitutes for) the safeguard"
    - "Neutral 404 (never 403) for a caller's-own-scope delete, so the status code cannot become an existence oracle"

key-files:
  created:
    - "app/api/works/[workId]/versions/[versionId]/pins/route.ts"
    - "app/api/works/[workId]/versions/[versionId]/pins/[pinId]/route.ts"
    - "app/api/works/[workId]/versions/[versionId]/pins/route.test.ts"
    - "__tests__/writer-room-private-pins.test.ts"
  modified: []

key-decisions:
  - "GET/POST/DELETE gate on resolveWorkAccess(..., 'contribute') for room membership; visibility of rows returned is left entirely to migration 224's work_version_pins_author_only RLS policy, with the route's own .eq('author_user_id', user.id) filter documented as redundant, not the safeguard"
  - "PinBodySchema is .strict() and carries only timestampMs — no body field, no update endpoint; a pin is wordless and immutable per D-10"
  - "DELETE returns 404 (never 403) when a pin does not match the caller's scope, matching the repo's own-scope disclosure convention"
  - "MAX_PINS_PER_VERSION = 100 enforced via a head-count select before insert, alongside a checkRateLimit ceiling of 300/15min keyed to work-version-pin:{userId}"

patterns-established:
  - "Doctrine gate test convention for D-11-class 'this must never gain a capability' constraints: readFileSync the route sources, assert absence of forbidden calls/imports/literals via named constants (not inline literals), and assert the presence-channel registration count stays fixed"

requirements-completed: [D-10, D-11, D-12, D-13]

coverage:
  - id: D1
    description: "A room member can drop a wordless pin on a take and read back only their own, via GET/POST /api/works/[workId]/versions/[versionId]/pins"
    requirement: "D-10"
    verification:
      - kind: unit
        ref: "app/api/works/[workId]/versions/[versionId]/pins/route.test.ts#GET pins / POST pins"
        status: pass
    human_judgment: false
  - id: D2
    description: "A pin can be deleted by its author; a pin belonging to someone else returns a neutral 404 indistinguishable from a pin that does not exist"
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "app/api/works/[workId]/versions/[versionId]/pins/route.test.ts#DELETE a pin"
        status: pass
    human_judgment: false
  - id: D3
    description: "Row-level security, not an application filter, hides another author's pins from the GET response"
    requirement: "D-11"
    verification: []
    human_judgment: true
    rationale: "jest cannot impersonate two authenticated Postgres roles to prove the RLS boundary; the route's own contract (redundant filter documented, RLS-only enforcement) is proven by the doctrine test and code review, but the cross-account guarantee itself requires a real Postgres role smoke, carried by plan 39-11."
  - id: D4
    description: "Dropping, reading, or deleting a pin produces no realtime event and no notification, and the presence channel gains no pin-shaped event"
    requirement: "D-11, D-12"
    verification:
      - kind: unit
        ref: "__tests__/writer-room-private-pins.test.ts#a pin never speaks to the room (D-11 doctrine gate)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-13
status: complete
---

# Phase 39 Plan 05: Private pins — a bookmark, not a letter Summary

**Server-side routes for wordless, author-only take pins: RLS is the sole visibility enforcement point, a doctrine test locks the presence channel against a pin-shaped event forever.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-09-13T22:15:18Z
- **Tasks:** 3
- **Files modified:** 4 (all new)

## Accomplishments
- `GET`/`POST /api/works/[workId]/versions/[versionId]/pins` — lists and creates private pins gated on `resolveWorkAccess(..., 'contribute')` at write time only; the GET's own `.eq('author_user_id', user.id)` filter is documented in-line as redundant narrowing, never the safeguard, so migration 224's single RLS policy remains the actual enforcement point
- `DELETE /api/works/[workId]/versions/[versionId]/pins/[pinId]` — author-only delete returning a neutral 404 (never 403) for a pin that is not the caller's, matching the repo's own-scope convention
- A behaviour test suite (9 tests) proving the route's own contract: 401 before the access gate, the refusal's own status with no select, the camel-cased view shape with no raw row keys, the `.strict()` wordless schema rejecting extra keys and out-of-range timestamps, the caller-set `author_user_id` on insert, the `MAX_PINS_PER_VERSION` ceiling, and the delete route's neutral 404
- A doctrine gate test (6 tests) that fails the build the moment a pin route imports `WriterRoomPresence`, calls `broadcast(`/`channel.send(`, calls `createNotification`, references the `writers-room:` channel literal, reaches for `createServiceClient`, or widens a read via `is_work_owner`/`work_member_tier` — and asserts the presence component still registers exactly five broadcast events, none of them pin-shaped

## Task Commits

Each task was committed atomically:

1. **Task 1: The pins routes — collection and single-pin delete** - `27481c24` (feat)
2. **Task 2: Behaviour tests for the pins routes** - `253db78c` (test)
3. **Task 3: The doctrine gate — a pin never speaks to the room** - `a1c9b630` (test)

## Files Created/Modified
- `app/api/works/[workId]/versions/[versionId]/pins/route.ts` - GET (list caller's own pins) and POST (create, ceiling-checked, rate-limited)
- `app/api/works/[workId]/versions/[versionId]/pins/[pinId]/route.ts` - DELETE, neutral 404 for someone else's pin
- `app/api/works/[workId]/versions/[versionId]/pins/route.test.ts` - route contract tests (auth, access, schema, ceiling, view shape, delete)
- `__tests__/writer-room-private-pins.test.ts` - D-11 doctrine gate (silence, presence-channel invariance, access model)

## Decisions Made
- Kept the count-before-insert ceiling check scoped by `.eq('version_id', versionId).eq('author_user_id', user.id)` rather than relying solely on RLS for the count, since a `head: true` count still benefits from an explicit scope for readability even though RLS would return the same number.
- Used a plain UUID regex to validate `pinId` in the delete route (matching the repo's convention of an explicit 400 for a malformed id) rather than letting a malformed id fall through to a query that would return zero rows and a 404 anyway — the 400 is more informative for a client bug and costs nothing in disclosure risk since `pinId` shape validation reveals nothing about existence.

## Deviations from Plan

None — plan executed exactly as written. One self-correction during execution: an early draft of the delete route's neutral-404 comment used the literal string "403" to explain why 403 is never returned, which would have failed the plan's own acceptance grep (`grep -c "403" ... returns 0`); reworded to describe the same behavior without the literal digit before committing Task 1.

## Issues Encountered
- The plan's `<verify>` command for Task 2 (`npx jest "app/api/works/[workId]/versions/[versionId]/pins/route.test.ts"`) does not run under this repo's installed Jest version when invoked with the literal bracketed path, because Jest's CLI test-path argument is compiled as a regular expression and `[workId]`/`[versionId]` are interpreted as character classes rather than literal brackets, matching zero files. This is a pre-existing environment quirk unrelated to this plan's code (confirmed: the exact same bracket-class behavior affects any bracketed Next.js route path passed to `npx jest` as a positional argument in this repo). Verified equivalently via `npx jest --testPathPatterns="pins/route.test.ts"` (9/9 passing) and via the full suite run (`npm test`: 610 suites / 7339 tests passing, including this file). No code change was needed or made.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The pins routes are ready for 39-09's promote-to-comment flow (DELETE the pin only after the comment POST succeeds) and for 39-11's RLS cross-account smoke, which is the only remaining verification of the row-level-security boundary this plan could not exercise from Jest.
- Migration 224 (referenced, not applied by this plan) remains human-gated per 39-11; these routes assume the migration lands before first use.

---
*Phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor*
*Completed: 2026-09-13*
