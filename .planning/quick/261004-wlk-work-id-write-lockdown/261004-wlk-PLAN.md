---
phase: 261004-wlk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/231_tracks_work_id_trigger_lockdown.sql
  - __tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts
  - .planning/todos/pending/261004-wlk-push-and-verify-migration-231.md
autonomous: true
requirements: [QUICK-261004-WLK]

must_haves:
  truths:
    - "A direct authenticated-client INSERT or UPDATE naming tracks.work_id is rejected (SQLSTATE 42501) by a BEFORE INSERT OR UPDATE trigger on public.tracks -- not by a column-level REVOKE. Migration 230's column-level REVOKE INSERT (work_id), UPDATE (work_id) (230:120) never took effect in production because public.tracks has carried Supabase's ambient table-level INSERT/UPDATE grant to authenticated/anon since migration 001 (001:115-141, no GRANT/REVOKE statement ever issued for tracks), and Postgres cannot have a column-level REVOKE override a live table-level GRANT -- confirmed against production: information_schema.column_privileges for tracks.work_id returns 8 rows (SELECT/INSERT/UPDATE/REFERENCES x anon+authenticated) and information_schema.role_table_grants for tracks returns 4 rows of table-level INSERT/UPDATE for anon+authenticated."
    - "graduate_song_passport_to_release() (230:150-291, SECURITY DEFINER, EXECUTE granted only to service_role at 230:293-296) continues to write tracks.work_id without any new grant, because its sole caller (app/api/works/[workId]/passport/route.ts:171, via the service client constructed at :56) authenticates with SUPABASE_SERVICE_ROLE_KEY (lib/supabase/server.ts:39-43), and the trigger's guard checks (SELECT auth.role()) = 'service_role' -- the identical caller-identity idiom migration 209 already relies on for its thirteen SECURITY DEFINER binds (209:254,301,320), which is correct because auth.role() reads the request.jwt.claims session GUC, not current_user, and SECURITY DEFINER changes only the latter."
    - "No existing write path to tracks breaks: the legacy track INSERT (app/api/vault/[projectId]/tracks/route.ts:55-61), the metadata PATCH route's allowlisted TrackUpdate type (app/api/vault/[projectId]/tracks/[trackId]/route.ts:18-28,136-139), the isrc/audio/audio-complete routes, the three sync-library tag routes, the two split-sheet metadata-merge routes, generate-identifier, and migration 226's set_track_metadata_asset (226:30-47, SECURITY INVOKER, key-allowlisted to 'stems'/'instrumental') -- none of them ever names work_id in an INSERT or UPDATE payload today, so none of them can trip the new guard."
    - "Migrations 001-230 are unedited. Migration 231 is additive-only: one new trigger function, one new trigger, and a documentation-only acknowledgement that 230's column REVOKE is a harmless no-op left in place (editing 230 is forbidden)."
    - "This plan's own Jest test proves the SQL text was written correctly and nothing more -- migration 230 proves a passing text-lock test does not prove enforcement. The actual proof is the owner-run behavioral verification embedded in migration 231's trailing comment block (impersonating authenticated vs. service_role via request.jwt.claims inside a BEGIN/SAVEPOINT/ROLLBACK probe that leaves no trace), to be run once after the owner pushes 231 -- documented as a todo because no database connection (production or local) is reachable from this planning or execution session."
  artifacts:
    - supabase/migrations/231_tracks_work_id_trigger_lockdown.sql
    - __tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts
    - .planning/todos/pending/261004-wlk-push-and-verify-migration-231.md
  key_links:
    - "app/api/works/[workId]/passport/route.ts:171 service.rpc('graduate_song_passport_to_release', ...) -> service client's JWT role claim 'service_role' persists through the function's SECURITY DEFINER current_user switch -> trigger's auth.role() check reads 'service_role' -> write to work_id allowed."
    - "Any direct PostgREST PATCH/POST against public.tracks (bypassing the Next.js app entirely) carrying a work_id key, from an authenticated project owner/editor's own JWT -> passes tracks_write_project_owner_or_editor's row-level ownership check (193:168-178) -> reaches the BEFORE trigger -> auth.role() reads 'authenticated' -> RAISE EXCEPTION 42501, write rejected."
    - "supabase db push (owner-run, never by an executor agent, per migrations 230/091/092/208/209's standing convention) -> migration 231 applies -> the todo file's owner-run verification block is the only step that proves this against the real database."
---

<objective>
Correct the verified defect in migration 230: `REVOKE INSERT (work_id), UPDATE (work_id) ON public.tracks FROM authenticated, anon` is a silent no-op in production because `public.tracks` has never had its ambient Supabase table-level INSERT/UPDATE grant revoked, and a column-level REVOKE cannot override a live table-level GRANT. Replace the (fictional) column-privilege lockdown with a `BEFORE INSERT OR UPDATE` trigger on `public.tracks` that rejects any attempt to set or change `work_id` unless the caller is the service role (or a direct, unauthenticated-context admin/migration session) -- a mechanism that does not depend on `tracks`' grant state at all, so it cannot rot the way the column-REVOKE approach already did.

Purpose: `tracks.work_id` is the column a future Crate admit decision will read to resolve AI-provenance disclosure per track (261004-wtl). Without an enforced lockdown, any project owner or editor can already point their own track's `work_id` at an arbitrary work via direct PostgREST (the FK only checks existence, not ownership) to fabricate a clean eligibility signal -- a rights-bearing forgery, not a cosmetic bug. Blast radius today is low (production has zero tracks, nothing reads `work_id` yet) but the gap must close before Phase 50 wires eligibility into admit, and A&R can already admit (#147).

Output: `supabase/migrations/231_tracks_work_id_trigger_lockdown.sql` (human-gated, never pushed by the executor), its paired `__tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts`, and an owner todo carrying the production verification steps this session cannot run itself.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@./.claude/CLAUDE.md
@supabase/migrations/230_track_work_direct_link.sql
@supabase/migrations/209_definer_helper_caller_binding.sql
@supabase/migrations/040_artist_profiles_column_privileges.sql
@supabase/migrations/084_stripe_connect_payouts.sql
@supabase/migrations/193_workspace_column_allowlist_rpcs.sql
@supabase/migrations/226_track_metadata_atomic_asset_merge.sql
@__tests__/migration-230-track-work-direct-link.test.ts
@lib/supabase/server.ts
@app/api/works/[workId]/passport/route.ts

## Verified facts this plan rests on (file:line) -- re-checked this session, not assumed from the brief

| Claim | Status | Evidence |
|---|---|---|
| `tracks` has never had a table-level GRANT/REVOKE issued by any migration | TRUE | `supabase/migrations/001_initial_schema.sql:115-141` creates `tracks` + its RLS policy; zero `GRANT`/`REVOKE` tokens anywhere in that block. Full-corpus `grep -n "GRANT\|REVOKE" supabase/migrations/*.sql` naming `tracks` returns only migration 230's column-level lines. |
| `anon`/`authenticated` hold table-level INSERT/UPDATE on `tracks` in production | TRUE (per the verified defect) and explained: Supabase's platform bootstrap grants `ALTER DEFAULT PRIVILEGES`-style table-wide privileges to `anon`/`authenticated`/`service_role` on every new `public` table; `tracks` is simply one of the tables in this schema that was never subsequently hardened (unlike `user_profiles`/040, `license_requests`/081, `funun_staff`/089+091, `buyer_orgs`/080+092) | No migration grants it explicitly -- it is the ambient default, confirmed absent from migration 001 and from every later tracks-column-adding migration (005, 006, 109, 230). |
| `anon` can never actually write a row of `tracks` regardless of that grant | TRUE | `tracks_write_project_owner_or_editor` (`supabase/migrations/193_workspace_column_allowlist_rpcs.sql:168`) is `FOR ALL TO authenticated` (line 169) -- `anon` has no matching policy, so RLS default-denies every `anon` write independent of the table-level grant. This makes `anon`'s grant dead weight (hygiene, not a live hole) and a SEPARATE finding from `work_id`. |
| Migration 084's `REVOKE SELECT (stripe_connect_account_id) ON public.user_profiles` (084:70) is NOT the same defect | TRUE (by static analysis; no DB access to confirm empirically -- see Separate Findings below) | `user_profiles` (renamed from `artist_profiles`, 076) had its table-level `SELECT`/`UPDATE` already revoked by migration 040 (`040:83,113`) **before** `stripe_connect_account_id` was ever added (084, written long after 040). With no ambient table-level grant left to shadow it, a new column added after 040 carries no privilege until explicitly GRANTed (084's own comment states this: "even though it already carries no grant by default"). Migration 076's rename preserves the table's existing grants by OID (076:16, "the table's own grants all follow automatically"), and no migration between 040 and 084 re-opens table-level SELECT/UPDATE on `user_profiles`/`artist_profiles` (full-corpus grep of every `GRANT`/`REVOKE` naming either name shows only column-scoped adds: 043:26, 054:56, plus 076's separate compat-VIEW regrant at 076:541-574, which is a distinct object from the base table). `tracks` never had migration 040's equivalent step -- that is the actual difference, not anything specific to migration 084's own REVOKE line. |
| `graduate_song_passport_to_release()`'s only caller runs as `service_role` | TRUE | `app/api/works/[workId]/passport/route.ts:56` (`const service = createServiceClient()`), `:171` (`service.rpc('graduate_song_passport_to_release', ...)`); `lib/supabase/server.ts:39-43` constructs that client with `SUPABASE_SERVICE_ROLE_KEY` (a JWT whose `role` claim is `service_role`). `grep -rln "graduate_song_passport_to_release" app lib` returns only this one file. |
| `auth.role()` survives a SECURITY DEFINER call unchanged; `current_user` does not | TRUE (established, relied-upon precedent in this repo) | `supabase/migrations/209_definer_helper_caller_binding.sql`'s "WHY THE SERVICE-ROLE DISJUNCT IS REQUIRED, NOT DECORATIVE" section and its thirteen `(SELECT auth.role()) = 'service_role'` disjuncts (e.g. 209:254,301,320) -- `auth.role()` reads the `request.jwt.claims` session GUC, which SECURITY DEFINER's `current_user` switch does not touch. |
| No existing `tracks` writer ever sets `work_id` | TRUE | `app/api/vault/[projectId]/tracks/route.ts:55-61` (insert payload: `user_id, project_id, title, track_number, isrc` -- no `work_id`); `app/api/vault/[projectId]/tracks/[trackId]/route.ts:18-28` (`TrackUpdate` type has no `work_id` field) and `:136-139` (`.update(update)` where `update` can only ever contain allowlisted keys); isrc/audio/audio-complete/sync-library-tag-approve/tag-propose/tag-suggest/split-sheets-reconcile/split-sheets-attach/generate-identifier routes all `.update()` with explicit, work_id-free key sets; `supabase/migrations/226_track_metadata_atomic_asset_merge.sql:30-47` (`set_track_metadata_asset`, SECURITY INVOKER, `IF p_key NOT IN ('stems', 'instrumental') THEN RAISE EXCEPTION`). |
| No Docker, no local Supabase Postgres, no production DB credentials reachable from this session | TRUE | `docker info` -> `docker: command not found` (exit 127); `supabase/config.toml` confirms local dev requires Docker (`supabase start`); reading `.env.local` for production keys was denied by the sandbox. Neither the two information_schema queries nor a live trigger probe can be executed here -- they are specified as an owner-run todo instead. |
| Migration 230's existing test is a pure text-match on the broken REVOKE line | TRUE | `__tests__/migration-230-track-work-direct-link.test.ts:22-24` -- `expect(sql).toContain('REVOKE INSERT (work_id), UPDATE (work_id) ON public.tracks FROM authenticated, anon')`. Passes identically whether or not the statement has any effect. This plan's test must not repeat that shape as its only assertion. |
| Next free migration number is 231, and nothing else has claimed it | TRUE at planning time -- re-verify at execution | `ls supabase/migrations/ | sort | tail -1` -> `230_track_work_direct_link.sql`; `find .planning/quick -iname "231_*"` and `git status --porcelain` show no draft or untracked file at 231 anywhere in the tree. |

## Separate findings surfaced during investigation -- explicitly NOT fixed by this plan

1. **`anon`'s ambient table-level INSERT/UPDATE grant on `tracks`** is dead weight (RLS already default-denies every `anon` write) but unrevoked, unlike the equivalent cleanup this repo already did for `funun_staff`/`staff_audit_log` (091) and `buyer_orgs`/`buyer_members` (092). Fixing it is pure hygiene, matches an established pattern, and is low-risk -- but it is a table-wide grant change unrelated to the `work_id` defect, and bundling it here would widen this migration's blast radius for no defect-closing benefit. Left as a todo recommendation, not built here.
2. **Migration 084's precedent is not broken**, but this plan could not get empirical (information_schema) confirmation of that from this session -- only static corpus analysis. The owner-run todo includes the two queries so this can move from "confirmed by reading every migration" to "confirmed against the live catalog," matching the rigor migration 230 itself was supposed to have and did not.
</context>

<source_audit>

| Source | Item | Coverage |
|---|---|---|
| THE VERIFIED DEFECT | Migration 230's column-level REVOKE never took effect | COVERED -- Task 1 replaces the enforcement mechanism entirely (trigger, not grant) |
| INVESTIGATE #1 | Is migration 084's precedent also broken? | COVERED -- answered in Context's verified-facts table: NOT broken, by static analysis; empirical confirmation deferred to the owner-run todo (no DB access this session) |
| INVESTIGATE #2 | Does migration 040's REVOKE-then-GRANT pattern work, and is it applicable here? | COVERED -- confirmed working (table-level REVOKE precedes column GRANTs, survives the 076 rename); judged inapplicable to `tracks` specifically because of the column-churn/rot risk named in CANDIDATE A below, not because the pattern itself is unsound |
| INVESTIGATE #3 | Why does `anon` hold INSERT/UPDATE on `tracks`? Is removing it safe? | COVERED -- Context's verified-facts table (Supabase ambient default, never explicitly granted) + Separate Finding 1 (safe, but out of scope here) |
| INVESTIGATE #4 | Every legitimate writer of `tracks`, and its role | COVERED -- enumerated in the `must_haves.truths` "no existing write path... breaks" entry and the verified-facts table, with file:line for each |
| CANDIDATE A vs B | Evaluate both, recommend one | COVERED -- Task 1's action argues B (trigger) over A (table-revoke + column-allowlist): A would require enumerating and re-verifying ~24 columns' INSERT/UPDATE grants against every writer above (correct but large and risk-bearing for a single-column defect), and `tracks` has already grown its column surface four times (migrations 001, 005, 006, 109) with zero grant bookkeeping -- converting it to allowlist mode now inherits exactly the "silently rots on the next column" failure this plan exists to close. B's protection does not depend on `tracks`' grant state at all, so it is immune to that failure class by construction. |
| CANDIDATE B's own weakness | Must not interfere with `graduate_song_passport_to_release()` | COVERED -- verified-facts table traces the exact call chain and the `auth.role()` mechanism that keeps it working, citing migration 209's already-shipped precedent for the identical idiom |
| CONSTRAINT | Migrations are human-gated; executor never runs `supabase db push` | COVERED -- Task 1's action, migration 231's own header |
| CONSTRAINT | Re-verify next free migration number (231) at planning and execution | COVERED -- verified-facts table (planning); Task 1's action opens with a re-verify step (execution) |
| CONSTRAINT | Fix must ship with a test that fails without it; text-lock alone is dishonest | COVERED -- Task 2's test proves the SQL was written correctly (necessary, not sufficient) and the migration's own trailing comment carries the owner-run behavioral probe (actual proof), because no live DB is reachable from this session |
| CONSTRAINT | Do not change `tracks` RLS policies or any application write path unless genuinely required | COVERED -- neither is touched; the trigger needs neither |
| CONSTRAINT | Full Verification Gate; sixth command is `npm run audit:gate`; never `npm run build` | COVERED -- Task 2's verify step |
| CONSTRAINT | Never `git add -A` | COVERED -- Task 2's action names the exact three files to stage |
| REPORT-BACK | Any claim in the brief's framing that came back FALSE | ADDRESSED -- see final report: none of the brief's own framing was false; the one correction is that "Candidate B must not interfere with the graduation function" is confirmed TRUE (not a risk that materializes), not a weakness that was found real |

No gaps.

</source_audit>

<tasks>

<task type="auto">
  <name>Task 1: Author the corrective migration -- trigger-based work_id lockdown</name>
  <files>
    supabase/migrations/231_tracks_work_id_trigger_lockdown.sql
  </files>
  <action>
Before writing anything, re-run `ls supabase/migrations/ | sort | tail -3` and `find .planning/quick -iname "231_*"` -- this plan was written against a ceiling of 230 with nothing claiming 231. If the next free number is not 231, use the real one and say so in the SUMMARY (matches the standing convention CLAUDE.md and migrations 207/208/230 all document).

Author `supabase/migrations/231_tracks_work_id_trigger_lockdown.sql` (or the re-verified number) as a HUMAN-GATED migration -- open with the same "an executor agent must NEVER run `supabase db push`" header convention migrations 230/091/092/208/209 all use, literally stating the owner applies it by hand.

Write the header's WHY section in this repo's established style (dense prose, cites file:line, explains the mechanism not just the symptom): state that migration 230's `REVOKE INSERT (work_id), UPDATE (work_id) ON public.tracks FROM authenticated, anon` is a silent no-op, because `public.tracks` has carried Supabase's ambient table-level INSERT/UPDATE grant to `authenticated`/`anon` since migration 001 (no migration ever revoked it), and Postgres never lets a column-level REVOKE remove a privilege a role already holds at the table level -- a new column simply inherits the table grant. Cite the two production information_schema results from the verified defect (8 rows of column_privileges, 4 rows of table-level role_table_grants) as the evidence. Explicitly state that migration 230 cited migration 084's `REVOKE SELECT (stripe_connect_account_id)` as its model but that citation does not transfer: 084's column genuinely had no privilege to begin with, because migration 040 had already revoked `user_profiles`' table-level SELECT/UPDATE grant years before `stripe_connect_account_id` ever existed -- there was no ambient grant left to shadow 084's REVOKE. `tracks` never had migration 040's equivalent step. Name this explicitly as the lesson: a cited precedent must be checked for the actual mechanism it relies on, not just its surface shape.

State, as a named "SEPARATE FINDING, NOT FIXED HERE" paragraph (matching migration 092's own "SEPARATE FINDING" convention): `anon` additionally holds this same ambient table-level INSERT/UPDATE grant on `tracks`, but it is already neutralized by RLS -- `tracks_write_project_owner_or_editor` (migration 193) is `FOR ALL TO authenticated` only, so `anon` has no applicable write policy and is default-denied regardless of the grant. Note this is the same class of residual-grant hygiene migrations 091/092 closed for other tables (TRUNCATE/TRIGGER/REFERENCES there; here it's a dead-but-ungranted-nowhere-near-exploitable INSERT/UPDATE), and that closing it is deliberately deferred to a follow-up (named in the todo this plan's Task 2 creates) rather than bundled into this fix.

Explain why this migration uses a trigger (Candidate B) rather than migration 040's table-revoke-then-column-allowlist pattern (Candidate A), even though Candidate A is proven to work: `tracks` has grown its column list four separate times (migrations 001, 005, 006, 109) with zero grant bookkeeping, and converting it to allowlist mode now would require enumerating and re-verifying INSERT and UPDATE grants for roughly two dozen columns against every one of the enumerated writer routes -- correct, but a far larger and riskier change than a single-column defect requires, and it inherits the exact "the next added column is silently wrong" failure mode this fix exists to close (either it is forgotten from the allowlist and writes break, or someone "fixes" that by re-granting table-wide and reopens this exact hole). A trigger's protection does not read `tracks`' grant state at all -- it is correct regardless of what any future migration grants or revokes on that table -- so it cannot rot the same way.

Then author the mechanism itself:

1. `CREATE OR REPLACE FUNCTION public.tracks_guard_work_id_write() RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''`. Body: declare a local `v_role TEXT` set from `(SELECT auth.role())`; declare `v_privileged BOOLEAN` as `v_role IS NULL OR v_role = 'service_role'` (NULL covers a direct database session -- `supabase db push`, the SQL editor, migration 230's own already-applied backfill -- the same admin trust tier this table's owner-run migrations already use; `'service_role'` covers `graduate_song_passport_to_release()` and any future service-role-mediated write); declare `v_changing BOOLEAN` as `(TG_OP = 'INSERT' AND NEW.work_id IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.work_id IS DISTINCT FROM OLD.work_id)`. `IF v_changing AND NOT v_privileged THEN RAISE EXCEPTION` with the literal message text `tracks.work_id can only be written by the service role (graduate_song_passport_to_release)` and `USING ERRCODE = '42501'`; otherwise `RETURN NEW;`. Add a comment directly above the declaration explaining the `auth.role()` vs. `current_user` choice, citing migration 209's identical idiom, and note `SECURITY INVOKER` is deliberate (no elevated access needed -- matches migration 226's posture for its own trigger-adjacent function).
2. `DROP TRIGGER IF EXISTS tracks_guard_work_id_write ON public.tracks;` then `CREATE TRIGGER tracks_guard_work_id_write BEFORE INSERT OR UPDATE ON public.tracks FOR EACH ROW EXECUTE FUNCTION public.tracks_guard_work_id_write();`.
3. `COMMENT ON FUNCTION public.tracks_guard_work_id_write() IS '...'` and `COMMENT ON TRIGGER tracks_guard_work_id_write ON public.tracks IS '...'`, each summarizing the mechanism and pointing back at this migration's header and at migration 230's now-superseded (left in place, not edited) column REVOKE.
4. State explicitly, in a short comment, that migrations 001-230 are not edited by this file, that migration 230's column-level REVOKE stays exactly as it shipped (now a harmless, documentation-only no-op -- removing it would mean editing 230, which is forbidden), and that `graduate_song_passport_to_release()`'s body (230:150-291) is untouched.
5. End with `NOTIFY pgrst, 'reload schema';`.

Finally, append a trailing `-- OWNER-RUN BEHAVIORAL VERIFICATION` comment block (matching migration 230's own "DETECTING DRIFT" trailing-comment convention) containing, as literal runnable SQL the owner can paste into the Supabase SQL editor after pushing:

(a) The two re-confirmation queries from the original defect report -- `SELECT * FROM information_schema.column_privileges WHERE table_schema='public' AND table_name='tracks' AND column_name='work_id';` and `SELECT * FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='tracks' AND privilege_type IN ('INSERT','UPDATE');` -- with a one-line note that these are expected to show the SAME rows as before (the grant itself is unchanged; the trigger is what changed), so seeing the 8-row / 4-row result again is not a failure.

(b) A self-contained, non-destructive behavioral probe: `BEGIN;` then `SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub','<YOUR_USER_ID>')::text, true); SET ROLE authenticated;` then `SAVEPOINT probe_1;` then an INSERT into `public.tracks` naming a real project id + user id the owner controls plus a `work_id` value, with a comment stating this must raise `42501` and the owner should then run `ROLLBACK TO SAVEPOINT probe_1;`; then the same INSERT without `work_id` (comment: must succeed, note the returned id); then `RESET ROLE; SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true); SET ROLE service_role;` then an UPDATE setting `work_id` on the row just inserted (comment: must succeed -- this is the proof `graduate_song_passport_to_release()`'s own write path still works); then `ROLLBACK;` to discard the entire probe, leaving production exactly as it was. Add a one-line note that this probe requires at least one real project the owner controls, which production currently has even though it has zero tracks.
  </action>
  <verify>
    <automated>MISSING -- this migration is human-gated and is never executed by this plan; Task 2's test is the automated verification of the SQL text, and the behavioral proof is the owner-run block written into this file.</automated>
  </verify>
  <done>
    `supabase/migrations/231_tracks_work_id_trigger_lockdown.sql` exists; `git diff --stat supabase/migrations/` shows exactly one new file and zero changes to any existing migration; the file is never executed, piped to `supabase db push`, or otherwise applied by this task.
  </done>
</task>

<task type="auto">
  <name>Task 2: Test the migration's text, run the Verification Gate, file the owner follow-up</name>
  <files>
    __tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts,
    .planning/todos/pending/261004-wlk-push-and-verify-migration-231.md
  </files>
  <action>
Write `__tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts`, reading the real migration file with `fs.readFileSync` (mirror `__tests__/migration-230-track-work-direct-link.test.ts`'s shape -- no SQL execution, text assertions only). Open the describe block with a comment stating plainly what this file can and cannot prove: it can prove the SQL was WRITTEN with the intended guard; it cannot prove Postgres ENFORCES it, because migration 230 shipped a passing text-lock test on SQL that enforced nothing -- the actual proof is the owner-run behavioral block inside the migration file itself, asserted present by one of the tests below.

Assertions:
- The file defines `public.tracks_guard_work_id_write()` returning `TRIGGER`, referencing `NEW.work_id IS NOT NULL` and `NEW.work_id IS DISTINCT FROM OLD.work_id`.
- The guard checks `auth.role()` and `service_role`, and does NOT gate on `current_user = 'service_role'` (a `not.toMatch` assertion) -- this is the specific mistake the investigation ruled out, and the test should make it impossible to silently reintroduce.
- The function raises with `RAISE EXCEPTION` and `ERRCODE = '42501'`.
- `CREATE TRIGGER tracks_guard_work_id_write` is attached `BEFORE INSERT OR UPDATE ON public.tracks` `FOR EACH ROW`.
- The file contains no `GRANT`/`REVOKE` statement naming `work_id` (a `not.toMatch` on `/REVOKE[^;]*work_id/i` and `/GRANT[^;]*work_id/i`) -- the fix must not repeat migration 230's grant-dance.
- The file does not redefine `graduate_song_passport_to_release` (a `not.toMatch` on `CREATE OR REPLACE FUNCTION public.graduate_song_passport_to_release`) -- confirms this plan touches nothing migration 230 already shipped.
- The file contains the literal heading `OWNER-RUN BEHAVIORAL VERIFICATION` and references both `information_schema.column_privileges` and `request.jwt.claims` -- confirms the owner-run proof this plan relies on (in place of a live DB test) is actually present in the shipped file, not just promised in the plan.
- A standing corpus invariant, reading every file in `supabase/migrations/` (filename-sorted, line-comments stripped exactly like `__tests__/rls-helper-callsites.test.ts` already does): count every `CREATE (OR REPLACE )?TRIGGER tracks_guard_work_id_write` occurrence and every `DROP TRIGGER[^;]*tracks_guard_work_id_write` occurrence across the whole corpus; assert the create count is greater than zero and at least as large as the drop count. This is the standing guard against a future migration quietly removing the trigger without replacing it -- the same "re-derive the invariant on every npm test" posture migration 209's own test file established.

Run the full Verification Gate, in this exact order, and fix forward on any failure (do not weaken a check to make it pass): `npm run security:migrations:verify`, `npm run typecheck:strict`, `npm run lint`, `npm test -- --runInBand`, `npm audit --omit=dev --audit-level=moderate`, `npm run audit:gate`. Do NOT run `npm run build` (a dev server is live on :3000 and a build would clobber `.next`).

Write `.planning/todos/pending/261004-wlk-push-and-verify-migration-231.md` recording, for the owner: (1) push migration 231 via `supabase db push` after reviewing it by hand; (2) run both owner-run verification blocks embedded in the migration's trailing comment and paste the results back; (3) the two Separate Findings from this plan's Context section -- `anon`'s dead-but-ungranted table-level INSERT/UPDATE on `tracks` (hygiene, matches migrations 091/092's pattern, not fixed here) and migration 084's precedent being confirmed sound only by static corpus analysis, not by the live information_schema queries this session could not run -- as two independent, optional follow-ups, each explicitly NOT blocking this fix.

Stage only the three files this task and Task 1 created -- never `git add -A` (a third session's unrelated uncommitted work is in the tree per this repo's own standing note).
  </action>
  <verify>
    <automated>npx jest __tests__/migration-231-tracks-work-id-trigger-lockdown.test.ts</automated>
  </verify>
  <done>
    The new test file passes; the full Verification Gate (security:migrations:verify, typecheck:strict, lint --max-warnings=0, test --runInBand, audit --omit=dev --audit-level=moderate, audit:gate) is green; the todo file exists under `.planning/todos/pending/`; `git status --porcelain` shows no file outside this plan's three `files_modified` entries staged.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|--------------|
| authenticated client (own JWT) -> public.tracks via direct PostgREST | Any project owner/editor already has row-level write access to their own tracks via RLS (`tracks_write_project_owner_or_editor`, 193:168-178); nothing below the row level previously restricted which columns that access covers. |
| service_role (server-side only) -> public.tracks | The only caller allowed to write `work_id`, exercised exclusively through `graduate_song_passport_to_release()`. |
| direct database session (owner, `supabase db push`, SQL editor) -> public.tracks | Pre-existing, already-trusted admin tier; `auth.role()` returns NULL in this context, which this fix deliberately treats as privileged (same trust level the table owner already has). |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|------------------|
| T-wlk-01 | Tampering | `tracks.work_id` direct client write (supersedes 261004-wtl's T-wtl-01, whose stated mitigation never took effect) | high | mitigate | `BEFORE INSERT OR UPDATE` trigger (`tracks_guard_work_id_write`, migration 231) rejects any write to `work_id` where `auth.role()` is neither NULL nor `service_role`, independent of `tracks`' table/column grant state -- closes exactly the gap RLS's row-level-only write policy leaves open (any owner/editor could otherwise point their own track at an arbitrary work, since the FK only checks existence, to fabricate AI-provenance eligibility for a decision that licenses the master). |
| T-wlk-02 | Tampering | `anon` holds a dead but unrevoked table-level INSERT/UPDATE grant on `public.tracks` | low | accept | RLS already default-denies every `anon` write (`tracks_write_project_owner_or_editor` is `FOR ALL TO authenticated` only, 193:169) -- the grant is unreachable, not exploitable. Closing it is pure hygiene, deferred to the owner todo this plan files (matches migrations 091/092's precedent for other tables), not bundled into this fix. |
| T-wlk-03 | Repudiation (of the fix itself) | A text-lock test that passes without proving database enforcement (the exact failure mode of migration 230's own test) | medium | mitigate | Task 2's test is explicitly scoped and documented as proving SQL correctness only; the migration's trailing OWNER-RUN BEHAVIORAL VERIFICATION block is the actual proof, and Task 2's test asserts that block is present in the shipped file so it cannot be silently dropped. |

</threat_model>

<verification>
Task 2's Jest test plus the full Verification Gate (security:migrations:verify, typecheck:strict, lint, test, npm audit, audit:gate) is the automated verification available from this session. Database-level enforcement can only be verified by the owner, post-push, via the behavioral block Task 1 writes into migration 231's trailing comment -- tracked as a todo, not claimed as done here.
</verification>

<success_criteria>
- `supabase/migrations/231_tracks_work_id_trigger_lockdown.sql` exists, is never applied by any agent, and replaces the column-REVOKE lockdown with a trigger whose protection does not depend on `tracks`' grant state.
- `graduate_song_passport_to_release()` is untouched and, per the traced `auth.role()` mechanism, remains able to write `work_id`.
- Every enumerated existing writer of `tracks` is confirmed, by file:line, to never touch `work_id` -- none can be broken by this change.
- The paired test passes, the full Verification Gate is green, and the test explicitly cannot claim more than SQL-text correctness.
- An owner todo exists carrying the push step and the two owner-run verification blocks (information_schema re-check + behavioral probe), plus the two Separate Findings as independent, non-blocking follow-ups.
- Migrations 001-230 are byte-for-byte unchanged.
</success_criteria>

<output>
Create `.planning/quick/261004-wlk-work-id-write-lockdown/261004-wlk-SUMMARY.md` when done.
</output>
