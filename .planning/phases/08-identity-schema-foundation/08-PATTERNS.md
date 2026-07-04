# Phase 8: Identity & Schema Foundation - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 13 (7 new migrations, 1 new lib helper, 1 new email template, 2 new admin route files, 4 modified read-path files)
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/034_member_identity_wave4.sql` | migration | CRUD (DDL) | `supabase/migrations/020_artist_profile_rights_fields.sql` / `022_artist_profile_genres_array.sql` (additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) | exact |
| `supabase/migrations/035_pending_industry_invites.sql` | migration | event-driven (trigger-consumed) | `supabase/migrations/030_curators_pitch_history.sql` (new table + RLS + `handle_new_user()` branch) | exact |
| `supabase/migrations/036_connections_blocks.sql` | migration | CRUD | `supabase/migrations/012_social_layer.sql` (`follows` table shape: composite PK, CHECK, RLS) | exact |
| `supabase/migrations/037_notifications_dm_reads.sql` | migration | event-driven / streaming (realtime) | `supabase/migrations/009_antenna_notifications.sql` (`notifications` table + RLS) and `014_dm_realtime.sql` (realtime publication pattern) | exact |
| `supabase/migrations/038_artist_profiles_column_privileges.sql` | migration | request-response (privilege DDL) | `supabase/migrations/031_curators_column_privileges.sql` | exact |
| `supabase/migrations/039_block_enforcement_existing_tables.sql` | migration | CRUD (RLS policy edit) | `supabase/migrations/012_social_layer.sql` (existing INSERT policies on `follows`/`wall_posts`/`endorsements`/`dm_threads`) | exact |
| `supabase/migrations/040_reserved_handles.sql` | migration | CRUD (seed data) | `supabase/migrations/010_public_showcase_profile.sql` (handle column + seed-style migration) | role-match |
| `lib/industry/createIndustryMember.ts` (new) | service | request-response | Curator claim/invite precedent in `supabase/migrations/030_curators_pitch_history.sql` + `lib/admin/gate.ts` (server-side orchestration pattern); no direct `lib/` analog exists — closest is `lib/curators/reach.ts`'s standalone-function shape | role-match |
| `lib/email/industryInvite.ts` (new, Resend template) | utility | request-response | No existing Resend template in `lib/` found by this pass — check `lib/` for existing `resend` usage before writing from scratch (see "No Analog Found") | none |
| `app/(admin)/admin/members/page.tsx` (new) | component (server page) | request-response | `app/(admin)/admin/curators/page.tsx` | exact |
| `app/api/admin/members/route.ts` (new) | route (API handler) | CRUD | `app/api/admin/curators/route.ts` | exact |
| `app/(artist)/settings/page.tsx` (modify — 2 sites) | component (server page) | CRUD (owner self-read) | Same file's own `.select('*')` calls; pattern source for the fix is `lib/supabase/server.ts`'s `createServiceClient()` + `lib/admin/gate.ts`'s ownership-check style | exact |
| `app/profile/page.tsx` (modify) | component (server page) | CRUD (owner self-read) | same as above | exact |
| `app/u/[handle]/page.tsx` (modify) | component (server page) | request-response (public read) | same file, explicit column list needed | exact |
| `app/api/profile/route.ts` (modify PATCH) | route (API handler) | CRUD | same file (already has `EDITABLE_FIELDS` allowlist pattern) — needs service-client swap for private-field writes | exact |

## Pattern Assignments

### `supabase/migrations/034_member_identity_wave4.sql` (migration, CRUD/DDL)

**Analog:** `supabase/migrations/022_artist_profile_genres_array.sql` and `020_artist_profile_rights_fields.sql`

**Core pattern** — additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` with inline `CHECK`:
```sql
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS member_type TEXT NOT NULL DEFAULT 'artist'
    CHECK (member_type IN ('artist', 'industry'));
```
Generated `tsvector` column + GIN index — no in-repo analog exists for `tsvector`; use RESEARCH.md's `Code Examples` skeleton verbatim (two-argument `to_tsvector('english', ...)`, `array_to_string()` for array columns). Follow the migration-file header comment convention seen in every migration (`-- ====...` banner + dated rationale, see 031's header lines 1-29).

**Trigger pattern for `featured_project_id` self-null** — no direct analog; closest structural precedent is `update_updated_at()` trigger function referenced in migration 030 line 51-54 (`CREATE TRIGGER ... FOR EACH ROW EXECUTE FUNCTION`). Follow that `CREATE TRIGGER` invocation shape.

---

### `supabase/migrations/035_pending_industry_invites.sql` + `handle_new_user()` industry branch (migration, event-driven)

**Analog:** `supabase/migrations/030_curators_pitch_history.sql` lines 1-127 (full file)

**Table + RLS pattern** (lines 13-36 of 030 — CREATE TABLE, immediately followed by `ENABLE ROW LEVEL SECURITY`):
```sql
CREATE TABLE curators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ...
);
ALTER TABLE curators ENABLE ROW LEVEL SECURITY;
```
Apply the identical shape to `pending_industry_invites` — service-role-only, no policies granted to `authenticated`/`anon` (mirrors the "no INSERT policy for users" comment style at line 82-85).

**`handle_new_user()` branch pattern** (lines 105-127) — this is the load-bearing analog for the industry branch. Copy the exception-isolation nested `BEGIN...EXCEPTION WHEN OTHERS THEN NULL...END` shape (lines 119-123) for the `pending_industry_invites` DELETE cleanup, and the "entire body copied verbatim from prior migration with new branch inserted" convention noted in the 030 comment (lines 100-104). **Critical divergence from analog:** unlike curators' bare `RETURN NEW` (line 108-110), the industry branch must INSERT an `artist_profiles` row per RESEARCH.md Pitfall 3 — do not copy the early-return shape verbatim, only the branch/exception-handling structure.

---

### `supabase/migrations/036_connections_blocks.sql` (migration, CRUD)

**Analog:** `supabase/migrations/012_social_layer.sql` lines 1-26 (`follows` table)

**Core pattern** — composite PK + CHECK + RLS immediately after CREATE TABLE:
```sql
CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows (followee_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "follows_select_all" ON follows;
CREATE POLICY "follows_select_all" ON follows FOR SELECT USING (true);
CREATE POLICY "follows_insert_own" ON follows FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());
```
Apply this exact `DROP POLICY IF EXISTS` + `CREATE POLICY` idempotent pairing to every new `connections`/`blocks` policy. Use RESEARCH.md's Architecture Patterns section for the actual `connections`/`blocks` column shapes (already fully drafted there with tradeoff rationale) — this analog supplies the idempotent-migration *style*, not the schema itself.

**`no_block()` SECURITY DEFINER pattern** — no in-repo analog (`SECURITY DEFINER` used elsewhere only in `handle_new_user()`, which is trigger-invoked, not a callable check function). Use RESEARCH.md's fully-specified `no_block()` code block verbatim (`LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''`).

---

### `supabase/migrations/037_notifications_dm_reads.sql` (migration, event-driven/streaming)

**Analog:** `supabase/migrations/009_antenna_notifications.sql` lines 62-91 (`notifications` table)

**Core pattern:**
```sql
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  ...
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own notifications" ON notifications;
CREATE POLICY "Users see own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
-- Inserts happen server-side via the service-role client ... no INSERT policy is granted to users.
```
Extend with `ADD COLUMN IF NOT EXISTS actor_id`, `actor_name`, `actor_avatar_url` (denormalized snapshot columns) using the same `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` idiom as migration 034.

**Realtime publication pattern** — check `supabase/migrations/014_dm_realtime.sql` for the exact `ALTER PUBLICATION supabase_realtime ADD TABLE ...` idempotent-guard shape referenced in RESEARCH.md's Standard Stack table (verified in-codebase precedent); mirror it for `notifications`.

**`dm_thread_reads` table** — no direct analog; treat as a simple two-column composite-PK table following the `follows` shape above (`thread_id`, `user_id`, `last_read_at`).

---

### `supabase/migrations/038_artist_profiles_column_privileges.sql` (migration, request-response/DDL)

**Analog:** `supabase/migrations/031_curators_column_privileges.sql` (full file, 77 lines) — **this is the exact, explicitly-named precedent (D-10)**.

**Core pattern** (lines 39-57):
```sql
REVOKE SELECT ON curators FROM authenticated, anon;
GRANT SELECT (id, name, playlist_name, ...) ON curators TO authenticated, anon;

REVOKE UPDATE ON curators FROM authenticated;
GRANT UPDATE (genre_focus, platform, ...) ON curators TO authenticated;
```
Apply verbatim to `artist_profiles` using RESEARCH.md's fully-drafted column lists (PUBLIC set / owner-editable set / private-no-grant set — see RESEARCH.md Code Examples, migration `038` skeleton, lines ~456-485). Reuse the analog's comment style explaining *why* each column is excluded (e.g., claim-token harvesting rationale at lines 30-38) — write equivalent rationale comments for the private PII columns here.

---

### `supabase/migrations/039_block_enforcement_existing_tables.sql` (migration, CRUD/RLS edit)

**Analog:** `supabase/migrations/012_social_layer.sql` — the existing INSERT policies to amend:
```sql
CREATE POLICY "follows_insert_own" ON follows FOR INSERT TO authenticated WITH CHECK (follower_id = auth.uid());
```
Pattern: `DROP POLICY IF EXISTS ...` then `CREATE POLICY ... WITH CHECK (follower_id = auth.uid() AND no_block(auth.uid(), followee_id))` — additive AND-clause onto the existing `WITH CHECK`, not a full policy rewrite. Apply the same to `wall_posts`, `endorsements`, `dm_threads`/`dm_messages` INSERT policies (all defined in migration 012).

---

### `supabase/migrations/040_reserved_handles.sql` (migration, CRUD/seed)

**Analog:** `supabase/migrations/010_public_showcase_profile.sql` (handle column + unique index precedent) for the idempotent `CREATE TABLE IF NOT EXISTS` + seed `INSERT` shape; no direct seed-data analog exists elsewhere in migrations — follow the plain `INSERT INTO ... VALUES (...), (...), ...` idiom, wrapped in `ON CONFLICT DO NOTHING` for re-run safety (idempotency convention consistent with every other migration's `IF NOT EXISTS`/`DROP POLICY IF EXISTS` style).

---

### `app/(admin)/admin/members/page.tsx` (component, request-response)

**Analog:** `app/(admin)/admin/curators/page.tsx` (full file, 31 lines)

**Full pattern to copy:**
```typescript
export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'

export default async function AdminMembersPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signin')
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) redirect('/')

  const service = createServiceClient()
  const { data: members } = await service
    .from('artist_profiles')
    .select('id, artist_name, member_type, industry_roles, roles, created_at')
    .eq('member_type', 'industry')
    .order('created_at', { ascending: false })

  return (
    <div className="flex-1 px-9 py-[30px]">
      <h1 className="text-2xl font-bold text-white">Members</h1>
      {/* MembersAdmin client component, mirroring CuratorAdmin */}
    </div>
  )
}
```
Also add a `Link href="/admin/members"` entry to `app/(admin)/layout.tsx`'s nav (lines 34-39 show the exact `<Link>` block to duplicate).

---

### `app/api/admin/members/route.ts` (route, CRUD)

**Analog:** `app/api/admin/curators/route.ts` (full file, 107 lines)

**Auth gate pattern** (lines 11-15, repeated at 32-35):
```typescript
const auth = await verifyAdmin()
if ('error' in auth) {
  return NextResponse.json({ error: auth.error }, { status: auth.status })
}
```

**POST handler / mass-assignment protection pattern** (lines 27-107): validate required fields first (`name`/`email`/`platform`-equivalent → `email`/`display_name`/`role_badges`), build the insert object strictly from an allowlist (mirrors `ADMIN_EDITABLE_FIELDS` looping pattern lines 58-81), handle unique-constraint violations explicitly:
```typescript
if (error) {
  if (error.code === '23505') {
    return NextResponse.json({ error: 'A curator with this email already exists' }, { status: 409 })
  }
  return NextResponse.json({ error: error.message }, { status: 500 })
}
```
For `/api/admin/members` POST, this becomes the entry point that calls `createIndustryMember()` (the new standalone lib helper — D-05) rather than a direct `.insert()`, but the validation/allowlist/error-shape conventions above should be copied identically.

---

### `lib/industry/createIndustryMember.ts` (service, request-response — new, no direct analog)

No existing `lib/` file performs "create an admin.createUser() account + orchestrate a side-channel table + send a custom email" as a single reusable function. Nearest structural precedents to combine:
- **Service-role orchestration + explicit error throwing:** `app/api/admin/curators/route.ts` lines 96-104 (`createServiceClient()`, destructure `{ data, error }`, throw/return on error) — reuse this call-and-check shape for `admin.createUser()` and the `pending_industry_invites` insert.
- **Function shape (standalone, pure, single-purpose):** CLAUDE.md's own convention — "Small, focused functions preferred," "Async functions return Result objects" — e.g. `{ userId, profileId }`.
- Error handling: throw descriptive `Error` instances per CLAUDE.md convention (`throw new Error('Failed to create industry member: ' + error.message)`), matching `lib/storage/index.ts`'s error style referenced in CLAUDE.md.

---

### `app/(artist)/settings/page.tsx`, `app/profile/page.tsx` (modify — owner self-read fix, Pitfall 1)

**Current code** (`app/profile/page.tsx` line 95):
```typescript
supabase.from('artist_profiles').select('*').eq('id', user.id).maybeSingle(),
```
**Fix pattern:** switch to `createServiceClient()` with an explicit ownership check performed first via the existing session-bound client, mirroring `lib/admin/gate.ts`'s `verifyAdmin()` shape (self-contained auth check returning either an error or the verified user):
```typescript
const supabase = createApiClient() // or createServerClient() for server components
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/signin')

const service = createServiceClient()
const { data: profile } = await service
  .from('artist_profiles')
  .select('*')
  .eq('id', user.id) // ownership check performed via user.id from the session-bound client, not client input
  .maybeSingle()
```
This is the exact "self-service routes independently re-verify row ownership server-side before using the service-role client" pattern RESEARCH.md Pitfall 1 specifies, modeled on the admin analog "admin routes independently re-verify is_admin server-side" (`lib/admin/gate.ts` / `app/(admin)/admin/curators/page.tsx` lines 9-17).

---

### `app/u/[handle]/page.tsx` (modify — public path fix, Pitfall 1)

**Current code** (line 109): `.select('*')`

**Fix pattern:** explicit PUBLIC column list matching D-11 exactly (see migration 038's GRANT SELECT column list above — reuse the identical list so the app-layer projection and the DB-layer grant never drift):
```typescript
.select('id, artist_name, genres, location, bio, career_stage, instagram_handle, threads_handle, tiktok_handle, spotify_url, monthly_listeners, total_streams, industry_roles, handle, member_type, pronouns, banner_url, open_to, featured_project_id, search_vector, avatar_url, verified, roles, is_public, created_at, updated_at')
```
Audit against `lib/profile/load.ts`'s `buildProfileData()` actual field usage before finalizing (per RESEARCH.md Pitfall 1 guidance) — do not over/under-select.

---

### `app/api/profile/route.ts` PATCH handler (modify — owner path fix, Pitfall 1)

**Current code** (lines 111-116) uses the session-bound `createApiClient()` client for both read-back and write:
```typescript
const { data, error } = await supabase
  .from('artist_profiles')
  .update(update)
  .eq('id', user.id)
  .select()
  .single()
```
**Fix pattern:** keep the `EDITABLE_FIELDS` allowlist exactly as-is (this is already correct mass-assignment protection — CLAUDE.md's own "Data Validation" convention), but swap the actual `.update()...select()` call to `createServiceClient()`, with the `auth.getUser()` ownership check (already present, lines 100-103) performed first via the session-bound client and its `user.id` used for the `.eq('id', user.id)` filter — same two-client-path split as the settings/profile page fix above.

## Shared Patterns

### Admin auth gate
**Source:** `lib/admin/gate.ts` (`verifyAdmin()`, lines 15-24)
**Apply to:** `app/api/admin/members/route.ts`, `app/(admin)/admin/members/page.tsx`
```typescript
export async function verifyAdmin(): Promise<VerifyAdminResult> {
  const supabase = createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  const isAdmin = (user.app_metadata as { is_admin?: boolean })?.is_admin === true
  if (!isAdmin) return { error: 'Forbidden', status: 403 }
  return { user }
}
```

### Idempotent RLS policy edits
**Source:** every table in `supabase/migrations/012_social_layer.sql`
**Apply to:** all new/modified RLS policies across migrations 035-039
```sql
DROP POLICY IF EXISTS "policy_name" ON table_name;
CREATE POLICY "policy_name" ON table_name FOR SELECT USING (...);
```

### Two-client-path split (RLS/column-privilege bypass for legitimate self/admin reads)
**Source:** `lib/supabase/server.ts` (`createServerClient`, `createApiClient`, `createServiceClient` factories) + `lib/admin/gate.ts` + `app/(admin)/admin/curators/page.tsx` lines 9-19
**Apply to:** `app/(artist)/settings/page.tsx`, `app/profile/page.tsx`, `app/api/profile/route.ts`, `lib/industry/createIndustryMember.ts`, `app/api/admin/members/route.ts`
Pattern: use the session-bound client (`createServerClient()`/`createApiClient()`) ONLY to establish `auth.getUser()` identity/ownership, then perform the actual privileged read/write via `createServiceClient()` (bypasses RLS + column grants entirely) once ownership/admin status is independently verified server-side — never trust layout-level gating alone.

### Mass-assignment protection via explicit allowlist
**Source:** `app/api/profile/route.ts` `EDITABLE_FIELDS` (lines 8-34) and `lib/admin/gate.ts` `EDITABLE_FIELDS` (lines 29-36)
**Apply to:** `app/api/admin/members/route.ts` (invite-form fields), any new PATCH/POST handler touching `artist_profiles` or `pending_industry_invites`

### Migration file header banner
**Source:** every migration file's top comment block, e.g. `supabase/migrations/031_curators_column_privileges.sql` lines 1-6
```sql
-- ============================================================
-- Funūn — Wave N: <feature name>
-- Migration NNN: <short description> (<ticket ref if any>)
-- Run via: supabase db push
-- ============================================================
```
**Apply to:** all 7 new migration files (034-040).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `lib/email/industryInvite.ts` (Resend template) | utility | request-response | No existing Resend-sent custom email template found in `lib/` during this pass — `resend` dependency is confirmed wired per CLAUDE.md but no template file was located; planner should grep `lib/` for `resend` usage at implementation time to confirm whether a template convention already exists elsewhere (e.g. pitch-send emails) before designing from scratch. |
| `no_block()` SECURITY DEFINER function | utility (DB function) | event-driven | No prior SECURITY DEFINER *callable check function* exists in this codebase (only `handle_new_user()`, which is trigger-invoked, not a general-purpose helper) — use RESEARCH.md's fully-specified code block directly. |
| `search_vector` generated tsvector column | model (DB column) | transform | No prior full-text-search column exists anywhere in this codebase's migration history — use RESEARCH.md's Code Examples skeleton (Pitfall 5) verbatim. |

## Metadata

**Analog search scope:** `supabase/migrations/` (001, 009, 010, 012, 014, 020-022, 027, 030-033), `app/(admin)/`, `app/api/admin/`, `lib/admin/gate.ts`, `lib/supabase/server.ts`, `app/api/profile/route.ts`, `app/(artist)/settings/page.tsx`, `app/profile/page.tsx`, `app/u/[handle]/page.tsx`
**Files scanned:** ~20
**Pattern extraction date:** 2026-07-04
