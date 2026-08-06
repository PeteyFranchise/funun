---
phase: 28-industry-accounts-green-room-access
plan: 03
subsystem: auth
tags: [supabase-admin-api, industry-accounts, curator-claim, tdd]

# Dependency graph
requires:
  - phase: 28-industry-accounts-green-room-access
    provides: "28-01 (dead industry_profiles read removal, capability_grants precedent), 28-02 (Green Room member_type gate)"
provides:
  - "provisionIndustryAccount() — shared, email-free account-creation primitive in lib/industry/createIndustryMember.ts"
  - "app/api/curators/claim/[token]/route.ts now mints real Industry accounts (role='industry', badge playlist_curator) instead of the legacy role='curator'"
  - "role='curator' is never minted again anywhere in the codebase — the single call site is repointed"
affects: [28-04, 28-05, industry-onboarding, curator-directory]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extract-a-primitive pattern for account creation: a shared createUser()-only function with zero email side effects, so multiple callers can each own their own email copy without double-send risk (RESEARCH Pitfall 4)"
    - "Atomic app_metadata.role set inside admin.createUser() (never a post-insert UPDATE) — now enforced at two call sites (createIndustryMember, curator claim route) via one shared primitive"

key-files:
  created:
    - __tests__/industry-member-capability.test.ts
    - __tests__/curator-claim-industry.test.ts
  modified:
    - lib/industry/createIndustryMember.ts
    - app/api/curators/claim/[token]/route.ts

key-decisions:
  - "provisionIndustryAccount() lives in lib/industry/createIndustryMember.ts (same file, not a new module) — keeps the atomic-role-set invariant and the duplicate-vs-transient-error distinction in one place with a single set of tests"
  - "Claim route's DuplicateIndustryMemberError catch path resolves the existing account's id via generateLink's returned user (not a second createUser call), matching the pre-existing existing-account fallback shape"
  - "curators.select() extended with `name` (already a NOT NULL column) to supply displayName to the primitive; falls back to curator.email when name is somehow empty"

patterns-established:
  - "provisionIndustryAccount({email, displayName, roleSlugs, invitedBy?}) -> {userId} is the canonical account-creation primitive for any current or future Industry-account mint site (INDUSTRY-03's future community/Team-Member invite route is expected to call this directly)"

requirements-completed: [INDUSTRY-04, INDUSTRY-03]

coverage:
  - id: D1
    description: "provisionIndustryAccount() extracted as a shared, email-free primitive: sets app_metadata.role='industry' atomically inside admin.createUser(), builds role_badges/profile_roles in user_metadata, returns {userId}, and surfaces DuplicateIndustryMemberError on email_exists/422"
    requirement: "INDUSTRY-04"
    verification:
      - kind: unit
        ref: "__tests__/industry-member-capability.test.ts#provisionIndustryAccount"
        status: pass
    human_judgment: false
  - id: D2
    description: "createIndustryMember()'s external contract ({userId, emailSent}, cold-invite email) is unchanged after delegating account creation to the primitive — admin members route (app/api/admin/members/route.ts) is unaffected"
    requirement: "INDUSTRY-04"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean) + full jest suite (1414/1414 pass, including admin-members-route consumers)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Curator claim route's primary mint path now creates an Industry account via provisionIndustryAccount() (role='industry', badge playlist_curator) and never calls admin.createUser with app_metadata.role='curator'"
    requirement: "INDUSTRY-04"
    verification:
      - kind: unit
        ref: "__tests__/curator-claim-industry.test.ts#mints an Industry account via provisionIndustryAccount on the primary path"
        status: pass
    human_judgment: false
  - id: D4
    description: "Exactly one email is sent per successful claim, with curator-claim-specific copy (not createIndustryMember's cold-invite subject) — no double-send"
    requirement: "INDUSTRY-04"
    verification:
      - kind: unit
        ref: "__tests__/curator-claim-industry.test.ts#mints an Industry account via provisionIndustryAccount on the primary path (sendEmail assertion)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Both atomic .eq('claim_token', token).is('claimed_by', null) conditional UPDATEs (primary mint path and existing-account fallback) are preserved byte-for-byte — the IDOR mitigation is not regressed to check-then-update, and a concurrent double-claim returns 410"
    requirement: "INDUSTRY-04"
    verification:
      - kind: unit
        ref: "__tests__/curator-claim-industry.test.ts (all 3 tests assert the eq/is call chain; one dedicated 410 test)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Existing-account fallback (email already belongs to an auth.users row) never overwrites that account's role/member_type — only links claimed_by and sends a magic link"
    requirement: "INDUSTRY-04"
    verification:
      - kind: unit
        ref: "__tests__/curator-claim-industry.test.ts#routes a DuplicateIndustryMemberError from provisionIndustryAccount into the existing-account fallback"
        status: pass
    human_judgment: false
  - id: D7
    description: "Manual/live verification: claiming a real curator directory row creates an Industry account, exactly one curator-claim email arrives, and the account can reach the Green Room + Antenna posting (after Plan 28-05's migration push)"
    verification: []
    human_judgment: true
    rationale: "Requires a live Supabase project (real admin.createUser + Resend delivery + Plan 28-05's not-yet-pushed migration) — cannot be exercised in this unit-test-only execution environment"

# Metrics
duration: ~20min
completed: 2026-08-06
status: complete
---

# Phase 28 Plan 03: Repoint Curator Claim to Industry-Account Creation Summary

**Extracted `provisionIndustryAccount()` as a shared, email-free account-creation primitive and repointed `app/api/curators/claim/[token]/route.ts`'s sole `role='curator'` mint site to create real Industry accounts instead — role='curator' is now retired as a mint target.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3
- **Files modified:** 4 (2 source, 2 new test files)

## Accomplishments
- `provisionIndustryAccount()` extracted from `createIndustryMember()` — account creation only (atomic `app_metadata.role='industry'` + `role_badges`/`profile_roles`), zero email side effects, with the existing duplicate-vs-transient-error distinction preserved
- `createIndustryMember()` refactored to delegate to the primitive while keeping its own `generateLink` + cold-invite email flow; its `{userId, emailSent}` external contract is byte-identical, so `app/api/admin/members/route.ts` needed no changes
- `app/api/curators/claim/[token]/route.ts`'s primary mint branch now calls `provisionIndustryAccount({email, displayName, roleSlugs: ['playlist_curator']})` — the last `admin.createUser({app_metadata:{role:'curator'}})` call site in the codebase is gone
- Claim route keeps its own updated email copy ("Your Funūn curator profile is now an Industry account") — the primitive never sends email, avoiding the double-send / wrong-copy pitfall RESEARCH flagged
- `DuplicateIndustryMemberError` from the primitive routes into the pre-existing existing-account fallback branch, which still never overwrites an existing account's role/member_type
- Both atomic `.eq('claim_token', token).is('claimed_by', null)` conditional UPDATEs (primary path + fallback) preserved exactly — verified with a dedicated concurrent-double-claim (410) test

## Task Commits

Each task was committed atomically (TDD: RED → GREEN):

1. **Task 1: Failing unit tests for the primitive and the repointed claim route** - `668d489` (test)
2. **Task 2: Extract provisionIndustryAccount() primitive from createIndustryMember()** - `1291901` (feat)
3. **Task 3: Repoint the curator claim route to Industry-account creation with its own email copy** - `caa9db7` (feat)

## Files Created/Modified
- `lib/industry/createIndustryMember.ts` - Added `provisionIndustryAccount()`; `createIndustryMember()` now delegates account creation to it
- `app/api/curators/claim/[token]/route.ts` - Primary mint branch repointed to the primitive with curator-claim email copy; `curators.select()` extended with `name`
- `__tests__/industry-member-capability.test.ts` - New unit tests for `provisionIndustryAccount()`
- `__tests__/curator-claim-industry.test.ts` - New unit tests for the repointed claim route (primary mint, duplicate-fallback, concurrent double-claim)

## Decisions Made
- `provisionIndustryAccount()` stays in `lib/industry/createIndustryMember.ts` rather than a new module — same domain, keeps the atomic-role-set invariant and duplicate-error handling co-located with its one existing caller-turned-sibling
- The existing-account fallback resolves the target user id from `generateLink`'s response (`existing.user.id`), matching the pre-existing shape, rather than attempting a second `createUser` call
- Added `name` to the claim route's `curators` `.select()` list to supply `displayName`; falls back to `curator.email` if `name` is ever empty

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a call-order bug in this plan's own Task-1 test assertions**
- **Found during:** Task 3 (making `curator-claim-industry.test.ts` GREEN)
- **Issue:** The atomic conditional UPDATE chain is `.eq('id', curator.id).eq('claim_token', token).is('claimed_by', null)` — Task 1's RED tests asserted `eqUpdate1` (the first `.eq()`) was called with `('claim_token', TOKEN)`, but that argument actually arrives at the *second* `.eq()` in the chain
- **Fix:** Corrected the two affected assertions to check `eqUpdate1` against `('id', 'cur1')` and `eqUpdate2` against `('claim_token', TOKEN)`, matching the route's real (and plan-mandated, unchanged) chain order
- **Files modified:** `__tests__/curator-claim-industry.test.ts`
- **Verification:** All 3 tests in the file pass; the IDOR-preservation assertions now check the correct call in the chain
- **Committed in:** `caa9db7` (Task 3 commit, alongside the route change)

---

**Total deviations:** 1 auto-fixed (1 bug in newly-authored test code, not the production route)
**Impact on plan:** No scope creep — the fix corrects a test-authoring mistake from this same plan's Task 1, not a pre-existing issue. The production route logic matches the plan's explicit instruction to preserve the chain "byte-for-byte."

## Issues Encountered
None beyond the test-assertion fix above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The single `role='curator'` mint site is retired; no new legacy curator accounts can be created going forward. `handle_new_user()`'s curator branch and the `(curator-portal)` route group remain in place per plan (two-step retirement, gated on Plan 28-05's live zero-count checkpoint).
- `provisionIndustryAccount()` is now available as the shared substrate for Plan 28-05 and any future INDUSTRY-03 community/Team-Member invite route.
- Manual/live verification (claim a real curator row end-to-end, confirm single email delivery and Green Room reachability) is deferred to a live-backend UAT pass — no Supabase project was exercised in this execution environment.
- `requirements-completed: [INDUSTRY-04, INDUSTRY-03]` are provisional IDs not yet registered in `.planning/REQUIREMENTS.md` (no Phase 28 section exists there yet) — same pre-existing documentation gap already recorded against 28-01/28-02 in STATE.md; `requirements.mark-complete` will return `not_found` and is deferred to a future `/gsd-docs-update` pass.

---
*Phase: 28-industry-accounts-green-room-access*
*Completed: 2026-08-06*

## Self-Check: PASSED

- FOUND: lib/industry/createIndustryMember.ts
- FOUND: app/api/curators/claim/[token]/route.ts
- FOUND: __tests__/industry-member-capability.test.ts
- FOUND: __tests__/curator-claim-industry.test.ts
- FOUND: .planning/phases/28-industry-accounts-green-room-access/28-03-SUMMARY.md
- FOUND commit: 668d489 (test)
- FOUND commit: 1291901 (feat)
- FOUND commit: caa9db7 (feat)
- TDD gate sequence verified: test(668d489) -> feat(1291901) -> feat(caa9db7); no refactor commit needed
