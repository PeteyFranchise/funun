---
phase: 08-identity-schema-foundation
verified: 2026-07-05T20:04:25Z
status: human_needed
score: 5/5 must-haves verified (all truths present in SQL + code; live-DB push pending)
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Push migrations 034-040 to the linked Supabase project and confirm all seven apply cleanly"
    expected: "All migrations apply without error; supabase db push exits 0"
    why_human: "No supabase/config.toml, no linked project, SUPABASE_ACCESS_TOKEN unset in the sandbox — no CLI push can run here; documented in 08-05-SUMMARY.md"
  - test: "As the authenticated role via direct PostgREST, run SELECT legal_first_name FROM artist_profiles LIMIT 1"
    expected: "42501 permission denied for column legal_first_name"
    why_human: "Column-privilege enforcement is a live-DB assertion; migration 040 is SQL-correct but has not been applied to any database"
  - test: "Log in as a seeded artist account with private fields populated, visit /settings and /profile, verify legal name / contact / PRO fields render and save without 500 or 42501"
    expected: "Pages load; private fields display and save correctly via service-client path"
    why_human: "Requires live database with migration 040 applied; tests the D-19 two-client-path split end-to-end"
  - test: "Visit a public /u/[handle] page as a logged-out visitor; confirm no legal_*, contact_phone, mailing_address, pro, ipi, publisher, mlc_id, or soundexchange_id values appear in the response payload"
    expected: "Response contains only the 28 PUBLIC-grant columns; private PII is absent"
    why_human: "Requires live database with migration 040 applied to verify the grant restriction holds at the PostgREST layer"
  - test: "Invite a new industry member via /admin/members: fill display name, pick role chips, submit. Confirm a member_type='industry' artist_profiles row exists, a free subscriptions row was created, and the custom Resend invite email arrives with the magic link"
    expected: "DB row created by handle_new_user() industry branch; subscriptions row with tier='free'; Resend email delivered; magic link signs in the invited member"
    why_human: "Full SC-5 end-to-end flow requires live database + Resend API configured; the trigger (migration 039) and code are present but the migration has not been pushed"
  - test: "Re-invite the same email address; confirm the POST /api/admin/members returns 409 with 'This email has already been invited.'"
    expected: "409 response; DuplicateIndustryMemberError correctly identified via email_exists code"
    why_human: "Requires live Supabase auth.admin.createUser() to return the email_exists code"
---

# Phase 8: Identity Schema Foundation — Verification Report

**Phase Goal:** The database is ready to back a professional network — one unified member-identity model with the connection, block, notification, and presence-read tables in place, and private fields locked down before any UI can expose them.
**Verified:** 2026-07-05T20:04:25Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `artist_profiles` carries extended identity columns (`member_type`, `search_vector`) with a GIN index | VERIFIED | Migration 034 line 19: `ADD COLUMN IF NOT EXISTS member_type TEXT NOT NULL DEFAULT 'artist' CHECK (member_type IN ('artist', 'industry'))`. Lines 36-46: `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', ...)) STORED` with `array_to_string(genres)` and `array_to_string(industry_roles)`. Lines 51-52: `CREATE INDEX IF NOT EXISTS idx_artist_profiles_search_vector ON artist_profiles USING GIN (search_vector)`. Two-arg to_tsvector form confirmed. ArtistProfile type: `types/index.ts` lines 380-381 add `member_type: 'artist' | 'industry'` and `search_vector: string | null`. |
| 2 | `connections` and `blocks` tables exist with RLS enabled; `no_block()` SECURITY DEFINER helper gates socially-exposed table inserts | VERIFIED | Migration 035: `connections` table with CHECK constraint, `connections_active_pair_uniq` partial unique index (WHERE status IN ('pending', 'accepted')), `ALTER TABLE connections ENABLE ROW LEVEL SECURITY`. `blocks` with `ALTER TABLE blocks ENABLE ROW LEVEL SECURITY`. `no_block(a UUID, b UUID) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''` with bidirectional check. REVOKE EXECUTE FROM PUBLIC/anon; GRANT … TO authenticated. Migration 038 wires `no_block()` into follows, wall_posts, endorsements, dm_threads, dm_messages INSERT policies. |
| 3 | `notifications` extended with actor-snapshot columns and added to the realtime publication; `dm_thread_reads` table exists for DM unread counts | VERIFIED | Migration 036 lines 18-21: `ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES auth.users ON DELETE SET NULL`, `actor_name TEXT`, `actor_avatar_url TEXT`. Lines 27-35: idempotent `ALTER PUBLICATION supabase_realtime ADD TABLE notifications` guard. Lines 42-65: `CREATE TABLE IF NOT EXISTS dm_thread_reads (thread_id UUID NOT NULL REFERENCES dm_threads ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE, last_read_at TIMESTAMPTZ, PRIMARY KEY (thread_id, user_id))` with RLS enabled and three policies. |
| 4 | A column-level REVOKE/GRANT migration ships so no authenticated user can read private fields via direct PostgREST | VERIFIED | Migration 040 line 70: `REVOKE SELECT ON artist_profiles FROM authenticated, anon`. Lines 71-83: `GRANT SELECT (id, artist_name, genre, genres, sound_identity, location, bio, career_stage, instagram_handle, threads_handle, tiktok_handle, spotify_url, monthly_listeners, total_streams, industry_roles, handle, member_type, pronouns, banner_url, open_to, featured_project_id, search_vector, avatar_url, verified, roles, is_public, created_at, updated_at, claimed_at) ON artist_profiles TO authenticated, anon`. All 11+ PRIVATE columns (legal_first_name, legal_last_name, legal_middle_name, legal_name_suffix, contact_phone, mailing_address, pro, ipi, publisher, mlc_id, soundexchange_id, isrc_country_code, isrc_registrant_code, isrc_year_counters) excluded from any GRANT. Line 98-104: REVOKE UPDATE + GRANT UPDATE (public owner-editable set only). |
| 5 | Industry-member identity is created without a `handle_new_user()` phantom-row race; role set at `admin.createUser()` time; early-return branch added | VERIFIED | `createIndustryMember()` line 34: `app_metadata: { role: 'industry' }` set inside `admin.createUser()` — not a post-insert UPDATE. Migration 039 lines 42-73: `handle_new_user()` branches on `NEW.raw_app_meta_data->>'role' = 'industry'` (server-controlled, not user-settable); industry branch executes a real `INSERT INTO public.artist_profiles (id, member_type, artist_name, industry_roles, roles)` with subscriptions row (D-18), then `RETURN NEW` — no bare RETURN NEW, no phantom row. |

**Score:** 5/5 truths verified in SQL/code (live-DB execution pending migration push)

### Post-Review Fixes (CR-01 through WR-05) — All Confirmed Present

| Fix | Commit | Verified |
|-----|--------|---------|
| CR-01: Six session-bound artist_profiles reads switched to `createServiceClient()` | e359d99 | Confirmed in pitchplug/route.ts:77, tools/[slug]/route.ts:64, documents/generate/route.ts:105, campaigns/route.ts:84, slots/.../generate/route.ts:69, rights/page.tsx:82 |
| CR-02: ISRC route and benchmarks route converted to service client for private columns | f23c11a | Confirmed in isrc/route.ts:57 (select + update both via service), benchmarks/route.ts:42 (select + update both via service) |
| CR-03: `claimed_at` added to migration 040 SELECT grant | 0cfcb3c | Confirmed in migration 040 lines 78-82 |
| CR-04: connections UPDATE policies replaced with two targeted policies + WITH CHECK + column-restricted GRANT UPDATE (status) | 8b74d4d | Confirmed in migration 035 lines 58-72: `connections_update_addressee` (WITH CHECK addressee + status IN ('accepted', 'declined')), `connections_update_requester_withdraw` (WITH CHECK requester + status = 'withdrawn'), REVOKE UPDATE + GRANT UPDATE (status) |
| WR-01: `clear_featured_if_unpublished()` made SECURITY DEFINER SET search_path = '' | 2928c04 | Confirmed in migration 034 line 92: `RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''` |
| WR-02: `check_handle_not_reserved()` BEFORE UPDATE trigger added to migration 037 | 5ccb6b5 | Confirmed in migration 037 lines 35-52: function with SECURITY DEFINER SET search_path = '', trigger `BEFORE UPDATE OF handle ON public.artist_profiles` |
| WR-03/WR-04: createIndustryMember() distinguishes duplicate vs. transient errors; returns `{ userId, emailSent }` | 3fced99 | Confirmed in createIndustryMember.ts lines 49-56 (email_exists branch vs. generic throw), line 77-79 (emailSent returned). MembersAdmin.tsx lines 99-115 display amber warning when emailSent=false |
| WR-05: HTML-escaping in industryInvite.ts | ba8b879 | Confirmed in industryInvite.ts lines 12-16 (`esc()` helper escaping `&`, `<`, `>`, `"`), applied to both displayName and actionLink |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/034_member_identity_wave4.sql` | member_type, search_vector, GIN index, featured-spotlight triggers | VERIFIED | 105 lines; all required elements present |
| `supabase/migrations/035_connections_blocks.sql` | connections, blocks, no_block() with SECURITY DEFINER | VERIFIED | 151 lines; CR-04 fix present |
| `supabase/migrations/036_notifications_dm_reads.sql` | actor-snapshot columns, realtime publication, dm_thread_reads | VERIFIED | 65 lines; all required elements present |
| `supabase/migrations/037_reserved_handles.sql` | reserved_handles + seed + WR-02 enforcement trigger | VERIFIED | 119 lines; trigger present |
| `supabase/migrations/038_block_enforcement_existing_tables.sql` | no_block() wired into follows/wall_posts/endorsements/dm_threads/dm_messages | VERIFIED | 68 lines; all 5 tables covered |
| `supabase/migrations/039_handle_new_user_industry_branch.sql` | handle_new_user() with industry branch keyed on app_metadata | VERIFIED | 90 lines; industry branch present |
| `supabase/migrations/040_artist_profiles_column_privileges.sql` | REVOKE/GRANT column-privilege lockdown; 11+ private columns excluded | VERIFIED | 120 lines; complete REVOKE + targeted GRANTs |
| `lib/industry/createIndustryMember.ts` | Standalone helper with atomic app_metadata.role set | VERIFIED | Returns { userId, emailSent }; WR-03/WR-04 fixes applied |
| `lib/industry/roleMapping.ts` | slug->ProfileRole preset mapping | VERIFIED | Present; exports mapSlugsToProfileRoles, isValidRoleSlugList |
| `lib/email/industryInvite.ts` | Custom HTML invite with HTML escaping | VERIFIED | esc() helper applied to displayName and actionLink |
| `app/api/admin/members/route.ts` | verifyAdmin()-gated GET + POST | VERIFIED | Both handlers present; POST delegates to createIndustryMember |
| `app/(admin)/admin/members/page.tsx` | Per-page is_admin gate + MembersAdmin render | VERIFIED | Lines 15-17: explicit is_admin check + redirect |
| `components/admin/MembersAdmin.tsx` | emailSent warning banner when invite not delivered | VERIFIED | Lines 99-115: amber warning on !emailSent |
| `types/index.ts` | ArtistProfile type with member_type + search_vector | VERIFIED | Lines 380-381 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `createIndustryMember()` | `handle_new_user()` industry branch | `app_metadata.role='industry'` set in `admin.createUser()` atomically | WIRED | app_metadata.role='industry' set at createUser time; trigger branches on `raw_app_meta_data->>'role'` |
| migration 040 GRANT SELECT | `app/u/[handle]/page.tsx` explicit column list | Byte-identical set (D-11 drift prevention) | WIRED | Page select string matches grant exactly (both omit claimed_at from public render; claimed_at is in the grant for middleware use) |
| `no_block()` helper | follows/wall_posts/endorsements/dm_threads/dm_messages INSERT policies | migration 038 `WITH CHECK (... AND no_block(...))` | WIRED | All 5 tables covered in migration 038 |
| `clear_featured_if_unpublished()` | `artist_profiles.featured_project_id` cleanup | SECURITY DEFINER + `UPDATE public.artist_profiles` | WIRED | WR-01 fix confirmed; SECURITY DEFINER bypasses RLS for cross-user cleanup |

### Behavioral Spot-Checks

Step 7b: SKIPPED — no runnable entry points for server-side schema verification without a live database. The `supabase db push --dry-run` check (the plan's nominated behavioral check) cannot execute in this environment (no `supabase/config.toml`). Live-DB smoke assertions are routed to human verification.

### Probe Execution

No `probe-*.sh` files declared for this phase. Step 7c: SKIPPED.

### Requirements Coverage

No requirement IDs from REQUIREMENTS.md are assigned to Phase 8 (foundation phase — per the phase brief, every Phases 9-13 requirement depends on this schema). No orphaned requirements detected.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `supabase/migrations/039_handle_new_user_industry_branch.sql` | 90 | `SECURITY DEFINER` without `SET search_path = ''` (IN-08, known/unfixed info-level finding) | Info | Low: all table/function references are schema-qualified (`public.artist_profiles`, `public.subscriptions`, `public.claim_collaborators`), which mitigates search_path hijack; inconsistency with no_block() pattern but not exploitable in current state |
| `supabase/migrations/040_artist_profiles_column_privileges.sql` | 98 | `REVOKE UPDATE ON artist_profiles FROM authenticated` omits `anon` (IN-06, known/unfixed info-level finding) | Info | Defense-in-depth gap only; anon cannot match the `auth.uid() = id` RLS USING clause so UPDATE is unreachable by anon in practice |

No `TBD`, `FIXME`, or `XXX` markers found in any phase-8 migration or companion code file. No unreferenced debt markers.

### Human Verification Required

#### 1. Apply migrations 034-040 to the live Supabase project

**Test:** `supabase init` (or link an existing project), set `SUPABASE_ACCESS_TOKEN`, run `npx supabase db push --dry-run` and then `npm run db:push`.
**Expected:** All seven migrations (034-040) apply without error; exit code 0.
**Why human:** No `supabase/config.toml` exists in this repo; no linked project; `SUPABASE_ACCESS_TOKEN` unset. Documented in 08-05-SUMMARY.md as a known environment gap, not a code gap.

#### 2. Verify column-privilege lockdown (SC-4) is live

**Test:** As the `authenticated` role via direct PostgREST: `SELECT legal_first_name FROM artist_profiles LIMIT 1`.
**Expected:** PostgreSQL 42501 "permission denied for column legal_first_name".
**Why human:** Column-privilege enforcement is only verifiable against a live database with migration 040 applied.

#### 3. Verify owner self-service paths work after migration 040 (SC-4 companion fix)

**Test:** Log in as a seeded artist account with private fields (legal name, contact, PRO/IPI) populated. Visit `/settings` and `/profile`. Edit a legal-name field and save.
**Expected:** Pages load without 500 or 42501; private fields render and save correctly; the two-client-path split (session-bound ownership check, then service client for the actual read/write) works end-to-end.
**Why human:** Requires a live database with migration 040 applied.

#### 4. Verify public profile does not leak private fields (SC-4)

**Test:** Visit a public `/u/[handle]` page as a logged-out visitor. Inspect the network response for `artist_profiles` data.
**Expected:** Response contains only the 28 PUBLIC-grant columns; `legal_*`, `contact_phone`, `mailing_address`, `pro`, `ipi`, `publisher`, `mlc_id`, `soundexchange_id` are absent from the payload.
**Why human:** Requires live database to confirm the PostgREST grant restriction actually filters the response.

#### 5. Verify SC-5 end-to-end industry-member invite flow

**Test:** From `/admin/members`, invite a new email address with display name and role chips. Confirm:
- A `member_type='industry'` row exists in `artist_profiles` with `industry_roles` (TEXT[]) and `roles` (JSONB) populated from `user_metadata`.
- A `subscriptions` row with `tier='free'` was created by the trigger.
- The custom Resend invite email arrives with a working magic link.
- Re-inviting the same email returns 409 "This email has already been invited."

**Expected:** All four assertions pass.
**Why human:** Requires live Supabase database (trigger fires on `auth.users` insert), Resend API configured, and a real email inbox.

---

## Gaps Summary

No code-level gaps were found. All five success criteria are satisfied by the migration SQL and companion code that exist in the repository. The sole outstanding item is the known environment limitation: migrations 034-040 have not been pushed to any live Supabase project. This is a documented, non-code gap requiring a human with project credentials to complete the steps listed in `08-05-SUMMARY.md`.

The two info-level findings from the code review (IN-06: REVOKE UPDATE omits anon; IN-08: `handle_new_user()` SECURITY DEFINER without SET search_path) were intentionally left in scope for the info category and are not code-level failures — they are defense-in-depth inconsistencies with no current exploitability.

---

_Verified: 2026-07-05T20:04:25Z_
_Verifier: Claude (gsd-verifier)_
