---
phase: 08-identity-schema-foundation
plan: 05
subsystem: database
tags: [postgres, rls, column-privileges, supabase, next.js, pii]

requires:
  - phase: 08-01
    provides: member_type and search_vector columns on artist_profiles (migration 034), which this plan's GRANT SELECT list depends on
provides:
  - Migration 040 (not yet pushed to a live database) that REVOKEs blanket authenticated/anon column privileges on artist_profiles and re-GRANTs only the D-11 PUBLIC/owner-editable sets
  - D-19 companion code fix across 4 read/write paths so the REVOKE does not break production
affects: [phase-09-rich-member-profile, phase-12-discovery-people-search, any future artist_profiles migration]

tech-stack:
  added: []
  patterns:
    - "Two-client-path split: session-bound client establishes auth.uid() ownership, then createServiceClient() performs the actual privileged read/write (bypasses RLS + column grants)"
    - "Explicit PUBLIC column list on the public read path must stay byte-identical to the migration's GRANT SELECT list to avoid app/DB drift"

key-files:
  created:
    - supabase/migrations/040_artist_profiles_column_privileges.sql
  modified:
    - app/u/[handle]/page.tsx
    - app/(artist)/settings/page.tsx
    - app/profile/page.tsx
    - app/api/profile/route.ts

key-decisions:
  - "Added `genre` (legacy) and `sound_identity` to both migration 040's GRANT SELECT list and app/u/[handle]/page.tsx's explicit column list — buildProfileData() in lib/profile/load.ts reads both to build the profile's `tags` display; neither is PII, and omitting them would have silently broken the public profile's tag rendering the moment the migration landed"
  - "app/(artist)/settings/page.tsx's second `.select('*')` (user_profiles table) was left on the session-bound client — user_profiles is a separate table (migration 026) not touched by migration 040, so it is unaffected by this plan's REVOKE and does not require the service-client swap; only the artist_profiles read on that page was switched"
  - "[BLOCKING] Task 3 (the live schema push) could not be executed in this sandbox — no supabase/config.toml, no linked Supabase project, SUPABASE_ACCESS_TOKEN unset. This is a phase-blocking manual-intervention gap; see below."

patterns-established:
  - "Column-privilege REVOKE/GRANT lockdown (migration 031 precedent) now applied to a second table (artist_profiles), with its companion app-layer fix shipped in the same PR (D-19) rather than split across deploys"

requirements-completed: []

coverage:
  - id: D1
    description: "Migration 040 REVOKEs blanket authenticated/anon SELECT/UPDATE on artist_profiles and re-GRANTs only the D-11 PUBLIC/owner-editable column sets; all 11 PRIVATE PII columns are ungrantable"
    verification:
      - kind: manual_procedural
        ref: "grep-based acceptance checks against supabase/migrations/040_artist_profiles_column_privileges.sql (file exists, REVOKE/GRANT clauses present, member_type + search_vector present, all 8 sampled PRIVATE columns absent from any GRANT clause) — see Deviations section for why `npx supabase db push --dry-run` could not be run"
        status: unknown
    human_judgment: true
    rationale: "The plan's own automated verify (`supabase db push --dry-run`) cannot run in this sandbox (no supabase/config.toml — see Deviations). Manual grep-based checks confirm the SQL is well-formed and column-complete, but only a real `db push --dry-run`/`db push` against a linked project can confirm the SQL actually applies cleanly against live Postgres. A human must run the dry-run push (see Manual-Intervention Gap below) before this is provably correct."
  - id: D2
    description: "D-19 companion code fix: public path uses an explicit PUBLIC column list; three owner self-service paths (settings, /profile, profile PATCH) use createServiceClient() after an auth.getUser()-derived ownership check; no session-bound select('*')/bare select() against artist_profiles remains"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (exit 0, confirmed in this session)"
        status: pass
      - kind: manual_procedural
        ref: "project-wide grep: `grep -rn \"artist_profiles\" --include=\"*.ts\" --include=\"*.tsx\" app lib | grep -E \"\\.select\\('\\*'\\)|\\.select\\(\\)\"` returns exactly one hit, on the `service` (createServiceClient) client in app/profile/page.tsx — confirmed in this session"
        status: pass
    human_judgment: false
  - id: D3
    description: "[BLOCKING] Live schema push (migrations 034-040) applied to a real database, types/supabase.ts regenerated, SC-4 smoke assertions (42501 on legal_first_name as authenticated; owner Settings/profile + public /u/[handle] load without 500) recorded"
    verification: []
    human_judgment: true
    rationale: "Cannot be attempted in this sandbox at all — no supabase/config.toml (supabase init was never run in this repo/environment), no linked Supabase project, SUPABASE_ACCESS_TOKEN unset. This is an environment gap, not a code gap. A human with real Supabase project access must run the push and smoke tests per the Manual-Intervention Gap section below before Phase 8 can be considered verified."

duration: ~20min
completed: 2026-07-05
status: complete
---

# Phase 8 Plan 5: Identity Schema Foundation - Column-Privilege Lockdown Summary

**Migration 040 REVOKEs blanket authenticated/anon column privileges on `artist_profiles` and re-GRANTs only the PUBLIC/owner-editable set (D-10/D-11); the D-19 companion code fix (4 files) prevents this from 500ing production — but the actual live push (Task 3, [BLOCKING]) could not run in this sandbox and is a pending manual-intervention gap.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-05
- **Tasks:** 2 of 3 fully executed (Task 3 attempted, blocked by missing environment setup — documented below)
- **Files modified:** 5 (1 new migration, 4 modified app files)

## Accomplishments

- Wrote `supabase/migrations/040_artist_profiles_column_privileges.sql`, applying migration 031's exact REVOKE/GRANT column-privilege pattern to `artist_profiles` — closing a live, pre-existing CRITICAL PII exposure (legal name, contact, mailing address, PRO/IPI/publisher/MLC/SoundExchange IDs were readable by any authenticated/anon caller via direct PostgREST before this migration).
- Shipped the mandatory D-19 companion code fix in the same plan: the public path (`app/u/[handle]/page.tsx`) now selects an explicit PUBLIC column list identical to the migration's GRANT SELECT set; the three owner self-service paths (`app/(artist)/settings/page.tsx`, `app/profile/page.tsx`, `app/api/profile/route.ts` PATCH) now read/write private fields via `createServiceClient()` only after an `auth.getUser()`-derived ownership check.
- Discovered and fixed a drift risk the plan's own drafted column list didn't anticipate: `buildProfileData()` (`lib/profile/load.ts`) reads `profile.genre` (legacy TEXT) and `profile.sound_identity` (JSONB) to build the public profile's `tags` display — neither was in the D-11-drafted PUBLIC set. Added both to the migration's GRANT SELECT list and to the public page's explicit select list so the public profile's tags don't silently disappear the moment the migration lands.
- Confirmed via project-wide grep that no other `.select('*')`/bare `.select()` against `artist_profiles` exists beyond the four sites already fixed.
- Attempted the [BLOCKING] Task 3 schema push; it cannot run in this sandbox (see Manual-Intervention Gap below) and is explicitly flagged as pending human action, per the plan's own contingency instructions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write migration 040 — artist_profiles column-privilege REVOKE/GRANT lockdown (D-10/D-11)** - `016eedb` (feat)
2. **Task 2: D-19 companion code fix — explicit PUBLIC column list + createServiceClient ownership-checked reads/writes** - `2acdf28` (feat)
3. **Task 3: [BLOCKING] Apply the phase schema push + regenerate types** - NOT EXECUTED (manual-intervention gap; no commit — nothing to commit, see below)

**Plan metadata:** committed separately as part of this SUMMARY/STATE/ROADMAP update.

## Files Created/Modified

- `supabase/migrations/040_artist_profiles_column_privileges.sql` - REVOKE/GRANT column-privilege lockdown on `artist_profiles`; PUBLIC set (26 columns, including 2 legacy additions — see Deviations), owner-editable UPDATE set, and 11 PRIVATE PII columns with no authenticated/anon grant at all
- `app/u/[handle]/page.tsx` - public read path: `.select('*')` replaced with an explicit column list matching migration 040's GRANT SELECT set exactly
- `app/(artist)/settings/page.tsx` - `artist_profiles` read switched to `createServiceClient()` after an `auth.getUser()`-derived ownership check; the separate `user_profiles` read on the same page left on the session-bound client (different table, unaffected by this migration)
- `app/profile/page.tsx` - `artist_profiles` read switched to `createServiceClient()` with the same ownership-check pattern
- `app/api/profile/route.ts` - PATCH handler's `.update(...).select()` read-back switched to `createServiceClient()`; `EDITABLE_FIELDS` mass-assignment allowlist unchanged

## Decisions Made

- Added `genre` and `sound_identity` to both the migration's GRANT SELECT list and `app/u/[handle]/page.tsx`'s explicit select list (see Deviations — this follows the plan's own explicit instruction to audit against `buildProfileData()` and add any discovered legacy PUBLIC field to both lists).
- Left `app/(artist)/settings/page.tsx`'s `user_profiles` read on the session-bound client rather than switching it to `createServiceClient()`. The plan's task description referred to "the two `.select('*')` owner self-read sites" on this page, but only one of those two selects targets `artist_profiles` (the table this migration touches); the other targets `user_profiles`, a wholly separate table (migration 026) with its own RLS policy (`auth.uid() = id`) that is not modified by migration 040. Switching it would be a scope-expanding, unnecessary architectural touch on a table this plan does not migrate, so it was left as-is. Documented here rather than silently deviating from the plan's literal wording.
- Followed the sandbox's pre-confirmed environment constraint (per orchestrator instruction) exactly: attempted Task 3, observed it cannot run, and documented the manual-intervention gap explicitly rather than silently marking the push as passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/2 - Bug/missing correctness] Public PUBLIC column list omitted two legacy fields consumed by the public profile renderer**
- **Found during:** Task 2 (the plan's own instruction to audit `app/u/[handle]/page.tsx`'s explicit column list against `lib/profile/load.ts`'s `buildProfileData()` field usage)
- **Issue:** The D-11-drafted PUBLIC column list (research, context, and the plan's own drafted list) did not include `genre` (legacy single-genre TEXT column, superseded by the `genres` array but still read) or `sound_identity` (JSONB mood-tag data). `buildProfileData()` reads both (`profile.genre`, `profile.sound_identity?.mood_tags`) to build the profile's `tags` array, which renders on every profile page (owner and public). Had migration 040 shipped with only the drafted list, and had the public page's explicit select also used only the drafted list, the public profile's tag chips would have silently gone blank for every visitor the moment the migration landed — a correctness regression, not a security one (neither field is PII).
- **Fix:** Added `genre` and `sound_identity` to migration 040's GRANT SELECT list and to `app/u/[handle]/page.tsx`'s explicit select list, keeping the two byte-identical as required by the plan's key_links constraint.
- **Files modified:** `supabase/migrations/040_artist_profiles_column_privileges.sql`, `app/u/[handle]/page.tsx`
- **Verification:** Manual read of `lib/profile/load.ts` confirmed these are the only two additional fields `buildProfileData()` reads that were missing from the drafted PUBLIC set; `npx tsc --noEmit` passes; grep confirms both fields appear in the GRANT SELECT clause and nowhere in the PRIVATE-column check.
- **Committed in:** `016eedb` (migration), `2acdf28` (page fix)

---

**Total deviations:** 1 auto-fixed (Rule 1/2 — correctness gap in the plan's own drafted column list, discovered via the plan's own mandated audit step)
**Impact on plan:** Necessary for correctness; no scope creep. No architectural changes were made.

## Issues Encountered

### [BLOCKING] Manual-Intervention Gap — Task 3 schema push could not run

Per the environment constraint confirmed by the orchestrator before this plan began, **this sandbox has no `supabase/config.toml`, no linked Supabase project, and `SUPABASE_ACCESS_TOKEN` is not set.** This was verified directly in this session:

```
$ npx supabase db push --dry-run
cannot read config in /Users/peterzora/Desktop/funun: open supabase/config.toml: no such file or directory
Have you set up the project with supabase init?

$ npm run db:push
> supabase db push
cannot read config in /Users/peterzora/Desktop/funun: open supabase/config.toml: no such file or directory
Have you set up the project with supabase init?

$ echo $SUPABASE_ACCESS_TOKEN
(empty)
```

This means **not even Task 1's own automated verify (`npx supabase db push --dry-run`) could execute** — the gap is more fundamental than "the live push specifically can't run"; no `supabase` CLI command that touches config/project state can run at all in this environment. Task 1's acceptance criteria were instead verified manually (see coverage `D1` above): grep-based structural checks confirm the migration file exists, contains the required REVOKE/GRANT clauses, includes `member_type`/`search_vector`, and excludes all sampled PRIVATE columns from any GRANT clause. These checks do **not** prove the SQL parses/applies cleanly against a live Postgres instance — only a real `db push --dry-run` can prove that.

**This plan's acceptance criteria are NOT silently marked as passed for Task 3.** Per the plan's own explicit instruction: "If the live push cannot be run in this environment ... document that explicitly in the SUMMARY as a manual-intervention gap and mark the phase's push as pending human action — do NOT mark the phase verified without it."

**Phase 8 is NOT verified until a human completes the following, in order, against a real/linked Supabase project:**

1. Run `supabase init` (or otherwise link this repo to a real Supabase project) and set `SUPABASE_ACCESS_TOKEN` in the environment.
2. Run `npx supabase db push --dry-run` and confirm it exits 0 for the full migration set (034 through 040 — plans 08-01 through 08-05 in this working tree).
3. Run `npm run db:push` (i.e. `supabase db push`, the real push — not dry-run) and confirm all seven migrations apply successfully.
4. Run `npm run db:types` (`supabase gen types typescript --local > types/supabase.ts`) to regenerate `types/supabase.ts` against the now-live schema. Note this script uses `--local`, which requires a local Supabase stack (Docker) to be running; if types are instead generated against the remote linked project, use `supabase gen types typescript --linked > types/supabase.ts` (or update the npm script) — confirm which is appropriate for this project's workflow before running.
5. Run the SC-4 manual smoke assertions from `.planning/phases/08-identity-schema-foundation/08-VALIDATION.md`:
   - As the `authenticated` role: `SELECT legal_first_name FROM artist_profiles LIMIT 1` — must return `42501 permission denied for column legal_first_name`.
   - Log in as a real/seeded artist account with private fields populated → visit `/settings` and `/profile` → confirm legal name/contact/PRO fields render and save without a 500 or `42501` error.
   - Visit a public `/u/[handle]` page as a logged-out visitor → confirm the page loads (no 500) and the response contains no `legal_*`, `contact_phone`, `mailing_address`, `pro`, `ipi`, `publisher`, `mlc_id`, or `soundexchange_id` values anywhere in the payload.
6. Only after all five steps above pass should Phase 8 be marked verified / the ROADMAP's SC-4 row flipped to ✅.

No code changes are needed to unblock this — it is purely an environment/credentials setup gap (Supabase project linkage + access token), not a bug in this plan's migration or code fix.

## User Setup Required

**External service requires manual configuration before Phase 8 can be verified.** See the "Manual-Intervention Gap" section above for the exact commands and assertions:
- Link this repo to a real Supabase project (`supabase init` / `supabase link`) and set `SUPABASE_ACCESS_TOKEN`
- Run `supabase db push` (migrations 034-040) and `npm run db:types` (or the `--linked` variant)
- Perform the SC-4 manual smoke assertions listed above

## Next Phase Readiness

- Migration 040 and its D-19 companion code fix are written, committed, type-checked, and grep-verified as internally consistent (app-layer projection matches DB-layer grant exactly). They are ready to deploy together in one release, as required by D-19.
- **Blocker for Phase 8 sign-off:** the schema push itself (Task 3) has not been applied to any live database in this environment. Phases 9-13 that depend on Phase 8's full column-privilege lockdown being live (not just written) should treat SC-4 as pending until a human completes the steps above.
- No other Phase 8 plan is affected by this gap — plans 08-01 through 08-04's migrations (034-039) are unaffected by whether 040 has been pushed; they simply have not been pushed either, for the same environment reason (this plan's Task 3 was the single consolidated push point for the whole phase, per the plan's own "CRITICAL" framing).

---
*Phase: 08-identity-schema-foundation*
*Completed: 2026-07-05*

## Self-Check: PASSED

All created/modified files confirmed present on disk; all three task/summary commits (`016eedb`, `2acdf28`, `138df9c`) confirmed present in `git log`.
