---
phase: 27-artist-invite-only-onboarding
plan: 06
subsystem: auth
tags: [nextjs, api-routes, supabase, jest, rate-limiting, enumeration-mitigation]

# Dependency graph
requires:
  - phase: 27-artist-invite-only-onboarding (plan 01)
    provides: "supabase/migrations/097_artist_invites_and_waitlist.sql (artist_invites/artist_waitlist tables)"
  - phase: 27-artist-invite-only-onboarding (plan 02)
    provides: "lib/security/rate-limit.ts — createRateLimiter()/getClientIp() shared limiter"
  - phase: 27-artist-invite-only-onboarding (plan 04)
    provides: "lib/invites/allowlist.ts — isArtistEmailAllowed()/emailHasExistingAccount() TS twin of the gate"
provides:
  - "POST /api/signup/check-invite — public, rate-limited, enumeration-mitigated pre-check the signup page (27-09) will drive its state machine off"
  - "GET /api/signup/invite/[token] — public deep-link resolver covering both artist_invites and collaborator_invites token sources"
affects: [27-09-signup-page, 27-11-migration-push-checkpoint]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-table token resolver — try artist_invites first, fall back to collaborator_invites, single response shape regardless of source"
    - "Never-admit-by-token discipline — deep-link routes return pre-fill data only; admission is always re-derived by email at the real gate (migration 098)"

key-files:
  created:
    - app/api/signup/check-invite/route.ts
    - app/api/signup/check-invite/route.test.ts
    - app/api/signup/invite/[token]/route.ts
    - app/api/signup/invite/[token]/route.test.ts
  modified: []

key-decisions:
  - "check-invite rate-limits on ip first, then (after parsing) on email — matching sync/register's two-dimension ordering; a malformed/empty body short-circuits before any DB call, returning the identical {allowed:false, existingAccount:false} shape."
  - "invite/[token] resolves inviterName best-effort via user_profiles.artist_name keyed by invited_by_user_id (artist_invites) or inviting_user_id (collaborator_invites) — null on any lookup failure or missing id, never thrown."
  - "invite/[token] checks artist_invites first; collaborator_invites is only queried as a fallback when artist_invites misses, avoiding a redundant second query on the common path."

patterns-established:
  - "Public signup-support routes: no session gate, createServiceClient() only, shared rate limiter instance per route, generic identical-shape responses for both allowed/denied and found/not-found cases."

requirements-completed: [INVITE-01, INVITE-05, INVITE-06]

coverage:
  - id: D1
    description: "POST /api/signup/check-invite returns {allowed, existingAccount} for a submitted email, rate-limited on ip then email, reusing isArtistEmailAllowed()/emailHasExistingAccount()"
    requirement: "INVITE-06"
    verification:
      - kind: unit
        ref: "app/api/signup/check-invite/route.test.ts#returns allowed:true for an invited/collaborator email, #returns allowed:false for an unknown/uninvited email, #returns existingAccount:true for an email that already has an account"
        status: pass
    human_judgment: false
  - id: D2
    description: "check-invite response shape is identical for allowed/denied emails and never differs for malformed input — enumeration mitigation (T-27-02)"
    requirement: "INVITE-06"
    verification:
      - kind: unit
        ref: "app/api/signup/check-invite/route.test.ts#returns the identical response shape for allowed and denied emails (enumeration mitigation), #returns allowed:false and never throws on a malformed body, #returns allowed:false and never throws on an empty body"
        status: pass
    human_judgment: false
  - id: D3
    description: "check-invite is rate-limited on both ip and email dimensions (429 on breach)"
    requirement: "INVITE-06"
    verification:
      - kind: unit
        ref: "app/api/signup/check-invite/route.test.ts#returns 429 after the ip rate-limit threshold is exceeded, #returns 429 after the email rate-limit threshold is exceeded"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/signup/invite/[token] resolves a token found in artist_invites to {email, inviterName, expired}"
    requirement: "INVITE-05"
    verification:
      - kind: unit
        ref: "app/api/signup/invite/[token]/route.test.ts#resolves a token found in artist_invites with inviter name + not expired"
        status: pass
    human_judgment: false
  - id: D5
    description: "The resolver falls back to collaborator_invites when artist_invites misses (both deep-link sources supported, D-09)"
    requirement: "INVITE-05"
    verification:
      - kind: unit
        ref: "app/api/signup/invite/[token]/route.test.ts#falls back to collaborator_invites when artist_invites misses"
        status: pass
    human_judgment: false
  - id: D6
    description: "Unknown token -> generic 404; expired token -> expired:true so the page can render the re-request state (D-09)"
    requirement: "INVITE-05"
    verification:
      - kind: unit
        ref: "app/api/signup/invite/[token]/route.test.ts#returns a generic 404 when the token matches neither table, #returns expired:true when token_expires_at is in the past"
        status: pass
    human_judgment: false
  - id: D7
    description: "The deep-link resolver never admits by token — it only supplies pre-fill data; admission is always re-derived from the submitted email at the real gate (migration 098)"
    requirement: "INVITE-01"
    verification:
      - kind: unit
        ref: "app/api/signup/invite/[token]/route.test.ts — route contains no auth.admin.createUser/session-issuing call in either resolve branch (structural: route only performs SELECT queries + resolveInviterName, never writes or authenticates)"
        status: pass
    human_judgment: false

# Metrics
duration: ~25min
completed: 2026-08-09
status: complete
---

# Phase 27 Plan 06: Pre-Signup Check-Invite Route + Deep-Link Resolver Summary

**Two public, rate-limited signup-support routes — `POST /api/signup/check-invite` (enumeration-mitigated allowlist pre-check reusing 27-04's TS gate twin) and `GET /api/signup/invite/[token]` (dual-table deep-link resolver covering both `artist_invites` and `collaborator_invites`) — neither of which ever grants admission, only pre-fill/framing data for the signup page.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-09 (sequential main-tree execution)
- **Completed:** 2026-08-09T07:14:59Z
- **Tasks:** 2/2
- **Files modified:** 4 created, 0 modified

## Accomplishments
- `POST /api/signup/check-invite` — no session gate, `createServiceClient()` only, two-dimension rate limiting (`ip:` then `email:`) via the shared 27-02 limiter, reuses `isArtistEmailAllowed()`/`emailHasExistingAccount()` from 27-04 verbatim. Response shape (`{ allowed, existingAccount }`) is byte-identical across allowed/denied/malformed inputs — no code path reveals *why* an email was denied.
- `GET /api/signup/invite/[token]` — checks `artist_invites` by `invite_token` first, falls back to `collaborator_invites` only on a miss (avoiding a redundant query on the common path), resolves `{ email, inviterName, expired }`. `inviterName` is a best-effort `user_profiles.artist_name` lookup keyed by `invited_by_user_id`/`inviting_user_id` — returns `null` on any failure or missing id, never throws. Unknown tokens return a generic 404; expired tokens (`token_expires_at` in the past) return `expired: true` so the signup page can render the re-request state (D-09).
- Both routes are ip-rate-limited (shared limiter, independent `Map` instances per route) to blunt brute-force/enumeration probing (T-27-04).
- Neither route ever grants admission — `check-invite` is a read-only pre-check UX layer, and `invite/[token]` only supplies pre-fill data; the real, unbypassable boundary stays migration 098's `handle_new_user()` trigger, which always re-derives admission from the email actually submitted at signup (RESEARCH Open Question 2, T-27-03).

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /api/signup/check-invite — public, rate-limited pre-check** - `80659be` (feat)
2. **Task 2: GET /api/signup/invite/[token] — deep-link resolver (both token tables)** - `27506af` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `app/api/signup/check-invite/route.ts` - public POST pre-check, rate-limited, enumeration-mitigated
- `app/api/signup/check-invite/route.test.ts` - 8 tests covering allowed/denied/existing-account/rate-limit/malformed-body
- `app/api/signup/invite/[token]/route.ts` - public GET deep-link resolver across both token tables
- `app/api/signup/invite/[token]/route.test.ts` - 6 tests covering both table sources, 404, expiry, best-effort inviter name, rate-limit

## Decisions Made
- **Rate-limit ordering in check-invite:** ip check first (before any JSON parsing), then email check after parsing — matches `sync/register`'s established two-dimension ordering exactly. A malformed/empty body short-circuits to the identical `{allowed:false, existingAccount:false}` shape without ever calling `isArtistEmailAllowed`/`emailHasExistingAccount` — cheaper and still never throws.
- **inviterName resolution is best-effort and silent on failure:** wrapped in try/catch, returns `null` rather than propagating a Supabase error — this value is pure UX framing, never a security-relevant field, so failing open (to `null`) is correct and matches the plan's "resolvable, best-effort" language.
- **artist_invites checked before collaborator_invites, not in parallel:** the plan's acceptance criteria explicitly requires "artist_invites first, then collaborator_invites" — sequential (not `Promise.all`) also means the common-path query count stays at one SELECT instead of two.

## Deviations from Plan

None - plan executed exactly as written. Both routes match the `<action>` and `<behavior>` sections verbatim; no architectural changes, no missing critical functionality discovered, no blocking issues.

## Issues Encountered
- Jest's `testPathPattern` CLI argument treats `[token]` as a regex character class, not a literal path segment — `npm test -- 'app/api/signup/invite/[token]/route.test.ts'` matched zero files. Resolved by escaping the brackets (`app/api/signup/invite/\[token\]/route.test.ts`) when invoking the test runner directly; this is a test-runner CLI-invocation quirk only, not a code or config issue — no production code, jest config, or file naming was changed.

## User Setup Required
None - no external service configuration required. Both routes are pure application code against the already-migrated (though not-yet-pushed, per 27-04) `artist_invites`/`collaborator_invites` schema; live enforcement smoke-testing remains 27-11's human-gated blocking checkpoint.

## Next Phase Readiness
- `check-invite` and `invite/[token]` are both ready for the signup page (27-09) to drive its `gate → checking → allowed|existing-account|denied→waitlist` state machine off of, per 27-PATTERNS' `app/(auth)/signup/page.tsx` plan.
- `npm test` (full 157-suite/1824-test run) and `npm run build` both green after this plan — both new routes appear in the build's dynamic route manifest (`/api/signup/check-invite`, `/api/signup/invite/[token]`).
- No regressions introduced; no new dependencies added.

---
*Phase: 27-artist-invite-only-onboarding*
*Completed: 2026-08-09*

## Self-Check: PASSED

All 4 created files verified present on disk; both task commits (`80659be`, `27506af`) verified present in `git log`.
