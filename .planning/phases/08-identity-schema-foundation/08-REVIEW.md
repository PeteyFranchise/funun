---
phase: 08-identity-schema-foundation
reviewed: 2026-07-05T04:21:51Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - app/(admin)/admin/members/page.tsx
  - app/(admin)/layout.tsx
  - app/(artist)/settings/page.tsx
  - app/api/admin/members/route.ts
  - app/api/profile/route.ts
  - app/profile/page.tsx
  - app/u/[handle]/page.tsx
  - components/admin/MembersAdmin.tsx
  - lib/email/industryInvite.ts
  - lib/industry/createIndustryMember.ts
  - lib/industry/roleMapping.ts
  - lib/profile/load.ts
  - supabase/migrations/034_member_identity_wave4.sql
  - supabase/migrations/035_connections_blocks.sql
  - supabase/migrations/036_notifications_dm_reads.sql
  - supabase/migrations/037_reserved_handles.sql
  - supabase/migrations/038_block_enforcement_existing_tables.sql
  - supabase/migrations/039_handle_new_user_industry_branch.sql
  - supabase/migrations/040_artist_profiles_column_privileges.sql
  - types/index.ts
findings:
  critical: 4
  warning: 5
  info: 8
  total: 17
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-07-05T04:21:51Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Reviewed the Phase 8 identity/schema work: 7 migrations (034–040), the admin industry-member invite flow, the migration-040 companion code fixes, and the profile pages. The parts that were explicitly called out as security-sensitive are mostly sound: the `/api/admin/members` route re-verifies `is_admin` via `verifyAdmin()` before any service-role use; the admin page repeats the check server-side; `no_block()` is correctly `SECURITY DEFINER` with `SET search_path = ''` and fully-qualified references; `handle_new_user()`'s industry branch is keyed on server-controlled `raw_app_meta_data` (not user-settable metadata); and the `/u/[handle]` public path selects an explicit column list that exactly matches migration 040's `GRANT SELECT` list.

However, the migration-040 companion fix is materially incomplete. The migration's own comment claims only four files needed switching to the service client. Cross-referencing every `artist_profiles` call site in the codebase shows at least nine additional session-bound (authenticated-role) reads/writes of now-ungranted columns — including `middleware.ts` (runs on every authenticated navigation), the ISRC assignment route, the benchmarks save route, PitchPlug, the tools registry route, LaunchPad campaign generation, document generation, and the rights page. All of these fail with Postgres 42501 (or silently degrade) the moment migration 040 is applied. Separately, the `connections` UPDATE policy allows a requester to self-accept their own connection request via direct PostgREST, and the featured-project unpublish trigger can silently no-op under RLS.

## Critical Issues

### CR-01: Migration 040 breaks at least six session-bound artist_profiles reads outside the four "companion fix" files

**File:** `supabase/migrations/040_artist_profiles_column_privileges.sql:34-42` (deploy-ordering comment), plus the call sites below
**Issue:** Migration 040 revokes blanket SELECT and re-grants only public columns to `authenticated`/`anon`. As the migration itself notes, Postgres fails the *whole* query on a `SELECT *` (or any select naming an ungranted column) — but the companion fix only covered `app/u/[handle]/page.tsx`, `app/(artist)/settings/page.tsx`, `app/profile/page.tsx`, and `app/api/profile/route.ts`. These session-bound (authenticated-role) call sites were missed and will return 42501 the instant the migration lands:

- `app/api/tools/pitchplug/route.ts:74-77` — `.select('*')` via `createApiClient()`. PitchPlug breaks.
- `app/api/tools/[slug]/route.ts:61-64` — `.select('*')` via `createApiClient()`. All registry tools break.
- `app/api/vault/[projectId]/documents/generate/route.ts:101-104` — `.select('*')` via `createApiClient()`. Document generation loses/errors on the artist's legal-name and contact fields it exists to consume.
- `app/api/launchpad/[projectId]/campaigns/route.ts:82-86` — `.select('*')` via `createApiClient()`, and the error is masked by `const profile = (profileRow ?? { artist_name: null })`, so campaign creation silently proceeds with an empty profile (silent-failure anti-pattern).
- `app/api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/generate/route.ts:66-69` — `.select('*')` via `createApiClient()`.
- `app/(artist)/vault/[projectId]/rights/page.tsx:78-81` — `.select('id, artist_name, pro, ipi, soundexchange_id')` via `createServerClient()`. `pro`, `ipi`, `soundexchange_id` are PRIVATE (no grant) → whole query fails → the rights page silently renders with no registration data.

**Fix:** For each owner-scoped route: keep the session-bound `auth.getUser()` ownership check, then perform the read via `createServiceClient()` filtered by the verified `user.id` (the exact D-19 pattern already applied in `app/profile/page.tsx:98-100`). For the rights page:
```typescript
const service = createServiceClient()
const { data: profile } = await service
  .from('artist_profiles')
  .select('id, artist_name, pro, ipi, soundexchange_id')
  .eq('id', user.id)
  .maybeSingle()
```
Do not deploy migration 040 until every listed call site is converted.

### CR-02: Migration 040 UPDATE grant omits columns actively written by session-bound routes (ISRC assignment and benchmarks are fully broken)

**File:** `supabase/migrations/040_artist_profiles_column_privileges.sql:81-87`
**Issue:** The `GRANT UPDATE` column list excludes `isrc_year_counters` and `sound_identity`, but session-bound routes write both:

- `app/api/vault/[projectId]/tracks/[trackId]/isrc/route.ts:54-57` selects `isrc_country_code, isrc_registrant_code, isrc_year_counters` (none granted SELECT) and `:89-91` updates `isrc_year_counters` (not granted UPDATE) via `createApiClient()`. ISRC self-assignment 42501s on both the read and the write. Migration 040's closing comment (lines 98-103) asserts these columns "already write... via the service-role client after this plan's Task 2 fix" — that is false; the route still uses `createApiClient()`.
- `app/api/benchmarks/route.ts:50-52` updates `sound_identity` (plus `monthly_listeners`) via `createApiClient()`. `sound_identity` has no UPDATE grant, so the whole statement fails and benchmark saves break. Migration 040's comment (lines 77-80) claims `sound_identity` is "not present in EDITABLE_FIELDS... or ProfileForm's write path today" — it missed this write path entirely.

**Fix:** Either (a) convert both routes to the ownership-check-then-`createServiceClient()` pattern, or (b) add `sound_identity` to the UPDATE grant (it is already public-SELECT) and handle the ISRC columns via the service client (they are deliberately private). Option (a) for the ISRC route + adding `sound_identity` to the UPDATE grant is the smallest correct change. Correct the migration comments so they match reality.

### CR-03: middleware.ts selects `claimed_at` (no SELECT grant) — collaborator-claim flow silently dies for every new signup after migration 040

**File:** `middleware.ts:42-48` (broken by `supabase/migrations/040_artist_profiles_column_privileges.sql:60-68`)
**Issue:** The middleware runs on every authenticated navigation and does:
```typescript
const { data: ap } = await supabase
  .from('artist_profiles')
  .select('claimed_at')
  .eq('id', session.user.id)
  .maybeSingle()
if (ap && ap.claimed_at === null) { /* fire claim */ }
```
`claimed_at` (migration 026) is not in migration 040's `GRANT SELECT` list, so this query returns a 42501 error on every request. The error object is discarded, `ap` is `null`, the `ap && ...` guard is false, and `/api/claim-collaborators` is never fired again. Result: Phase 4's collaborator-claim linking silently stops working for all new users — no error surfaces anywhere. This is the exact "Silent Failures" anti-pattern the project CLAUDE.md forbids.

**Fix:** Add `claimed_at` to migration 040's `GRANT SELECT` list (it is a non-PII timestamp sentinel; exposing it is harmless), or move the sentinel check behind a service-role API call. Adding the column to the grant is the one-line fix:
```sql
GRANT SELECT (id, ..., claimed_at) ON artist_profiles TO authenticated, anon;
```

### CR-04: connections UPDATE policy lets a requester self-accept their own request and lets participants re-point the row

**File:** `supabase/migrations/035_connections_blocks.sql:53-54`
**Issue:**
```sql
CREATE POLICY "connections_update_participant" ON connections FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());
```
No `WITH CHECK` and no column restriction. Since the table is exposed via PostgREST today:
1. A user INSERTs a pending request to any victim (allowed by `connections_insert_own`), then UPDATEs their own row to `status = 'accepted'` — forging a mutual "accepted" connection without the addressee's consent. When `WITH CHECK` is omitted, Postgres reuses the `USING` clause for the new row, and `requester_id = auth.uid()` still holds, so the update succeeds.
2. Either participant can also rewrite `requester_id` or `addressee_id` (the new row passes `USING` as long as one of the two columns still equals `auth.uid()`), re-pointing an existing request at a third party.

The comment says state transitions "happen through the API layer in Phase 10", but RLS is the actual security boundary — direct PostgREST calls bypass any future API-layer checks permanently. Anything in Phases 10/11/13 that trusts `status = 'accepted'` (e.g. DM/visibility gating) inherits this bypass.

**Fix:** Until Phase 10 ships real transition logic, restrict the policy so only the addressee can transition a pending request, and freeze the pair columns, e.g.:
```sql
DROP POLICY "connections_update_participant" ON connections;
CREATE POLICY "connections_update_addressee" ON connections FOR UPDATE TO authenticated
  USING (addressee_id = auth.uid() AND status = 'pending')
  WITH CHECK (addressee_id = auth.uid() AND status IN ('accepted', 'declined'));
CREATE POLICY "connections_update_requester_withdraw" ON connections FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() AND status = 'pending')
  WITH CHECK (requester_id = auth.uid() AND status = 'withdrawn');
REVOKE UPDATE ON connections FROM authenticated;
GRANT UPDATE (status) ON connections TO authenticated;
```
(The column-level `GRANT UPDATE (status)` also closes the requester_id/addressee_id rewrite.)

## Warnings

### WR-01: clear_featured_if_unpublished() runs under invoker RLS — silently no-ops for other users' profiles, defeating its own T-08-01 purpose

**File:** `supabase/migrations/034_member_identity_wave4.sql:80-93`
**Issue:** `check_featured_project_is_public()` only requires the featured project to be `is_public = true` — not owned by the featuring user — so user A can legitimately feature user B's public project. When B later unpublishes, `clear_featured_if_unpublished()` fires as B (no `SECURITY DEFINER`), and its `UPDATE artist_profiles SET featured_project_id = NULL WHERE featured_project_id = NEW.id` is filtered by the "Artists manage own profile" RLS policy (`auth.uid() = id`) — it silently updates zero rows on A's profile. A's `featured_project_id` now dangles at a private project UUID, and that column is in migration 040's public SELECT grant, so the private-draft project id leaks — exactly the T-08-01 information-disclosure scenario this trigger was built to prevent. Additionally, `featured_project_id` has no FK to `vault_projects`, so a hard DELETE of a project also leaves a dangling public pointer with no trigger coverage.
**Fix:** Make the cleanup trigger definer-owned and path-hardened:
```sql
CREATE OR REPLACE FUNCTION clear_featured_if_unpublished()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ ... $$;
```
and add an `AFTER DELETE ON vault_projects` trigger (or an FK with `ON DELETE SET NULL`) for the deletion case. Alternatively, require ownership in `check_featured_project_is_public()` so only self-owned projects can be featured.

### WR-02: reserved_handles is never enforced while migration 040 grants UPDATE(handle) to every authenticated user

**File:** `supabase/migrations/037_reserved_handles.sql` and `supabase/migrations/040_artist_profiles_column_privileges.sql:82-87`
**Issue:** Migration 037 creates and seeds `reserved_handles`, but no trigger, constraint, or reviewed code path checks it. Meanwhile migration 040 explicitly grants `UPDATE (handle)` on `artist_profiles` to `authenticated`. `handle` is not in the app's `EDITABLE_FIELDS` (`app/api/profile/route.ts:8-34`), so the app never writes it — but any authenticated user can bypass the app entirely and set `handle = 'admin'`, `'funun'`, `'verified'`, etc. via direct PostgREST on their own row (RLS own-row policy permits it; only the `lower(handle)` unique index constrains it). There is also no format validation at the DB layer. This defeats the impersonation protection the reserved list exists to provide.
**Fix:** Until the Phase 12/13 handle-claim flow ships with enforcement, remove `handle` from the UPDATE grant, or add a BEFORE UPDATE trigger:
```sql
CREATE OR REPLACE FUNCTION check_handle_not_reserved() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.handle IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.reserved_handles WHERE handle = lower(NEW.handle)
  ) THEN RAISE EXCEPTION 'handle is reserved'; END IF;
  RETURN NEW;
END $$;
```

### WR-03: DuplicateIndustryMemberError conflates every createUser failure with "duplicate email"

**File:** `lib/industry/createIndustryMember.ts:43-52`
**Issue:** Any `admin.createUser()` error — transient network failure, bad service key, malformed metadata, Supabase outage — is thrown as `DuplicateIndustryMemberError`, which the route (`app/api/admin/members/route.ts:99-101`) maps to `409 This email has already been invited.` An admin retrying after a transient failure is told the invite already exists when no account was ever created, with no path to discover the truth.
**Fix:** Branch on the actual duplicate signal before assuming duplicate:
```typescript
if (createError) {
  if (createError.code === 'email_exists' || createError.status === 422) {
    throw new DuplicateIndustryMemberError(createError.message)
  }
  throw new Error(`Failed to create industry member: ${createError.message}`)
}
```

### WR-04: Invite email failures are silently swallowed — account created, 201 returned, no email sent, and no resend path exists

**File:** `lib/industry/createIndustryMember.ts:70` and `app/api/admin/members/route.ts:47-104`
**Issue:** `sendEmail()` returns `{ ok: false, error }` on failure (Resend unconfigured, API error — see `lib/email/index.ts:36-53`); the result is discarded at line 70, so the route returns 201 and the admin believes the invite was delivered. If `generateLink()` fails instead, the error is thrown *after* `createUser()` succeeded — the account exists with no invite delivered. In both partial-failure states, a retry hits the duplicate branch (409 "already been invited"), and `MembersAdmin` is create-only with no resend action — the invited member is permanently stuck (they can still self-serve a magic link at `/signin`, but nothing tells the admin or the member that). Magic links also expire (default OTP TTL), compounding the no-resend gap.
**Fix:** Check the `sendEmail` result and surface delivery failure to the caller (e.g. return `{ userId, emailSent: boolean }` and show a warning in the UI), and/or add a resend action that calls `generateLink` + `sendEmail` for an existing industry member instead of failing 409.

### WR-05: industryInviteEmail interpolates displayName into HTML without escaping

**File:** `lib/email/industryInvite.ts:13`
**Issue:** `html: \`<p>Hi ${displayName},</p>...\`` — no HTML escaping. Today `displayName` comes from a trusted admin form, but `createIndustryMember()` is explicitly documented (lines 10-12) as reusable by "a future self-serve industry signup flow", at which point `displayName` becomes attacker-controlled and this is HTML injection into a Funūn-branded transactional email (phishing content, tracking pixels, layout spoofing around the real sign-in link).
**Fix:** Escape interpolated values:
```typescript
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
html: `<p>Hi ${esc(displayName)},</p>...`
```

## Info

### IN-01: GET /api/admin/members is dead code; its logic is duplicated in the server page

**File:** `app/api/admin/members/route.ts:15-41`, `app/(admin)/admin/members/page.tsx:19-34`
**Issue:** Nothing calls the GET handler (`MembersAdmin` only POSTs; the page does its own identical service query + per-row `getUserById` email attach). Two copies of the same list-building logic will drift.
**Fix:** Either have the page (or a shared `lib/admin/members.ts` helper) be the single source, or delete the GET handler until something consumes it.

### IN-02: Second DEMO_PROFILE defined in settings page instead of reusing lib/profile/load.ts

**File:** `app/(artist)/settings/page.tsx:9-52`
**Issue:** A full 44-field `DEMO_PROFILE` literal duplicates `lib/profile/load.ts:17-64` (different values, same shape). Every future `ArtistProfile` column addition must now be made in two places.
**Fix:** Export one demo profile from `lib/profile/load.ts` and spread-override the settings-specific values.

### IN-03: isValidRoleSlugList accepts duplicate slugs → duplicate badges and duplicate industry_roles entries

**File:** `lib/industry/roleMapping.ts:26-48`
**Issue:** `["producer","producer"]` passes validation; `mapSlugsToProfileRoles` dedupes presets but not custom-badge slugs (e.g. `["mixing_engineer","mixing_engineer"]` yields two identical custom badges), and the raw slug array is stored verbatim in `industry_roles`. The UI prevents this, but the API contract does not.
**Fix:** Dedupe in the route or in `isValidRoleSlugList` (`new Set(slugs).size === slugs.length` or normalize with `Array.from(new Set(slugs))`).

### IN-04: 038 policies call no_block() bare, contradicting 035's documented (SELECT no_block(...)) wrapping

**File:** `supabase/migrations/038_block_enforcement_existing_tables.sql:33,38,43,52,66` vs `supabase/migrations/035_connections_blocks.sql:108-109,132`
**Issue:** Migration 035's rationale for `STABLE` (and its COMMENT) says the function is intended to be wrapped as `(SELECT no_block(...))` inside policies for per-statement caching; migration 038 uses bare calls everywhere. Behavior is identical, but the documented contract and the implementation disagree.
**Fix:** Wrap the calls or amend the 035 comment.

### IN-05: dm_thread_reads INSERT policy does not require the user to be a thread participant

**File:** `supabase/migrations/036_notifications_dm_reads.sql:61-62`
**Issue:** `WITH CHECK (user_id = auth.uid())` lets any authenticated user insert read-markers for threads they do not participate in (junk rows; FK errors also confirm thread-id existence, though UUID enumeration is impractical).
**Fix:** Add a participant check: `AND EXISTS (SELECT 1 FROM dm_threads t WHERE t.id = thread_id AND (t.a_id = auth.uid() OR t.b_id = auth.uid()))`.

### IN-06: Migration 040 revokes UPDATE only from authenticated, leaving anon's default column-level UPDATE grant intact

**File:** `supabase/migrations/040_artist_profiles_column_privileges.sql:81`
**Issue:** `REVOKE SELECT ... FROM authenticated, anon` covers both roles, but `REVOKE UPDATE ON artist_profiles FROM authenticated` omits `anon`. Supabase's default bootstrap grants ALL to both roles, so `anon` retains blanket column UPDATE. RLS ("Artists manage own profile", `auth.uid() = id`) matches zero rows for anon, so this is not exploitable today — but it is a defense-in-depth inconsistency with the migration's own pattern.
**Fix:** `REVOKE UPDATE ON artist_profiles FROM authenticated, anon;` (no re-grant to anon).

### IN-07: getUserById failures render silently as empty email in the admin list

**File:** `app/(admin)/admin/members/page.tsx:31-33`, `app/api/admin/members/route.ts:34-37`
**Issue:** If `auth.admin.getUserById` errors (rate limit, deleted user), the row renders `" · Joined ..."` with a blank email and no indication anything failed.
**Fix:** Fall back to a visible placeholder (e.g. `'(email unavailable)'`) or log the lookup error.

### IN-08: handle_new_user() is SECURITY DEFINER without SET search_path

**File:** `supabase/migrations/039_handle_new_user_industry_branch.sql:39-90`
**Issue:** All table/function references are schema-qualified (`public.artist_profiles`, `public.subscriptions`, `public.claim_collaborators`), which mitigates hijacking, but the function does not pin `search_path` the way `no_block()` (migration 035) deliberately does. Inconsistent hardening across the same phase's SECURITY DEFINER functions.
**Fix:** Add `SET search_path = ''` to the function definition for parity with the no_block() hardening.

---

_Reviewed: 2026-07-05T04:21:51Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
