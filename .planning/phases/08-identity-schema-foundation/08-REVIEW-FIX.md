---
phase: 08-identity-schema-foundation
fixed_at: 2026-07-05T06:30:00Z
review_path: .planning/phases/08-identity-schema-foundation/08-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-07-05T06:30:00Z
**Source review:** `.planning/phases/08-identity-schema-foundation/08-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (CR-01 through CR-04, WR-01 through WR-05)
- Fixed: 9
- Skipped: 0

## Fixed Issues

### CR-01: Migration 040 breaks six session-bound artist_profiles reads

**Files modified:** `app/(artist)/vault/[projectId]/rights/page.tsx`, `app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/generate/route.ts`, `app/api/launchpad/[projectId]/campaigns/route.ts`, `app/api/tools/[slug]/route.ts`, `app/api/tools/pitchplug/route.ts`, `app/api/vault/[projectId]/documents/generate/route.ts`
**Commit:** `e359d99`
**Applied fix:** Each file: kept auth.getUser() ownership check via the session client, then replaced the artist_profiles read with `createServiceClient()` scoped to the verified `user.id` (D-19 pattern). The rights page additionally switched from `createServerClient` to the service client for its private-column select (`pro`, `ipi`, `soundexchange_id`).

---

### CR-02: ISRC route and benchmarks route break under migration 040 UPDATE grant gaps

**Files modified:** `app/api/vault/[projectId]/tracks/[trackId]/isrc/route.ts`, `app/api/benchmarks/route.ts`, `supabase/migrations/040_artist_profiles_column_privileges.sql`
**Commit:** `f23c11a`
**Applied fix:** ISRC route: converted both the private-column SELECT (`isrc_country_code`, `isrc_registrant_code`, `isrc_year_counters`) and the counter UPDATE to use `createServiceClient()`. Benchmarks route: converted both the `sound_identity` merge-read and the UPDATE to `createServiceClient()`. Corrected migration 040's comments (deploy-ordering list now includes all 12 companion files; removed the false claim that `sound_identity` is not written by any session route; corrected the PRIVATE column comment about ISRC handling).

---

### CR-03: middleware.ts selects claimed_at with no SELECT grant — collaborator-claim silently dies

**Files modified:** `supabase/migrations/040_artist_profiles_column_privileges.sql`
**Commit:** `0cfcb3c`
**Applied fix:** Added `claimed_at` to migration 040's `GRANT SELECT` list with a comment explaining it is a non-PII timestamp sentinel required by the Phase 4 collaborator-claim middleware check. No code changes to middleware.ts were needed — the middleware pattern is correct; only the grant was missing.

---

### CR-04: connections UPDATE policy allows self-accept and pair rewrite

**Files modified:** `supabase/migrations/035_connections_blocks.sql`
**Commit:** `8b74d4d`
**Applied fix:** Replaced the single open `connections_update_participant` policy (no WITH CHECK, no column restriction) with two targeted policies:
- `connections_update_addressee`: addressee transitions `pending -> accepted | declined` with explicit `WITH CHECK`
- `connections_update_requester_withdraw`: requester transitions `pending -> withdrawn` with explicit `WITH CHECK`

Added `REVOKE UPDATE ON connections FROM authenticated` + `GRANT UPDATE (status) ON connections TO authenticated` to close the column-rewrite vector. Added corresponding `DROP POLICY IF EXISTS` guards for idempotency.

---

### WR-01: clear_featured_if_unpublished() runs under invoker RLS — silently no-ops for other users' profiles

**Files modified:** `supabase/migrations/034_member_identity_wave4.sql`
**Commit:** `2928c04`
**Applied fix:** Added `SECURITY DEFINER SET search_path = ''` to `clear_featured_if_unpublished()` and schema-qualified the UPDATE target to `public.artist_profiles`. Without SECURITY DEFINER the function ran as the project owner (invoking user), so the "Artists manage own profile" RLS policy filtered the UPDATE to only their own row — user A who featured user B's project was never cleaned up, leaving a dangling private-draft UUID in the public SELECT grant (T-08-01 information disclosure).

---

### WR-02: reserved_handles never enforced — any authenticated user can claim a reserved handle via PostgREST

**Files modified:** `supabase/migrations/037_reserved_handles.sql`
**Commit:** `5ccb6b5`
**Applied fix:** Added `check_handle_not_reserved()` trigger function (`SECURITY DEFINER SET search_path = ''`) with a `BEFORE UPDATE OF handle ON public.artist_profiles` trigger. The function checks `lower(NEW.handle)` against `public.reserved_handles` and raises an exception if found. The check is skipped when the handle is unchanged (`IS DISTINCT FROM` guard). Added matching `DROP TRIGGER IF EXISTS` for idempotency.

---

### WR-03/WR-04: createIndustryMember conflates all createUser failures with "duplicate email" and silently discards email delivery failures

**Files modified:** `lib/industry/createIndustryMember.ts`, `app/api/admin/members/route.ts`, `components/admin/MembersAdmin.tsx`
**Commit:** `3fced99`
**Applied fix (WR-03):** Replaced the catch-all `DuplicateIndustryMemberError` throw with a branch: only `createError.code === 'email_exists' || createError.status === 422` maps to the duplicate error; all other failures throw a generic `Error` with the actual error message, which the route's existing 500 handler surfaces to the admin.

**Applied fix (WR-04):** `createIndustryMember()` now returns `{ userId, emailSent: boolean }` instead of `{ userId }`. The route includes `emailSent` in the 201 response body. `MembersAdmin` reads `emailSent` and, when `false`, displays a persistent amber warning banner telling the admin that the account was created but the invite email was not delivered, and that the member can still sign in via `/signin`.

---

### WR-05: industryInviteEmail interpolates displayName into HTML without escaping

**Files modified:** `lib/email/industryInvite.ts`
**Commit:** `ba8b879`
**Applied fix:** Added an `esc()` helper that escapes `&`, `<`, `>`, and `"`. Applied to both `displayName` and `actionLink` in the template string. Defends against HTML injection into Funun-branded transactional email (phishing content, tracking pixels, layout spoofing) when `createIndustryMember()` is eventually called from a self-serve flow where `displayName` is attacker-controlled.

---

## Skipped Issues

None — all in-scope findings were fixed.

---

## TypeScript Result

`npx tsc --noEmit` exits non-zero with 5 pre-existing errors in `components/profile/AddressAutocomplete.tsx` (missing `google` Maps type declarations). These errors are unrelated to all files modified in this fix run and were present before any changes. No new type errors were introduced.

---

_Fixed: 2026-07-05T06:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
