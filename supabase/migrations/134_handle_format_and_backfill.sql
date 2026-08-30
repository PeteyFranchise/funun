-- ============================================================
-- Funūn — Phase 36 (account-identity: mandatory @handle for User Accounts)
-- Migration 134: the closing database statement of the phase — the handle
--                format rule promoted from an application convention to a
--                database guarantee.
--
-- WHY (a) — D-05, THE FORMAT RULE IS ONLY REAL IF THE DATABASE HOLDS IT.
-- Migration 040 grants `authenticated` a column-level UPDATE on handle, so a
-- raw PostgREST write reaches this column without passing through any
-- application route — the same bypass that made migration 133's reserved-name
-- trigger rewrite necessary. Migration 133 closed the reserved/retired half of
-- that hole; this closes the format half. Until now nothing at the database
-- layer stopped `-`, `   `, `a`, a 400-character string, or an emoji from being
-- stored as somebody's public identity and then rendered at /u/<handle>.
--
-- WHY (b) — THE PATTERN IS COPIED, NOT RE-DERIVED. The regex literal below is
-- the SAME STRING as HANDLE_PATTERN in lib/handles/validate.ts, and the bounds
-- are that module's HANDLE_MIN_LENGTH and HANDLE_MAX_LENGTH. If the two ever
-- differ by a single character, one layer accepts a handle the other rejects
-- and the disagreement surfaces much later as an unexplainable 400 on a value
-- the form said was fine. __tests__/migration-134.test.ts reads the pattern out
-- of BOTH files and asserts string identity, so they cannot drift silently.
-- PostgreSQL's advanced regular expressions support the non-capturing group,
-- so the JavaScript pattern transfers verbatim with no translation step.
--
-- WHY (c) — THE `handle IS NULL OR` DISJUNCT LOOKS REDUNDANT AND IS NOT. A
-- CHECK constraint is already satisfied by NULL, so this changes no behaviour;
-- it is written explicitly so the statement's intent survives review, and so
-- the constraint is safe to apply before, after, or entirely independently of
-- any future nullability decision on this column. It is also what makes this
-- migration safe to push TODAY against rows that have no handle yet — see (d).
--
-- WHY (d) — THERE IS NO BACKFILL AND NO SWEEP IN THIS FILE, AND THAT IS THE
-- WHOLE POINT. An earlier draft of this migration carried a one-shot UPDATE
-- that generated a handle for every remaining handle-less row, on the premise
-- that all of them were test and demo fixtures the D-09 gate could never reach.
-- That premise was retired on 2026-08-27: the owner DELETED those five fixture
-- accounts outright (via the management API) rather than sweeping them. What
-- remains handle-less is not fixtures — it is REAL PEOPLE (the owner and two
-- accounts belonging to Thomas). Running that sweep now would auto-assign a
-- public identity to three humans who have simply not signed in since plan 06's
-- gate shipped, which directly violates the locked decision that existing
-- accounts are PROMPTED to choose a handle and never have one generated for
-- them (36-CONTEXT.md D-09; ROADMAP owner decision 4). The gate is the
-- mechanism for those three rows, and it fires on their very next artist-group
-- page load. The constraint below tolerates their NULL until then.
--
-- WHAT IS DELIBERATELY ABSENT: no nullability alteration of
-- public.user_profiles.handle appears in this file. D-13 specifies one, and it
-- was NOT dropped — it was escalated. On this Supabase instance app_metadata is
-- invisible to handle_new_user() at INSERT (the Phase 27 27-13 diagnostic), so
-- the buyer, staff, industry and curator branches cannot fire and every
-- provisioning lane falls through to the default branch, which carries a handle
-- only for a self-serve artist signup. A non-nullable column would therefore
-- reject buyer, staff, industry and curator provisioning outright, and would
-- also fire inside migration 133's D-15 fallback — the handler whose entire
-- purpose is to insert a handle-less row so that a lost race costs a handle
-- rather than an account. Note that deleting the fixtures did NOT unblock this:
-- the obstacle was never the old rows, it is INSERT-time provisioning. The
-- owner adjudicates it at plan 07's decision checkpoint; see 36-07-SUMMARY.md
-- for the recorded outcome.
--
-- HUMAN-GATED — this project never runs `supabase db push` from an agent
-- (matches Phases 16/21/25/27/28/31.2's standing convention, and migration
-- 133's own header). Draft + text-tested only
-- (__tests__/migration-134.test.ts); the owner reviews and pushes via
-- `supabase db push` against prod at the 36-07 Task 3 blocking checkpoint.
-- Do NOT edit migrations 001-133 (already landed).
-- ============================================================

-- ─── (1) Format constraint (D-05) ─────────────────────────────────────────
-- Letters and digits are the only atoms; hyphen and underscore are permitted
-- only as INTERNAL single separators, so a leading separator, a trailing
-- separator, and consecutive separators are all rejected. The one long-lived
-- production handle, 'maya-reyes', passes. Adding this to a live table
-- validates every existing row on apply, which is why the checkpoint's
-- pre-push query lists any stored handle this would reject — and why the
-- NULL-tolerant disjunct matters for the three rows that have none yet.
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_handle_format_chk
  CHECK (
    handle IS NULL
    OR (handle ~ '^[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*$' AND length(handle) BETWEEN 3 AND 30)
  );

COMMENT ON COLUMN public.user_profiles.handle IS
  'Phase 36 D-04/D-05: the User Account''s public @handle. Stored exactly as typed; compared lowered (migration 010''s functional unique index is the uniqueness guarantee). Format is enforced by user_profiles_handle_format_chk, whose pattern and 3-30 bounds are the same values as lib/handles/validate.ts. Reserved and retired names are enforced by migration 133''s check_handle_not_reserved() on both write paths. NULL means "this account has not chosen a handle yet" — a legitimate state, never corruption, and one D-09''s hard gate resolves by PROMPTING on the next artist-group page load. Never generate a handle for an existing account.';

-- ─── (2) Schema-cache reload ──────────────────────────────────────────────
-- A new constraint changes what PostgREST reports for this column.
NOTIFY pgrst, 'reload schema';
