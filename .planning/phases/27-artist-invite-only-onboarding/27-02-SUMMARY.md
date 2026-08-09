---
phase: 27-artist-invite-only-onboarding
plan: 02
subsystem: security
tags: [rate-limiting, captcha, cloudflare-turnstile, email, html-escaping, jest]

requires:
  - phase: 27-artist-invite-only-onboarding
    provides: "27-01: migration 097 (artist_invites/artist_waitlist tables) + lib/invites/schema.ts"
provides:
  - "lib/security/rate-limit.ts: createRateLimiter({windowMs, maxAttempts}) factory + getClientIp(request)"
  - "lib/security/turnstile.ts: verifyTurnstileToken(token, remoteIp?) fail-closed Cloudflare siteverify wrapper"
  - "lib/email/esc.ts: esc(s) HTML-escape helper"
  - "sync/register, industryInvite.ts, staffInvite.ts refactored to consume the shared modules"
affects: [27-03, 27-04, 27-05, check-invite, waitlist, waitlist-resubscribe, artist-invite-emails]

tech-stack:
  added: []
  patterns:
    - "createRateLimiter() factory — each call owns an independent Map, so multiple public routes/dimensions (ip/email) never share buckets"
    - "Server-only secret read inside the function body (never module top-level, never NEXT_PUBLIC_) — same discipline as RESEND_API_KEY in lib/email/index.ts"
    - "Fail-closed external verification: any error/missing-config path returns false, never true"

key-files:
  created:
    - lib/security/rate-limit.ts
    - lib/security/rate-limit.test.ts
    - lib/security/turnstile.ts
    - lib/security/turnstile.test.ts
    - lib/email/esc.ts
    - lib/email/esc.test.ts
  modified:
    - app/api/sync/register/route.ts
    - lib/email/industryInvite.ts
    - lib/email/staffInvite.ts

key-decisions:
  - "lib/email/buyerInvite.ts (a third esc() duplicate found during Task 3 read_first) left untouched — out of this plan's explicit files_modified scope; only industryInvite.ts and staffInvite.ts were named"

patterns-established:
  - "Shared rate limiter: instantiate `createRateLimiter()` once per route/module (module-scope const), call `.isRateLimited(key)` per dimension — this is the pattern Wave 3's check-invite/waitlist/resubscribe routes must follow, not a fresh copy"
  - "Turnstile verification: call verifyTurnstileToken(token, getClientIp(request)) as an extra gate before any DB write in the waitlist route"

requirements-completed: [INVITE-07, INVITE-10]

coverage:
  - id: D1
    description: "Shared rate limiter (createRateLimiter/getClientIp) extracted and tested; sync/register consumes it with identical behavior"
    requirement: INVITE-10
    verification:
      - kind: unit
        ref: "lib/security/rate-limit.test.ts"
        status: pass
      - kind: integration
        ref: "app/api/sync/register/route.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Turnstile server-side verification (verifyTurnstileToken) fails closed on missing secret, empty token, fetch error, and explicit success:false"
    requirement: INVITE-07
    verification:
      - kind: unit
        ref: "lib/security/turnstile.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Shared esc() HTML-escape helper extracted; industryInvite.ts and staffInvite.ts import it with byte-identical rendered output"
    verification:
      - kind: unit
        ref: "lib/email/esc.test.ts"
        status: pass
      - kind: integration
        ref: "__tests__/curator-claim-industry.test.ts, lib/staff/createStaffAccount.test.ts"
        status: pass
    human_judgment: false

duration: ~10min
completed: 2026-08-09
status: complete
---

# Phase 27 Plan 02: Shared Security & Email Primitives Summary

**Extracted a shared sliding-window rate limiter, a fail-closed Cloudflare Turnstile verifier, and a shared email HTML-escape helper — refactoring sync/register and the two existing invite email templates to consume them instead of leaving copy-paste drift for the later waves.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-08-09T06:28:16Z
- **Tasks:** 3/3 completed
- **Files modified:** 9 (6 created, 3 refactored)

## Accomplishments
- `lib/security/rate-limit.ts` — `createRateLimiter({windowMs, maxAttempts})` factory (each instance owns an independent `Map`) + `getClientIp(request)`, lifted verbatim from `app/api/sync/register/route.ts`'s in-route limiter; `sync/register` now imports it with byte-for-byte identical behavior (15-minute window, 5 attempts).
- `lib/security/turnstile.ts` — `verifyTurnstileToken(token, remoteIp?)` posts to Cloudflare's siteverify endpoint, reads `TURNSTILE_SECRET_KEY` only inside the function body, and fails closed (returns `false`) on missing secret/token, fetch rejection, or an explicit `success: false` response.
- `lib/email/esc.ts` — the `esc(s)` HTML-escape helper (`&`/`<`/`>`/`"`) previously duplicated identically in `industryInvite.ts` and `staffInvite.ts`; both templates now import the shared version and no longer declare a local `esc`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract the shared rate limiter into lib/security/rate-limit.ts** — `17d7d13` (feat)
2. **Task 2: lib/security/turnstile.ts — fail-closed server-side captcha verification** — `a5d24ef` (feat)
3. **Task 3: Extract lib/email/esc.ts and repoint the two existing templates** — `c19f3eb` (feat)

_No TDD RED/GREEN split was used — tasks were written test-and-implementation-together per the plan's `<action>` blocks, verified against the plan's `<verify>` gates before commit._

## Files Created/Modified
- `lib/security/rate-limit.ts` — shared rate limiter factory + `getClientIp`
- `lib/security/rate-limit.test.ts` — boundary test (allows maxAttempts, blocks next), per-key/per-instance isolation, window reset, default-constants coverage
- `lib/security/turnstile.ts` — fail-closed Cloudflare Turnstile verifier
- `lib/security/turnstile.test.ts` — success, missing-secret, empty-token, fetch-rejection, explicit-failure cases
- `lib/email/esc.ts` — shared HTML-escape helper
- `lib/email/esc.test.ts` — per-character escaping, mixed-string escaping, already-safe-input passthrough
- `app/api/sync/register/route.ts` — deleted local limiter/`getClientIp`, imports `@/lib/security/rate-limit`
- `lib/email/industryInvite.ts` — deleted local `esc`, imports `@/lib/email/esc`
- `lib/email/staffInvite.ts` — deleted local `esc`, imports `@/lib/email/esc`

## Decisions Made
- Left `lib/email/buyerInvite.ts`'s own `esc()` duplicate untouched — the plan's `files_modified` list explicitly scopes Task 3 to `industryInvite.ts` and `staffInvite.ts` only; `buyerInvite.ts` is a pre-existing, out-of-scope third copy not introduced or worsened by this plan.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `npm test` (targeted suites), `npm run build`, and `tsc --noEmit` all ran clean; the pre-existing `app/api/sync/register/route.test.ts`, `__tests__/curator-claim-industry.test.ts`, and `lib/staff/createStaffAccount.test.ts` suites (which exercise the refactored code paths) stayed green with zero changes needed to the tests themselves.

## User Setup Required

None triggered by this plan directly — `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` are read by `verifyTurnstileToken()` but not yet wired into any route (that's Wave 3's waitlist route). Provisioning happens at the 27-11 checkpoint per this plan's frontmatter `user_setup` block.

## Next Phase Readiness

All three shared primitives are ready for Wave 3's `check-invite`, `waitlist`, and `waitlist/resubscribe` routes to import directly — no proliferation risk remains for the rate limiter or `esc()`. `verifyTurnstileToken` is ready to gate the waitlist route once `TURNSTILE_SECRET_KEY` is provisioned. No blockers for 27-03 onward.

---
*Phase: 27-artist-invite-only-onboarding*
*Completed: 2026-08-09*

## Self-Check: PASSED

All 9 created/modified source files and 3 task commit hashes (17d7d13, a5d24ef, c19f3eb) verified present on disk / in git log.
