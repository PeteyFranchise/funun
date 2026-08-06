---
phase: 28-industry-accounts-green-room-access
plan: 05
subsystem: database
tags: [supabase, migration, rls, capability-grants, green-room, human-gated]

# Dependency graph
requires:
  - phase: 28-industry-accounts-green-room-access
    provides: "28-01 (member_type/capability_grants lockstep via grantCapability), 28-02 (app-layer greenRoomPosterGate member_type rule this migration's RLS mirrors), 28-03 (provisionIndustryAccount admin-invite + repointed curator-claim paths this migration's trigger fix covers)"
provides:
  - "supabase/migrations/085_industry_capability_green_room_gate.sql — DRAFTED, TEXT-TESTED, NOT PUSHED"
  - "handle_new_user() industry branch writes an approved capability_grants row (source=signup) atomic with the user_profiles insert"
  - "One-time idempotent backfill for existing member_type=industry profiles lacking an approved industry grant"
  - "green_room_posts_insert_own RLS WITH CHECK gains a member_type IN (artist,industry) EXISTS clause"
affects: [antenna-opportunities, green-room, industry-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Migration-text-assertion test (readFileSync + toContain/toMatch) mirroring __tests__/migration-061.test.ts, scoped to a substring window around the industry branch to assert BEGIN/EXCEPTION nesting without a full SQL parser"

key-files:
  created:
    - __tests__/migration-085.test.ts
    - .planning/phases/28-industry-accounts-green-room-access/28-05-SUMMARY.md
  modified:
    - supabase/migrations/085_industry_capability_green_room_gate.sql

key-decisions:
  - "capability_grants insert placed inside handle_new_user()'s SECURITY DEFINER trigger (not app-code) — matches PATTERNS' framing of this as the single writer, atomic with the user_profiles insert the branch already owns, and covers both the admin-invite (createIndustryMember) and repointed curator-claim (28-03, provisionIndustryAccount) creation paths with one write, since both mint accounts via admin.createUser({app_metadata:{role:'industry'}})"
  - "Grant insert wrapped in its own nested BEGIN/EXCEPTION WHEN OTHERS block, mirroring the branch's existing subscriptions-insert isolation idiom, so a grant-insert hiccup cannot orphan the account (T-28-05-04)"
  - "Backfill uses source='backfill' (mirroring migration 042's own D-12 backfill), the trigger uses source='signup' — both already valid per migration 042's CHECK constraint; no new source enum value added"
  - "industry_profiles table and the curator handle_new_user() branch left completely untouched — out of scope per the plan's prohibitions"
  - "RLS WITH CHECK on green_room_posts_insert_own is a DROP+CREATE replace (not a second stacked policy), keeps author_id = auth.uid() and adds a member_type EXISTS gate against public.user_profiles, mirroring Plan 28-02's app-layer greenRoomPosterGate() member_type rule as a DB-authoritative backstop"

patterns-established:
  - "For a plan whose final task is a blocking human-verify migration-push checkpoint, the executor drafts + text-tests + commits the migration and test, writes the SUMMARY documenting the drafted-but-not-pushed state (status: blocked, mirroring 17-09-SUMMARY.md's precedent), and stops without running supabase db push"

requirements-completed: []
# INDUSTRY-01/INDUSTRY-02/INDUSTRY-06 remain NOT marked complete — the DB-layer half of
# each requirement (this migration) is drafted but not yet live. Mark complete only after
# the Task 3 checkpoint resolves "approved" (LOCAL=REMOTE through 085 + smoke checks pass).

coverage:
  - id: D1
    description: "Migration 085 drafted: handle_new_user() industry branch writes an approved capability_grants row (source=signup) atomic with the user_profiles insert, isolated in its own exception block"
    requirement: "INDUSTRY-01"
    verification:
      - kind: unit
        ref: "__tests__/migration-085.test.ts#inside the industry branch, writes an approved industry capability_grants row with source=signup"
        status: pass
      - kind: unit
        ref: "__tests__/migration-085.test.ts#wraps the trigger-time capability_grants insert in a nested exception-isolation block"
        status: pass
    human_judgment: false
  - id: D2
    description: "Migration 085 drafted: idempotent backfill inserts an approved industry grant for every existing member_type=industry profile lacking one"
    requirement: "INDUSTRY-01"
    verification:
      - kind: unit
        ref: "__tests__/migration-085.test.ts#backfills approved industry grants for existing member_type=industry profiles that lack one, idempotently"
        status: pass
    human_judgment: false
  - id: D3
    description: "Migration 085 drafted: green_room_posts_insert_own RLS WITH CHECK requires author_id = auth.uid() AND a member_type IN (artist,industry) EXISTS on user_profiles"
    requirement: "INDUSTRY-02"
    verification:
      - kind: unit
        ref: "__tests__/migration-085.test.ts#the new green_room_posts_insert_own WITH CHECK keeps author_id=auth.uid() AND adds a member_type EXISTS gate"
        status: pass
      - kind: unit
        ref: "__tests__/migration-085.test.ts#drops and re-creates green_room_posts_insert_own rather than stacking a second policy"
        status: pass
    human_judgment: false
  - id: D4
    description: "Scope guards hold: curator branch not deleted, industry_profiles not dropped/referenced, green_room_posts_update_own untouched"
    verification:
      - kind: unit
        ref: "__tests__/migration-085.test.ts#does not delete the curator branch, does not drop industry_profiles, does not stack a duplicate policy leftover"
        status: pass
      - kind: unit
        ref: "__tests__/migration-085.test.ts#preserves the curator early-return branch verbatim"
        status: pass
      - kind: unit
        ref: "__tests__/migration-085.test.ts#leaves green_room_posts_update_own untouched (no DROP POLICY for it)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Migration 085 pushed to the live database (LOCAL=REMOTE through 085), live role='curator' account count recorded, and the four post-push smoke scenarios (industry account posts an Antenna opportunity; artist AND industry can post in Green Room; a non-member is RLS-rejected; a @funun.studio account is app-layer-blocked) all pass"
    verification: []
    human_judgment: true
    rationale: "Blocking checkpoint (Task 3, gate=blocking-human) — this project's standing convention never runs supabase db push from an agent. Requires a human with Supabase CLI/dashboard access to review, push, and manually exercise live accounts against the running app."

# Metrics
duration: ~20min
completed: 2026-08-06
status: blocked
---

# Phase 28 Plan 05: Migration 085 — Industry Capability Grant + Green Room RLS Gate Summary

**Drafted and text-tested migration 085 (handle_new_user() industry-branch capability_grants write + backfill + green_room_posts_insert_own RLS member_type gate) — the two autonomous tasks are committed; the migration is intentionally NOT pushed, pending the blocking human-verify checkpoint.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 of 3 (the remaining task is a blocking-human checkpoint, not executor work)
- **Files modified:** 2 (1 new test file, 1 new migration file)

## Accomplishments

- **`__tests__/migration-085.test.ts`** — 12 migration-text assertions mirroring `__tests__/migration-061.test.ts`'s `readFileSync`+`toContain`/`toMatch` pattern: confirms the `CREATE OR REPLACE FUNCTION public.handle_new_user()` replace shape, the preserved curator/artist branches, the industry-branch `capability_grants` insert (capability=`industry`, status=`approved`, source=`signup`) wrapped in its own `BEGIN`/`EXCEPTION WHEN OTHERS` block, the idempotent `NOT EXISTS` backfill, the `DROP POLICY`+`CREATE POLICY` replace of `green_room_posts_insert_own` with the `member_type IN ('artist','industry')` `EXISTS` gate alongside the existing `author_id = auth.uid()` check, and four scope-creep guards (no curator-branch delete, no `industry_profiles` reference anywhere in the file, `green_room_posts_update_own` untouched, human-gated-push comment present).
- **`supabase/migrations/085_industry_capability_green_room_gate.sql`** — drafted, all 12 text assertions GREEN:
  - (a) Full-body `CREATE OR REPLACE FUNCTION public.handle_new_user()`, copied verbatim from migration 076's live body (curator early-return branch, artist default branch with `claim_collaborators()`), with the industry branch extended: after the existing `subscriptions` insert (kept exactly as-is), a new nested `BEGIN ... INSERT INTO public.capability_grants (profile_id, capability, status, role_slugs, source, decided_at) VALUES (NEW.id, 'industry', 'approved', <role_badges array>, 'signup', now()) ... EXCEPTION WHEN OTHERS THEN NULL; END;` block. This is the single writer, atomic with the `user_profiles` insert the branch already owns, and covers both the admin-invite (`createIndustryMember()`) and repointed curator-claim (Plan 28-03's `provisionIndustryAccount()`) creation paths for free, since both set `app_metadata.role='industry'` at `admin.createUser()` time.
  - (b) A one-time idempotent backfill: `INSERT INTO capability_grants (...) SELECT up.id, 'industry', 'approved', 'backfill', now() FROM public.user_profiles up WHERE up.member_type = 'industry' AND NOT EXISTS (SELECT 1 FROM capability_grants cg WHERE cg.profile_id = up.id AND cg.capability = 'industry' AND cg.status = 'approved')` — mirrors migration 042's own D-12 backfill shape; the anti-join guard makes re-running the migration safe and avoids tripping `capability_grants_active_uniq`.
  - (c) `DROP POLICY IF EXISTS "green_room_posts_insert_own" ON green_room_posts;` followed by a `CREATE POLICY` with `WITH CHECK (author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND member_type IN ('artist', 'industry')))` — the RLS backstop mirroring Plan 28-02's app-layer `greenRoomPosterGate()` member_type rule (defense-in-depth doctrine). `green_room_posts_update_own` is untouched.
  - Header comment explicitly marks the file HUMAN-GATED and states the owner pushes it via Codex — this executor did not and will not run `supabase db push`.

## Task Commits

Each autonomous task was committed atomically (TDD: RED → GREEN):

1. **Task 1: Failing migration-text assertions for migration 085** — `fba75e1` (test, RED — asserted against a not-yet-existing migration file, confirmed `ENOENT`)
2. **Task 2: Write migration 085 (capability write + backfill + Green Room RLS gate) — DO NOT push** — `0575a97` (feat, GREEN)

**Task 3 (BLOCKING checkpoint):** not executed by this agent — see "Checkpoint" section below.

## Files Created/Modified

- `__tests__/migration-085.test.ts` — 12 migration-text assertions (RED → GREEN)
- `supabase/migrations/085_industry_capability_green_room_gate.sql` — the drafted, additive, NOT-pushed migration

## Decisions Made

See `key-decisions` in frontmatter above. Summary:
- Capability grant write lives in the SQL trigger (`handle_new_user()`), not app code — single writer, atomic, covers both creation call sites.
- `source='signup'` for the trigger write, `source='backfill'` for the backfill — both already valid per migration 042's `CHECK` constraint; no new enum value.
- `industry_profiles` and the curator branch are completely untouched (out of scope per plan prohibitions).
- RLS policy is a DROP+CREATE replace, not a stacked second policy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, self-caught in test authoring] One of my own Task 1 test assertions had a false-positive matching window**
- **Found during:** Task 2, first `npx jest __tests__/migration-085.test.ts` run against the drafted migration.
- **Issue:** The "uses source=backfill" test located the first `NOT EXISTS` substring via `migration.indexOf('NOT EXISTS')` and checked a ±800-char window for `'backfill'`. My migration's own header comment for the backfill block used the phrase "NOT EXISTS anti-join" in prose, so `indexOf` matched that comment occurrence (which precedes the literal `'backfill'` string in the actual `INSERT`/`SELECT` statement) instead of the SQL clause, and the 200-char forward window didn't reach far enough to find `'backfill'`.
- **Fix:** Reworded the migration's own comment from "NOT EXISTS anti-join" to "anti-join guard below" (production text change, not a test-assertion weakening) — the test's matching logic and its meaning were correct; the migration's prose comment was the actual source of ambiguity.
- **Files modified:** `supabase/migrations/085_industry_capability_green_room_gate.sql` (comment text only, no logic change).
- **Verification:** `npx jest __tests__/migration-085.test.ts` — 12/12 green after the fix.
- **Committed in:** `0575a97` (Task 2 commit, before the file was ever committed as "passing").

---

**Total deviations:** 1 auto-fixed (1 bug in this same plan's own migration comment wording, caught by its own test).
**Impact on plan:** No scope creep — comment-only fix, no change to any SQL statement's behavior.

## Issues Encountered

Git commit messages containing possessive apostrophes (`'s`) inside a bullet list, when passed through a `cat <<'EOF' ... EOF` heredoc wrapped in `git commit -m "$(...)"`, caused a shell quoting error in this execution environment on the first two attempts. Rewrote the commit messages to avoid possessive apostrophes; the third attempt succeeded cleanly. No production code was affected — purely a commit-message authoring issue.

## User Setup Required

None from this session for the two completed tasks. **Task 3 requires a human with Supabase CLI/dashboard access — see Checkpoint below.**

## Checkpoint (BLOCKING — Task 3, not executed)

**Type:** human-verify (`gate="blocking-human"`)
**What was drafted:** Migration 085 (`supabase/migrations/085_industry_capability_green_room_gate.sql`) — text-tested, committed, **NOT pushed**. All application code from Plans 28-01/28-02/28-03/28-04 is already merged and depends on this migration going live to be fully exercisable end-to-end (the Antenna gate fix from 28-01 and the Green Room app-layer gate from 28-02 are both currently satisfiable in code but not yet backed by a live DB write/RLS policy).

**Exact steps for the human/owner (via Codex, not this agent):**
1. Review `supabase/migrations/085_industry_capability_green_room_gate.sql` — confirm it is additive only: no curator-branch delete, no `industry_profiles` drop, no `DROP TABLE` anywhere.
2. **Before pushing**, confirm the live count of legacy accounts to migrate:
   `SELECT COUNT(*) FROM curators WHERE claimed_by IS NOT NULL;` and cross-check how many of those `auth.users` rows carry `app_metadata.role='curator'`. Record the number here in a follow-up edit to this SUMMARY (owner expects ~0). If nonzero, do NOT proceed with the deferred curator-branch/`(curator-portal)` route-group removal follow-up until those accounts are individually migrated — Plan 28-03's repoint already prevents any NEW `role='curator'` accounts from being minted.
3. Push: `supabase db push` (applies 085). Then `supabase migration list` — confirm `LOCAL=REMOTE` through 085.
4. Post-push smoke (live accounts):
   - (a) A freshly admin-invited Industry account can `POST /api/antenna/opportunities` (was a guaranteed 403 before Plan 28-01/this migration) and has an approved `industry` `capability_grants` row.
   - (b) Both an artist account AND an industry account can post in the Green Room.
   - (c) A principal without `member_type IN ('artist','industry')` (e.g., a buyer session, or a direct PostgREST insert attempt) is REJECTED by RLS on `green_room_posts` insert.
   - (d) A `@funun.studio` account still cannot post (this is the app-layer `greenRoomPosterGate()` check from Plan 28-02, unaffected by this migration but worth re-confirming in the same pass).
5. Report results back (paste the `supabase migration list` output + the four smoke outcomes into this SUMMARY or a follow-up note).

**Resume signal:** Type "approved" once 085 is live (`LOCAL=REMOTE`) and all four smoke checks pass, or describe the specific failure. A fresh executor agent will resume from this point — it will NOT redo Tasks 1/2 (their commits `fba75e1`/`0575a97` already exist).

## Verification Results (autonomous tasks only)

- `npx jest __tests__/migration-085.test.ts` — 12/12 GREEN.
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (0 warnings, `--max-warnings=0`).
- `npm run test` (full suite) — 115 suites / 1430 tests, all GREEN (one prior run showed 3 unrelated PDF-rendering timeout failures in `lib/vault/pdf/*.test.ts`, confirmed flaky/pre-existing — a clean rerun was 115/115 green with no code changes in between).

## TDD Gate Compliance

Task 1 (`tdd="true"`) and Task 2 (`tdd="true"`) followed the RED → GREEN gate sequence. Git log confirms:
1. `test(28-05): add failing migration-text assertions for migration 085` (RED) — commit `fba75e1`
2. `feat(28-05): draft migration 085 - industry capability grant + Green Room RLS gate (NOT PUSHED)` (GREEN) — commit `0575a97`

No REFACTOR commit was needed. No test-suite gate applies to Task 3 (checkpoint, not a code task).

## Requirements

`INDUSTRY-01`, `INDUSTRY-02`, and `INDUSTRY-06` are provisional IDs per the plan's own frontmatter note — no Phase 28 section exists yet in `.planning/REQUIREMENTS.md` (same pre-existing registration gap already logged against 28-01/28-02/28-03/28-04 in STATE.md). None are marked complete by this run: the DB-layer half of each is drafted but not live — mark complete only after Task 3 resolves "approved".

## Next Phase Readiness

- This is the final plan (5 of 5) in Phase 28. Tasks 1-2 of Plan 28-05 are complete; **Task 3 (the migration push + live smoke) is the sole remaining item in the entire phase**, blocking full phase completion.
- Neither this checkpoint nor the migration's un-pushed state blocks any other phase — no downstream phase depends on Phase 28 per `.planning/ROADMAP.md`.
- Once Task 3 resolves "approved": (1) update this SUMMARY's Checkpoint section with the recorded `role='curator'` count and smoke results, (2) mark `INDUSTRY-01`/`INDUSTRY-02`/`INDUSTRY-06` complete once REQUIREMENTS.md registration happens in a future `/gsd-docs-update` pass, (3) if the live `role='curator'` count is confirmed zero, the deferred two-step curator-branch/`(curator-portal)` route-group removal becomes unblocked as a follow-up cleanup (not part of this phase's scope).

---
*Phase: 28-industry-accounts-green-room-access*
*Completed (autonomous tasks only): 2026-08-06*

## Self-Check: PASSED

- FOUND: __tests__/migration-085.test.ts
- FOUND: supabase/migrations/085_industry_capability_green_room_gate.sql
- FOUND: .planning/phases/28-industry-accounts-green-room-access/28-05-SUMMARY.md
- FOUND commit: fba75e1 (test, RED)
- FOUND commit: 0575a97 (feat, GREEN)
- TDD gate sequence verified: test(fba75e1) -> feat(0575a97); no refactor commit needed
