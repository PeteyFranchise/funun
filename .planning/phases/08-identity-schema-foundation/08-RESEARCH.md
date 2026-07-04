# Phase 8: Identity & Schema Foundation - Research

**Researched:** 2026-07-04
**Domain:** Supabase/Postgres schema — unified member identity, RLS, column-level privileges, Realtime publication, Supabase Auth admin API
**Confidence:** MEDIUM-HIGH (direct codebase verification on all existing-schema claims; SDK type-level verification on Auth admin API claims; official Postgres/Supabase docs on column-privilege and Realtime/RLS mechanics)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Industry accounts are created via **admin-invite only** for v1 — no public self-serve signup this phase. A server-side `createIndustryMember()` helper calls `supabase.auth.admin.createUser()` (or `inviteUserByEmail()`, see D-03) with `app_metadata.role='industry'` set at creation time, mirroring the Wave 3 curator pattern (migration 030) exactly — `handle_new_user()` gets an industry early-return branch so no phantom `artist_profiles` row is created. **Research flag (Pitfall 2/3): as literally stated this is not achievable with `inviteUserByEmail()` — see reconciliation below.**
- **D-02:** Build a **minimal internal admin route** (e.g. `/admin/members`) rather than a one-off script — gated by the same `is_admin` pattern as `/admin/curators`/`/admin/checklist`.
- **D-03:** Invited industry members get in via **`supabase.auth.admin.inviteUserByEmail()`** — sends Supabase's built-in branded magic-link invite email automatically. No new email template or Resend wiring needed. **Research flag (Pitfall 2): this method cannot carry `app_metadata` — see reconciliation.**
- **D-04:** The invite form collects **email + display name + initial role badge(s)** at creation time (role picks from the existing `INDUSTRY_ROLE_GROUPS` list in `lib/industry-roles.ts`) — so the invited member's profile has at least one role badge to render on day one.
- **D-05: Forward-compatible design for future self-serve (not built this phase).** `createIndustryMember()` must be a standalone, reusable function — not inlined into the admin route handler — so a future self-serve flow (application + manual approval, or invite-code gated) can call the exact same function later without redesigning the identity-race-avoidance logic.
- **D-06:** The existing `industry_profiles` table (migration 001, zero writers anywhere in the app) is **left untouched**. No migration, no drop, no data move.
- **D-07:** `member_type` (`'artist' | 'industry'`) is the **auth-level account type** — set once at account creation, gates capability access (artist → Vault/Launchpad/PitchPlug; industry → Antenna/opportunities). Does not change based on profile edits.
- **D-08:** The existing `industry_roles` TEXT[] column remains the **profile-level display-badge list** — freely editable, independent of `member_type`. **Research flag (Pitfall 4): the profile page today actually renders from `roles` (JSONB), a separate column — see Open Questions.**
- **D-09:** Role badges are **cosmetic only** — self-tagging a badge from "the other world" does **not** unlock the other world's capabilities. Cross-capability access requests are out of scope for Phase 8.
- **D-10:** Phase 8 **retroactively fixes the existing exposure**, not just new Wave 4 columns — `artist_profiles` currently has a `FOR SELECT USING (true)` policy with zero column-level REVOKE/GRANT, exposing `legal_first_name`, `legal_middle_name`, `legal_last_name`, `legal_name_suffix`, `contact_phone`, `mailing_address`, `pro`, `ipi`, `publisher`, `mlc_id`, `soundexchange_id` to any authenticated/anon caller via direct PostgREST. One migration applies the full REVOKE/GRANT pattern (per migration 031 precedent) across the whole table. **Research flag (Pitfall 1): shipping this migration alone, without a companion code fix to the owner's own self-service read paths, will break the owner's own Settings/Profile pages — see required companion fix.**
- **D-11:** Column classification — **PUBLIC** (readable by anyone): `artist_name`, `genres`, `location`, `bio`, `career_stage`, `instagram_handle`, `threads_handle`, `tiktok_handle`, `spotify_url`, `monthly_listeners`, `total_streams`, `industry_roles`, `handle`, and all new Wave 4 columns (`member_type`, `pronouns`, `banner_url`, `open_to`, `featured_project_id`, `search_vector`). **PRIVATE** (owner + service-role only): `legal_first_name`, `legal_middle_name`, `legal_last_name`, `legal_name_suffix`, `contact_phone`, `mailing_address`, `pro`, `ipi`, `publisher`, `mlc_id`, `soundexchange_id`.
- **D-12:** This column-privilege lockdown is a **fixed tier**, distinct from Phase 13's SAFETY-04 per-user visibility toggle (row-level, user-configurable, built later).
- **D-13:** Reserved handles live in a **new `reserved_handles` table** (`handle TEXT PRIMARY KEY, reason TEXT`), seeded in this migration, growable later via plain `INSERT`.
- **D-14:** Scope is **broad** — system/brand words plus a curated set of well-known music-platform/brand names. Exact expanded brand-name list is Claude's discretion during planning.
- **D-15:** Phase 8 creates the `blocks` table + `no_block()` SECURITY DEFINER helper **and wires it into existing socially-exposed tables' RLS now** — `wall_posts`, `endorsements`, `dm_threads`/`dm_messages`, and `follows` INSERT policies all get the `no_block()` check added in this migration.
- **D-16:** `featured_project_id` is **restricted to public/released projects only**, enforced at the DB level. If a featured project is later unpublished, the reference should null itself out.
- **D-17:** `search_vector` is built from `artist_name`, `genres`, `location`, `industry_roles`, `handle`, **and `bio`**.

### Claude's Discretion
- Exact expanded reserved-brand-name list for `reserved_handles` seed data (D-14).
- Exact wording/shape of `no_block()` (function signature, which tables' policies get the literal SQL edit vs. a shared helper call).
- Full migration numbering/file breakdown (this phase likely spans multiple migration files).
- Exact `notifications` actor-snapshot column set (e.g. `actor_name`, `actor_avatar_url`).
- `/admin/members` UI polish/layout — minimal is fine, follow existing `/admin/curators`/`/admin/checklist` visual conventions.

### Deferred Ideas (OUT OF SCOPE)
- **Future self-serve industry signup UX** (application + manual approval, or invite-code gated) — explicitly deferred past Phase 8/this milestone; only `createIndustryMember()` needs to be built in a way that doesn't foreclose it (D-05).
- **Cross-capability access** (an industry member requesting Vault access, or an artist requesting Antenna-posting access) — explicitly out of scope; badges are cosmetic only for now (D-09).
- **`industry_profiles` table repurposing/migration** — left untouched (D-06); revisit only if a concrete future need arises.
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 8 carries no user-facing requirement by design — per `.planning/REQUIREMENTS.md`'s explicit "Phase note": *"Phase 8 (Identity & Schema Foundation) carries no user-facing requirement by design — it is the schema/migration root every Phase 9–13 requirement depends on (column-privilege lockdown, block enforcement, identity-race avoidance). Its success is verified structurally, not by a mapped requirement."*

| ID | Description | Research Support |
|----|-------------|-------------------|
| (none mapped) | Foundation phase — success verified against the phase's 5 success criteria in ROADMAP.md, not a REQUIREMENTS.md ID | See Validation Architecture's "Phase Requirements → Test Map" below, which maps each of the 5 success criteria to a verification method |

Downstream requirements this phase unblocks (for planner context, not this phase's own scope): PROFILE-01..09 (Phase 9), CONNECT-01/02 + NOTIF-01..03 (Phase 10), PRESENCE-01..03 + CONNECT-03..05 (Phase 11), DISCOVER-01..03 (Phase 12), DISCOVER-04 + SAFETY-01..04 (Phase 13).
</phase_requirements>

## Summary

This is a schema-only phase, but three of its five success criteria rest on assumptions that direct codebase inspection shows are **incomplete or contradicted by what's already shipped**. This research surfaces four load-bearing findings the planner must resolve before writing tasks:

1. **Most of the "new" `artist_profiles` columns already exist.** Migration `010_public_showcase_profile.sql` already added `banner_url`, `pronouns`, `open_to` (JSONB), `featured_project_id`, `roles` (JSONB), `verified`, `handle`, and `is_public` — and all are actively read/written by live code (`lib/profile/load.ts`, `components/profile/ProfileView.tsx`, `app/(artist)/settings/page.tsx`, `app/u/[handle]/page.tsx`). CONTEXT.md's D-11 lists these as "new Wave 4 columns" to classify PUBLIC — they're not new, they're pre-existing. The genuinely new columns for this phase are only `member_type` and `search_vector`. This changes the migration from "add 6 columns" to "add 2 columns + confirm 6 already-correct ones with `IF NOT EXISTS` no-ops."

2. **Column-level REVOKE on `artist_profiles` will break the owner's own self-service reads, not just block other users.** Postgres column privileges are role-scoped, not row-scoped — `REVOKE SELECT (legal_first_name, ...) FROM authenticated` blocks the `authenticated` role universally, including the profile owner reading their own row. Confirmed via direct grep: `app/(artist)/settings/page.tsx`, `app/profile/page.tsx`, `app/u/[handle]/page.tsx`, and `app/api/profile/route.ts` (PATCH) all call `.select('*')` (or bare `.select()`) against `artist_profiles` using the session-bound `authenticated`-role client (`createServerClient()`/`createApiClient()`), never the service-role client. Per Postgres semantics and Supabase's own column-level-security docs, `SELECT *` against a table with column-level restrictions fails the **entire query** with a `42501 permission denied for column` error — it does not silently omit the restricted columns. D-10's migration alone, if shipped without corresponding code changes, will 500 the owner's own Settings page, the owner's own `/profile` page, the public `/u/[handle]` page for every visitor, and the profile PATCH route. This is Migration-031's pattern applied to a materially different case (031's `curators`/`pitch_history` private columns were never legitimately self-read by the authenticated role; `artist_profiles`'s private columns are self-read by the owner today). See Pitfall 1 for the required fix.

3. **D-01/D-03 as literally stated cannot both be true.** `supabase.auth.admin.inviteUserByEmail(email, options)` accepts only `{ data, redirectTo }` in its options — verified directly from the installed `@supabase/auth-helpers-nextjs`/`@supabase/auth-js` TypeScript definitions (`GoTrueAdminApi.d.ts`). It has **no `app_metadata` parameter**. Only `admin.createUser({ email, app_metadata, ... })` can set `app_metadata` atomically at creation, and `createUser()` explicitly does **not** send any email (per Supabase's own JSDoc). So "set `app_metadata.role='industry'` at creation time" (D-01) and "invite via `inviteUserByEmail()`" (D-03) cannot be satisfied by a single call — D-03's method structurally cannot carry the role, reopening exactly the identity race D-01 is designed to prevent. See Pitfall 2 for a reconciliation that preserves both the branded-email UX (D-03) and the race-free guarantee (D-01/D-05) using a side-channel `pending_industry_invites` table instead of relying on `app_metadata` timing at all.

4. **Two competing "role badge" systems already exist and neither is `industry_roles` alone.** `roles` (JSONB, migration 010, typed `ProfileRole[]` — a `{kind:'preset', slug}` | `{kind:'custom', label}` union over `PROFILE_ROLES` = artist/producer/songwriter/music_supervisor/anr/exec) is the column **actually rendered as badges today** in `ProfileView.tsx`. `industry_roles` (TEXT[], migration 021) is a **different, larger taxonomy** (`INDUSTRY_ROLE_GROUPS` in `lib/industry-roles.ts` — 20+ slugs like `mixing_engineer`, `tour_manager`) used for split-sheet collaborator auto-fill, not profile badges. D-08's claim that "the existing `industry_roles` TEXT[] column... remains the profile-level display-badge list" does not match what the code renders. D-04's invite-time role picker sources from `INDUSTRY_ROLE_GROUPS`/`industry_roles` — but if nothing also populates `roles` (JSONB), the invited member's profile still shows zero badges on day one, which is the exact outcome D-04 says it wants to avoid. See Open Questions.

**Primary recommendation:** Ship the phase in the sequence below, treating findings 2 and 3 as blocking design decisions (not optional polish) — both require a small code/table addition beyond "just a migration," and skipping either one leaves the phase's own success criteria unmet (criterion 4 for finding 2; criterion 5 for finding 3).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Member identity (artist + industry, `member_type`) | Database / Storage | API (createIndustryMember helper) | Single source of truth is the `artist_profiles` row + `auth.users.app_metadata`; API only orchestrates creation |
| Connections (mutual request/accept) | Database / Storage | API / Backend | RLS fully expresses "who can see/insert/update which rows"; no app-layer authorization needed beyond calling the right endpoint |
| Blocks + `no_block()` enforcement | Database / Storage | API / Backend | Must be enforced in RLS (SECURITY DEFINER helper), not app code — this is the CRITICAL-2 pitfall from milestone research; UI is a Phase 13 concern only |
| Notifications (schema + realtime) | Database / Storage | API / Backend | Table extension + `ALTER PUBLICATION`; emit path is server-side (service-role), consumption is realtime `postgres_changes` gated by RLS |
| `dm_thread_reads` (unread tracking) | Database / Storage | API / Backend | Pure schema; read/write path is Phase 11's concern |
| Column-level privacy lockdown | Database / Storage | API / Backend (self-service read path) | REVOKE/GRANT is DB-tier, but the owner-self-read exception (Pitfall 1) requires an API-tier code change in the same phase |
| Reserved handles | Database / Storage | — | Static lookup table; validation logic can live in DB (unique index / trigger) or API, either is fine — no product-layer decision needed |
| `/admin/members` UI | Frontend Server (SSR) | API / Backend | One small server-rendered admin page (D-02); mutations route through an API handler that re-verifies `is_admin`, matching `lib/admin/gate.ts`'s existing pattern |

## Standard Stack

### Core

No new npm packages are required for this phase — it is pure Postgres/Supabase DDL. `date-fns`/`lucide-react` (noted in milestone STACK.md) are Phase 9+ concerns, not Phase 8.

| Capability | Mechanism | Verified |
|------------|-----------|----------|
| Full-text search column | Postgres `tsvector` + `GENERATED ALWAYS AS ... STORED` + `to_tsvector('english', ...)` | [VERIFIED: postgresql.org/docs/current/textsearch-tables.html] — official example matches this exact pattern |
| GIN index on `search_vector` | `CREATE INDEX ... USING GIN (search_vector)` (built-in `tsvector_ops`, not `gin_trgm_ops`) | [CITED: postgresql.org] |
| Realtime delivery for `notifications` | `ALTER PUBLICATION supabase_realtime ADD TABLE notifications` (idempotent guard via `pg_publication_tables`) | [VERIFIED: in-codebase precedent, migration 014] |
| Column-level privilege lockdown | `REVOKE`/`GRANT (col1, col2, ...)` | [VERIFIED: Supabase docs + in-codebase precedent migration 031] |
| SECURITY DEFINER helper (`no_block()`) | `LANGUAGE sql STABLE SECURITY DEFINER` with pinned `search_path` | [CITED: supabase.com/docs/guides/database/functions] |

### Package Legitimacy Audit

Not applicable — this phase introduces no npm/pip/cargo packages. All work is SQL migrations against the existing Supabase/Postgres stack.

## Architecture Patterns

### System Architecture Diagram

```
                              admin.createUser() / inviteUserByEmail()
                                          │
                                          ▼
                              INSERT INTO auth.users
                                          │
                              (AFTER INSERT trigger, same transaction)
                                          ▼
                              public.handle_new_user()
                                          │
                     ┌────────────────────┼─────────────────────┐
                     │                    │                     │
        role='curator' (030)   pending_industry_invites    default: artist
        early-return, no       row exists for NEW.email?   INSERT artist_profiles(id)
        artist_profiles row         │           │          INSERT subscriptions(...)
                                    yes          no         claim_collaborators()
                                     │            │
                        INSERT artist_profiles    (fall through to
                        (member_type='industry',   default artist branch —
                         artist_name=display_name,  should not normally happen
                         industry_roles=role_badges) for an invited industry user)
                        DELETE pending row
                        skip subscriptions insert
                        skip claim_collaborators()
                                          │
                                          ▼
                              artist_profiles row (unified identity)
                     ┌────────────────────┼─────────────────────────────┐
                     ▼                    ▼                             ▼
        Public read path            Owner self-service              Realtime / search
        /u/[handle] (SSR)           read/write path                 consumers
        → explicit PUBLIC           settings, /profile,              (Phase 9-13)
          column list only          api/profile PATCH
          (D-11 PUBLIC set)         → service-role client
                                      + auth.uid()===id check
                                      (bypasses column REVOKE)

        follows / wall_posts / endorsements / dm_threads (existing, migration 012)
                     │  INSERT policies gain: AND no_block(auth.uid(), other_party_id)
                     ▼
        connections (new)  ◄──── requester/addressee, status state machine
        blocks (new)       ◄──── no_block() SECURITY DEFINER reads this, used in
                                  RLS policies above; not exposed as a public RPC

        notifications (extended: actor_id/actor_name/actor_avatar_url)
                     │  ALTER PUBLICATION supabase_realtime ADD TABLE notifications
                     ▼
        postgres_changes subscription (Phase 10) — RLS-filtered per subscriber

        dm_thread_reads (new) — (thread_id, user_id) → last_read_at, powers DM unread count
```

### Recommended Migration File Breakdown

Claude's discretion per CONTEXT.md, but the natural one-file-per-concern split (matching this codebase's convention — see migrations 020/021/022, 030/031) is:

```
034_member_identity_wave4.sql          -- member_type, search_vector (GENERATED) + GIN index
                                        -- ADD COLUMN IF NOT EXISTS for the 6 already-existing
                                        -- columns (documents intent, costs nothing — no-ops)
035_pending_industry_invites.sql       -- side-channel table (Pitfall 2) + handle_new_user()
                                        -- industry branch, mirroring migration 030's shape
036_connections_blocks.sql             -- connections + blocks tables, RLS, no_block()
037_notifications_dm_reads.sql         -- actor-snapshot columns, realtime publication,
                                        -- dm_thread_reads table
038_artist_profiles_column_privileges.sql -- REVOKE/GRANT lockdown (D-10/D-11) — see Pitfall 1
                                        -- for the required companion code changes
039_block_enforcement_existing_tables.sql -- no_block() wired into follows/wall_posts/
                                        -- endorsements/dm_threads INSERT policies (D-15)
040_reserved_handles.sql               -- reserved_handles table + seed data (D-13/D-14)
```

Ordering rationale: `pending_industry_invites` (035) must exist before any admin route calls `createIndustryMember()`, and logically follows the identity-column migration (034) since both touch `handle_new_user()`/`artist_profiles`. The column-privilege lockdown (038) is placed after `connections`/`blocks`/`notifications` land so the REVOKE audit can cover every table touched so far in one pass, but it does NOT depend on them — it could equally ship earlier. `reserved_handles` (040) has no dependencies and could ship first if preferred.

### Connections Table — Mutual Request/Accept

Single-row-per-pair with a `status` state machine (not a two-row model) is the correct choice here — matches milestone ARCHITECTURE.md's draft and is the standard pattern for asymmetric-initiator, symmetric-once-accepted relationships:

```sql
CREATE TABLE connections (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id   UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  addressee_id   UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','declined','withdrawn')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id),
  UNIQUE (requester_id, addressee_id)
);
```

**Tradeoff analysis:**
- **Single row (recommended):** One `UNIQUE (requester_id, addressee_id)` row per pair, status transitions in place. Query for "my connections" needs `WHERE (requester_id = me OR addressee_id = me) AND status = 'accepted'` — a single index-friendly OR, cheap at this scale. RLS is simple (participant check on both columns). Re-request after decline needs either an UPDATE-back-to-pending or a unique-constraint workaround (see below).
- **Two rows (rejected):** One row per direction once accepted, mirrors `follows`' existing shape. Doubles storage and write complexity for zero query benefit here, since (unlike `follows`) the relationship must go through a pending/accept step that a two-row model doesn't naturally express (which row is "the request"?).

**Known edge case to resolve in planning:** what happens if A requests, B declines, and later A wants to re-request? With `UNIQUE (requester_id, addressee_id)` and status permanently `'declined'`, a second INSERT violates the constraint. Options: (a) UPDATE the existing row back to `'pending'` with a cooldown check in the API layer, or (b) drop the plain UNIQUE and instead use a partial unique index `UNIQUE (requester_id, addressee_id) WHERE status IN ('pending','accepted')` so a new request can INSERT a fresh row once the old one is terminal. Option (b) is cleaner and avoids resurrecting stale rows; recommend it. Also add the reverse-pair partial unique consideration: nothing currently stops A requesting B **and** B requesting A simultaneously (two independent pending rows in opposite directions) — the API layer should check for an existing reverse-direction row and auto-accept instead of creating a duplicate pending request; this is an app-layer concern, not a schema one, but the planner should be aware the schema alone does not prevent it.

### Blocks Table — Bidirectional Enforcement, Directional Storage

Store one directional row per block (`blocker_id`, `blocked_id`), enforce bidirectionality only in the **read/check helper**, not by writing two rows:

```sql
CREATE TABLE blocks (
  blocker_id  UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX idx_blocks_blocked ON blocks (blocked_id);  -- reverse-direction lookups
```

**Why directional storage + bidirectional check (not two rows):** Who blocked whom is meaningful data (only the blocker should ever see their own blocklist — D-15/CRITICAL-2's milestone research already specifies `blocks_select_own` restricted to `blocker_id = auth.uid()`). Writing two symmetric rows would make "who blocked whom" ambiguous and double every INSERT/DELETE. The asymmetry is preserved in storage; symmetry is enforced only where it matters — the `no_block()` helper checks both directions:

```sql
CREATE OR REPLACE FUNCTION public.no_block(a UUID, b UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  )
$$;

-- Do not grant EXECUTE to anon/authenticated as a directly-callable RPC unless
-- intentionally needed client-side — it is meant to be called FROM RLS policy
-- bodies (which run as the defining role regardless of caller grants), not
-- invoked directly via supabase.rpc('no_block', ...). If PostgREST auto-exposes
-- it (any function in the `public` schema is RPC-callable by default), consider:
--   REVOKE EXECUTE ON FUNCTION public.no_block(uuid, uuid) FROM PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.no_block(uuid, uuid) TO authenticated;
-- (grant back only if it also needs to be called from an RLS policy body by an
-- authenticated request — RLS-embedded calls do not require the caller to hold
-- EXECUTE, but PostgREST RPC exposure does; test whichever grant configuration
-- is used against an actual policy + a direct supabase.rpc() call before shipping.)
```

**SECURITY DEFINER correctness details (why each line above matters):**
1. `SET search_path = ''` (or `= public, pg_temp` with fully-qualified names) — prevents a search-path-hijacking attack where a malicious `blocks` table in a different schema earlier in a caller-controlled search path gets picked up instead of `public.blocks`. [CITED: supabase.com/docs/guides/database/functions] This is the standard, documented Supabase best practice for every SECURITY DEFINER function, and is the same class of fix `db_function_search_path_mutable` lints for in Supabase's Security Advisor.
2. `STABLE` (not `VOLATILE`) — allows the planner to cache the result within a single statement when wrapped in `(SELECT no_block(...))` inside an RLS policy, avoiding a per-row re-evaluation (same performance pattern already used project-wide for `(SELECT auth.uid())`, per PITFALLS.md MOD-8).
3. `SECURITY DEFINER` is required here specifically because the calling role (`authenticated`, restricted by `blocks_select_own` to `blocker_id = auth.uid()`) could not otherwise read the OTHER party's block row to check "did they block me" — the function runs as its owner (bypassing RLS on `blocks`) so it can see both directions regardless of the caller's own RLS-restricted view.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text/fuzzy people search | A custom LIKE-scan or app-side filtering of all rows | Postgres `tsvector` + GIN (this phase); optionally `pg_trgm` + GIN as a separate index if fuzzy substring matching is added later | Native, zero extra infra, already proven at this project's likely scale (low thousands of members) |
| Realtime delivery of new notifications | A custom polling-only mechanism from day one | `ALTER PUBLICATION supabase_realtime ADD TABLE notifications` + `postgres_changes` (Phase 10 consumes it) | Already the exact pattern used for `dm_messages` (migration 014); RLS-filtered per subscriber automatically |
| Row-scoped "owner can see private columns of their own row" | A custom column-masking view or app-layer response filtering that re-implements what RLS already does | Split the read path: RLS handles row scoping everywhere; column REVOKE handles "no one but service-role" for private columns; owner-self-service routes use the service-role client with an explicit ownership check (see Pitfall 1) | Postgres column privileges are not row-aware — there is no built-in "owner of this row may see this column" primitive; the two-client-path pattern is the standard reconciliation, not a workaround to avoid |
| Block-relationship checks scattered across every RLS policy as inline subqueries | Repeating `NOT EXISTS (SELECT 1 FROM blocks WHERE ...)` in every policy | The single `no_block()` SECURITY DEFINER helper (D-15) | One function, one place to fix/audit, consistent semantics everywhere it's referenced |

**Key insight:** Every "don't hand-roll" item above already has an in-codebase precedent from Wave 3 (migrations 030/031) or Wave 2/3's Realtime usage (migration 014) — this phase is disciplined reuse of proven patterns, not new design, with the single exception of the column-REVOKE self-read reconciliation (Pitfall 1), which has no prior-wave precedent because no earlier REVOKE'd table needed owner-self-read.

## Runtime State Inventory

This phase retrofits privileges and a trigger onto **live, already-migrated schema** (not a rename, but the same "existing runtime state" caution applies since `artist_profiles` already has real columns, real RLS, and a real trigger in production use).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `artist_profiles` rows already contain values in `banner_url`, `pronouns`, `open_to`, `featured_project_id`, `roles`, `verified`, `handle`, `is_public` (all from migration 010, already live). No data migration needed — these columns keep their existing values and types. | None — code edit only (see column classification below); do not `DROP`/retype these columns. |
| Live service config | None found. No external service (Songtrust, Dropbox Sign, Datadog, etc.) references `artist_profiles`, `connections`, `blocks`, or `notifications` outside this repo. | None. |
| OS-registered state | None — no cron/Task Scheduler/pm2/launchd entries reference this phase's tables. | None. |
| Secrets/env vars | `SUPABASE_SERVICE_ROLE_KEY` already exists and is required for the owner-self-service fix (Pitfall 1) and for `createIndustryMember()`'s admin-API calls — no new secret needed, confirmed present via existing `createServiceClient()` usage project-wide. | None. |
| Build artifacts / generated types | `types/supabase.ts` is generated via `npm run db:types` (`supabase gen types typescript --local`) — will go stale the moment any migration in this phase lands and must be regenerated. `types/index.ts`'s hand-maintained `ArtistProfile` type (line 331+) must also be manually updated to add `member_type` and `search_vector` fields. | Regenerate `types/supabase.ts`; manually extend `ArtistProfile` in `types/index.ts`. |

## Common Pitfalls

### Pitfall 1 (CRITICAL): Column REVOKE breaks the owner's own `.select('*')` reads

**What goes wrong:** D-10 requires a blanket `REVOKE SELECT (legal_first_name, ..., soundexchange_id) FROM authenticated, anon` on `artist_profiles`. Postgres enforces column privileges per-role, with no row-level exception — there is no way to express "role `authenticated` may see `legal_first_name` only when `auth.uid() = id`" via GRANT/REVOKE alone. Confirmed via direct grep, **four existing call sites** issue `.select('*')` (or bare `.select()`, which PostgREST/the JS client also expands to `select=*`) against `artist_profiles` using the session-bound `authenticated`-role client:
- `app/(artist)/settings/page.tsx` (two call sites, owner's own row)
- `app/profile/page.tsx` (owner's own row)
- `app/u/[handle]/page.tsx` (PUBLIC page — any visitor)
- `app/api/profile/route.ts` PATCH handler's `.update(update).select().single()`

**Why it happens:** Migration 031's precedent (curators/pitch_history) REVOKEs columns that were never legitimately read by the authenticated role in the first place — that table has no "owner reads their own private field" use case. `artist_profiles`'s private fields (legal name, contact, PRO/IPI/publisher/MLC/SoundExchange) are actively self-read/edited by the owner today via the Settings page and the rights-registry metadata screens. Applying 031's pattern verbatim to a table with this different access shape breaks the legitimate case, not just the illegitimate one.

**Consequence if shipped without a companion fix:** [VERIFIED: supabase.com/docs/guides/database/postgres/column-level-security, cross-checked against postgresql.org REVOKE semantics] — `SELECT *` against a column-restricted table fails the **entire query** with a `42501 permission denied for column` error (not a partial result with restricted columns silently nulled). Every one of the four call sites above will start hard-erroring for every request, including the owner's own Settings page — the phase's own success criterion 4 ("no authenticated user can read private fields via direct PostgREST") would technically be satisfied, but at the cost of breaking existing, in-scope, legitimate functionality that isn't gated by this phase's stated boundary.

**How to avoid — required companion fix (not optional polish):**
1. Ship the REVOKE/GRANT migration exactly as D-10/D-11 specify — this is still correct and necessary for blocking other users/anon/direct-PostgREST access.
2. In the same phase, update the identified call sites:
   - `app/u/[handle]/page.tsx` (public path): replace `.select('*')` with an explicit column list matching D-11's PUBLIC set exactly (`id, artist_name, genres, location, bio, career_stage, instagram_handle, threads_handle, tiktok_handle, spotify_url, monthly_listeners, total_streams, industry_roles, handle, member_type, pronouns, banner_url, open_to, featured_project_id, search_vector, avatar_url, verified, is_public, created_at, updated_at` — audit against `buildProfileData()`'s actual field usage in `lib/profile/load.ts` to avoid over- or under-selecting).
   - `app/(artist)/settings/page.tsx`, `app/profile/page.tsx`, `app/api/profile/route.ts` (owner self-service paths): switch these specific queries to `createServiceClient()` (bypasses RLS **and** column grants entirely), with an explicit `auth.uid() === requested id` check performed via the existing session-bound client (`supabase.auth.getUser()`) **before** the service-role query runs — mirroring the project's own established pattern: "Admin routes independently re-verify `is_admin` server-side, not just layout-level gating" (CONTEXT.md code_context), applied here as "self-service routes independently re-verify row ownership server-side before using the service-role client."
   - Any other private-field readers surfaced by `grep -rn "select('\*')\|\.select()" --include="*.ts" --include="*.tsx" | grep artist_profiles` (a project-wide audit, not just the four sites found in this research pass — new call sites may exist by the time this phase executes).
3. Treat this as a Phase 8 task, not deferred to Phase 9 — the migration and the code fix must land together, or the phase temporarily breaks the app between migration and code-fix deploys if split across separate PRs.

**Warning signs during planning:** if the plan has a task that says "apply column privilege migration" with no corresponding task touching `settings/page.tsx`/`profile/page.tsx`/`api/profile/route.ts`/`u/[handle]/page.tsx`, this pitfall has not been addressed.

---

### Pitfall 2 (CRITICAL): `inviteUserByEmail()` cannot carry `app_metadata` — D-01/D-03 as stated are mutually incompatible

**What goes wrong:** [VERIFIED: read directly from installed `@supabase/auth-js` TypeScript definitions, `node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.d.ts`] `inviteUserByEmail(email, options?: { data?: object; redirectTo?: string })` has no `app_metadata` field in its options type — only `data` (which maps to `user_metadata`, not `app_metadata`). `generateLink({ type: 'invite', email, options })` has the identical `{ data, redirectTo }` shape — also no `app_metadata`. Only `createUser(attributes: AdminUserAttributes)` accepts `app_metadata`, and `createUser()`'s own JSDoc states it "will not send a confirmation email... use `inviteUserByEmail()` if you want to send them an email invite instead" — the two methods' capabilities are mutually exclusive along exactly the axis D-01/D-03 need combined.

**Why it happens:** The curator precedent (migration 030) used `admin.createUser()` with `app_metadata.role='curator'` set at creation — it never needed a branded invite email (curators self-claim via a magic-link claim token sent through Resend, not Supabase's built-in invite flow). D-01/D-03 borrowed the "set role at creation" language from that precedent but paired it with a different admin-API method that cannot fulfill it.

**Consequence if shipped as literally specified:** Either (a) use `createUser()` and lose the "automatic branded magic-link invite email, no new template" convenience D-03 wants, or (b) use `inviteUserByEmail()` and reintroduce the exact identity race D-01/CRITICAL-3 (milestone PITFALLS.md) is designed to prevent — `app_metadata.role` would have to be set via a follow-up `admin.updateUserById()` call, by which time `handle_new_user()` has already fired against a `NEW.raw_app_meta_data` with no `role` key, defaulting to the artist branch.

**How to avoid — recommended reconciliation (side-channel table, not `app_metadata` timing):**

Decouple "does the trigger build the right profile row" from "when does `app_metadata.role` get set." Add a small pending-invite table that the trigger checks **instead of** `app_metadata`, and let `app_metadata.role` be a best-effort follow-up (its timing no longer matters for correctness, only for later route-gating convenience):

```sql
CREATE TABLE pending_industry_invites (
  email        TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role_badges  TEXT[] NOT NULL DEFAULT '{}',
  invited_by   UUID REFERENCES auth.users,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE pending_industry_invites ENABLE ROW LEVEL SECURITY;
-- No policies granted to authenticated/anon — service-role only (admin route).
```

`createIndustryMember()` (D-05's reusable helper) sequence, using the **service-role client**:
1. `INSERT INTO pending_industry_invites (email, display_name, role_badges, invited_by) VALUES (...)`.
2. `await supabase.auth.admin.inviteUserByEmail(email)` — this both creates the `auth.users` row and sends Supabase's branded invite email in one call, fulfilling D-03 exactly as written. The `on_auth_user_created` trigger fires synchronously during this call.
3. `handle_new_user()` checks `EXISTS (SELECT 1 FROM public.pending_industry_invites WHERE email = NEW.email)` — if found, it inserts `artist_profiles` with `member_type='industry'`, `artist_name = display_name`, `industry_roles = role_badges` from the pending row, **skips** the `subscriptions` insert (industry members likely don't need Vault-tier gating — confirm with the planner/D-07's capability-gating framing), **skips** `claim_collaborators()` (an artist-specific flow), and deletes the consumed `pending_industry_invites` row — wrapped in the same nested exception-isolation pattern as migration 027's CR-04 so a delete failure doesn't roll back the profile insert.
4. `createIndustryMember()` then makes a best-effort follow-up `admin.updateUserById(user.id, { app_metadata: { role: 'industry' } })` for any code elsewhere that branches on `app_metadata.role` (e.g., a future middleware check) — since the DB profile is already correct via step 3 regardless of this call's timing or success, this step is no longer safety-critical, only a convenience mirror.

This preserves D-03's UX exactly, closes D-01's race entirely (the trigger never depends on `app_metadata` being present at insert time), and generalizes cleanly for D-05's future self-serve flow (an application+approval flow would `INSERT` the pending row on approval and then either call `inviteUserByEmail()` or let the applicant's own signup complete — either path, the trigger behaves correctly because it keys off the pending table, not the auth method used).

**Confidence:** MEDIUM — the `inviteUserByEmail`/`createUser`/`generateLink` option-shape claims are HIGH confidence (read directly from installed SDK type definitions, not training-data recall). The recommended reconciliation pattern itself is this research's own design (not found verbatim in Supabase docs), reasoned from confirmed SDK constraints plus the existing exception-isolation convention (migration 027) — flag this as an architectural decision for the planner/user to confirm, not a pre-validated pattern.

---

### Pitfall 3: "Early-return" branch must build a correct row, not skip the row entirely

**What goes wrong:** CONTEXT.md's D-01 says the industry branch mirrors the curator early-return "so no phantom `artist_profiles` row is created" — but curators (migration 030) are **not** part of the unified identity table at all; they early-return and skip `artist_profiles` entirely. Industry members, per D-07/D-08, **are** part of the unified `artist_profiles` table (`member_type='industry'`) — they need a row, just a differently-built one (no `subscriptions` insert, no `claim_collaborators()` call, `member_type`/`artist_name`/`industry_roles` populated from the pending invite). If the planner copies migration 030's branch verbatim (`IF role = 'industry' THEN RETURN NEW; END IF;`), industry members get **zero** `artist_profiles` row — contradicting D-07's premise that `member_type` lives on that table, and breaking every Phase 9-13 feature that assumes every member (artist or industry) has an `artist_profiles` row to join against.

**How to avoid:** Write the industry branch as an alternate INSERT (see Pitfall 2's step 3), not a bare `RETURN NEW`. Double-check this explicitly during planning — the wording similarity to the curator precedent is the trap.

---

### Pitfall 4: Two independent "role badge" columns already exist — D-04/D-08 don't fully reconcile with what's rendered today

**What goes wrong:** `roles` (JSONB, migration 010, `ProfileRole[]`) is what `ProfileView.tsx` actually renders as badges today. `industry_roles` (TEXT[], migration 021, `INDUSTRY_ROLE_GROUPS` taxonomy) is used for split-sheet collaborator auto-fill and is a different, larger vocabulary. D-08 states industry_roles "remains the profile-level display-badge list" — true for split-sheet credit purposes, not true for what the profile page currently displays. D-04's invite-time picker sources role picks from `INDUSTRY_ROLE_GROUPS` (i.e., populates `industry_roles`) — if `createIndustryMember()` only writes `industry_roles` and never `roles`, the invited member's profile page shows zero badges, which is exactly the "sit at no roles selected" outcome D-04 says it wants to avoid.

**How to avoid:** During planning, decide explicitly whether `createIndustryMember()` should also translate the D-04 role picks into an initial `roles` (JSONB) entry (e.g., map a matching `INDUSTRY_ROLE_GROUPS` slug to a `PROFILE_ROLES` preset if one exists — `music_supervisor` and `ar_executive`→`anr` have close matches; anything else becomes `{kind:'custom', label}`) at creation time. This is not a locked decision in CONTEXT.md — flag it as Claude's discretion during planning, but do not leave it unaddressed, since it directly affects whether D-04's stated goal is actually achieved.

---

### Pitfall 5: `to_tsvector()` without an explicit config is not a valid generated-column expression

**What goes wrong:** `GENERATED ALWAYS AS (to_tsvector(coalesce(artist_name,'') || ...)) STORED` fails with `ERROR: generation expression is not immutable` — `to_tsvector(text)` (the one-argument form) depends on the `default_text_search_config` GUC, which Postgres cannot prove immutable. [VERIFIED: postgresql.org/docs/current/textsearch-tables.html — official example uses the two-argument form specifically for this reason]

**How to avoid:** Always use the two-argument form with a literal config: `to_tsvector('english', ...)`. Array columns (`genres`, `industry_roles`) must be flattened first: `array_to_string(genres, ' ')`. Full expression per D-17's composition (artist_name, genres, location, industry_roles, handle, bio):

```sql
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(artist_name, '') || ' ' ||
      array_to_string(genres, ' ') || ' ' ||
      coalesce(location, '') || ' ' ||
      array_to_string(industry_roles, ' ') || ' ' ||
      coalesce(handle, '') || ' ' ||
      coalesce(bio, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_artist_profiles_search_vector
  ON artist_profiles USING GIN (search_vector);
```

**Terminology clarification for the planner:** the phase description's "GIN trigram index... for a `tsvector` search column" conflates two distinct index strategies. `gin_trgm_ops` (pg_trgm extension) indexes `text`/`varchar` columns for typo-tolerant substring/`ILIKE` matching; a plain `GIN` index on a `tsvector` column uses the built-in `tsvector_ops` opclass for stemmed, word-boundary, ranked (`ts_rank`) full-text search. You cannot apply `gin_trgm_ops` to a `tsvector`-typed column (type mismatch). The SQL above is the correct implementation of D-17's actual requirement (a `tsvector` column + GIN index). If typo-tolerant fuzzy matching on `artist_name`/`handle` is also wanted later (e.g., "Sipho" matching "Siphoo"), that requires a **separate** `pg_trgm` GIN index on a text expression — out of this phase's locked scope but worth flagging as a Phase 12 (Discovery) consideration since DISCOVER-01 mentions "keyword" search.

---

### Pitfall 6: Realtime `postgres_changes` needs table-level GRANT, not just RLS

**What goes wrong:** [VERIFIED: supabase.com/docs/guides/realtime/postgres-changes] Realtime evaluates the subscriber's RLS SELECT policy per row before delivery, but this requires the subscriber's role (`authenticated`) to also hold table-level `SELECT` privilege in the first place — RLS alone, without a base GRANT, still blocks delivery. Supabase's default schema bootstrap already grants blanket `SELECT` to `authenticated`/`anon` on new tables (confirmed by every existing migration in this repo never needing an explicit `GRANT SELECT` for realtime to work on `dm_messages`), so this is very unlikely to bite — but it becomes a live concern **only if** the column-privilege migration (Pitfall 1) accidentally revokes table-level `SELECT` on `notifications` too broadly. Keep the `notifications` REVOKE/GRANT (if any is applied — CONTEXT.md does not lock a `notifications` column classification, only `artist_profiles`) scoped narrowly if it happens; do not let a broad audit sweep accidentally touch `notifications`' existing grants.

**Caveat on `REPLICA IDENTITY` and DELETE payloads:** if any future phase needs the "old value" on an UPDATE/DELETE to `notifications` (e.g., to diff what changed), `REPLICA IDENTITY FULL` is required, and even then RLS is not applied to DELETE payloads (Postgres cannot evaluate a policy against a row that's already gone) — the old record on a DELETE with `REPLICA IDENTITY FULL` contains only primary keys, not full column data. Not currently needed for this phase's INSERT-only consumption pattern (Phase 10 subscribes to INSERT events only, per milestone ARCHITECTURE.md), but worth noting so a future phase doesn't assume otherwise.

## Code Examples

### `034_member_identity_wave4.sql` (illustrative skeleton)

```sql
-- New columns only; the other six are already live (migration 010) — IF NOT
-- EXISTS documents intent without risk of clobbering existing data/types.
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS member_type TEXT NOT NULL DEFAULT 'artist'
    CHECK (member_type IN ('artist', 'industry')),
  ADD COLUMN IF NOT EXISTS banner_url          TEXT,
  ADD COLUMN IF NOT EXISTS pronouns            TEXT,
  ADD COLUMN IF NOT EXISTS open_to             JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS featured_project_id UUID;
  -- ^ these four are no-ops in practice (already exist from migration 010) —
  -- kept here only so the migration is self-documenting about the full
  -- Phase 8 identity column set without assuming migration history knowledge.

-- search_vector — see Pitfall 5 for why the two-arg to_tsvector form is required.
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(artist_name, '') || ' ' ||
      array_to_string(genres, ' ') || ' ' ||
      coalesce(location, '') || ' ' ||
      array_to_string(industry_roles, ' ') || ' ' ||
      coalesce(handle, '') || ' ' ||
      coalesce(bio, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_artist_profiles_search_vector
  ON artist_profiles USING GIN (search_vector);

-- D-16: featured_project_id restricted to public/released projects, self-nulls
-- if the target is later unpublished.
CREATE OR REPLACE FUNCTION check_featured_project_is_public()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.featured_project_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM vault_projects
      WHERE id = NEW.featured_project_id AND is_public = true
    ) THEN
      RAISE EXCEPTION 'featured_project_id must reference a public vault_project';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER artist_profiles_featured_project_check
  BEFORE INSERT OR UPDATE OF featured_project_id ON artist_profiles
  FOR EACH ROW EXECUTE FUNCTION check_featured_project_is_public();

-- Self-null when a featured project is unpublished (is_public flips to false).
CREATE OR REPLACE FUNCTION clear_featured_if_unpublished()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_public = false AND OLD.is_public = true THEN
    UPDATE artist_profiles SET featured_project_id = NULL
    WHERE featured_project_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER vault_projects_clear_featured_on_unpublish
  AFTER UPDATE OF is_public ON vault_projects
  FOR EACH ROW EXECUTE FUNCTION clear_featured_if_unpublished();
```

### `038_artist_profiles_column_privileges.sql` (illustrative skeleton — D-10/D-11)

```sql
-- PUBLIC set (D-11) — includes the 6 pre-existing "showcase" columns plus
-- the 2 genuinely new ones from this phase.
REVOKE SELECT ON artist_profiles FROM authenticated, anon;
GRANT SELECT (
  id, artist_name, genres, location, bio, career_stage,
  instagram_handle, threads_handle, tiktok_handle, spotify_url,
  monthly_listeners, total_streams, industry_roles, handle,
  member_type, pronouns, banner_url, open_to, featured_project_id,
  search_vector, avatar_url, verified, roles, is_public,
  created_at, updated_at
) ON artist_profiles TO authenticated, anon;

-- UPDATE: owner-editable public columns only (private fields excluded —
-- those go through the service-role path per Pitfall 1's companion fix).
REVOKE UPDATE ON artist_profiles FROM authenticated;
GRANT UPDATE (
  artist_name, genres, location, bio, career_stage,
  instagram_handle, threads_handle, tiktok_handle, spotify_url,
  monthly_listeners, industry_roles, handle, pronouns, banner_url,
  open_to, featured_project_id, roles
) ON artist_profiles TO authenticated;

-- Private columns (legal_*, contact_phone, mailing_address, pro, ipi,
-- publisher, mlc_id, soundexchange_id): no grant at all for authenticated
-- or anon. Owner-self reads/writes go through createServiceClient() with
-- an explicit auth.uid()===id check performed first (Pitfall 1).
```

### `handle_new_user()` — industry branch (illustrative — see Pitfall 2/3)

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.raw_app_meta_data->>'role') = 'curator' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.pending_industry_invites WHERE email = NEW.email) THEN
    INSERT INTO public.artist_profiles (id, member_type, artist_name, industry_roles)
    SELECT NEW.id, 'industry', display_name, role_badges
    FROM public.pending_industry_invites WHERE email = NEW.email;

    BEGIN
      DELETE FROM public.pending_industry_invites WHERE email = NEW.email;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- swallow cleanup failure; profile insert above already committed
    END;

    RETURN NEW; -- no subscriptions insert, no claim_collaborators() for industry
  END IF;

  INSERT INTO public.artist_profiles (id) VALUES (NEW.id);
  INSERT INTO public.subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active');

  BEGIN
    PERFORM public.claim_collaborators(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| App-layer-only column allowlists (`EDITABLE_FIELDS` in `app/api/profile/route.ts`) | Column-level `REVOKE`/`GRANT` enforced at the database, app-layer allowlist as defense-in-depth only | Already established in-codebase since migration 031 (Wave 3) | This phase extends the same discipline to `artist_profiles`, the table with the widest existing exposure |
| Post-insert `UPDATE` to set `app_metadata.role` | Set `app_metadata` at `admin.createUser()` time, or (this phase, Pitfall 2) a pending-invite side-channel table when the invite method can't carry `app_metadata` | Established migration 030 (Wave 3); extended this phase for the `inviteUserByEmail()` case | Prevents the identity-race phantom-row bug documented in CRITICAL-3 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Industry members should NOT get a `subscriptions` row (free-tier pitch credits etc. are artist/Vault-tier concepts) | Pitfall 2/3, Code Examples | If industry members do need some subscription-adjacent gating later, the `handle_new_user()` industry branch needs a follow-up migration to add it — low risk, additive fix |
| A2 | `SECURITY DEFINER` function `no_block()` should not be directly RPC-callable via PostgREST and should have `EXECUTE` revoked from `PUBLIC`/`anon`/`authenticated` except where explicitly needed | Architecture Patterns (Blocks Table) | If a future phase needs `no_block()` callable directly from the client (e.g., a "can I message this person" pre-check), the grant will need to be added back — low risk, but must be verified against an actual RLS policy + a direct `supabase.rpc()` call in the target Supabase project, not assumed from docs alone |
| A3 | The recommended `pending_industry_invites` reconciliation (Pitfall 2) is the best resolution to the D-01/D-03 contradiction, as opposed to simply dropping D-03's "no new email template" constraint and using `createUser()` + a custom Resend-sent invite email | Pitfall 2 | If the user/planner prefers the simpler `createUser()` + custom email path over the extra table, this changes Phase 8's migration set (no `pending_industry_invites` table needed) and adds a small Resend template task instead — a real tradeoff decision, not a slam-dunk, and should be confirmed with the user before locking into planning |
| A4 | Mapping `INDUSTRY_ROLE_GROUPS` picks to an initial `roles` (JSONB) badge entry at industry-member creation time is the right fix for Pitfall 4, rather than changing what `ProfileView.tsx` renders to read from `industry_roles` instead of `roles` | Pitfall 4 | If the "correct" fix is actually to change what the profile page renders from (not what `createIndustryMember()` writes), this affects Phase 9 more than Phase 8 — flagged as an open question, not a locked assumption |

**If this table is empty:** N/A — see entries above; all four require explicit confirmation before the planner treats them as final.

## Open Questions

1. **Does `createIndustryMember()` need to populate the `roles` (JSONB) badge column, not just `industry_roles`, at creation time?**
   - What we know: `industry_roles` alone (as D-04 currently specifies) leaves the profile page showing zero badges, since `ProfileView.tsx` renders from `roles`, not `industry_roles`.
   - What's unclear: whether this is purely a Phase 8 schema/seed-data concern (populate both columns) or should instead be deferred to Phase 9 (which will touch `ProfileView.tsx`/profile editing anyway).
   - Recommendation: resolve in Phase 8 planning by deciding which column(s) `createIndustryMember()` writes; do not let it silently fall through to Phase 9 without an explicit decision, since D-04's stated goal ("profile has at least one role badge to render on day one") depends on it.

2. **Is the `pending_industry_invites` side-channel table the right reconciliation for the D-01/D-03 contradiction, or should D-03 be relaxed instead?**
   - What we know: `inviteUserByEmail()` cannot carry `app_metadata`; `createUser()` can but sends no email. The side-channel table preserves both D-01 and D-03 as stated, at the cost of one small new table.
   - What's unclear: whether the user, on hearing about this contradiction, would simply prefer to relax D-03 (accept a small custom Resend invite-email template, already have Resend wired per CLAUDE.md) rather than add a table.
   - Recommendation: surface this explicitly during `/gsd-plan-phase` or a follow-up `/gsd-discuss-phase` pass before locking the migration — this is exactly the kind of "user decision now, not organically discovered mid-planning" risk research-then-plan is supposed to prevent.

3. **Should industry members get a `subscriptions` row at all?**
   - What we know: The default artist branch inserts a free-tier `subscriptions` row; A1 assumes industry members skip this.
   - What's unclear: whether any future industry-facing paid tier (e.g., a "Pete's Network" style curation feature analogous to Antenna's `pete_exclusive`) will need a subscription row to exist for industry members later.
   - Recommendation: confirm with the user during planning; if uncertain, inserting a `subscriptions` row with `tier='free'` for industry members too is a safe, cheap default that doesn't foreclose either direction (a no-op row is far cheaper to have and ignore than to retrofit later).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI (`supabase db push`) | Applying migrations | Available via `npx supabase` (project devDependency, not globally installed) | 1.226.4 (installed; 2.109.0 exists upstream but this repo pins `^1.200.0`) | Use `npx supabase db push`, or apply SQL directly via the Supabase Dashboard SQL editor / management API (both already used as documented fallbacks in prior migrations' header comments) |
| Local Postgres instance for pre-flight testing | Verifying `EXPLAIN`/generated-column syntax before pushing to the live project | Not checked — no `supabase start` local stack confirmed running in this session | — | `supabase db push` targets the remote project directly per this repo's existing convention (no evidence of a local-first workflow in `package.json` scripts beyond `db:types`/`db:push`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Owner-self-service fix (Pitfall 1), `createIndustryMember()` | Confirmed present (used throughout the existing codebase via `createServiceClient()`) | — | — |

**Missing dependencies with no fallback:** None — this phase has no dependency that blocks execution.

## Validation Architecture

No test framework exists in this project (confirmed: no test runner in `package.json` devDependencies, no `tests/`/`__tests__/` directories in this repo — consistent with CLAUDE.md's own "No test framework in dependencies (testing infrastructure not detected)" note). This phase is pure SQL/migration + a handful of server-side data-access edits with no UI surface (except D-02's small `/admin/members` page), so "tests" here means **migration-verification SQL assertions**, run manually against the pushed migration, not an automated suite.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None (SQL assertion scripts run via `psql`/Supabase SQL editor) |
| Config file | none — see Wave 0 gaps below |
| Quick run command | `npx supabase db push --dry-run` (validates migration SQL parses/applies cleanly before touching the live project) |
| Full suite command | Manual SQL assertions (see below) run against the Supabase SQL editor or `psql "$SUPABASE_DB_URL"` after push |

### Phase Requirements → Test Map

Phase 8 has no mapped user-facing requirement IDs (per REQUIREMENTS.md's explicit phase note). Verification instead maps to the phase's own 5 success criteria:

| Success Criterion | Verification | Automated? | File Exists? |
|---|---|---|---|
| 1. Extended identity columns + GIN trigram index | `\d artist_profiles` shows `member_type`, `search_vector`; `SELECT * FROM pg_indexes WHERE tablename='artist_profiles' AND indexname LIKE '%search%'` | Manual SQL | ❌ Wave 0 |
| 2. `connections`/`blocks` RLS + `no_block()` | `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('connections','blocks')` returns `true`; manual test as two distinct users via `supabase.rpc()`/direct client calls | Manual SQL + manual client test | ❌ Wave 0 |
| 3. `notifications` extension + realtime; `dm_thread_reads` | `SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='notifications'` returns a row | Manual SQL | ❌ Wave 0 |
| 4. Column REVOKE/GRANT + no `SELECT *` breakage | As `authenticated` role: `SELECT legal_first_name FROM artist_profiles LIMIT 1` → expect `42501`; as owner via the app's Settings page → expect success (manual click-through, since D-02/owner-self-service is the one UI surface this phase touches) | Manual SQL + manual click-through | ❌ Wave 0 |
| 5. Industry identity without phantom-row race | Invite a test industry email via `createIndustryMember()`; confirm `artist_profiles.member_type='industry'` exists with no `subscriptions` row; confirm `pending_industry_invites` row was consumed/deleted | Manual (requires a real or staging Supabase Auth call) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx supabase db push --dry-run` (syntax/apply validation) after each migration file is written.
- **Per wave merge:** Full manual SQL assertion pass (table above) against the pushed state.
- **Phase gate:** All 5 manual assertions pass before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] No automated test harness exists for Postgres migrations in this repo — consider a lightweight `supabase/tests/` SQL assertion script (using `pgTAP` or plain `DO $$ ... RAISE EXCEPTION ...` blocks) if this pattern repeats across Phases 9-13; not required to build from scratch for Phase 8 alone given project convention, but flag as a recurring cost if skipped every phase.
- [ ] No staging Supabase project confirmed distinct from production — verify whether migrations in this phase (especially the column REVOKE, which is behavior-changing) should be tested against a staging project before the live push, given this phase touches an already-live table with real user data.

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` (`.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Yes | Supabase Auth (existing); this phase adds `admin.createUser()`/`inviteUserByEmail()` orchestration for industry members — no new auth mechanism, reuses existing session/JWT model |
| V3 Session Management | No (unchanged) | — |
| V4 Access Control | Yes | RLS on every new table (`connections`, `blocks`, `notifications` extension, `dm_thread_reads`, `pending_industry_invites`, `reserved_handles`); `no_block()` SECURITY DEFINER helper gates cross-table access; `verifyAdmin()` reuse for `/admin/members` |
| V5 Input Validation | Yes | `member_type` CHECK constraint; `connections.status` CHECK constraint; `blocks` self-block CHECK; reserved-handle lookup at handle-claim time |
| V6 Cryptography | No — no new secrets/tokens introduced this phase | — |
| V8 Data Protection | Yes | This phase's core deliverable — column-level REVOKE/GRANT lockdown of private PII fields (legal name, phone, mailing address, PRO/IPI/publisher/MLC/SoundExchange IDs) on `artist_profiles`, closing a pre-existing exposure (D-10) |
| V13 API and Web Service | Yes | `/admin/members` API route must independently re-verify `is_admin` (matching `lib/admin/gate.ts`'s existing pattern), not rely on layout-level redirect alone |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Column-level PII exposure via direct PostgREST `SELECT *` | Information Disclosure | REVOKE/GRANT column privileges (this phase's core fix) — but see Pitfall 1 for the required companion code change so the fix doesn't also break legitimate owner-self-reads |
| Block evasion via direct PostgREST bypass of UI-only enforcement | Information Disclosure / Elevation of Privilege | `no_block()` SECURITY DEFINER referenced in RLS policies on every socially-exposed table (D-15), not app-layer-only |
| Identity race — phantom `artist_profiles` row from mistimed `app_metadata` | Elevation of Privilege / Tampering | Never rely on `app_metadata` timing for a method that can't carry it atomically (Pitfall 2); trigger keys off a side-channel table instead |
| Handle squatting / impersonation | Spoofing | `reserved_handles` lookup at claim time (D-13/D-14) |
| SECURITY DEFINER search-path hijacking | Tampering / Elevation of Privilege | `SET search_path = ''` (or fully-qualified names) on every SECURITY DEFINER function (`no_block()`, any trigger function) |

## Sources

### Primary (HIGH confidence)
- Direct codebase read: `supabase/migrations/001,009,010,012,014,020,021,022,027,030,031,033` — full schema/RLS/trigger history through the current live state
- Direct codebase grep: `.select('*')`/`.select()` call sites against `artist_profiles` across `app/(artist)/settings/page.tsx`, `app/profile/page.tsx`, `app/u/[handle]/page.tsx`, `app/api/profile/route.ts`
- Direct SDK type inspection: `node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.d.ts`, `lib/types.d.ts` — `inviteUserByEmail`/`createUser`/`generateLink` option shapes
- [PostgreSQL Full Text Search — Tables and Indexes](https://www.postgresql.org/docs/current/textsearch-tables.html) — official `to_tsvector('english', ...)` generated-column example
- [Supabase Column-Level Security](https://supabase.com/docs/guides/database/postgres/column-level-security) — `SELECT *` failure behavior under column restrictions
- [Supabase Realtime — Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) — RLS-per-subscriber delivery, `REPLICA IDENTITY` DELETE caveat

### Secondary (MEDIUM confidence)
- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions) — `SECURITY DEFINER` + `search_path` pinning best practice
- `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md` (milestone-level Wave 4 research, 2026-07-03) — connections/blocks table shape draft, `no_block()` draft, column-privilege analysis (used as a starting point, corrected against direct codebase verification in several places — see Pitfall 1 and the `industry_roles`-as-private discrepancy noted in Open Questions)
- GitHub Discussions cited in web search results on `inviteUserByEmail()` "already registered" behavior for existing users (supabase/auth#2180, supabase discussions #35645) — corroborates that re-inviting an already-created user is not a viable workaround

### Tertiary (LOW confidence)
- None — all claims above are either direct codebase verification, direct SDK inspection, or official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, pure Postgres/Supabase native features, all verified against official docs or direct SDK inspection
- Architecture: HIGH — connections/blocks/notifications shape is direct extension of already-proven in-codebase patterns (migrations 009/012/014/030/031)
- Pitfalls: HIGH on Pitfalls 1/2/3/5/6 (all independently verified via direct code/SDK/docs inspection, not training-data recall); MEDIUM on Pitfall 4 and the Open Questions' recommended resolutions (these are this research's own design reconciliations, not pre-validated patterns — flagged for explicit user/planner confirmation)

**Research date:** 2026-07-04
**Valid until:** 30 days (stable Postgres/Supabase mechanics; the SDK-shape findings should be re-verified if `@supabase/supabase-js`/`@supabase/auth-helpers-nextjs` are upgraded before this phase executes, since option shapes could change between major versions)

