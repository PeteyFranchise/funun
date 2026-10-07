---
created: 2026-10-04T00:00:00Z
title: Push migration 231 (tracks.work_id trigger lockdown) and run its owner-run verification
area: database
files:
  - supabase/migrations/231_tracks_work_id_trigger_lockdown.sql
  - supabase/migrations/230_track_work_direct_link.sql
---

## Status (2026-10-04)

Migration 231 is **authored, text-tested, and committed** — never applied. It corrects migration
230's `REVOKE INSERT (work_id), UPDATE (work_id) ON public.tracks FROM authenticated, anon`, which
was verified against production to be a silent no-op (confirmed by two `information_schema`
queries: `tracks.work_id` still shows 8 rows of column_privileges and `tracks` still shows 4 rows
of table-level INSERT/UPDATE grants for anon+authenticated, unchanged by 230). Migration 231
replaces that column-privilege approach with a `BEFORE INSERT OR UPDATE` trigger
(`tracks_guard_work_id_write`) whose protection does not depend on `tracks`' grant state at all.

No database (local or production) was reachable from the planning or execution session that wrote
this migration — no Docker, no local Supabase Postgres, and `.env.local` credentials were denied by
the sandbox. Everything below is the owner's step.

## Remaining to run (resume here)

1. **Review migration 231 by hand**, then push it:
   ```
   supabase db push
   ```
   (Standard convention for this repo — never run from an agent.)

2. **Re-confirm the grant state is unchanged** (expected — the grant itself did not change, only
   the trigger did; seeing the same 8-row / 4-row result as the original defect report is NOT a
   failure):
   ```sql
   SELECT * FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND table_name = 'tracks' AND column_name = 'work_id';

   SELECT * FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'tracks'
     AND privilege_type IN ('INSERT', 'UPDATE');
   ```

3. **Run the behavioral probe** — the actual proof. It is written out verbatim, ready to paste, in
   migration 231's own trailing `OWNER-RUN BEHAVIORAL VERIFICATION` comment block. Requires one real
   project you own (production has that even with zero tracks). It is wrapped in
   `BEGIN` / `SAVEPOINT` / `ROLLBACK` and leaves nothing behind:
   - Impersonating `authenticated`, an INSERT naming `work_id` must raise `42501`.
   - The same client, same row, without `work_id`, must succeed.
   - Impersonating `service_role`, an UPDATE setting `work_id` on that row must succeed — this is
     the proof `graduate_song_passport_to_release()`'s own write path still works.
   - Paste the three results back (success/failure + any error code) so this todo can close.

4. **Two independent, optional follow-ups** — surfaced during this investigation, explicitly NOT
   part of this fix and NOT blocking it:

   a. **`anon`'s dead-but-ungranted table-level INSERT/UPDATE on `tracks`.** It is already
      neutralized by RLS (`tracks_write_project_owner_or_editor` is `FOR ALL TO authenticated`
      only, so `anon` has no applicable write policy and is default-denied regardless of the
      grant). Revoking it is pure hygiene and matches the precedent migrations 091
      (`funun_staff`/`staff_audit_log`) and 092 (`buyer_orgs`/`buyer_members`) already set for
      other tables there (TRUNCATE/TRIGGER/REFERENCES). Low-risk, not urgent.

   b. **Migration 084's precedent (`REVOKE SELECT (stripe_connect_account_id) ON
      public.user_profiles`) was confirmed sound only by static corpus analysis this session** —
      migration 040 had already revoked `user_profiles`' table-level SELECT/UPDATE years before
      084 ever ran, so there was no ambient grant left for 084's REVOKE to fight. This session
      could not confirm that empirically against the live `information_schema` (no DB access).
      If convenient while already in the SQL editor for steps 2-3 above, run the same two
      `information_schema` queries against `user_profiles.stripe_connect_account_id` and paste the
      result back — this would upgrade that confirmation from "read every migration" to "confirmed
      against the live catalog," matching the rigor migration 230 itself was supposed to have.

---

## DONE 2026-10-05 — applied and behaviourally verified

Migration 231's trigger was confirmed against production: the forged `tracks.work_id` write is
refused, and the legitimate graduation path still succeeds. 231 replaced migration 230's
column-level REVOKE, which was a silent no-op.
