---
phase: 09-rich-member-profile
plan: 01b
type: execute
wave: 2
depends_on: [09-01a]
files_modified:
  - supabase/migrations/043_profile_allow_resharing.sql
  - lib/profile/validate.ts
  - app/api/profile/route.ts
  - lib/profile/load.ts
  - components/profile/ProfileView.tsx
  - app/u/[handle]/page.tsx
autonomous: false
requirements: [PROFILE-02, PROFILE-04, PROFILE-05, PROFILE-06]
must_haves:
  truths:
    - "A PATCH to /api/profile with valid roles/open_to/pronouns/avatar_url/banner_url/featured_project_id/allow_resharing persists them; malformed roles/open_to values are rejected, not written"
    - "Pinning a non-public or non-owned release as featured returns a friendly 400/404, not a raw Postgres trigger exception"
    - "buildProfileData() returns a placementsCount derived from activity_events kind='placement' COUNT"
    - "artist_profiles.allow_resharing column exists and is live on the remote database"
  artifacts:
    - supabase/migrations/043_profile_allow_resharing.sql
    - lib/profile/validate.ts
  key_links:
    - "app/api/profile/route.ts EDITABLE_FIELDS allowlist gates every writable column (mass-assignment boundary)"
    - "featured_project_id API pre-check + migration 034 DB trigger together enforce owner+public"
    - "lib/profile/validate.ts is the pure-logic module 09-01a's RED tests import — implementing it turns them GREEN"
---

<objective>
Turn 09-01a's RED tests GREEN and lay the DB/API layer every downstream Phase 9 plan depends on: create `lib/profile/validate.ts` (the pure validators 09-01a's tests import), extend the `/api/profile` PATCH allowlist with the seven new profile fields (with per-field validation), thread the placements stat through `buildProfileData()`, add migration 043 (`allow_resharing`), and run the BLOCKING `supabase db push`.

Purpose: This is the shared data/API/validation layer. Plans 02–05 write to these fields, read `allow_resharing`, and render `placementsCount` — none can proceed until this exists and the column is pushed live. It is split out from 09-01a because it touches the live DB (migration + push checkpoint) and is therefore non-autonomous.
Output: One new validator module, one new migration, three extended source files, and a live remote column.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/09-rich-member-profile/09-RESEARCH.md
@.planning/phases/09-rich-member-profile/09-PATTERNS.md
@.planning/phases/09-rich-member-profile/09-VALIDATION.md
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: lib/profile/validate.ts validators + PATCH /api/profile allowlist extension (GREEN)</name>
  <files>lib/profile/validate.ts, app/api/profile/route.ts</files>
  <read_first>
    - app/api/profile/route.ts (full — existing EDITABLE_FIELDS + sanitize() branches; service-client write-back at lines ~118-124)
    - .planning/phases/09-rich-member-profile/09-PATTERNS.md (sections for app/api/profile/route.ts — exact branch shapes to copy)
    - .planning/phases/09-rich-member-profile/09-RESEARCH.md (Code Examples → EDITABLE_FIELDS extension, ProfileRoleSchema, open_to filter, featured_project_id pre-check; Pitfalls 3 and 4)
    - types/index.ts (ProfileRole union line ~259, OpenTo union line ~264, PROFILE_ROLES line ~239, PROFILE_ROLE_LABELS, and OPEN_TO_VALUES exported by 09-01a)
    - __tests__/profile-roles-validation.test.ts, __tests__/featured-project-validation.test.ts (the RED tests from 09-01a — this task's exports MUST satisfy their import names and assertions exactly)
  </read_first>
  <action>
    Create `lib/profile/validate.ts` exporting exactly the names 09-01a's RED tests import: a Zod schema `ProfileRoleSchema` = `z.union` of `{kind:'preset', slug: z.enum(PROFILE_ROLES)}` and `{kind:'custom', label: z.string().trim().min(1).max(40)}`; `sanitizeProfileRoles(value: unknown): ProfileRole[] | null` (returns parsed array capped at max 6 via `z.array(ProfileRoleSchema).max(6).safeParse`, or null when invalid); `filterOpenTo(value: unknown): OpenTo[]` (array filter keeping only strings in `OPEN_TO_VALUES`, imported from `types/index.ts`); `isFeaturableProjectRow(row: { id: string; user_id: string; is_public: boolean } | null | undefined, userId: string): 'ok' | 'not_found' | 'not_public'` — the pure predicate 09-01a's featured-project test asserts against fixture rows (returns `not_found` when row is null/undefined or `row.user_id !== userId`, `not_public` when owned but `!row.is_public`, else `ok`). Zod is already a dependency.
    In `app/api/profile/route.ts`: add `'pronouns','roles','open_to','avatar_url','banner_url','featured_project_id','allow_resharing'` to `EDITABLE_FIELDS`. Add sanitize() branches: `roles` → use `sanitizeProfileRoles`, skip the field if it returns null; `open_to` → use `filterOpenTo`; `allow_resharing` → coerce to strict boolean; `featured_project_id` → for a non-null value, use the service client to `select('id, user_id, is_public').eq('id', value).maybeSingle()`, run `isFeaturableProjectRow(row, user.id)`, and return 404 (message: not found — see acceptance criteria for the exact non-raw string) when `not_found` and 400 (only-public message) when `not_public` (Pitfall 4), else set the value (null clears the pin). `avatar_url`/`banner_url`/`pronouns` fall through the existing generic string branch. Import `sanitizeProfileRoles`, `filterOpenTo`, `isFeaturableProjectRow` from `@/lib/profile/validate`.
  </action>
  <verify>
    <automated>npx jest __tests__/profile-roles-validation.test.ts __tests__/featured-project-validation.test.ts && grep -n "allow_resharing" app/api/profile/route.ts</automated>
  </verify>
  <acceptance_criteria>
    - `npx jest __tests__/profile-roles-validation.test.ts __tests__/featured-project-validation.test.ts` passes (GREEN) — 09-01a's two role/featured RED tests now pass against the real `@/lib/profile/validate` exports.
    - `grep -n "allow_resharing" app/api/profile/route.ts` shows it in EDITABLE_FIELDS.
    - The client-facing not-featurable messages are friendly, not raw Postgres: the 400 uses "Only public releases can be featured — publish it first." and the 404 uses "Release not found"; `grep -c "featured_project_id must reference" app/api/profile/route.ts` returns 0 (no raw trigger-exception string echoed to the client).
    - `sanitizeProfileRoles` rejects a 7-element or malformed-element array (returns null); `filterOpenTo` drops unknown strings.
    - `isFeaturableProjectRow` returns `not_found`/`not_public`/`ok` per the fixture-row test; `npx tsc --noEmit` clean.
  </acceptance_criteria>
  <done>lib/profile/validate.ts implements the four validators 09-01a's tests import (role/featured tests now GREEN); allowlist grown by seven validated fields; featured pre-check returns friendly errors.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: buildProfileData placements + u/[handle] placements query (GREEN)</name>
  <files>lib/profile/load.ts, components/profile/ProfileView.tsx, app/u/[handle]/page.tsx</files>
  <read_first>
    - lib/profile/load.ts (full — buildProfileData signature line ~87, options bag, ProfileData return line ~108)
    - components/profile/ProfileView.tsx (ProfileData type lines ~37-56 — add placementsCount field)
    - app/u/[handle]/page.tsx (Promise.all lines ~122-130 with the follows COUNT query; buildProfileData call line ~202)
    - .planning/phases/09-rich-member-profile/09-PATTERNS.md (lib/profile/load.ts section — options-bag extension + placements query)
    - .planning/phases/09-rich-member-profile/09-RESEARCH.md (Placements stat query code example; A2 assumption re activity_events kind='placement')
    - __tests__/profile-load.test.ts (the RED test from 09-01a — this task makes it GREEN)
  </read_first>
  <action>
    In `lib/profile/load.ts`: add `placementsCount?: number | null` (default null) to the `buildProfileData` options-bag parameter, and add `placementsCount` to the returned `ProfileData` object (pass-through). In `components/profile/ProfileView.tsx`: add `placementsCount: number | null` to the exported `ProfileData` type ONLY (do not render it here — Plan 05 owns the Stats-card row). In `app/u/[handle]/page.tsx`: add a fourth query to the existing `Promise.all` — `supabase.from('activity_events').select('*', { count: 'exact', head: true }).eq('profile_id', profile.id).eq('kind', 'placement')` — destructure its `count` as `placementsCount`, and pass `placementsCount` into the `buildProfileData(profile, projects, { publicOnly: true, followerCount, placementsCount })` call. Do NOT add a cached counter column (research A2 / notifications convention).
  </action>
  <verify>
    <automated>npx jest __tests__/profile-load.test.ts && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `npx jest __tests__/profile-load.test.ts` passes (placementsCount + avgReadiness derived correctly) — 09-01a's profile-load RED test now GREEN.
    - `npx tsc --noEmit` reports no errors (ProfileData type extended consistently across load.ts, ProfileView.tsx, and the page).
    - `grep -c "kind', 'placement'\|kind: 'placement'" app/u/[handle]/page.tsx` (or equivalent) returns 1 — the placements COUNT query exists, added to the existing Promise.all not a separate round-trip.
  </acceptance_criteria>
  <done>placementsCount flows profile → page query → buildProfileData → ProfileData; full type-check clean; all four Wave 0 tests GREEN.</done>
</task>

<task type="auto">
  <name>Task 3: Migration 043 — allow_resharing column with column-privilege lockdown</name>
  <files>supabase/migrations/043_profile_allow_resharing.sql</files>
  <read_first>
    - supabase/migrations/040_artist_profiles_column_privileges.sql (the migration-031/040 REVOKE/GRANT column-privilege pattern — the CRITICAL Wave 4 research rule: apply column privileges in the SAME migration that adds any column)
    - supabase/migrations/034_member_identity_wave4.sql (how prior Wave 4 columns on artist_profiles were added — default, type, and whether they were added to GRANT SELECT lists)
    - .planning/phases/09-rich-member-profile/09-RESEARCH.md (schema_push_requirement note: migration numbering is sequential, most recent is 042; new migration is 043; A3 — allow_resharing is a single global boolean)
    - .planning/STATE.md (Accumulated Context: "apply the migration-031 column-level REVOKE/GRANT pattern to every new/existing private column in the SAME migration that adds it")
  </read_first>
  <action>Create `supabase/migrations/043_profile_allow_resharing.sql` adding `artist_profiles.allow_resharing boolean NOT NULL DEFAULT true` (D-07 — default on; the toggle turns it off). `allow_resharing` is NOT sensitive/private (research security table: "isn't sensitive") — so it belongs in the PUBLIC-readable GRANT SELECT column set, mirroring how `open_to`/`verified` are granted in migration 040, so `app/u/[handle]/page.tsx` and `app/r/[projectId]/page.tsx` can read it through the session/server client. Follow migration 040's exact GRANT SELECT (col-list) TO authenticated pattern — add `allow_resharing` to that grant list. Do NOT add it to any REVOKE (private) set. Keep the migration idempotent-safe consistent with the repo's convention (ADD COLUMN IF NOT EXISTS where the repo uses it). Match the file's leading comment-header style used by migrations 034-042.</action>
  <verify>
    <automated>grep -Ev '^[[:space:]]*--' supabase/migrations/043_profile_allow_resharing.sql | grep -c "allow_resharing boolean"</automated>
  </verify>
  <acceptance_criteria>
    - Migration file exists at `supabase/migrations/043_profile_allow_resharing.sql`.
    - Non-comment SQL contains `allow_resharing boolean NOT NULL DEFAULT true` (the grep above returns >=1).
    - The file contains a `GRANT SELECT` referencing `allow_resharing` (readable by authenticated), and does NOT contain a `REVOKE ... allow_resharing` (it is not private).
    - Migration number is 043 and follows migration 042 sequentially.
  </acceptance_criteria>
  <done>Migration 043 adds the boolean with public-read column grant, in the same migration per the Wave 4 column-privilege rule.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: [BLOCKING] Push migration 043 to the remote database</name>
  <files>supabase/migrations/043_profile_allow_resharing.sql</files>
  <read_first>
    - supabase/migrations/043_profile_allow_resharing.sql (the migration built in Task 3 — the SQL being pushed)
    - .planning/STATE.md (resolved blockers — project ref wgfjakfiyeewzfuxkgyo; the Phase 15 `supabase db push` precedent for migrations 041+042)
  </read_first>
  <what-built>Migration 043 adds `artist_profiles.allow_resharing boolean NOT NULL DEFAULT true` with a public-read column grant. Type-checks and build pass WITHOUT the push because Supabase types come from config, not the live DB — so verification of anything reading `allow_resharing` would be a false positive until this column is live on the remote database (per schema_push_requirement).</what-built>
  <action>Run `supabase db push` from the repo root to apply migration 043 to the remote database. This is a [BLOCKING] gate: it requires interactive Supabase auth (login/link) that cannot be reliably suppressed in a non-TTY agent context — set `SUPABASE_ACCESS_TOKEN` for a non-interactive retry, otherwise flag for the operator to run it (autonomous: false). The phase CANNOT pass verification of any code reading `allow_resharing` until this push confirms LOCAL=REMOTE for 043.</action>
  <how-to-verify>
    1. From the repo root run: `supabase db push` (applies migration 043). If prompted for auth, run `supabase login` then re-run, or set `SUPABASE_ACCESS_TOKEN` and retry non-interactively. The project ref is `wgfjakfiyeewzfuxkgyo` (see STATE.md resolved blockers).
    2. Confirm success: `supabase migration list` shows migration 043 with LOCAL and REMOTE both populated (matching every migration 001–042).
    3. Confirm the column reads: as an authenticated session, `SELECT allow_resharing FROM artist_profiles LIMIT 1;` returns without a 42501 permission error (public-readable), and the default is `true`.
  </how-to-verify>
  <verify>`supabase migration list` shows migration 043 populated in BOTH the LOCAL and REMOTE columns.</verify>
  <done>Migration 043 is live on the remote database (043 appears with LOCAL and REMOTE both populated in `supabase migration list`); `SELECT allow_resharing FROM artist_profiles LIMIT 1;` succeeds without a 42501 error.</done>
  <resume-signal>Type "approved" once `supabase migration list` shows 043 live on REMOTE, or paste any push error to resolve it.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → PATCH /api/profile | Untrusted JSON body crosses into a service-role write; the EDITABLE_FIELDS allowlist is the mass-assignment gate |
| client → DB (direct PostgREST) | An authenticated client could hit `artist_profiles` directly; column grants (migration 040/043) are the row/column boundary |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-09-01 | Tampering | PATCH /api/profile mass-assignment (client sends `verified:true` / `member_type:'industry'`) | high | mitigate | New fields (roles, open_to, pronouns, avatar_url, banner_url, featured_project_id, allow_resharing) added to the existing explicit `EDITABLE_FIELDS` allowlist ONLY; never widened to spread-all / `select('*')`; `verified` and `member_type` remain absent from the allowlist |
| T-09-02 | Tampering | roles/open_to write untyped JSON into columns other components trust | high | mitigate | Zod `ProfileRoleSchema` (discriminated union, max 6, custom label ≤40 chars) + `filterOpenTo` against OPEN_TO_VALUES; invalid `roles` payloads are dropped, not written (Pitfall 3) |
| T-09-03 | Information Disclosure | featured_project_id pinning a private draft's UUID onto a public profile | high | mitigate | API pre-check (`isFeaturableProjectRow`: owner + is_public) returns friendly 400/404 before the write; migration 034 DB triggers remain the authoritative DB-layer guard — the API pre-check is UX on top, not a substitute (research security table) |
| T-09-04 | Tampering | allow_resharing coerced from a non-boolean payload | low | mitigate | Strict boolean coercion in the sanitize() branch; column defaults true and is non-sensitive (no RLS/privilege escalation surface) |
</threat_model>

<verification>
- All four Wave 0 Jest files green: `npx jest` (the four 09-01a files + existing suite).
- Type-check clean: `npx tsc --noEmit`.
- Migration 043 live on REMOTE (checkpoint Task 4): `supabase migration list` shows 043 populated LOCAL+REMOTE.
- Allowlist grep: `verified` and `member_type` are NOT in EDITABLE_FIELDS.
</verification>

<success_criteria>
- The seven new profile fields are writable via PATCH /api/profile with per-field validation; malformed roles/open_to rejected.
- Featured-pin of a non-public/non-owned release returns a friendly error, not a raw trigger exception.
- placementsCount is derived by COUNT (no cached column) and flows to ProfileData.
- allow_resharing column is live on the remote DB.
- 09-01a's four RED tests are all GREEN.
</success_criteria>

## Artifacts this phase produces

New symbols/files created by this plan (exclude from downstream drift "unexplained new symbol" flags):

- File: `supabase/migrations/043_profile_allow_resharing.sql`
- Column: `artist_profiles.allow_resharing boolean NOT NULL DEFAULT true`
- File: `lib/profile/validate.ts` exporting `ProfileRoleSchema`, `sanitizeProfileRoles(value): ProfileRole[] | null`, `filterOpenTo(value): OpenTo[]`, `isFeaturableProjectRow(row, userId): 'ok' | 'not_found' | 'not_public'`
- Allowlist additions to `EDITABLE_FIELDS` in `app/api/profile/route.ts`: `pronouns`, `roles`, `open_to`, `avatar_url`, `banner_url`, `featured_project_id`, `allow_resharing`
- `buildProfileData()` option + `ProfileData` field: `placementsCount`

<output>
Create `.planning/phases/09-rich-member-profile/09-01b-SUMMARY.md` when done.
</output>
</content>
