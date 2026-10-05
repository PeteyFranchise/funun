---
phase: quick/261004-wlk-work-id-write-lockdown
plan: 261004-wlk
subsystem: database
tags: [postgres, supabase, trigger, rls, migration, jest, security]

requires: []
provides:
  - "supabase/migrations/231_tracks_work_id_trigger_lockdown.sql — a BEFORE INSERT OR UPDATE trigger (tracks_guard_work_id_write) on public.tracks that rejects any client write to work_id unless auth.role() is NULL or 'service_role', correcting migration 230's silent-no-op column REVOKE. HUMAN-GATED, never applied."
  - "__tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts — proves the SQL text was written correctly (role check, trigger attachment, SECURITY INVOKER, no grant-dance, owner-run probe present); explicitly scoped as NOT proving enforcement"
  - ".planning/todos/pending/261004-wlk-push-and-verify-migration-231.md — owner's push + two-part verification steps, plus two independent non-blocking follow-ups"
affects: [261004-wtl, catalogue, phase-50-crate-admit]

tech-stack:
  added: []
  patterns:
    - "Enforcement mechanism independent of a table's grant state (BEFORE INSERT OR UPDATE trigger) preferred over column-privilege REVOKE/GRANT when a table's column surface has grown without grant bookkeeping -- the trigger cannot rot the way a column allowlist already did here"
    - "auth.role() = 'service_role' (reads request.jwt.claims, survives SECURITY DEFINER's current_user switch) as the caller-identity check inside a guard that must still permit a SECURITY DEFINER function's writes -- same idiom migration 209 already established for thirteen functions"
    - "Text-lock test explicitly labeled, in its own header comment, as proving SQL correctness only, not database enforcement -- the behavioral proof lives in the migration file's own trailing owner-run comment block instead"

key-files:
  created:
    - supabase/migrations/231_tracks_work_id_trigger_lockdown.sql
    - __tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts
    - .planning/todos/pending/261004-wlk-push-and-verify-migration-231.md
  modified: []

key-decisions:
  - "D-WLK-01: trigger (Candidate B), not table-revoke-then-column-allowlist (Candidate A, migration 040's own proven pattern) -- tracks has grown its column list four times with zero grant bookkeeping, and allowlist mode would inherit the exact 'next column silently breaks or reopens' failure this fix exists to close. A trigger's protection does not read tracks' grant state at all."
  - "D-WLK-02: guard checks (SELECT auth.role()) = 'service_role', never current_user -- SECURITY DEFINER changes current_user to the function owner, which would make a current_user-based guard blind to graduate_song_passport_to_release()'s real caller. Matches migration 209's already-shipped idiom verbatim."
  - "D-WLK-03: NULL auth.role() (a direct database session -- owner via supabase db push, SQL editor, or a migration's own backfill) is treated as privileged, matching the pre-existing admin trust tier this table's owner-run migrations already operate at."
  - "D-WLK-04: anon's dead-but-ungranted table-level INSERT/UPDATE on tracks is NOT revoked here -- already neutralized by RLS (tracks_write_project_owner_or_editor is FOR ALL TO authenticated only), and bundling a table-wide grant change into a single-column defect fix would widen this migration's blast radius for no defect-closing benefit. Deferred to the owner todo as an independent, optional follow-up, matching the precedent migrations 091/092 already set for other tables."
  - "D-WLK-05: migration 231's own COMMENT ON FUNCTION text was rephrased mid-task to describe (not literally reproduce) migration 230's broken REVOKE syntax -- the first draft's text-lock test correctly flagged that verbatim quoting was indistinguishable, by text match alone, from this migration reissuing the same grant-dance it exists to replace."

requirements-completed: [QUICK-261004-WLK]

coverage:
  - id: D1
    description: "A BEFORE INSERT OR UPDATE trigger on public.tracks rejects any work_id write where auth.role() is neither NULL nor service_role, replacing migration 230's non-functional column REVOKE"
    requirement: "QUICK-261004-WLK"
    verification:
      - kind: unit
        ref: "__tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts#defines tracks_guard_work_id_write() returning TRIGGER, checking both INSERT and UPDATE changes to work_id"
        status: pass
      - kind: unit
        ref: "__tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts#attaches the trigger BEFORE INSERT OR UPDATE ON public.tracks FOR EACH ROW"
        status: pass
    human_judgment: true
    rationale: "No database connection (local or production) was reachable from this session -- the test proves the SQL was written correctly, not that Postgres enforces it. The owner must run the behavioral probe embedded in migration 231's trailing comment after pushing it, which is a necessarily manual, database-connected step this environment cannot perform."
  - id: D2
    description: "The guard uses auth.role()/service_role, not current_user, so graduate_song_passport_to_release()'s SECURITY DEFINER write path keeps working"
    requirement: "QUICK-261004-WLK"
    verification:
      - kind: unit
        ref: "__tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts#gates on auth.role() / service_role, and does NOT gate on current_user -- the specific mistake this fix rules out"
        status: pass
    human_judgment: false
  - id: D3
    description: "No existing tracks write path (legacy insert, metadata PATCH allowlist, isrc/audio/sync-library/split-sheet routes, set_track_metadata_asset) names work_id, so none can trip the new guard"
    requirement: "QUICK-261004-WLK"
    verification:
      - kind: other
        ref: "grep -rn work_id app/api/vault/ -> no results; both tracks.insert() and the TrackUpdate allowlist type confirmed free of work_id by direct source read"
        status: pass
    human_judgment: false
  - id: D4
    description: "The owner-run behavioral verification (information_schema re-check + BEGIN/SAVEPOINT/ROLLBACK impersonation probe) is embedded verbatim in migration 231's trailing comment and tracked as a todo"
    requirement: "QUICK-261004-WLK"
    verification:
      - kind: unit
        ref: "__tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts#carries the owner-run behavioral verification block, referencing both information_schema.column_privileges and request.jwt.claims"
        status: pass
    human_judgment: true
    rationale: "This is a procedural step the owner must execute against a live database; no automated test can confirm the probe's actual outcome in production."

duration: ~55min
completed: 2026-10-05
status: complete
---

# Quick Task 261004-wlk: Work ID Write Lockdown Summary

**Migration 231 replaces migration 230's silently-no-op column-level REVOKE with a BEFORE INSERT OR UPDATE trigger on `public.tracks` whose protection does not depend on the table's grant state, so it cannot rot the same way — authored, text-tested, and left unapplied for the owner.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-10-05
- **Tasks:** 2/2
- **Files created:** 3 (1 migration, 1 test, 1 todo)

## Baseline Gate (BEFORE any code)

Confirmed green on a fresh worktree off `origin/main` (`5c1738db`), before writing migration 231 or its test:

```
$ npm run security:migrations:verify
PASS: migrations 214–218 are transactional, collision-sensitive, least-privilege, checksum-pinned, and covered by read-only probes.

$ npm run typecheck:strict
(clean — tsc --noEmit --noUnusedLocals --noUnusedParameters, no output, exit 0)

$ npm run lint
(ESLINT_USE_FLAT_CONFIG=false eslint . --ext .js,.jsx,.ts,.tsx --max-warnings=0 — only the ESLintRCWarning migration notice, zero lint errors/warnings, exit 0)

$ npm test -- --runInBand
Test Suites: 649 passed, 649 total
Tests:       8125 passed, 8125 total
Snapshots:   0 total
Time:        48.528 s

$ npm audit --omit=dev --audit-level=moderate
found 0 vulnerabilities

$ npm run audit:gate
audit-gate: clean -- 1 active deferral(s), earliest expiry 2026-11-02.
```

## The migration, and explicit confirmation it was never applied

`supabase/migrations/231_tracks_work_id_trigger_lockdown.sql`. Re-verified 231 was the next free number at execution time (`ls supabase/migrations/ | sort | tail -1` → `230_track_work_direct_link.sql`; no `231_*` anywhere in `supabase/migrations/`, `.planning/quick/**`, or `git status --porcelain`).

**It was never applied.** No `supabase db push`, `supabase db reset`, `psql`, or any execution of this file's SQL was run at any point in this session. `git diff --stat supabase/migrations/` after Task 1 showed exactly one new file and zero changes to any existing migration. No Docker, no local Supabase Postgres, and no production credentials were reachable from this session (`.env.local` is denied by the sandbox) — confirming a live push was never even possible here, let alone performed.

## The trigger's guard condition, and why `auth.role()` survives `SECURITY DEFINER`

```sql
v_role TEXT := (SELECT auth.role());
v_privileged BOOLEAN := v_role IS NULL OR v_role = 'service_role';
v_changing BOOLEAN := (TG_OP = 'INSERT' AND NEW.work_id IS NOT NULL)
  OR (TG_OP = 'UPDATE' AND NEW.work_id IS DISTINCT FROM OLD.work_id);

IF v_changing AND NOT v_privileged THEN
  RAISE EXCEPTION 'tracks.work_id can only be written by the service role (graduate_song_passport_to_release)'
    USING ERRCODE = '42501';
END IF;
```

`auth.role()` reads the `request.jwt.claims` session GUC — a property of the **connection**, set once per request and untouched by anything that happens inside a function call. `current_user`, by contrast, is exactly what `SECURITY DEFINER` changes: for the duration of a `SECURITY DEFINER` call, `current_user` becomes the function's **owner**, not its caller. `graduate_song_passport_to_release()` (migration 230, unedited) is `SECURITY DEFINER`. A guard gated on `current_user = 'service_role'` would see the function's owner on every call, regardless of who invoked it, and could not distinguish a legitimate service-role-mediated write from any other — it would either wrongly block the one legitimate writer or (if the owner role happens to be named something that passes) wrongly admit everyone. `auth.role()` has no such blind spot, because it never changes identity mid-call.

This is not a new idiom: migration 209 already ships thirteen `SECURITY DEFINER` functions relying on the identical `(SELECT auth.role()) = 'service_role'` disjunct (`209_definer_helper_caller_binding.sql:254,301,320`, with its own "WHY THE SERVICE-ROLE DISJUNCT IS REQUIRED, NOT DECORATIVE" section making the same argument). Migration 231 matches that established idiom rather than inventing a new one.

NULL is treated as privileged for the same reason: a direct database session (the owner via `supabase db push`, the SQL editor, or a migration's own backfill) has no `request.jwt.claims` at all, so `auth.role()` returns NULL there — the same admin trust tier this table's owner-run migrations already operate at.

## The graduation path still works — the call chain

Confirmed, re-reading the source (not assumed from the plan):

1. `app/api/works/[workId]/passport/route.ts:56` — `const service = createServiceClient()`.
2. `lib/supabase/server.ts:39-43` — `createServiceClient()` builds the client from `SUPABASE_SERVICE_ROLE_KEY`, whose JWT carries the `role: "service_role"` claim.
3. `app/api/works/[workId]/passport/route.ts:171` — `service.rpc('graduate_song_passport_to_release', { p_passport_id, p_master_designation_id, p_actor_user_id, p_release_title })`.
4. Inside `graduate_song_passport_to_release()` (migration 230, `SECURITY DEFINER`, unedited by this migration), the `INSERT INTO public.tracks (..., work_id) VALUES (..., v_work.id)` fires the new trigger.
5. The trigger's `(SELECT auth.role())` reads the service client's connection-level JWT claim → `'service_role'` → `v_privileged = TRUE` → the `IF` guard does not fire → `RETURN NEW` → the insert proceeds exactly as before.

`grep -rln "graduate_song_passport_to_release" app lib` returns only this one route file — confirmed the single caller claim holds.

## What the Jest test proves, and what it explicitly does not

`__tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts` (12 tests, all passing) opens with a header comment stating plainly: this file proves the SQL was **written** with the intended guard (correct function shape, correct role check, correct trigger attachment, `SECURITY INVOKER`, no grant-dance repeat, no edit to `graduate_song_passport_to_release`, and the owner-run probe's presence) — it does **not** and **cannot** prove Postgres **enforces** any of it, because migration 230 shipped a passing text-lock test on SQL that enforced nothing in production. A standing corpus invariant (mirroring `__tests__/rls-helper-callsites.test.ts`'s own `stripLineComments` discipline) counts every `CREATE (OR REPLACE) TRIGGER tracks_guard_work_id_write` against every `DROP TRIGGER ... tracks_guard_work_id_write` across the whole migrations corpus, so a future migration silently dropping the trigger without a replacement would fail this test.

One mid-task correction: the first draft of the migration's `COMMENT ON FUNCTION` text quoted migration 230's broken `REVOKE INSERT (work_id), UPDATE (work_id)` statement verbatim for documentation. The test's own `REVOKE[^;]*work_id` assertion (intentionally written broad, per the plan, to catch any repeat of 230's grant-dance) correctly flagged that quoting as textually indistinguishable from reissuing the statement. Fixed by rephrasing the comment to describe the superseded mechanism in prose rather than reproduce its exact syntax, and by checking both the `REVOKE`/`GRANT` and `current_user` assertions against comment-stripped code so the migration's own header prose (which legitimately quotes `current_user = 'service_role'` and the old `REVOKE` line to explain what NOT to do) isn't mistaken for the executable guard itself.

## The owner-run probe, verbatim

Embedded in `supabase/migrations/231_tracks_work_id_trigger_lockdown.sql`'s trailing `OWNER-RUN BEHAVIORAL VERIFICATION` comment block:

```sql
BEGIN;

-- Impersonate an ordinary authenticated client.
SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub','<YOUR_USER_ID>')::text, true);
SET ROLE authenticated;

SAVEPOINT probe_1;
-- MUST RAISE 42501 -- an authenticated client naming work_id directly.
INSERT INTO public.tracks (project_id, user_id, title, track_number, work_id)
VALUES ('<YOUR_PROJECT_ID>', '<YOUR_USER_ID>', 'trigger probe', 9999, '00000000-0000-0000-0000-000000000000');
-- After observing the 42501 error above:
ROLLBACK TO SAVEPOINT probe_1;

-- MUST SUCCEED -- the same client, same row shape, just without work_id.
INSERT INTO public.tracks (project_id, user_id, title, track_number)
VALUES ('<YOUR_PROJECT_ID>', '<YOUR_USER_ID>', 'trigger probe', 9999)
RETURNING id;
-- Note the returned id; it is referenced as <PROBE_TRACK_ID> below.

RESET ROLE;
-- Impersonate the service role -- the one path graduate_song_passport_
-- to_release() actually uses.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET ROLE service_role;

-- MUST SUCCEED -- this is the proof graduate_song_passport_to_release()'s
-- own write path still works.
UPDATE public.tracks SET work_id = '00000000-0000-0000-0000-000000000000'
WHERE id = '<PROBE_TRACK_ID>';

-- Discard the entire probe. Production is unchanged after this line.
ROLLBACK;
```

Preceded by the two `information_schema` re-confirmation queries (noted as expected to return the **same** rows as before — the grant itself did not change, only the trigger did). Both blocks are reproduced exactly as shipped; see the migration file itself for the full surrounding comment, including the two literal `information_schema` queries.

## The six gate commands, with counts (after both tasks)

```
$ npm run security:migrations:verify
PASS: migrations 214–218 are transactional, collision-sensitive, least-privilege, checksum-pinned, and covered by read-only probes.

$ npm run typecheck:strict
(clean — exit 0)

$ npm run lint
(ESLINT_USE_FLAT_CONFIG=false eslint . --ext .js,.jsx,.ts,.tsx --max-warnings=0 — zero warnings, exit 0)

$ npm test -- --runInBand
Test Suites: 650 passed, 650 total
Tests:       8137 passed, 8137 total
Snapshots:   0 total
Time:        32.487 s

$ npm audit --omit=dev --audit-level=moderate
found 0 vulnerabilities

$ npm run audit:gate
audit-gate: clean -- 1 active deferral(s), earliest expiry 2026-11-02.
```

Delta from baseline: +1 suite / +12 tests (the new migration-231 test file), everything else unchanged. `npm run build` was deliberately never run (dev server convention).

## Confirmation no third-session file was staged

The worktree (`.claude/worktrees/wlk-261004`, branch `261004-wlk-work-id-write-lockdown`) was created fresh from `origin/main` (`5c1738db`), so the third session's uncommitted work in the **main checkout** (`components/brand/`, `components/nav/ArtistNav.tsx`, `WorkspaceNav.tsx`, `components/buyer/BuyerTopNav.tsx`, `app/(auth)/AuthBanner.tsx`, `app/help/page.tsx`, `app/r/[projectId]/page.tsx`, `.planning/quick/261003-uniform-header-pronunciation/`) never existed in this worktree's working tree at all — there was nothing to accidentally stage. Every commit in this task staged explicit paths only (`git add <path>` per file, never `git add -A`/`git add .`). Final `git status --short` before the metadata commit showed exactly the three files this plan's `files_modified` names, nothing else.

## Task Commits

1. **docs: add quick task plan** — `894554bd` (docs) — copied the untracked PLAN.md from the main checkout into the worktree.
2. **Task 1: Author the corrective migration** — `39a34608` (feat)
3. **Task 2: Test the migration's text, run the Verification Gate, file the owner follow-up** — `84af5ae7` (test)

## Files Created
- `supabase/migrations/231_tracks_work_id_trigger_lockdown.sql` — the trigger-based lockdown, human-gated, never applied
- `__tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts` — SQL-text proof (12 tests) + standing corpus invariant
- `.planning/todos/pending/261004-wlk-push-and-verify-migration-231.md` — owner's push + verification steps, plus two independent non-blocking follow-ups

## Decisions Made

See `key-decisions` in frontmatter (D-WLK-01 through D-WLK-05).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migration's own COMMENT ON FUNCTION text failed its own text-lock test**
- **Found during:** Task 2 (writing the Jest test)
- **Issue:** The migration's `COMMENT ON FUNCTION public.tracks_guard_work_id_write()` body quoted migration 230's broken `REVOKE INSERT (work_id), UPDATE (work_id)` statement verbatim, which the test's `REVOKE[^;]*work_id` assertion (correctly, per the plan's own instruction) could not distinguish from this migration reissuing that same grant-dance.
- **Fix:** Rephrased the comment to describe the superseded mechanism in prose instead of reproducing its exact syntax; updated the test to check the `REVOKE`/`GRANT`/`current_user` assertions against comment-stripped code (reusing the repo's established `stripLineComments` discipline from `__tests__/rls-helper-callsites.test.ts`) so legitimate header prose explaining what the broken pattern looked like isn't mistaken for the executable guard.
- **Files modified:** `supabase/migrations/231_tracks_work_id_trigger_lockdown.sql`, `__tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts`
- **Verification:** All 12 tests pass; full Verification Gate green afterward.
- **Committed in:** `84af5ae7` (the migration's one-line comment edit and the test file landed in the same commit, since the test file had not yet been committed when the fix was made).

---

**Total deviations:** 1 auto-fixed (Rule 1).
**Impact on plan:** The fix is a wording correction to a code comment, not a behavior or mechanism change — the guard's actual logic (`auth.role()`, `service_role`, `42501`, trigger attachment) is byte-identical to what the plan specified. No scope creep.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

**A database migration requires manual application.** See the owner todo at `.planning/todos/pending/261004-wlk-push-and-verify-migration-231.md` for:
- Reviewing and pushing `supabase/migrations/231_tracks_work_id_trigger_lockdown.sql` by hand (`supabase db push`)
- Running the two owner-run verification blocks embedded in the migration's trailing comment and recording the results
- Two independent, optional follow-ups (anon's dead grant on `tracks`; empirical confirmation of migration 084's precedent), explicitly not blocking this fix

## Next Phase Readiness

Migration 231 is ready for owner review and push. Once applied and the behavioral probe confirms enforcement, `tracks.work_id` is closed to client forgery and Phase 50's Crate admit eligibility check can read it without the gap this quick task exists to close. The branch `261004-wlk-work-id-write-lockdown` has been pushed to origin; no PR was opened per this task's instructions (the orchestrator opens it).

## Self-Check: PASSED

- `supabase/migrations/231_tracks_work_id_trigger_lockdown.sql` — FOUND
- `__tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts` — FOUND
- `.planning/todos/pending/261004-wlk-push-and-verify-migration-231.md` — FOUND
- Commit `894554bd` — FOUND in `git log --oneline --all`
- Commit `39a34608` — FOUND in `git log --oneline --all`
- Commit `84af5ae7` — FOUND in `git log --oneline --all`
- Full verification gate (6 commands) — all run this session, output recorded verbatim above

---
*Phase: quick/261004-wlk-work-id-write-lockdown*
*Completed: 2026-10-05*
