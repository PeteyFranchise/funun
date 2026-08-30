---
phase: 36-account-identity-mandatory-handle-for-user-accounts-artist-d
plan: 02
subsystem: database
tags: [postgres, supabase, migration, rls, triggers, security, handles]

# Dependency graph
requires: []
provides:
  - "supabase/migrations/133_handle_identity.sql — the whole Phase 36 database layer in one file, one push"
  - "public.handle_history — retired-handle record under zero-policy RLS + REVOKE, unique on lower(old_handle)"
  - "check_handle_not_reserved() rewritten — fires on INSERT as well as UPDATE OF handle, OLD-safe, and blocks retired handles (D-06 + D-08)"
  - "handle_new_user() rewritten — default branch writes raw_user_meta_data.handle inside a two-condition catch (D-03 + D-15)"
  - "resolve_profile_by_handle(TEXT) — case-insensitive profile lookup with retired-handle fallback, granted to anon (D-04 + D-07)"
affects: [36-03, 36-04, 36-05, 36-06, 36-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Narrowly-scoped nested EXCEPTION block naming exact condition names (unique_violation, raise_exception) rather than WHEN OTHERS — the first place in this codebase where a trigger catch is deliberately narrow because the caught condition is expected rather than exceptional"
    - "SECURITY DEFINER resolver RPC as the escape hatch for a lower(col) = lower($1) comparison PostgREST cannot express, doubling as the read path into a table that is fully revoked from anon/authenticated"
    - "Structural index-ordering assertions in a migration text-lock test (TG_OP before OLD; not_invited raise before the nested catch) — proving an invariant, not a string"

key-files:
  created:
    - supabase/migrations/133_handle_identity.sql
    - __tests__/migration-133.test.ts
  modified: []

key-decisions:
  - "Assumption A1 resolved as a UNIVERSAL block: a retired handle is unclaimable by everyone, the original owner included. Universal is the safe default and relaxing it later is a single function edit with no schema change, whereas shipping the permissive version and later discovering an impersonation path is not recoverable the same way. Recorded in a comment above the history check and asserted by the test (the history-check region contains no NEW.id)."
  - "Assumption A2 declined: no DB-level format CHECK constraint in this migration. The plan's prohibitions override RESEARCH's optional suggestion — it ships with plan 07 once the regex is final and provably byte-identical to lib/handles/validate.ts's HANDLE_RE."
  - "Assumption A3 taken: the trigger is renamed to user_profiles_handle_not_reserved while the DROP still targets the pre-rename trigger NAME on the CURRENT table (public.user_profiles). Migration 076's ALTER TABLE ... RENAME TO was OID-preserving, so the trigger followed the table under its old name; naming public.artist_profiles would fail the push."
  - "The resolver's OUT parameter names (profile_id, current_handle, redirected) are kept exactly as the plan specifies because plan 05 consumes them; every column reference inside the body is table-qualified so the profile_id OUT param cannot collide with handle_history.profile_id in PL/pgSQL."

patterns-established:
  - "When a trigger catch must be narrow, name the SQLSTATE condition explicitly and text-lock both the condition list and the block's INSERT-target scope — a WHEN OTHERS in this position would convert a broken column, a broken FK, or an outage into a silent 'handle taken'."
  - "Migration text-lock tests should assert prose against a comment-stripped and an unwrapped-prose view of the file, so 'the migration does not do X' assertions cannot be defeated or falsely tripped by a header comment."

# Metrics
metrics:
  duration: ~35 min
  tasks-completed: 2 of 3
  tests-added: 35
  full-suite: 3055 passing (280 suites)
  completed: 2026-08-30

status: blocked
blocked-on: "Task 3 — blocking human checkpoint: the owner must run `supabase db push`. An executor agent never pushes on this project."
---

# Phase 36 Plan 02: Migration 133 — Handle Identity Database Layer Summary

Authored the entire Phase 36 database layer as one migration: a `handle_history` table, a
rewritten reserved-name guard that finally covers the INSERT path and blocks retired handles,
a rewritten `handle_new_user()` that writes the signup-chosen handle inside a two-condition
catch, and a case-insensitive profile resolver. Text-locked by 35 jest assertions. **Not
pushed** — the push is the owner's blocking checkpoint.

## What Was Built

### `supabase/migrations/133_handle_identity.sql`

**Section 1 — `public.handle_history`.** `CREATE TABLE IF NOT EXISTS` with
`id`/`profile_id`/`old_handle`/`retired_at`, a unique index on `lower(old_handle)` mirroring
migration 010's functional index, and a plain index on `profile_id`. RLS enabled with zero
policies, `REVOKE SELECT, INSERT, UPDATE, DELETE ... FROM authenticated, anon` and
`REVOKE ALL ... FROM PUBLIC` — the doctrine established in migrations 128–132. The table
appears in no GRANT to `anon` or `authenticated` and there is no policy-creation statement
anywhere in the file.

**Section 2 — `check_handle_not_reserved()` rewritten (D-06).** This was the delicate one and
it is a **body rewrite, not an event-list widening**. Migration 037's condition dereferenced
the OLD row unconditionally; on an INSERT the OLD row does not exist, so the comparison was
NULL and the guard never fired. The new condition is
`NEW.handle IS NOT NULL AND (TG_OP = 'INSERT' OR lower(NEW.handle) IS DISTINCT FROM lower(OLD.handle))`
— the `TG_OP` test short-circuits the OR before anything reads OLD, and a comment says so
explicitly. `RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''` is carried
over byte-for-byte from 037.

Two `EXISTS` checks live in the one function body (not a second trigger — RESEARCH Pitfall 1):
`reserved_handles WHERE handle = lower(NEW.handle)` and
`handle_history WHERE lower(old_handle) = lower(NEW.handle)`. Both raise a plain
`RAISE EXCEPTION 'handle is reserved'` with no `USING ERRCODE`, so they carry SQLSTATE P0001 —
the `raise_exception` condition section 3's catch names.

The trigger swap is `DROP TRIGGER IF EXISTS artist_profiles_handle_not_reserved ON
public.user_profiles;` (old trigger name, current table) followed by `CREATE TRIGGER
user_profiles_handle_not_reserved BEFORE INSERT OR UPDATE OF handle ON public.user_profiles`.
The string `public.artist_profiles` appears nowhere in the file.

**Section 3 — `handle_new_user()` rewritten (D-03 + D-15).** Migration 105's body is reproduced
with exactly one edit. The curator early return, buyer early return, staff early return, the
entire industry branch, the admin-provision intent consumption, the invite gate, the
specific-invite accept marking, the subscriptions insert and the collaborator claim are all
unchanged — verified mechanically, see below. The dead curator branch is left exactly as it is
per D-01.

The one edit replaces `INSERT INTO public.user_profiles (id) VALUES (NEW.id);` with:

```sql
BEGIN
  INSERT INTO public.user_profiles (id, handle)
  VALUES (NEW.id, NULLIF(TRIM(NEW.raw_user_meta_data->>'handle'), ''));
EXCEPTION WHEN unique_violation OR raise_exception THEN
  INSERT INTO public.user_profiles (id) VALUES (NEW.id);
END;
```

Four load-bearing properties, each carrying a comment in the file: it wraps only that one
INSERT; it names exactly two conditions (a catch-all would report a broken column, a broken FK
or an outage as a handle collision); it cannot swallow the invite gate, because that raise
carries the same P0001 but fires earlier and aborts the trigger before the block is entered;
and `NULLIF(TRIM(...), '')` makes the buyer/staff/industry provisioning lanes a no-op, since
none of them set `user_metadata.handle`. A comment also records the INSERT-time metadata
asymmetry (`user_metadata` visible, `app_metadata` and `email_confirmed_at` not) that makes
D-03 possible at all, pointing at `lib/accounts/provisionIntent.ts`.

**Section 4 — `resolve_profile_by_handle(p_handle TEXT)`.** `RETURNS TABLE (profile_id UUID,
current_handle TEXT, redirected BOOLEAN)`, `LANGUAGE plpgsql STABLE SECURITY DEFINER SET
search_path = ''`. Current handles resolve first (`redirected` FALSE); on `IF FOUND THEN
RETURN`, otherwise it falls through to `handle_history` joined back to `user_profiles`
(`redirected` TRUE). `REVOKE ALL ... FROM PUBLIC` then `GRANT EXECUTE ... TO anon,
authenticated, service_role`. The comment records why this is an RPC rather than a filter from
the page: PostgREST cannot express `lower(col) = lower($1)`, and an underscore is both a legal
handle character under D-05 and a single-character wildcard in a pattern match, so `/u/a_c`
would silently resolve to `@abc` or match two rows and 404 a legitimate profile.

**Section 5.** `NOTIFY pgrst, 'reload schema';` is the file's last statement.

### `__tests__/migration-133.test.ts` — 35 assertions

Written in the style of `__tests__/migration-105-gate.test.ts` (readFileSync + index slicing +
copied `normalizeWhitespace`/`extractBranch` helpers, which 105's test also copies rather than
imports). Two views of the file are derived: `sqlOnly` (comment lines stripped, so
"the migration does not do X" assertions cannot be defeated or falsely tripped by prose) and
`commentProse` (comment lines unwrapped and whitespace-collapsed, so a hard-wrapped sentence in
the header can still be asserted).

The two assertions that carry the most weight are **ordering proofs**, because the defects they
cover look correct in review:

1. In the guard body, the index of `TG_OP = 'INSERT'` is less than the index of the first
   `OLD.handle` reference. This is the assertion that would have caught the original migration
   037 defect — a test that only checked the trigger said "BEFORE INSERT" would have passed
   against the broken body.
2. In `handle_new_user()`, the index of the `not_invited` raise is less than the index of the
   nested catch. Both carry P0001; the gate is safe only because of that ordering, so the
   invariant is machine-checked rather than assumed.

Scope is proven the same way: from the nested block's `BEGIN` to its matching `END;`, the only
`INSERT INTO` target is `public.user_profiles`, the block contains neither `public.subscriptions`
nor `claim_collaborators`, and both of those are asserted to still exist *after* the block. The
pre-existing `EXCEPTION WHEN OTHERS THEN` blocks are counted at exactly four, so the new catch
cannot have quietly joined them.

Branch parity: curator, buyer, staff and industry branches are extracted with migration 105's
own four markers and compared, whitespace-normalized, against the corresponding slice of
migration 105 itself. All four match.

## Deviations from Plan

**None that change an owner decision.** Three assumption resolutions and one wording adjustment:

**1. [Plan-directed] Assumption A1 resolved as a universal block.** The plan instructed this
explicitly. Recorded in a comment above the history check and asserted by the test.

**2. [Plan-directed] Assumption A2 declined — no format CHECK constraint.** RESEARCH offered it
as an optional defense-in-depth addition; the plan's prohibitions forbid it in this migration.
Followed the plan. Deferred to plan 07.

**3. [Plan-directed] Assumption A3 taken — the trigger is renamed.** `DROP TRIGGER IF EXISTS
artist_profiles_handle_not_reserved ON public.user_profiles` targets the live table regardless
of the trigger's own name, so the rename is safe.

**4. [Minor, test-only] Prose assertions run against an unwrapped view of the comments.** Two
header assertions initially failed because the sentences they matched are hard-wrapped across
`--` lines. Added a `commentProse` helper that strips the `--` prefixes and collapses
whitespace, and pointed the seven prose assertions at it. No change to the migration; the
assertions still verify the same wording.

**5. [Defensive, not a deviation] Every column reference inside the resolver is table-qualified.**
The plan specifies `profile_id` as an OUT parameter name, which is also a `handle_history`
column name. In PL/pgSQL an unqualified `profile_id` in the second query would be an ambiguous
reference; `h.profile_id` is unambiguous because `h` is a table alias and not a variable. The
signature is unchanged — plan 05 consumes it as specified.

## Gate Results

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` (`--max-warnings=0`) | clean |
| `npx jest __tests__/migration-133.test.ts` | 35/35 passing |
| `npx jest` (full suite) | 3055 passing, 280 suites, 0 failing |
| `npx jest __tests__/migration-105-gate.test.ts` | still passing — 133 reproduces 105's branches rather than replacing its file |
| Task 1 automated verifies (7 greps) | all pass |
| `npm run build` | **deliberately not run** — dev server on :3000 |

Full-suite baseline was 2993 at plan start; the count is 3055 because plan 36-01 (same wave)
landed its own tests in parallel. 3055 = 2993 + 35 (this plan) + 27 (36-01).

## Threat Mitigations Applied

| Threat ID | Disposition | How it landed |
|-----------|-------------|---------------|
| T-36-04 | mitigate | Trigger widened to `BEFORE INSERT OR UPDATE OF handle` **and** the body rewritten so `TG_OP` short-circuits before OLD is read. Index-ordering assertion in the test. |
| T-36-05 | mitigate | Guard keeps `SECURITY DEFINER SET search_path = ''` and fires on both write paths, so it applies to a raw PostgREST write exactly as to an application write. Asserted as a byte-for-byte string. |
| T-36-06 | mitigate | `handle_history` EXISTS check inside the same guard function, blocking universally (A1). Test asserts the history-check region contains no `NEW.id`. |
| T-36-07 | mitigate | Migration 010's lowered unique index remains the enforcement; the D-15 catch converts a lost race into a NULL handle. |
| T-36-08 | mitigate | Catch names exactly two conditions; test asserts the condition list, the occurrence count (1), the block's INSERT-target scope, and that the four pre-existing `WHEN OTHERS` blocks are still four. |
| T-36-09 | mitigate | Test asserts `not_invited` raise index < nested catch index. |
| T-36-10 | accept | Resolver granted to `anon` as designed; it returns a profile id, and the page keeps its own `is_public` and block checks. |
| T-36-11 | mitigate | Zero-policy RLS + REVOKE from PUBLIC/authenticated/anon; test also scans every `GRANT` statement in the file and asserts none mentions `handle_history`. |
| T-36-SC | accept | Zero new dependencies; no package-manager install anywhere in this plan. |

## Known Stubs

None. Nothing in this plan renders UI or returns placeholder data.

## What Could Not Be Verified Without the Push

Everything here is text-locked, not executed. The migration has never been parsed by
PostgreSQL. Specifically unverified until `supabase db push` runs:

- That the file parses and applies cleanly end to end.
- That `DROP TRIGGER IF EXISTS artist_profiles_handle_not_reserved ON public.user_profiles`
  finds and removes the live trigger (the OID-preserving-rename reasoning is sound and
  documented in migration 076, but it is reasoning, not observation).
- That PL/pgSQL accepts the resolver's `profile_id` OUT parameter alongside
  `handle_history.profile_id` — every reference is table-qualified, so it should, but only the
  push proves it.
- That the guard actually rejects a reserved handle on the INSERT path in practice
  (checkpoint step 6 smokes this).
- That the `handle_new_user()` replacement leaves buyer/staff/industry provisioning working —
  branch parity is proven textually, but only a live provisioning run proves it behaviorally.

## Next

**Task 3 is a blocking human checkpoint and this plan stops here.** Waves 2 and 3 (plans 03,
04, 05, 06, 07) all call a function or write a table that does not exist until the push lands,
and TypeScript types on this project come from config rather than the live database, so any
downstream verification before the push would be a false positive.

## Self-Check: PASSED

- `supabase/migrations/133_handle_identity.sql` — exists
- `__tests__/migration-133.test.ts` — exists
- `36-02-SUMMARY.md` — exists
- commit `8c66482` — present in git log
- commit `256b7ec` — present in git log
