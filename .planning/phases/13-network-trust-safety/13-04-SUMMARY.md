---
phase: 13-network-trust-safety
plan: 04
subsystem: api
tags: [trust-safety, reports, moderation, admin, supabase, rls, nextjs]

requires:
  - phase: 13-network-trust-safety
    plan: 01
    provides: ReportTargetType/ReportReason/ReportStatus/ReportStatusView contracts (lib/trust-safety/contracts.ts), migration 058 reports table (private-by-default, server-owned writes)
  - phase: 12-discovery-feed-people-search
    provides: green_room_can_view_post SECURITY DEFINER visibility RPC (migrations 057/059/060), green_room_posts/comments/reposts/placements schema
provides:
  - POST/GET /api/reports — member-facing report creation + own-status reads
  - GET/PATCH /api/admin/reports[/:id] — admin report queue with filtering, status transitions, admin notes, and content-action routing
  - lib/trust-safety/reports.ts — target visibility gate + create validation + dedupe
  - lib/trust-safety/admin-reports.ts — patch validation, content-action routing, filter parsing, enriched admin listing
  - /admin/reports admin UI page + components/admin/ReportsAdmin.tsx
affects: [13-05-verification-profile-visibility]

tech-stack:
  added: []
  patterns:
    - "Report target visibility reuses the existing green_room_can_view_post SECURITY DEFINER RPC (called via the service client, same proven pattern as lib/green-room/placements-admin.ts's no_block() call) rather than re-deriving draft/publish/custom-audience/block visibility logic in TypeScript — single source of truth for what a viewer may see stays in the database function all Green Room read paths already depend on"
    - "Same-shape-for-different-reasons 404: isReportTargetVisible() returns one boolean covering both 'target does not exist' and 'target exists but is not visible to this reporter' — the route never branches on which, so a reporter cannot use the report endpoint as a content-existence oracle for hidden/blocked/private material"
    - "Content-action routing (admin-reports.ts's applyContentAction) maps an actioned report onto whatever hide/remove/pause column ALREADY exists for that target's table (green_room_post/comment moderation_status, green_room_repost deleted_at, green_room_placement status) instead of inventing a new moderation state machine — profile/message targets have no such mechanism and are rejected before any write"

key-files:
  created:
    - lib/trust-safety/reports.ts
    - lib/trust-safety/admin-reports.ts
    - app/api/reports/route.ts
    - app/api/admin/reports/route.ts
    - app/api/admin/reports/[id]/route.ts
    - app/(admin)/admin/reports/page.tsx
    - components/admin/ReportsAdmin.tsx
    - __tests__/trust-safety-reports.test.ts
    - __tests__/trust-safety-admin-reports.test.ts
    - __tests__/reports-api.test.ts
  modified:
    - jest.config.js
    - app/(admin)/layout.tsx

key-decisions:
  - "Profile report-target visibility uses the same rule the public profile route (app/u/[handle]/page.tsx) currently enforces — is_public = true, or the reporter is the profile owner — rather than also gating on artist_profiles.profile_visibility (connections_only). That column exists in migration 058 but is not yet read/enforced anywhere (SAFETY-04/profile-visibility enforcement is explicitly 13-05's scope, which has not executed); wiring report-target visibility to a rule the rest of the app doesn't enforce yet would create a visibility inconsistency, not close one."
  - "Message report-target visibility checks thread participancy (a_id/b_id on dm_threads) rather than re-deriving the DM send-gate's connection/block rules — the send gate governs who may START a conversation, not who may see an already-existing message; a message a user received (including from the message-request/cold-outreach flow) is visible to them regardless of current connection state."
  - "Self-reporting a profile is rejected with a 400 before the service client is ever created — a narrow Rule 2 addition (missing input validation), not present in the plan's acceptance criteria but trivial and unambiguously correct."
  - "Per-target dedupe returns the existing open report (200) rather than erroring — re-reporting isn't a client mistake worth surfacing as an error; it should look identical to a fresh submission from the reporter's point of view while the backend avoids unbounded duplicate rows."
  - "Built the /admin/reports UI page + ReportsAdmin component (not just the two API routes) even though the plan's Task 2 acceptance criteria are API-shaped — every other admin capability in this codebase (checklist, tips, curators, industry members, green-room placements) ships a matching admin page under app/(admin)/admin/*, and the plan's own objective is to 'give admins a private queue to review, action, or dismiss reports,' which an API-only surface does not satisfy. Mirrors components/admin/PlacementAdmin.tsx's filter-form/action-button pattern exactly."
  - "[Rule 3 — blocking] jest.config.js's testPathIgnorePatterns entry '/.claude/worktrees/' (added in 656a307 to stop the MAIN checkout from double-discovering other agents' worktree test files) unintentionally self-excludes every test file when jest is run from inside an isolated executor worktree, because the worktree's own rootDir path always contains that exact substring. Verified before fixing: `npx jest --listTests` returned 0 matches from inside this worktree. Fixed by computing the current worktree's own directory name at config-load time and only ignoring OTHER (`.claude/worktrees/<other-name>/`) paths via a negative-lookahead regex — the main-checkout behavor (ignore all `.claude/worktrees/`) is preserved when jest is not run from inside one. This was required just to run this plan's own verification gate at all, not something specific to reports."

patterns-established:
  - "lib/trust-safety/{reports,admin-reports}.ts split the same way lib/green-room/placements-admin.ts already does: the route handles verifyAdmin()/auth, the lib module handles validation + service-client data access assuming the caller is already authorized — no lib function in either file re-checks auth itself."

requirements-completed: [SAFETY-02]

coverage:
  - id: D1
    description: "Authenticated member can create a report against a profile, message, or Green Room post/comment/repost/placement target; creation is rejected with an identical 404 for both a nonexistent target and a target that exists but isn't visible to the reporter"
    requirement: "SAFETY-02"
    verification:
      - kind: unit
        ref: "__tests__/reports-api.test.ts (POST /api/reports describe block)"
        status: pass
      - kind: unit
        ref: "__tests__/trust-safety-reports.test.ts (isReportTargetVisible — profile/message/green_room_post/comment/repost/placement describe blocks)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Re-reporting an already-open target dedupes to the existing report row instead of creating an unbounded number of duplicates for the same reporter+target pair"
    requirement: "SAFETY-02"
    verification:
      - kind: unit
        ref: "__tests__/reports-api.test.ts ('dedupes: returns the existing open report instead of inserting a duplicate')"
        status: pass
    human_judgment: false
  - id: D3
    description: "A reporter's own status reads (GET /api/reports) return only id/target_type/status/created_at — never reason, details, admin_notes, reviewed_by, or reviewed_at — matching the ReportStatusView contract exactly; the reported user has no read path to any report about them at all"
    requirement: "SAFETY-02"
    verification:
      - kind: unit
        ref: "__tests__/reports-api.test.ts (GET /api/reports; 'creates a new report and returns only the reporter-facing status view shape')"
        status: pass
    human_judgment: true
    rationale: "The unit tests assert the response shape and that GET uses the session client (RLS row-scope + migration 058 column-level GRANT) rather than the service client. Full confirmation that a reported user genuinely cannot read a report about them requires a live-database RLS exercise against the pushed migration 058, which is the same human-gated live-DB checkpoint noted in 13-01-SUMMARY.md's coverage entries, not something this plan's unit tests can re-prove."
  - id: D4
    description: "Admins can filter the report queue by status, reason, target_type, and a created_at date range, move a report to under_review/actioned/dismissed, and attach an admin-only internal note"
    requirement: "SAFETY-02"
    verification:
      - kind: unit
        ref: "__tests__/reports-api.test.ts (GET/PATCH /api/admin/reports describe blocks)"
        status: pass
      - kind: unit
        ref: "__tests__/trust-safety-admin-reports.test.ts (parseReportFilters, validateReportPatch, loadReportsForAdmin describe blocks)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Actioning a Green Room content report (post/comment/repost/placement) routes to that target's existing hide/remove/pause mechanism; profile/message targets — which have no such mechanism — reject a contentAction before any write"
    requirement: "SAFETY-02"
    verification:
      - kind: unit
        ref: "__tests__/trust-safety-admin-reports.test.ts (applyContentAction describe block, validateReportPatch 'rejects an unsupported contentAction' tests)"
        status: pass
      - kind: unit
        ref: "__tests__/reports-api.test.ts (PATCH /api/admin/reports/[id] describe block)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Admins have a reachable private queue UI (not API-only) to review reports, apply filters, and take actions"
    requirement: "SAFETY-02"
    verification: []
    human_judgment: true
    rationale: "No component-level render test exists for ReportsAdmin.tsx — matches this codebase's existing precedent (PlacementAdmin, NetworkTab, etc. have no React Testing Library render tests, only API-layer/pure-function tests, since no RTL setup exists in this Jest config). Visual/interaction confirmation of the filter form, action buttons, and content-action routing in the browser is a manual UAT item, consistent with 13-VALIDATION.md scenario 6 (admin reviews and marks dismissed/actioned; supported Green Room targets can be hidden/removed/paused)."

duration: ~50min
completed: 2026-07-18
status: complete
---

# Phase 13 Plan 04: Reporting & Admin Review Summary

**Member report creation for profiles/messages/Green Room content with visibility-gated, deduped, private-by-default writes, plus an admin queue (API + UI) that filters, transitions status, and routes actioned Green Room reports to each target's existing hide/remove/pause mechanism.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-07-18
- **Tasks:** 2 completed (plus one Rule 3 blocking-issue fix to jest.config.js, required to run this plan's own verification gate)
- **Files:** 10 created, 2 modified

## Accomplishments

- `lib/trust-safety/reports.ts`: `validateReportCreate()` validates targetType/targetId/reason/details against 13-01's contracts; `isReportTargetVisible()` gates report creation per target type — profile (is_public or owner), message (thread participancy via dm_threads a_id/b_id), and green_room_post/comment/repost (delegates to the existing `green_room_can_view_post` SECURITY DEFINER RPC rather than re-deriving draft/publish/audience/block logic), and green_room_placement (active status + within its schedule window). `findOpenReport()`/`toReportStatusView()` handle dedupe and the reporter-facing view shape.
- `app/api/reports/route.ts`: `POST` creates a report (401 unauthenticated, 400 invalid input or self-report, 404 identical-shape for nonexistent/not-visible target, 200 dedupe-to-existing, 201 new report); `GET` returns the caller's own report statuses via the session client, relying on migration 058's RLS row-scope + column-level GRANT as real defense-in-depth rather than an app-only check.
- `lib/trust-safety/admin-reports.ts`: `validateReportPatch()` validates status transitions (under_review/actioned/dismissed only — submitted is create-time-only), admin notes, and per-target-type content-action support; `applyContentAction()` routes hide/remove/pause to each target table's existing column (green_room_posts/comments `moderation_status`, green_room_reposts `deleted_at`, green_room_placements `status`); `parseReportFilters()`/`loadReportsForAdmin()` handle admin queue filtering and reporter-identity enrichment via an explicit column list against `artist_profiles`.
- `app/api/admin/reports/route.ts` (GET, filterable) and `app/api/admin/reports/[id]/route.ts` (PATCH), both gated by the existing `verifyAdmin()` precedent exactly as used by `/api/admin/green-room/placements`.
- `app/(admin)/admin/reports/page.tsx` + `components/admin/ReportsAdmin.tsx`: a reachable admin queue UI (filters, status-badge list, per-row action buttons including target-type-appropriate content actions), mirroring `components/admin/PlacementAdmin.tsx`'s pattern, plus a Reports link in the admin sidebar.
- `__tests__/reports-api.test.ts`, `__tests__/trust-safety-reports.test.ts`, `__tests__/trust-safety-admin-reports.test.ts`: 66 new tests covering auth gating, validation, dedupe, per-target-type visibility, admin filtering, status-transition validation, and content-action routing (including the "same 404 shape for not-found vs not-visible" invariant).

## Task Commits

1. **Task 1: Add report API** - `65737da` (feat) — also includes the jest.config.js Rule 3 fix (see Deviations), bundled because the fix was required to run this task's own tests.
2. **Task 2: Add admin report queue** - `ec852fe` (feat)

**Plan metadata:** _pending — see final commit below_

## Files Created/Modified

- `lib/trust-safety/reports.ts` - Report create validation, per-target-type visibility gate, dedupe, status-view narrowing
- `lib/trust-safety/admin-reports.ts` - Admin patch validation, content-action routing, filter parsing, enriched listing
- `app/api/reports/route.ts` - POST create / GET own-status-reads
- `app/api/admin/reports/route.ts` - GET filterable admin queue
- `app/api/admin/reports/[id]/route.ts` - PATCH status/notes/content-action
- `app/(admin)/admin/reports/page.tsx` - Admin reports page shell
- `components/admin/ReportsAdmin.tsx` - Filter form + queue list + action buttons
- `app/(admin)/layout.tsx` - Added Reports nav link
- `jest.config.js` - Fixed worktree-self-exclusion bug in testPathIgnorePatterns
- `__tests__/reports-api.test.ts` - API-layer tests for all four report routes
- `__tests__/trust-safety-reports.test.ts` - Unit tests for lib/trust-safety/reports.ts
- `__tests__/trust-safety-admin-reports.test.ts` - Unit tests for lib/trust-safety/admin-reports.ts

## Decisions Made

See `key-decisions` in frontmatter — summarized:
- Profile report-target visibility mirrors the CURRENTLY enforced public-profile rule (is_public/owner), not the not-yet-enforced `profile_visibility` column (that's 13-05's job).
- Message visibility = thread participancy, not a re-check of the DM send-gate's connection rules.
- Self-reporting a profile is rejected (Rule 2, trivial).
- Dedupe returns the existing open report (200) rather than erroring.
- Built a full admin UI page, not just the API, since every other admin capability in this codebase has one and the plan's stated objective requires a reachable queue.
- Fixed a pre-existing jest.config.js bug (Rule 3) that made it impossible to run ANY test from inside an isolated executor worktree.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed jest.config.js worktree self-exclusion**
- **Found during:** Task 1 (attempting to run this plan's own verify gate, `npm test -- --runInBand __tests__/reports-api.test.ts`)
- **Issue:** `jest.config.js`'s `testPathIgnorePatterns` includes a plain-string `/.claude/worktrees/` entry (added in commit 656a307 to stop the MAIN checkout from double-discovering test files nested inside other agents' isolated worktrees). Since this executor's own rootDir IS `.claude/worktrees/agent-a96d03fe6200fe03a/`, the substring match also excluded every test file in the CURRENT worktree — confirmed with `npx jest --listTests` returning 0 matches before the fix.
- **Fix:** Compute the current worktree's directory name from `__dirname` at config-load time and build a negative-lookahead pattern that ignores every `.claude/worktrees/<name>/` path EXCEPT the one jest is currently rooted in. When not running from inside a worktree at all (the main checkout), falls back to the original "ignore all" behavior — no change for that case.
- **Files modified:** `jest.config.js`
- **Verification:** `npx jest --listTests` went from 0 to 40 matches immediately after the fix; full suite (`npx jest --runInBand`) passed at 43 suites / 397 tests after adding this plan's own test files, versus the 40 suites / 331 tests baseline noted in STATE.md.
- **Committed in:** `65737da` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added an admin UI page, not just the two API routes**
- **Found during:** Task 2 (admin report queue)
- **Issue:** The plan's Task 2 acceptance criteria are phrased at the API level, but the plan's own objective states admins need "a private queue to review, action, or dismiss reports." Every other admin capability in this codebase (checklist, tips, curators, industry members, green-room placements) ships a matching page under `app/(admin)/admin/*` — an API-only surface would leave the queue unreachable by an admin without writing raw `fetch` calls.
- **Fix:** Added `app/(admin)/admin/reports/page.tsx` + `components/admin/ReportsAdmin.tsx`, mirroring `components/admin/PlacementAdmin.tsx`'s established filter-form/action-button pattern exactly, plus a Reports link in `app/(admin)/layout.tsx`'s sidebar.
- **Files modified:** `app/(admin)/admin/reports/page.tsx` (new), `components/admin/ReportsAdmin.tsx` (new), `app/(admin)/layout.tsx`
- **Verification:** `npx tsc --noEmit` and `npm run lint` clean; no render-level test exists (matches this codebase's existing precedent of no RTL setup — see coverage D6's rationale).
- **Committed in:** `ec852fe` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing-critical-functionality)
**Impact on plan:** The jest.config.js fix was necessary just to execute this plan's own verification gate — no scope creep, and it's a narrow, additive regex change that preserves the original intent (ignore sibling worktrees) for every other caller. The admin UI addition stays within this plan's stated objective and existing codebase conventions; it did not require any new API surface beyond what Task 2 already specified.

## Issues Encountered

None beyond the two items above — both handled per the deviation rules without blocking execution.

## User Setup Required

None — no new environment variables or external service configuration. Migration 058 (the `reports` table this plan writes to) is already applied to both local and remote databases per the assignment's confirmation (`supabase migration list` in sync through 060), so no DB push checkpoint is outstanding for this plan specifically.

## Next Phase Readiness

- **SAFETY-02 is functionally satisfied by this plan's scope:** members can report profile/message/Green Room targets with server-side visibility validation and per-target dedupe; reports are private by default (reporter sees only id/target_type/status/created_at, reported users have no read path at all — enforced by migration 058's RLS + column grants, exercised here via unit tests); admins have a filterable, actionable, reachable queue that routes Green Room actions to existing hide/remove/pause mechanisms without inventing new moderation state.
- **Live-DB / manual UAT still outstanding** (not this plan's job to close): 13-VALIDATION.md's manual UAT scenarios 5 and 6 (Industry C reports A's profile + a Green Room post/comment/repost; admin reviews and dismisses/actions one, confirming supported Green Room targets can be hidden/removed/paused) require a real three-account exercise against the live database — the same category of human-gated live-DB checkpoint noted throughout 13-01/13-02's summaries.
- **13-03 (Hard block enforcement) remains unexecuted** and out of this plan's scope — this plan's report-target visibility checks intentionally mirror CURRENTLY enforced visibility (is_public, moderation_status, green_room_can_view_post which already includes `no_block()` per migrations 059/060), not a hypothetical fully-audited state. Nothing in this plan blocks 13-03 from proceeding independently.
- **13-05 (Verification & profile visibility) is unaffected** by this plan and can proceed independently; profile report-target visibility here deliberately does NOT depend on 13-05's not-yet-enforced `profile_visibility` column (see key-decisions), so there is no ordering dependency between the two plans.
- The jest.config.js fix benefits every future executor working from an isolated worktree in this repo, not just this plan.

---
*Phase: 13-network-trust-safety*
*Completed: 2026-07-18*
