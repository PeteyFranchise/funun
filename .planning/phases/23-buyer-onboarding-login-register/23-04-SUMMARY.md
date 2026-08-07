---
phase: 23-buyer-onboarding-login-register
plan: 04
subsystem: api
tags: [nextjs, supabase, rate-limiting, buyer-orgs, lead-routing, account-enumeration]

# Dependency graph
requires:
  - phase: 23-buyer-onboarding-login-register (plan 01)
    provides: "buyer_orgs.status/use_case/contact_*/source columns (migration 095, drafted); BuyerOrgStatus type"
  - phase: 25-funun-team-accounts-ae
    provides: "funun_staff table, buyer_orgs.ae_user_id (migration 090), lib/staff/notifications.ts's resolveLeadRecipient/buildLeadRoutedNotification (unwired hook explicitly built for this call site)"
  - phase: 16-gtm-beta-launch (buyer_orgs foundation)
    provides: "lib/buyers/createBuyerAccount.ts (batch-1 failure-safe compensation), buyer_orgs/buyer_members schema"
provides:
  - "buildRegisterPayload — pure validator/mapper for the public Register (+ 'Talk to a sales rep') form, source discriminant"
  - "resolveLeadershipFallback — funun_staff leadership lookup, fail-closed to null, never throws"
  - "POST /api/sync/register — the first unauthenticated write path in the buyer domain: creates buyer_orgs (pending_onboarding) + first approver/org-admin member, wires lead routing, rate-limited, account-enumeration-safe"
affects: [23-05, 23-06, 23-07-login-register-modal, 23-08-migration-push-checkpoint]

tech-stack:
  added: []
  patterns:
    - "In-route, in-memory per-key rate-limit window (Map<string, number[]>) as the beta-acceptable stand-in for a durable limiter — mirrors the *pattern* of lib/social/dm.ts's cold-DM limiter, not its table"
    - "Neutral-response account-enumeration avoidance on a POST endpoint: DuplicateBuyerAccountError caught and answered with the SAME 201 shape as success, mirroring forgot-password's discipline"

key-files:
  created:
    - lib/buyers/register.ts
    - lib/buyers/register.test.ts
    - lib/staff/leadershipFallback.ts
    - app/api/sync/register/route.ts
    - app/api/sync/register/route.test.ts
  modified: []

key-decisions:
  - "buildRegisterPayload allowlists exactly company/contactName/email/phone/role/useCase/source — never spreads the request body; role/useCase are trimmed free text with no external validation, matching this codebase's phone/free-text precedent"
  - "Invalid/omitted source falls back to 'register' rather than erroring — keeps the two-doors-one-pipeline UX forgiving for a modal that may not always set the discriminant"
  - "Lead routing (routeLead) is a separate async helper called on BOTH the success path and the caught-duplicate path — the org row is created either way, so staff still see a repeat-signup attempt land in their queue even when the account itself couldn't be (re)created"
  - "Rate limiting checks IP first (before JSON parsing/validation) and email second (after buildRegisterPayload succeeds) — two independent per-key windows, 5 attempts / 15 minutes each, in-memory Map acceptable for beta per the plan's own directive"
  - "Duplicate-email path returns { data: { orgId }, emailSent: false } with the exact same 201 status and shape as the happy path (minus userId, which never existed) — no error field, no distinguishing signal"

patterns-established:
  - "routeLead(service, org) as the single call site both the success and duplicate branches funnel through — future call sites needing best-effort lead notification should reuse this shape rather than re-deriving resolveLeadershipFallback + resolveLeadRecipient + createNotification inline"

requirements-completed: [SYNC-03, SYNC-04, SYNC-05]

coverage:
  - id: D1
    description: "buildRegisterPayload validates and normalizes the six qualifying fields plus the source discriminant, rejecting malformed email/missing company/contactName/too-short phone"
    requirement: "SYNC-03"
    verification:
      - kind: unit
        ref: "lib/buyers/register.test.ts (17 tests: happy path, trimming, per-field rejection, email lowercasing, phone min-length, source default/accept/fallback, mass-assignment guard)"
        status: pass
    human_judgment: false
  - id: D2
    description: "resolveLeadershipFallback reads funun_staff for a leadership user_id via the service-role client, never throwing"
    requirement: "SYNC-04"
    verification:
      - kind: other
        ref: "test -f lib/staff/leadershipFallback.ts && grep resolveLeadershipFallback (plan's own verify command)"
        status: pass
      - kind: unit
        ref: "app/api/sync/register/route.test.ts — 'never blocks or fails the signup when lead routing errors' exercises resolveLeadershipFallback's rejection path indirectly via routeLead's own try/catch"
        status: pass
    human_judgment: false
  - id: D3
    description: "POST /api/sync/register creates a buyer_orgs row (status=pending_onboarding) + first approver/org-admin member via createBuyerAccount, returns 201 with orgId/userId/emailSent"
    requirement: "SYNC-05"
    verification:
      - kind: unit
        ref: "app/api/sync/register/route.test.ts#creates a pending_onboarding buyer_orgs row + approver/org-admin member, routes the lead, returns 201"
        status: pass
    human_judgment: false
  - id: D4
    description: "Both doors ('Register' and 'Talk to a sales rep') hit the same endpoint; source discriminant carries through to the buyer_orgs insert for admin-queue/notification copy"
    requirement: "SYNC-05"
    verification:
      - kind: unit
        ref: "app/api/sync/register/route.test.ts#carries the source discriminant through for the 'Talk to a sales rep' door"
        status: pass
    human_judgment: false
  - id: D5
    description: "After the signup mutation, best-effort lead routing fires resolveLeadRecipient(org, leadershipFallbackId) -> createNotification(buildLeadRoutedNotification(...)) as an in-app notification + best-effort Resend email copy when the recipient's email is resolvable; never blocks or fails the signup on error"
    requirement: "SYNC-04"
    verification:
      - kind: unit
        ref: "app/api/sync/register/route.test.ts#creates a pending_onboarding buyer_orgs row... (asserts createNotification called with type 'lead_routed', userId = leadership fallback)"
        status: pass
      - kind: unit
        ref: "app/api/sync/register/route.test.ts#never blocks or fails the signup when lead routing errors"
        status: pass
    human_judgment: false
  - id: D6
    description: "400 on invalid payload (no account created); rate-limited 429 by IP and by email beyond a threshold; buyer_orgs insert never select-star (explicit column list); mass-assignment guarded via buildRegisterPayload's allowlist, never spreading the request body into the insert"
    requirement: "SYNC-05"
    verification:
      - kind: unit
        ref: "app/api/sync/register/route.test.ts#returns 400 on an invalid payload and never creates an account"
        status: pass
      - kind: unit
        ref: "app/api/sync/register/route.test.ts#returns 429 after the rate-limit threshold is exceeded for the same IP"
        status: pass
      - kind: unit
        ref: "app/api/sync/register/route.test.ts#returns 429 after the rate-limit threshold is exceeded for the same email"
        status: pass
      - kind: unit
        ref: "app/api/sync/register/route.test.ts#returns 500 (not a leak) when the buyer_orgs insert itself fails"
        status: pass
    human_judgment: false
  - id: D7
    description: "A duplicate email does NOT reveal an account already exists — the SAME neutral 201-shaped response as success, and the buyer_orgs row created before the duplicate check is never rolled back"
    requirement: "SYNC-05"
    verification:
      - kind: unit
        ref: "app/api/sync/register/route.test.ts#returns a neutral 201 response on a duplicate email, never revealing the account already exists"
        status: pass
    human_judgment: false
  - id: D8
    description: "Live behavior against the migration-095 columns (status/use_case/contact_*/source actually persisting and being readable by the buyer portal) requires the migration to be pushed"
    verification: []
    human_judgment: true
    rationale: "Migration 095 is drafted but HUMAN-GATED and unpushed (owner pushes at the 23-08 checkpoint per standing convention) — this plan's own tests mock the service client, so the real INSERT against the live buyer_orgs schema has not been exercised against a real database."

# Metrics
duration: ~15min
completed: 2026-08-07
status: complete
---

# Phase 23 Plan 04: Register Payload Builder + Leadership Fallback + POST /api/sync/register Summary

**Public light-touch register pipeline — `buildRegisterPayload` validator, `resolveLeadershipFallback` resolver, and `POST /api/sync/register` (the first unauthenticated write in the buyer domain) creating a real `pending_onboarding` buyer_orgs account and wiring the already-built Phase 25 lead-routing hook.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3/3 completed
- **Files modified:** 5 (all new)

## Accomplishments
- `lib/buyers/register.ts`'s `buildRegisterPayload` — a pure, allowlisted mapper/validator for the six B2B qualifying fields (company, contactName, email, phone, role, useCase) plus a `source: 'register' | 'sales_rep'` discriminant, modelled on `lib/deals/request-payload.ts`'s `buildRequestBody`. 17 tests covering the happy path, trimming/normalization, per-field rejection, email lowercasing, phone loose-min-length, source default/accept/invalid-fallback, and a mass-assignment leakage guard.
- `lib/staff/leadershipFallback.ts`'s `resolveLeadershipFallback(service)` — reads `funun_staff` for the first `staff_role='leadership'` row's `user_id`, service-role only, fail-closed to `null`, never throws.
- `app/api/sync/register/route.ts` — `POST /api/sync/register`: validates via `buildRegisterPayload`, inserts a `buyer_orgs` row (`status='pending_onboarding'`) with an explicit column list, calls `createBuyerAccount({ buyerRole: 'approver', isOrgAdmin: true })` for the first org-admin member, then fires best-effort lead routing (`resolveLeadershipFallback` → `resolveLeadRecipient` → `createNotification(buildLeadRoutedNotification(...))`) with an email copy when the recipient's address is resolvable. Rate-limited by IP and by email (5 attempts / 15-minute window each, in-memory). Duplicate email returns the exact same 201 shape as success — no enumeration signal — while leaving the created org row in place. 8 integration tests, all green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure register payload builder + validator** - `df555ad` (feat)
2. **Task 2: Leadership fallback resolver** - `9c88f22` (feat)
3. **Task 3: POST /api/sync/register — unauthenticated service-role account creation + lead routing** - `1848a2d` (feat, includes a Rule 1 fix to Task 1's test file found during this task's `tsc` verification)

**Plan metadata:** committed with this SUMMARY (see final commit below)

## Files Created/Modified
- `lib/buyers/register.ts` - `buildRegisterPayload` pure validator/mapper; `RegisterForm`/`RegisterPayload`/`RegisterSource` types
- `lib/buyers/register.test.ts` - 17 tests covering every behavior bullet
- `lib/staff/leadershipFallback.ts` - `resolveLeadershipFallback(service)` — funun_staff leadership lookup, fail-closed
- `app/api/sync/register/route.ts` - Public `POST /api/sync/register`: account creation + rate limiting + lead routing + enumeration avoidance
- `app/api/sync/register/route.test.ts` - 8 integration tests (mocked service client, `createBuyerAccount`, `resolveLeadershipFallback`, `createNotification`)

## Decisions Made
- `buildRegisterPayload` never spreads the request body — an explicit allowlist of exactly seven output keys, verified by a dedicated "never emits keys outside the allowlist" test that deliberately pollutes the input with `status`/`ae_user_id`.
- An invalid or missing `source` value falls back to `'register'` rather than returning a 400 — the two-doors-one-pipeline UX shouldn't hard-fail on a modal bug that omits the discriminant; `'register'` is the safer default framing for admin-queue copy.
- `routeLead` (the best-effort lead-routing helper) is called on both the success path and the caught-`DuplicateBuyerAccountError` path, since the `buyer_orgs` row is created unconditionally either way — staff still see the signup (or repeat-signup attempt) land in their queue even when the account itself couldn't be (re)created.
- Rate limiting is a simple in-route, in-memory `Map<string, number[]>` keyed separately by `ip:` and `email:` prefixes (5 attempts / 15 minutes each) — explicitly acceptable for beta per this plan's own directive ("reuse the *pattern* of `lib/social/dm.ts`'s cold-DM limiter... not that table; a simple in-route/service-backed counter is acceptable"). This does not survive a cold start or span multiple serverless instances; documented here rather than silently assumed durable.
- The org insert selects an explicit column list (`id, name, ae_user_id`) rather than `select('*')`, per the codebase's column-grant doctrine, even though service-role reads bypass column GRANTs entirely — kept explicit for consistency with every other route in this domain.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed two unused `@ts-expect-error` directives in `lib/buyers/register.test.ts`**
- **Found during:** Task 3 (`npx tsc --noEmit` verification, run after Task 3's own changes)
- **Issue:** Task 1's mass-assignment-leakage test used `@ts-expect-error` above two extra object-literal keys (`status`, `ae_user_id`) inside an object immediately followed by `as RegisterForm`. TypeScript's excess-property check does not fire on an object literal that is cast with `as` before being passed to the function, so the expected type errors never occurred — `tsc` flagged both directives as "Unused '@ts-expect-error' directive" (TS2578), which fails a clean typecheck.
- **Fix:** Replaced the two `@ts-expect-error` comments with a single explicit intersection-typed local (`pollutedForm: RegisterForm & { status: string; ae_user_id: string }`) that legitimately allows the extra keys without needing a suppression directive at all — the runtime assertion (that `buildRegisterPayload`'s output never contains those keys) is unchanged.
- **Files modified:** `lib/buyers/register.test.ts`
- **Verification:** `npx tsc --noEmit -p tsconfig.json` clean; `npm test -- lib/buyers/register.test.ts` still 17/17 passing (same assertions, same coverage)
- **Committed in:** `1848a2d` (bundled with Task 3's commit, since it was caught by that task's own build-verification step)

---

**Total deviations:** 1 auto-fixed (Rule 1 — type-check bug in a prior task's test file, not a logic change)
**Impact on plan:** No scope creep; a mechanical fix required for a clean `tsc --noEmit` run. The register endpoint's actual behavior and test coverage are unchanged.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None yet for this plan specifically. `POST /api/sync/register` writes to columns added by migration 095, which remains unpushed (HUMAN-GATED per 23-01's own directive) — the owner pushes it (alongside any other Phase 23 migrations) via Codex at the 23-08 checkpoint. This plan's tests mock the service client entirely and do not require a live database to pass.

## Next Phase Readiness
- `buildRegisterPayload`, `resolveLeadershipFallback`, and `POST /api/sync/register` are ready for `23-07`'s Login/Register modal to call directly — the modal's Register/`Talk to a sales rep` submit handlers can POST the six form fields (plus an optional `source`) with no further backend work.
- `routeLead`'s shape (resolve fallback → resolve recipient → resolve recipient email → notify with email copy) is now a reusable pattern for any future best-effort staff-notification call site in this domain.
- Full verification: `npm test` — 134 suites / 1600 tests green; `npx tsc --noEmit` clean; `npm run lint` clean (0 warnings); `npm run build` compiles `/api/sync/register` with zero errors.
- No blockers for subsequent Phase 23 plans. The only outstanding item is the human-gated `supabase db push` for migration 095, already deferred by design to the 23-08 checkpoint (unchanged by this plan).

---
*Phase: 23-buyer-onboarding-login-register*
*Completed: 2026-08-07*

## Self-Check: PASSED

All 5 created files verified present on disk; all 3 task commits (df555ad, 9c88f22, 1848a2d) verified present in git log.
