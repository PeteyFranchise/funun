# Phase 20: Profile Table Rename - Pattern Map

**Mapped:** 2026-07-24
**Files analyzed:** 2 new migrations (076, 077) + ~97 runtime files (grouped by category, not individually) + `types/index.ts` type rename
**Analogs found:** 5 strong analogs for the migrations; runtime files are mechanical find/replace (no per-file analog needed)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql` | migration | batch (DDL: rename + view + grants + function repoint + notify) | `supabase/migrations/075_phase19_privilege_hardening.sql` (header/footer + grant-sweep style) + `supabase/migrations/072_repoint_claim_functions.sql` (CREATE OR REPLACE-style table repoint) + `supabase/migrations/040_artist_profiles_column_privileges.sql` (column-scoped GRANT lists to reissue on the view) | exact (composite of 3 analogs — no single migration does all 5 things this one does) |
| `supabase/migrations/077_drop_artist_profiles_compat_view.sql` | migration | batch (DDL: drop only) | `supabase/migrations/073_drop_user_profiles.sql` | exact (same shape: single DROP + NOTIFY, gated by a prior soak/precondition) |
| `types/index.ts` (`ArtistProfile` → `UserProfile`) | model/type | transform | itself (rename in place, no analog needed) | trivial |
| ~80 non-test files under `app/`, `lib/`, `components/` calling `.from('artist_profiles')` | controller / service / component (mixed) | CRUD | `app/api/profile/route.ts` (representative importer + `.from()` call site) | trivial find/replace — grouped, not individually mapped |
| `middleware.ts` | middleware | request-response | itself | trivial find/replace (1 occurrence per RESEARCH) |
| 16 test files under `__tests__/` referencing `artist_profiles`/`ArtistProfile` | test | CRUD (fixture data) | any of the ~80 non-test call sites | trivial find/replace |

**Do not plan per-file tasks for the ~97 runtime files.** Group them into a small number of mechanical-replace tasks (e.g. by directory: `app/`, `lib/`, `components/`, `__tests__/`, `middleware.ts`) with `tsc --noEmit` as the completeness gate (per D-03), as RESEARCH.md's "Don't Hand-Roll" table already recommends. The only individually-templated work is migrations 076/077 and the 6 function bodies below.

## Pattern Assignments

### `supabase/migrations/076_rename_artist_profiles_to_user_profiles.sql` (migration, batch)

**Analogs:** `075_phase19_privilege_hardening.sql` (header/footer + REVOKE/GRANT sweep style), `072_repoint_claim_functions.sql` (CREATE OR REPLACE function-body repoint), `040_artist_profiles_column_privileges.sql` (exact column-scoped GRANT lists to reissue on the new view)

**Header/footer pattern** (from `075`, lines 1-43):
```sql
-- ============================================================
-- Funūn — Wave 4: The Green Room (Phase 19: Profile & Identity Model Cleanup)
-- Migration 075: privilege hardening for the 072 claim functions + 074 flags table
--
-- Preflight of the Phase 19 human-gated push (Codex, 2026-07-24) found two
-- default-grant gaps in the pending migrations 072/074. Per project
-- convention (historical/pending migrations are immutable), the fix lands as
-- this NEW migration rather than editing 071–074. Both changes mirror the
-- established privilege-sweep pattern in migration 070 ...
--
-- An executor agent must NEVER run `supabase db push` for this migration.
-- The live push is this phase's human checkpoint (plan 19-07), applied with
-- 071–074 in filename order: 071 → 072 → 073 → 074 → 075.
-- ============================================================
```
Migration 076/077 must use this exact structure: banner, "Wave 2: Rights & Registration Rails (Phase 20: Profile Table Rename)" project line, a prose rationale paragraph, and the "An executor agent must NEVER run `supabase db push` for this migration" footer line placed in the header block (not at the file's end — 075 places it in the header, 072 places it in the header too; follow that placement).

**`CREATE OR REPLACE FUNCTION` table-repoint pattern** (from `072_repoint_claim_functions.sql`, lines 52-79 and 211-244):
```sql
-- ─── claim_collaborators() ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_collaborators(
  p_user_id UUID,
  p_email   TEXT
)
RETURNS VOID AS $$
DECLARE
  v_pro         TEXT;
  ...
BEGIN
  UPDATE public.collaborators
    SET claimed_by = p_user_id
  WHERE LOWER(email) = LOWER(p_email)
    AND claimed_by IS NULL;

  -- RE-POINTED (R1): was `FROM public.user_profiles`, now the canonical
  -- table. Column rename: phone -> contact_phone.
  SELECT pro, ipi, publisher, contact_phone, mailing_address
    INTO v_pro, v_ipi, v_publisher, v_phone, v_address
    FROM public.artist_profiles
    WHERE id = p_user_id;
  ...
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
```
This is the exact precedent for the "RE-POINTED" comment convention and the required `SET search_path = ''` + `public.`-qualified table reference on every DEFINER function body. Migration 076 does the identical operation to all 6 functions below, just `artist_profiles` → `user_profiles` instead of `user_profiles` → `artist_profiles` (the direction is reversed from 072, same mechanics).

**Column-scoped GRANT lists to reissue on the compat view** (source of truth — copy verbatim, target renamed to `artist_profiles` view):

From `040_artist_profiles_column_privileges.sql` lines 83-119 (base SELECT + UPDATE lists):
```sql
REVOKE SELECT ON artist_profiles FROM authenticated, anon;
GRANT SELECT (
  id, artist_name, genre, genres, sound_identity, location, bio, career_stage,
  instagram_handle, threads_handle, tiktok_handle, spotify_url,
  monthly_listeners, total_streams, industry_roles, handle,
  member_type, pronouns, banner_url, open_to, featured_project_id,
  search_vector, avatar_url, verified, roles, is_public,
  created_at, updated_at,
  claimed_at
) ON artist_profiles TO authenticated, anon;

REVOKE UPDATE ON artist_profiles FROM authenticated;
GRANT UPDATE (
  artist_name, genres, location, bio, career_stage,
  instagram_handle, threads_handle, tiktok_handle, spotify_url,
  monthly_listeners, industry_roles, handle, pronouns, banner_url,
  open_to, featured_project_id, roles
) ON artist_profiles TO authenticated;
```
Plus later additions to fold in (per RESEARCH's Open Question 1 — planner/executor should verify against live `information_schema.role_column_grants` before finalizing, but these are the known deltas from direct migration inspection):
- `043_profile_allow_resharing.sql:26`: `GRANT SELECT (allow_resharing) ON artist_profiles TO authenticated, anon;`
- `054_dm_request_status_presence.sql:56`: `GRANT SELECT (last_seen_at) ON artist_profiles TO authenticated, anon;`

**`security_invoker` view + explicit view GRANTs — NO existing analog in this repo.** RESEARCH.md confirms via direct grep that no `CREATE VIEW ... WITH (security_invoker = on)` exists anywhere in `supabase/migrations/`. This is net-new Postgres 15 machinery for this codebase. Use RESEARCH.md's "Code Examples" section (the full migration-076 shape, lines 257-290 of 20-RESEARCH.md) as the template — it is already codebase-conventions-compliant (header style, `NOTIFY pgrst` footer) and cites primary PostgreSQL docs, not a repo precedent:
```sql
ALTER TABLE artist_profiles RENAME TO user_profiles;

-- (6x CREATE OR REPLACE FUNCTION — table-repoint pattern above)

CREATE VIEW artist_profiles WITH (security_invoker = on) AS
  SELECT * FROM user_profiles;

REVOKE ALL ON artist_profiles FROM PUBLIC, authenticated, anon;
GRANT SELECT (/* union of 040 + 043 + 054 columns above */)
  ON artist_profiles TO authenticated, anon;
GRANT UPDATE (/* 040's UPDATE column list above */)
  ON artist_profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
```

**`NOTIFY pgrst` footer pattern** (established in `072` line 246, `075` line 61, `070` — universal convention): end both 076 and 077 with `NOTIFY pgrst, 'reload schema';` on its own line as the final statement.

---

### `supabase/migrations/077_drop_artist_profiles_compat_view.sql` (migration, batch)

**Analog:** `supabase/migrations/073_drop_user_profiles.sql`

**Extract:** Read `073`'s header (precondition-gated drop, human-gated push footer) and its single `DROP ... ;` + `NOTIFY pgrst, 'reload schema';` body shape — 077 is structurally identical, just `DROP VIEW IF EXISTS public.artist_profiles;` instead of `DROP TABLE`. Precondition in 077's header must reference D-04 (smoke-test gate) and D-05 (soak period) explicitly, mirroring how `073`'s header references its own precondition (071's data rescue having completed first).

---

### `types/index.ts` — `ArtistProfile` → `UserProfile` (model/type, transform)

**Location:** `types/index.ts` lines 367-420ish (the full `ArtistProfile` type definition — read the whole block before renaming, it has many domain-specific inline comments referencing migration numbers that should NOT be altered, only the type name itself and its self-references).

**Current definition excerpt** (lines 367-380):
```typescript
export type ArtistProfile = {
  id: string
  artist_name: string | null
  genre: string | null
  location: string | null
  bio: string | null
  career_stage: 1 | 2 | 3 | 4
  instagram_handle: string | null
  threads_handle: string | null
  tiktok_handle: string | null
  spotify_url: string | null
  monthly_listeners: number | null
  total_streams: number | null
  sound_identity: SoundIdentity | null
  ...
```

**Usages within the same file** (lines 630, 745 confirmed): `artist?: ArtistProfile`, `author?: ArtistProfile` — both rename to `UserProfile`.

**Representative importer pattern** (`app/api/profile/route.ts` lines 1-10):
```typescript
import { NextResponse } from 'next/server'
import { createApiClient, createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ArtistProfile } from '@/types'
import { normalizeCountry, normalizeRegistrant } from '@/lib/metadata/identifiers'
```
All ~20 importers follow this `import type { ArtistProfile } from '@/types'` shape — mechanical rename to `import type { UserProfile } from '@/types'`.

**`.from()` call site pattern** (same file, lines 215/254/296):
```typescript
.from('artist_profiles')
```
Rename to `.from('user_profiles')` — identical shape across all ~87 call sites.

---

## Shared Patterns

### Human-gated migration header/footer
**Source:** `supabase/migrations/075_phase19_privilege_hardening.sql` (lines 1-43), `073_drop_user_profiles.sql`
**Apply to:** Both 076 and 077
```sql
-- ============================================================
-- Funūn — Wave 2: Rights & Registration Rails (Phase 20: Profile Table Rename)
-- Migration 0XX: <one-line description>
-- ... prose rationale ...
-- An executor agent must NEVER run `supabase db push` for this migration.
-- ============================================================
```

### DEFINER function repoint convention
**Source:** `supabase/migrations/072_repoint_claim_functions.sql`, `070_readiness_definer_privilege_sweep.sql`
**Apply to:** All 6 functions listed below inside migration 076
- `CREATE OR REPLACE FUNCTION public.<name>(...)` — schema-qualify the function name itself
- `LANGUAGE plpgsql|sql ... SECURITY DEFINER SET search_path = ''`
- Every table reference inside the body MUST be `public.`-qualified (required once `search_path` is emptied)
- A one-line "RE-POINTED" comment at the call site being changed, naming the old and new table

### `NOTIFY pgrst, 'reload schema'` footer
**Source:** every migration that changes exposed shape (`072`, `073`, `075`, `070`)
**Apply to:** Both 076 and 077, as the final statement

### Column-scoped GRANT/REVOKE (never blanket `GRANT ALL`)
**Source:** `supabase/migrations/040_artist_profiles_column_privileges.sql`, `043_profile_allow_resharing.sql`, `054_dm_request_status_presence.sql`, `075_phase19_privilege_hardening.sql` (REVOKE EXECUTE / GRANT EXECUTE per-function pattern)
**Apply to:** The view's GRANT statements in migration 076 — must reproduce the exact column lists, never widen to `GRANT ALL`

### `@/` absolute imports, no semicolons, named exports
**Source:** `app/api/profile/route.ts` (lines 1-10), project-wide convention (CLAUDE.md)
**Apply to:** All TS/TSX runtime file edits — the rename touches only string literals and type names, never the import style itself

## The 6 Functions Requiring `CREATE OR REPLACE` in Migration 076

| Function | Source migration (current live body) | Repoint |
|----------|----------------------------------------|---------|
| `handle_new_user()` | `039_handle_new_user_industry_branch.sql` (full body; both the industry branch's `INSERT INTO public.artist_profiles (...)` at line 51 and the default/artist branch's `INSERT INTO public.artist_profiles (id) VALUES (NEW.id)` at line 75 — Pitfall 4: BOTH branches must change) | `artist_profiles` → `user_profiles` in both INSERT statements |
| `clear_featured_if_unpublished()` | `034_identity_columns_and_search.sql` lines 129-142 (`SECURITY DEFINER SET search_path = ''`, `UPDATE public.artist_profiles SET featured_project_id = NULL ...`) | `artist_profiles` → `user_profiles` |
| `green_room_post_matches_custom_audience()` | `060_green_room_block_visibility_and_audience_roles.sql` line 25 (`LEFT JOIN public.artist_profiles ap ON ap.id = p_viewer`) | `artist_profiles` → `user_profiles` |
| `green_room_can_view_post()` | `059_green_room_feed_author_publicness.sql` line 34 (`SELECT 1 FROM public.artist_profiles ap`) | `artist_profiles` → `user_profiles` |
| `claim_collaborators()` | `072_repoint_claim_functions.sql` lines 53-209 (full body — 5 `SELECT/UPDATE ... public.artist_profiles` occurrences: lines 78, 103, 117, 124, 136, 143, 155, 162, 174, 181, 195, 202, 206) | `artist_profiles` → `user_profiles` throughout; preserve `SECURITY DEFINER SET search_path = ''` and the 075-hardened EXECUTE-grant posture (do not re-add a `GRANT EXECUTE ... TO authenticated` line — 075 revoked it deliberately) |
| `backfill_claimed_collaborators()` | `072_repoint_claim_functions.sql` lines 216-244 | `artist_profiles` → `user_profiles`; same EXECUTE-grant caution as above |

**Security note carried from RESEARCH.md:** `claim_collaborators`/`backfill_claimed_collaborators` are `SECURITY DEFINER` with cross-user write capability, locked down to `service_role`-only EXECUTE by migration `075`. `CREATE OR REPLACE FUNCTION` preserves existing GRANT/REVOKE state when the signature is unchanged (confirmed by `075`'s own comment) — migration 076 must NOT add any new `GRANT EXECUTE` line for these two functions.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| The `CREATE VIEW ... WITH (security_invoker = on)` clause in migration 076 | migration (DDL fragment) | batch | No existing view in this repo uses `security_invoker`; RESEARCH.md's own Code Examples section (citing PostgreSQL 15/18 docs) is the template to use instead of a repo analog |

## Metadata

**Analog search scope:** `supabase/migrations/` (034, 039, 040, 043, 054, 058, 059, 060, 070, 072, 073, 075), `types/index.ts`, `app/api/profile/route.ts`
**Files scanned:** 12 migrations + 1 type file + 1 representative importer (directly read); ~97 runtime files scoped by RESEARCH.md's grep counts, not individually read (per phase instructions — mechanical rename, no per-file pattern needed)
**Pattern extraction date:** 2026-07-24
