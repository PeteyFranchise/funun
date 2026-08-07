-- ============================================================
-- Funūn — Phase 25 review fix (#10): enforce one funun_staff row per auth user. Migration 094.
--
-- WHY: funun_staff.user_id (migration 089) has a plain index, not a UNIQUE constraint. A retry
-- or a manual seed can insert duplicate directory rows for a single account → duplicated
-- directory output, role updates hitting multiple rows, and maybeSingle() queries erroring on
-- >1 row. Flagged by the Codex review (finding #10). (The provisioning failure-safety fix
-- shrinks the retry window, but the constraint is the real guarantee.)
--
-- WHAT: deduplicate any existing rows (keep the physically-first row per user_id via MIN(ctid)),
-- then add a UNIQUE constraint on user_id. The DELETE is a no-op when there are no duplicates
-- (the expected state). funun_staff stays service-role-only (migrations 089/091) — this only
-- adds an integrity constraint; no grants change.
--
-- HUMAN-GATED — never `supabase db push` from an agent; the owner reviews + pushes via Codex.
-- Do NOT edit migration 089 (already live).
-- ============================================================

-- Dedup first so the UNIQUE constraint can be added even if stray duplicates exist.
DELETE FROM public.funun_staff
WHERE ctid NOT IN (
  SELECT MIN(ctid) FROM public.funun_staff GROUP BY user_id
);

ALTER TABLE public.funun_staff
  ADD CONSTRAINT funun_staff_user_id_key UNIQUE (user_id);
