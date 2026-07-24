# Phase 20: Profile Table Rename (artist_profiles → user_profiles) - Research

**Researched:** 2026-07-24
**Domain:** PostgreSQL zero-downtime table rename via compatibility view (Supabase/PostgREST), TypeScript symbol rename across a Next.js codebase
**Confidence:** HIGH

## Summary

This phase renames the canonical profile table `artist_profiles` → `user_profiles` with zero downtime, using the textbook Postgres pattern: rename the table, then create a temporary **updatable compatibility view** under the old name so already-deployed code (which still calls `.from('artist_profiles')`) keeps reading and writing correctly until the new code deploys and the view is dropped.

The mechanics are well-understood and low-risk **once one thing is done correctly**: the compat view MUST be created `WITH (security_invoker = on)`. Without it, PostgreSQL 15's default view behavior checks underlying-table access as the **view owner** (in this codebase, effectively the migration-running admin role, which owns/bypasses RLS) rather than the calling `authenticated`/`anon` role — silently turning the view into an RLS bypass where any signed-in user could read or write any other user's profile row through the compat view during the deploy gap. This is confirmed PostgreSQL 15 behavior, not a hypothetical [VERIFIED: PostgreSQL/Supabase/pganalyze sources — see Sources]. `security_invoker = on` is available and appropriate here (Supabase's local `supabase/config.toml` pins `major_version = 15`) [VERIFIED: supabase/config.toml].

A `CREATE VIEW artist_profiles AS SELECT * FROM user_profiles` satisfies every rule for Postgres's **automatically-updatable view** mechanism (single relation in FROM, no DISTINCT/GROUP BY/aggregates/set ops), so INSERT/UPDATE/DELETE against the view rewrite transparently into the underlying table with no INSTEAD OF triggers needed [VERIFIED: PostgreSQL docs]. The second thing that must not be skipped: **the view is a brand-new relation and does not inherit the underlying table's GRANTs.** Privileges on a view are independent of privileges on its base tables [VERIFIED: PostgreSQL docs / Supabase privileges guide] — migration 076 must explicitly re-issue the exact same column-scoped `GRANT SELECT (...)`/`GRANT UPDATE (...)` to `authenticated, anon` that migrations 040/043/054/058 already apply to the renamed table, or old deployed code hitting the view gets `42501 permission denied` the instant 076 lands.

Because this is a **plain single-table `ALTER TABLE ... RENAME TO`** (not a create-new-table-and-copy swap), the table's OID is unchanged, so every dependent object that references it **by OID** — RLS policies on the table itself, triggers, foreign keys, GRANTs — continues working automatically with zero changes needed [VERIFIED: PostgreSQL OID/dependency mechanism]. What does **not** auto-update: (1) index/constraint/trigger **names** that happen to embed `artist_profiles` (cosmetic only, safe to leave), and (2) **function body text** — six PL/pgSQL/SQL functions in this codebase contain literal SQL referencing `artist_profiles` inside their body and MUST be `CREATE OR REPLACE`d in migration 076 with the reference changed to `user_profiles`, or they will start erroring (or silently routing through the transitional view, then breaking) once the rename lands. These six are enumerated precisely below from direct migration-file inspection, not estimation.

**Primary recommendation:** Migration 076 does five things in one file — (1) `ALTER TABLE artist_profiles RENAME TO user_profiles`; (2) `CREATE OR REPLACE FUNCTION` for the 6 functions whose bodies literally say `artist_profiles`; (3) `CREATE VIEW artist_profiles AS SELECT * FROM user_profiles WITH (security_invoker = on)`; (4) explicit column-scoped GRANTs on the view matching the table's current grants; (5) `NOTIFY pgrst, 'reload schema'`. Deploy the code (single grep-and-replace across ~97 files: 80 non-test app/lib/component/type files + middleware.ts + 16 test files, all verified by direct grep, plus the `ArtistProfile`→`UserProfile` type rename across its 20 importers). Run the D-04 smoke-test gate. Soak. Migration 077 drops the view.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Table rename + compat view + grants | Database / Storage | — | Pure schema-layer change; no app-tier logic |
| `handle_new_user()` / trigger function bodies | Database / Storage | — | SECURITY DEFINER trigger functions live entirely in Postgres |
| `claim_collaborators()` / `backfill_claimed_collaborators()` repoint | Database / Storage | — | Already re-pointed to `artist_profiles` in Phase 19 (migration 072); this phase only follows the rename |
| Green Room visibility functions (`green_room_can_view_post`, `green_room_post_matches_custom_audience`) | Database / Storage | — | SECURITY DEFINER SQL functions called from RLS policies |
| `.from('artist_profiles')` query strings | API / Backend + Frontend Server (SSR) | — | Both API routes (`app/api/**`) and server components (`app/(artist)/**/page.tsx`) issue these calls directly against Supabase |
| `ArtistProfile` → `UserProfile` type rename | API / Backend + Frontend Server (SSR) | Browser (client components) | `types/index.ts` is imported by both server routes/pages and a handful of client components (e.g. `ProfileForm.tsx`) |
| PostgREST schema cache reload (`NOTIFY pgrst`) | Database / Storage | API / Backend | The notification is a DB-side `NOTIFY`; its effect (PostgREST re-exposing the renamed relation + view) is consumed by every API request |
| Vercel deploy between push #1 and push #2 | CDN / Static (build) + API / Backend | — | The code deploy is the synchronization point between the two human-gated migrations |

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

- **D-01: Compatibility-view rename.** Migration **076** renames `artist_profiles` → `user_profiles` AND creates a temporary **updatable** `artist_profiles` view over `user_profiles`, so old deployed code keeps working — reads **and** writes pass through — during the deploy gap. Then the new code deploys (reads `user_profiles`). Then migration **077** drops the view. This is the textbook zero-downtime table rename; it eliminates the DB-ahead-of-code race that bit Phase 19.
- **D-02: 2 human-gated migration pushes with the code deploy between them** (076 → deploy → 077). Safe in both directions and safe to roll back: if the post-076 deploy fails, redeploy the prior code — it still reads `artist_profiles` via the view; nothing to un-migrate.
- **D-03: Rename scope.** Rename the DB table + every `from('artist_profiles')` query string + the `ArtistProfile` TypeScript type → `UserProfile` (name freed by Phase 19's deletion of the old duplicate `UserProfile`). **Leave** incidental local variable names (`artistProfile`, `myProfileRow`, etc.) as-is — internal, low value, high churn. The `/api/profile` route URL is unchanged. `tsc --noEmit` is the completeness check for any missed reference.
- **D-04: Smoke-test gate.** After the code deploy, BEFORE push #2 drops the view, the **full smoke-test set** must pass: signup on all 3 `handle_new_user` branches (artist / industry / curator), public profile (`/u/[handle]`, `/r/[projectId]`), a split sheet, a Settings rights save, a metadata/registration read, and confirm the `NOTIFY pgrst` schema reload took effect.
- **D-05: Drop timing.** After smoke tests pass, keep the compat view for a **short soak** (until old warm serverless instances drain / a low-traffic window), THEN push #2 drops it. Cheap insurance against a straggler old instance still calling `artist_profiles`.

### Claude's Discretion

- The precise per-file sequencing of the ~79 runtime reference updates, the generated-types regeneration, the exact `CREATE VIEW` definition + its RLS/write-through mechanics (researcher/planner confirms updatable-view + RLS behavior), and the migration file bodies. Not user-facing decisions.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. (The `industry_profiles` vs `member_type` reconciliation remains a separate future item, unchanged from Phase 19's out-of-scope note.)

</user_constraints>

## Project Constraints (from CLAUDE.md)

- **GSD workflow enforcement**: all file-changing work in this repo goes through a GSD command (`/gsd-execute-phase` for this planned phase work) — no direct ad hoc edits.
- **Human-gated migrations (this phase's most important constraint)**: the executor must NEVER run `supabase db push`. Every schema change is a NEW migration file — next free numbers are **076** and **077** (075 is latest, confirmed via `ls supabase/migrations/`). Historical migrations are immutable — new files only, verified via `supabase migration list` (LOCAL=REMOTE).
- **TypeScript strict mode**, 2-space indent, **no semicolons**, named exports (not default), all imports via `@/*` alias (never relative `../`).
- **Naming conventions**: PascalCase types (`ArtistProfile` → `UserProfile` fits this), camelCase functions/variables, `@/lib/[domain]/` module organization.
- **Error handling**: descriptive `Error` instances, `{ error, data }` destructuring, explicit ownership checks before service-role writes — the pattern already used throughout `app/api/profile/route.ts` and unaffected by this rename.
- **No console.log in committed code** — this phase's migrations use `RAISE NOTICE` (already the established pattern in 071) if any diagnostic output is needed, not application logging.
- **Comments**: this phase's migration files should follow the established convention (see `supabase/migrations/070_*.sql`, `075_*.sql`) — a header block explaining the "why," inline notes on any non-obvious GRANT/REVOKE/SECURITY DEFINER decision, and an explicit "An executor agent must NEVER run `supabase db push` for this migration" footer.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────┐
                         │   OLD deployed serverless instances      │
                         │   (pre-076 code, still warm on Vercel)   │
                         └───────────────┬───────────────────────────┘
                                         │ .from('artist_profiles')
                                         │ SELECT / INSERT / UPDATE / DELETE
                                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PostgREST (Supabase Data API)                                          │
│   - resolves "artist_profiles" against its schema cache                │
│   - after migration 076 + NOTIFY pgrst, that name now points at a VIEW │
└───────────────────────────────┬──────────────────────────────────────┘
                                 ▼
              ┌──────────────────────────────────────────┐
              │  VIEW public.artist_profiles              │
              │  WITH (security_invoker = on)             │
              │  SELECT * FROM public.user_profiles        │
              │  (automatically updatable — Postgres       │
              │   rewrites INSERT/UPDATE/DELETE directly   │
              │   onto the base table)                     │
              │  GRANTs: SELECT(cols)/UPDATE(cols) to      │
              │  authenticated, anon — re-issued explicitly│
              └───────────────────┬─────────────────────────┘
                                  │ RLS evaluated as INVOKING role
                                  │ (security_invoker=on), not view owner
                                  ▼
              ┌──────────────────────────────────────────┐
              │  TABLE public.user_profiles                │
              │  (was artist_profiles — same OID, same RLS │
              │   policies, same triggers, same FKs,       │
              │   same indexes — all followed automatically)│
              └───────────────────┬─────────────────────────┘
                                  ▲
                                  │ .from('user_profiles')  (direct, no view)
                         ┌────────┴───────────────────────────────┐
                         │   NEW deployed serverless instances      │
                         │   (post-076 code, deployed between the   │
                         │   two migration pushes)                  │
                         └───────────────────────────────────────────┘

Sequencing:
  push #1 (076: rename + view + grants + function repoint + NOTIFY)
    → Vercel deploy of new code (reads user_profiles directly)
      → D-04 smoke-test gate (signup×3, public profile, split sheet,
        Settings save, metadata/registration read, pgrst reload confirm)
        → soak (D-05: drain old warm instances / low-traffic window)
          → push #2 (077: DROP VIEW artist_profiles)
```

### Recommended Migration Structure

```
supabase/migrations/
├── 076_rename_artist_profiles_to_user_profiles.sql   # rename + view + grants + 6 function repoints + NOTIFY
└── 077_drop_artist_profiles_compat_view.sql          # DROP VIEW only, after soak
```

### Pattern 1: Zero-downtime rename via updatable compatibility view

**What:** Rename the table, then stand up a same-named view so old code paths (reads AND writes) pass through unmodified during the deploy gap.
**When to use:** Any table rename where old and new application code will run simultaneously against the same database — the exact situation here (serverless deploys are not atomic; multiple Vercel instances/regions cut over at different times).
**Example (migration 076 shape):**
```sql
-- Source: PostgreSQL 15/18 CREATE VIEW docs (automatically-updatable views)
-- + PostgreSQL 15 release notes (security_invoker)
-- ─── 1. Rename (OID-preserving; RLS/triggers/FKs/grants on the table
--         itself follow automatically) ───────────────────────────────
ALTER TABLE artist_profiles RENAME TO user_profiles;

-- ─── 2. Re-create the 6 functions whose bodies literally say
--         "artist_profiles" (function bodies are text, NOT OID-linked;
--         they do not auto-follow a rename) ──────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user() ...
  -- INSERT INTO public.artist_profiles  →  INSERT INTO public.user_profiles
CREATE OR REPLACE FUNCTION public.clear_featured_if_unpublished() ...
  -- UPDATE public.artist_profiles  →  UPDATE public.user_profiles
CREATE OR REPLACE FUNCTION public.green_room_post_matches_custom_audience(...) ...
  -- LEFT JOIN public.artist_profiles  →  LEFT JOIN public.user_profiles
CREATE OR REPLACE FUNCTION public.green_room_can_view_post(...) ...
  -- FROM public.artist_profiles  →  FROM public.user_profiles
CREATE OR REPLACE FUNCTION public.claim_collaborators(...) ...
  -- multiple FROM/UPDATE public.artist_profiles  →  public.user_profiles
CREATE OR REPLACE FUNCTION public.backfill_claimed_collaborators(...) ...
  -- FROM/UPDATE public.artist_profiles  →  public.user_profiles
-- (CREATE OR REPLACE preserves each function's existing GRANT EXECUTE
--  state, per this codebase's own migration-075 comment — no re-grant
--  needed unless intentionally changing it.)

-- ─── 3. Compatibility view (THE critical security clause) ────────────
CREATE VIEW artist_profiles WITH (security_invoker = on) AS
  SELECT * FROM user_profiles;

-- ─── 4. Explicit GRANTs on the view (views do NOT inherit the base
--         table's privileges — must be re-issued, verbatim, matching
--         migrations 040/043/054/058's cumulative column lists) ──────
GRANT SELECT (id, artist_name, genre, genres, ... , last_seen_at, allow_resharing)
  ON artist_profiles TO authenticated, anon;
GRANT UPDATE (artist_name, genres, location, ... , roles)
  ON artist_profiles TO authenticated;
-- No INSERT/DELETE grant — the table itself never granted these to
-- authenticated/anon either (writes/inserts go through
-- createServiceClient(), which bypasses RLS + column grants entirely).

-- ─── 5. Force PostgREST to see the renamed table + new view ───────────
NOTIFY pgrst, 'reload schema';
```

### Pattern 2: Symbol-level rename (TypeScript layer)

**What:** Every `.from('artist_profiles')` string literal → `.from('user_profiles')`; the `ArtistProfile` type → `UserProfile`; leave local variable names alone (D-03).
**When to use:** After migration 076 is live and the compat view exists — the new code can be written/reviewed at any time before that, but should not deploy until 076 has landed (otherwise the new code 404s against a table that doesn't exist yet).
**Verified counts (direct grep, not estimation):**
- 87 exact `.from('artist_profiles')` / `.from("artist_profiles")` call sites across 80 non-test files (`app/`, `lib/`, `components/`, `types/`) + `middleware.ts` + 16 test files under `__tests__/` (tsconfig's `include: ["**/*.ts", "**/*.tsx"]` type-checks all of these, so `tsc --noEmit` per D-03 will catch a missed rename in ANY of them, test files included).
- 20 files import/use the `ArtistProfile` type (`types/index.ts` plus its 19 importers, including `app/api/profile/route.ts`, `components/profile/ProfileForm.tsx`, `lib/profile/load.ts`, `lib/tools/*.ts`).
- The ROADMAP's "~79 runtime files" figure is close to the 80 non-test files found; the ~97 total (adding middleware.ts + tests) is the true completeness bound `tsc --noEmit` + a full-repo grep should both confirm zero.

### Anti-Patterns to Avoid

- **Table-swap instead of rename:** Do NOT implement this as "create a new `user_profiles` table, copy rows, point new code at it." That pattern creates a NEW OID, so RLS policies/triggers/FKs on the OLD table do not follow — every one of the 6 SECURITY DEFINER functions, both `artist_profiles`-only RLS policies, and every FK from `capability_grants`/`verification_audit_log` would need manual re-creation, and in-flight writes during the copy window can be lost. `ALTER TABLE ... RENAME TO` is strictly simpler and safer here since it's a same-OID, same-data operation with zero data migration.
- **Creating the view WITHOUT `security_invoker = on`:** silently reintroduces an RLS bypass (see Common Pitfalls #1). This is the single highest-severity mistake available in this migration.
- **Assuming the view inherits the table's GRANTs:** it does not (see Common Pitfalls #2). Skipping the explicit GRANT step produces `42501 permission denied for view "artist_profiles"` for every `authenticated`/`anon` request from old code the instant 076 lands — effectively an immediate outage, the opposite of the zero-downtime goal.
- **Leaving DB function bodies pointed at the view during the transition, planning to "fix later":** functions like `claim_collaborators()` are being `CREATE OR REPLACE`d in this same migration anyway (per Phase 19's 072); there's no reason to route their internal reads through the transitional view rather than the renamed table directly. Point them straight at `user_profiles`.
- **Renaming index/constraint/trigger names for cosmetic consistency in this same migration:** `artist_profiles_handle_lower_uniq`, `artist_profiles_is_public_idx`, `idx_artist_profiles_search_vector`, `artist_profiles_updated_at`, `artist_profiles_search_vector_trigger`, `artist_profiles_featured_project_check`, `artist_profiles_handle_not_reserved`, and the FK constraint `artist_profiles_featured_project_fk` all keep their old literal names after the table rename — this is expected Postgres behavior (index/constraint/trigger names are independent identifiers, not derived from the table name at read time) and is purely cosmetic. Renaming them adds risk (each `RENAME INDEX`/`RENAME CONSTRAINT` takes its own lock) for zero functional benefit and is explicitly not requested by CONTEXT.md — leave them as-is.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Zero-downtime rename | A custom dual-write trigger/shim table, or an app-level feature flag switching between two table names | The `RENAME TO` + updatable-view pattern | This is Postgres's own built-in mechanism (automatically-updatable views), requires zero custom trigger code, and is a well-documented, widely-used pattern (Percona and others document this exact recipe) |
| RLS-safe view | A custom `SECURITY DEFINER` wrapper function re-implementing the table's policies | `WITH (security_invoker = on)` (PG15+) | This is the purpose-built, one-line Postgres 15 feature for exactly this problem; a hand-rolled DEFINER wrapper would have to reimplement `auth.uid()`-based policy logic and risks getting it wrong |
| Symbol rename completeness check | A manually-maintained checklist of files | `tsc --noEmit` (per D-03) + a full-repo `grep -rn "artist_profiles"` outside historical migrations | TypeScript's own type checker will fail to compile any `.from('user_profiles')` call whose result is still typed/destructured against the old `ArtistProfile` shape if the two drift, and it catches every import site of the renamed type mechanically |

**Key insight:** every piece of this phase — the view, the invoker semantics, the updatable-view rewrite, the OID-based dependency tracking — is native, well-tested PostgreSQL machinery, not custom application code. The risk in this phase is entirely in **remembering to invoke each mechanism correctly** (the `security_invoker` clause, the explicit view GRANTs, the 6 function repoints), not in building anything new.

## Runtime State Inventory

> Included per protocol — Phase 20 is a rename phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — this is a pure `ALTER TABLE RENAME`, not a data migration. Every row, column value, and column name in `artist_profiles`/`user_profiles` is byte-identical before and after; no data transformation, backfill, or copy occurs. (Contrast with Phase 19's migrations 071–073, which DID move data between two distinct tables — that data movement is already complete and out of scope here.) | None |
| Live service config | None found. No Supabase Storage bucket, Vercel cron (`vercel.json` has no reference to `artist_profiles`), Stripe webhook config, or Resend template references the table name. Green Room / trust-safety SQL functions reference the table only inside their own function bodies (covered above), not via any external service config. | None |
| OS-registered state | None — this is a hosted Supabase/Vercel deployment; no local OS-level task scheduler, pm2, or systemd registrations exist in this project (confirmed: no such tooling appears in `package.json` or the repo). | None |
| Secrets/env vars | None — grep of `.env.example` and the codebase's env-var reads shows no secret key or environment variable named after `artist_profiles`; Supabase connection env vars (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.) are table-name-agnostic. | None |
| Build artifacts | `types/supabase.ts` (the `supabase gen types typescript` output referenced by `package.json`'s `db:types` script) is **not committed to the repo** (confirmed: `find . -iname "*database.types*" -o -iname "*supabase-types*"` outside `node_modules` returns nothing) and is not imported anywhere — this codebase's only Supabase type surface is the hand-maintained `types/index.ts` `ArtistProfile` type (D-03's target). No stale generated-types artifact exists to regenerate or go stale. | None — confirms D-03's "generated-types regeneration" concern is moot; there is nothing to regenerate |

**Summary:** this rename phase has an unusually clean Runtime State Inventory — every category is genuinely empty, which is consistent with the phase being scoped as code + one schema rename, not a data migration or external-integration rename.

## Common Pitfalls

### Pitfall 1: Compat view created without `security_invoker = on` silently bypasses RLS
**What goes wrong:** By default (PG < 15 semantics, still the default in PG15 unless explicitly overridden), a view checks underlying-table access **as the view's owner**, not the querying role. If the view is created by the migration-running admin/postgres role (which owns/bypasses RLS on its own tables), every `authenticated`/`anon` request through the view sees and can modify **every row**, not just their own — a full cross-user PII/rights-data exposure for the duration the view exists.
**Why it happens:** This was long-standing Postgres behavior across all pre-15 versions, and `security_invoker` defaults to off; you must opt in explicitly per view.
**How to avoid:** `CREATE VIEW artist_profiles WITH (security_invoker = on) AS SELECT * FROM user_profiles;` — non-negotiable for this migration.
**Warning signs:** Any old-code smoke test that reads a DIFFERENT user's profile row through `/api/profile` or a public page and gets rights/PII data it shouldn't (e.g., another user's `contact_phone`/`mailing_address`) is proof this was skipped.

### Pitfall 2: The view does not inherit the table's GRANTs
**What goes wrong:** `GRANT SELECT (...)`/`GRANT UPDATE (...)` on `user_profiles` (from migrations 040/043/054/058, still attached post-rename by OID) do **not** apply to the newly created `artist_profiles` view — it is a separate relation with its own, empty-by-default privilege set (subject to whatever Supabase's default-privilege bootstrap grants new relations in `public`, which should NOT be relied upon — see Assumption A1). Old code hitting the view immediately gets `42501 permission denied`.
**Why it happens:** "Privileges on views are separate from privileges on the underlying tables" is explicit, documented Postgres behavior — a view is a first-class relation for privilege purposes even though it delegates query execution to the base table.
**How to avoid:** Re-issue the exact column-scoped GRANT statements on the view that migrations 040/043/054/058 issued on the table (SELECT column list + UPDATE column list, no INSERT/DELETE grant since the table never had one for authenticated/anon).
**Warning signs:** Any `permission denied for view "artist_profiles"` (or `for relation`) error in logs immediately after 076 deploys, before the code deploy has rolled out.

### Pitfall 3: Function bodies with literal `artist_profiles` text do not auto-follow the rename
**What goes wrong:** Unlike RLS policies/triggers/FKs (which reference the table by OID and are unaffected by rename), PL/pgSQL and SQL-language function BODIES are stored as literal source text and only resolve identifiers at each execution. Six functions in this codebase have `FROM`/`INTO`/`UPDATE`/`JOIN public.artist_profiles` literally in their body: `handle_new_user()` (039), `clear_featured_if_unpublished()` (034), `green_room_post_matches_custom_audience()` (060), `green_room_can_view_post()` (059), `claim_collaborators()` (072), `backfill_claimed_collaborators()` (072). If left unchanged, they would resolve against the transitional `artist_profiles` VIEW during the deploy gap (functionally working, since it's updatable) but then **break the moment migration 077 drops the view** — a silent time bomb.
**Why it happens:** Easy to assume "the rename cascades everywhere" because most dependent objects genuinely do cascade — functions are the one category that doesn't.
**How to avoid:** `CREATE OR REPLACE FUNCTION` all six in migration 076 itself, pointed directly at `user_profiles`, not left to resolve through the view.
**Warning signs:** Everything works fine through 076→deploy→smoke-tests→soak, then signup or Green Room feed queries start failing the moment 077 (view drop) lands — a classic "worked in the transition window, broke after cleanup" bug.

### Pitfall 4: `handle_new_user()` runs on every one of 3 signup branches — miss one, break one
**What goes wrong:** `handle_new_user()` (latest body in migration 039) has an `IF ... industry branch ... ELSE ... default (artist) branch ...` structure with `INSERT INTO public.artist_profiles` in **both** branches, plus curator accounts early-return with no insert at all. A partial fix (updating only one branch) breaks signup for the other member type.
**Why it happens:** The function was extended incrementally across migrations 001→027→030→039 for different member types; both live INSERT statements must be caught in the same CREATE OR REPLACE.
**How to avoid:** D-04's smoke-test gate explicitly requires signup on **all 3** `handle_new_user` branches (artist / industry / curator) — treat this as non-negotiable, not a "spot check one and assume the others are fine."
**Warning signs:** One member-type signup works, another silently fails to create a profile row (curator's early-return path making the deficiency easy to miss since it never inserts to begin with).

### Pitfall 5: PostgREST schema cache staleness after the view is created
**What goes wrong:** PostgREST caches the database schema (including which relations exist and their columns) and does not pick up `ALTER TABLE`/`CREATE VIEW` changes until its cache is refreshed. Without `NOTIFY pgrst, 'reload schema'`, requests against the renamed table OR the new view can 404/500 with stale-schema errors even though the SQL is correct.
**Why it happens:** This is documented PostgREST behavior (schema cache reload is opt-in via `NOTIFY` unless an event-trigger auto-reload is configured) — this codebase's own migration convention already issues `NOTIFY pgrst, 'reload schema'` at the end of migrations that change exposed shape (see 072/073), so the pattern is established, just must not be forgotten here.
**How to avoid:** End migration 076 with `NOTIFY pgrst, 'reload schema';`; D-04 explicitly lists "confirm the NOTIFY pgrst schema reload took effect" as a smoke-test item.
**Warning signs:** Intermittent "column not found"/relation errors that resolve themselves after a few minutes (cache eventually reloads on its own via connection cycling) — a symptom of a missed or delayed NOTIFY, not a real schema bug.

### Pitfall 6: Dropping the view too early races a straggler warm serverless instance
**What goes wrong:** Vercel serverless functions can stay warm and serving traffic on old code for some time after a new deploy completes (not all instances cut over instantly, especially across regions or under low traffic). If migration 077 drops the view immediately after the code deploy "looks done," a straggler old instance's next `.from('artist_profiles')` call 404s.
**Why it happens:** Serverless "deploy complete" in the platform UI does not guarantee every previously-warm instance has been recycled.
**How to avoid:** D-05's soak period is exactly this insurance — keep the view alive until either a defined wait window passes or a low-traffic window is reached, THEN push 077.
**Warning signs:** A spike of `PGRST` "relation does not exist" errors clustered shortly after 077 deploys, from a small number of requests — consistent with exactly one or two straggler instances.

## Code Examples

### The full migration 076 shape (illustrative — planner fills in exact grant column lists from migrations 040/043/054/058)
```sql
-- Source: this codebase's supabase/migrations/070_*.sql and 075_*.sql
-- header/footer conventions; PostgreSQL 15 CREATE VIEW docs; PostgreSQL
-- automatically-updatable-views docs (see Sources)

-- ============================================================
-- Funūn — Wave 2 (Phase 20: Profile Table Rename)
-- Migration 076: artist_profiles -> user_profiles (rename + compat view)
-- Run via: supabase db push
-- An executor agent must NEVER run `supabase db push` for this migration.
-- ============================================================

ALTER TABLE artist_profiles RENAME TO user_profiles;

-- (6x CREATE OR REPLACE FUNCTION — see Pattern 1 above for the exact
--  set: handle_new_user, clear_featured_if_unpublished,
--  green_room_post_matches_custom_audience, green_room_can_view_post,
--  claim_collaborators, backfill_claimed_collaborators — each byte-
--  identical to its current live body except artist_profiles ->
--  user_profiles in the SQL text.)

CREATE VIEW artist_profiles WITH (security_invoker = on) AS
  SELECT * FROM user_profiles;

REVOKE ALL ON artist_profiles FROM PUBLIC, authenticated, anon;
GRANT SELECT (/* exact column list from migration 040 + 043's
  allow_resharing + 054's last_seen_at additions */)
  ON artist_profiles TO authenticated, anon;
GRANT UPDATE (/* exact column list from migration 040 */)
  ON artist_profiles TO authenticated;

NOTIFY pgrst, 'reload schema';
```

### Migration 077 (after soak)
```sql
-- ============================================================
-- Funūn — Wave 2 (Phase 20: Profile Table Rename)
-- Migration 077: drop the artist_profiles compatibility view
-- PRECONDITION: D-04 smoke-test gate passed AND D-05 soak period elapsed.
-- Run via: supabase db push
-- An executor agent must NEVER run `supabase db push` for this migration.
-- ============================================================

DROP VIEW IF EXISTS public.artist_profiles;

NOTIFY pgrst, 'reload schema';
```

### Verifying grant parity after 076 lands (recommend as a scripted smoke-test step, not just visual inspection)
```sql
-- Source: PostgreSQL information_schema docs
SELECT grantee, privilege_type, column_name
FROM information_schema.role_column_grants
WHERE table_name = 'artist_profiles'
ORDER BY grantee, column_name;
-- Compare against the same query for table_name = 'user_profiles'
-- (pre-076) to confirm exact column-grant parity was reproduced on the view.
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Supabase's Postgres bootstrap grants `service_role` blanket privileges on newly-created relations (including views) in the `public` schema by default, so the compat view does not need an explicit `GRANT ... TO service_role` for the app's `createServiceClient()` writes to keep working. This is based on (a) this codebase's own migration-040 comment stating service_role "bypasses RLS and column grants entirely" and (b) a public Supabase changelog entry describing the platform's legacy default-privilege behavior for tables created before an opt-out change rolled out May 30, 2026 — this project predates that date. It has NOT been directly verified against this specific database's current default-privilege configuration for VIEWS specifically (vs. tables). [ASSUMED] | Pitfall 2 / Code Examples | If wrong, `createServiceClient()` writes through the view would 42501 during the deploy gap — but note the NEW code deployed between 076 and 077 writes directly to `user_profiles`, not through the view, so this would only affect OLD code's service-role paths (if any exist) during the gap. Low blast radius; still worth an explicit smoke-test check (query `information_schema.role_table_grants` for `service_role` on the view right after 076 lands, add an explicit `GRANT ALL ON artist_profiles TO service_role` defensively if absent). |
| A2 | `security_invoker` is genuinely available and behaves as documented on this project's actual Supabase-hosted Postgres instance (not just the local `supabase/config.toml`'s `major_version = 15` declaration) — i.e., the remote production database is confirmed running Postgres 15.x or later. [ASSUMED — local config strongly implies this but the live remote version was not independently queried in this research session] | Summary / Pattern 1 | If the remote database is somehow on an older major version despite the local config pin, `WITH (security_invoker = on)` would be a syntax/parameter error at migration time — this would fail loudly at the human-gated push (not silently), so the risk is a blocked push, not a silent security hole. Recommend confirming via `SELECT version();` as a first step of the migration 076 checkpoint, before the ALTER TABLE runs. |
| A3 | The Supabase-hosted `service_role`/`postgres` roles in this project have not been customized away from Supabase's standard bootstrap (i.e., no project-specific privilege lockdown has been applied to the schema-creation role itself). [ASSUMED] | Runtime State Inventory / Pitfall 2 | If wrong, some other role than expected owns newly created objects, potentially changing which role's privileges the view's owner-check would apply to pre-`security_invoker` (irrelevant once `security_invoker=on` is set correctly, but relevant if that clause is ever accidentally omitted). |

## Open Questions

1. **Exact GRANT column lists for migration 076.**
   - What we know: migrations 040 (base SELECT/UPDATE lists), 043 (`allow_resharing` addition), 054 (`last_seen_at` addition), and 058 (visibility/verification columns addition) each incrementally extended the table's column-level grants. The full current SELECT and UPDATE column lists are the union of all four.
   - What's unclear: whether any grant was ever revoked/narrowed after being added (a diff-through-time read, not just a grep) — this research read each migration's grant statements individually but did not execute a live `\dp+ artist_profiles` against the actual database to get the current ground truth in one query.
   - Recommendation: the planner's migration-076 task should have the executor run (or ask the human to run) `SELECT grantee, privilege_type, column_name FROM information_schema.role_column_grants WHERE table_name = 'artist_profiles';` against the LIVE remote database as a verification step before finalizing the GRANT statements in 076 — belt-and-suspenders against this research's migration-file reading missing a later narrowing.

2. **Does `service_role` need an explicit GRANT on the compat view?**
   - What we know: no explicit `GRANT ... TO service_role` exists anywhere in 24 migrations touching `artist_profiles`; service-role writes already work in production today via ambient default privileges (per this codebase's own migration-040 comment).
   - What's unclear: whether that ambient default-privilege bootstrap extends to newly-created VIEWS the same way it does to newly-created TABLES on this specific project (see Assumption A1).
   - Recommendation: add a defensive `GRANT ALL ON artist_profiles TO service_role;` to migration 076 regardless — it costs nothing (service_role already has equivalent-or-greater access via other paths) and removes the ambiguity entirely rather than relying on an unverified default.

## Environment Availability

Skipped — this phase's only external dependency is the already-live Supabase Postgres database and Vercel deployment pipeline, both of which are the existing production environment for this project (not new tooling to provision). The phase's actual gating mechanism is the human-gated migration push protocol (documented in `<project_context>`/CONTEXT.md), not tool availability.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (via `ts-jest`, transpile-only mode — `isolatedModules: true`) |
| Config file | `jest.config.js` |
| Quick run command | `npm test -- --testPathPattern=<relevant-suite>` |
| Full suite command | `npm test` (66 test suites under `__tests__/` at time of research) |

### Phase Requirements → Test Map

This phase has no formal `REQ-XX` IDs yet (20-SPEC.md is TBD per ROADMAP) — the D-01..D-05 decisions in 20-CONTEXT.md are the acceptance source. Mapping each to its verification mechanism:

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-01/D-02 (rename + view + 2-push sequencing) | DB object correctness (RLS/grants/functions repointed) | manual (live-DB SQL verification) | `SELECT ... FROM information_schema.role_column_grants ...` (see Code Examples) | N/A — live-DB check, not a repo test file |
| D-03 (symbol rename completeness) | Every `.from('artist_profiles')` and `ArtistProfile` reference updated | static/type-check | `npx tsc --noEmit` | ✅ — tsconfig already covers all `.ts`/`.tsx` |
| D-03 (no accidental behavior change) | Existing app logic unaffected by the rename | unit/integration (regression) | `npm test` (full 66-suite run) | ✅ — existing suite, no new files needed; a passing full run before AND after the rename is the regression proof |
| D-03 (build correctness) | App builds clean after rename | build | `npm run build` | ✅ — existing script |
| D-04 (smoke-test gate: 3 signup branches, public profile, split sheet, Settings save, metadata/registration read, pgrst reload) | Live-DB, post-deploy behavioral checks | manual-only (human UAT against the live/staging environment) | none automatable within this repo — these are live signup/click-through checks against a real Supabase project post-deploy | ❌ — inherently manual; no existing Jest suite exercises live signup against a real `auth.users` insert trigger chain |
| D-05 (soak before drop) | No straggler-instance breakage | manual (log monitoring) | monitor Vercel/PostgREST logs for `42P01`/`PGRST` relation-not-found spikes in the soak window | N/A |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` (catches any missed rename immediately, per D-03's own stated completeness check)
- **Per wave merge:** `npm test` (full suite) + `npm run build`
- **Phase gate:** Full suite green + `tsc --noEmit` clean BEFORE the migration 076 human-gated push; D-04's live smoke-test set green BEFORE the migration 077 human-gated push (these are two distinct gates, not one)

### Wave 0 Gaps
- None — no new test infrastructure is needed. `tsc --noEmit` and the existing 66-suite Jest run are sufficient automated coverage for the symbol-rename half of this phase (D-03). The DB-side half (D-01/D-02/D-04/D-05) is inherently a live-database, human-gated verification sequence that cannot be meaningfully unit-tested in this repo — the migration files themselves are the artifact under test, and their correctness is verified by the human-run `supabase migration list` (LOCAL=REMOTE) + the D-04 smoke-test checklist against the real deployed app, matching this project's established pattern for every prior schema migration (062–075).

*Note for the planner:* consider adding a lightweight **grep-based regression guard** as a plan task — e.g. a one-line CI/local check (`! grep -rn "artist_profiles" app lib components types --include="*.ts" --include="*.tsx" | grep -v "// " ` or similar) run right before the code-deploy task, to mechanically confirm zero remaining literal references outside comments before the human triggers the Vercel deploy. This is optional tooling, not a new test framework — Claude's Discretion per D-03's "precise per-file sequencing."

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This phase does not touch signup/login/session mechanics — `handle_new_user()`'s body changes are a table-name substitution only, not a logic change |
| V3 Session Management | No | Unaffected |
| V4 Access Control | **Yes** | The compat view's `security_invoker = on` clause IS the access-control-preserving mechanism for this phase — RLS policies must apply identically through the view as through the renamed table for the duration the view exists |
| V5 Input Validation | No | No new input surface; `/api/profile`'s existing `EDITABLE_FIELDS` allowlist is untouched |
| V6 Cryptography | No | Unaffected |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| View created without `security_invoker = on`, silently granting any authenticated/anon caller RLS-bypassing read/write access to every user's profile row through the old `artist_profiles` name | Elevation of Privilege / Information Disclosure | `WITH (security_invoker = on)` on the `CREATE VIEW` statement (Pitfall 1) — this is the single highest-severity risk this phase introduces if mishandled |
| View missing explicit column GRANTs, causing an unintended **wider-than-intended** re-grant if someone "fixes" the resulting 42501 errors by doing a blanket `GRANT ALL ON artist_profiles TO authenticated, anon` instead of the narrow column-scoped grant the table actually has | Elevation of Privilege / Information Disclosure | Explicitly copy the EXACT column-scoped SELECT/UPDATE lists from migrations 040/043/054/058 — never a blanket `GRANT ALL` (Pitfall 2) |
| `claim_collaborators()`/`backfill_claimed_collaborators()` remain SECURITY DEFINER cross-user-write functions (per migration 075's own hardening) — re-creating them in 076 must preserve the 075 `REVOKE ... FROM PUBLIC/anon/authenticated; GRANT ... TO service_role` posture, not accidentally reset it to a wider default via an incautious `CREATE OR REPLACE` | Elevation of Privilege | Confirmed: `CREATE OR REPLACE FUNCTION` preserves existing GRANT/REVOKE state when the signature is unchanged (this codebase's own migration-075 comment states this explicitly) — no additional action needed as long as 076 doesn't add a fresh `GRANT EXECUTE ... TO authenticated` line that wasn't there before |

## Sources

### Primary (HIGH confidence)
- [PostgreSQL 18 docs — CREATE VIEW](https://www.postgresql.org/docs/current/sql-createview.html) — automatically-updatable view rules, `security_invoker` option
- `supabase/config.toml` (this repo) — confirms `major_version = 15`
- `supabase/migrations/001_initial_schema.sql` through `075_*.sql` (this repo) — direct inspection of every migration referencing `artist_profiles`, used to enumerate the exact 6 functions needing repoint, the 2 RLS policies on the table itself, the FK/index/constraint/trigger names, and the cumulative GRANT column lists (040/043/054/058)
- Direct grep of `app/`, `lib/`, `components/`, `types/`, `__tests__/`, `middleware.ts` (this repo) — exact file/occurrence counts for the D-03 symbol-rename scope

### Secondary (MEDIUM confidence)
- [Percona — PostgreSQL Updatable Views: Performing Schema Updates With Minimal Downtime](https://www.percona.com/blog/postgresql-updatable-views-performing-schema-updates-with-minimal-downtime/) — confirms the rename+compat-view pattern as a recognized technique
- [pganalyze — Row Level Security, security_invoker views, and LEAKPROOF functions](https://pganalyze.com/blog/5mins-postgres-row-level-security-bypassrls-security-invoker-views-leakproof-functions) — confirms the pre-PG15 view-owner-bypasses-RLS default behavior and PG15's fix
- [Supabase — Postgres Roles and Privileges / Securing your API](https://supabase.com/docs/guides/api/securing-your-api) — confirms Supabase's legacy default-privilege bootstrap for tables in `public` (basis for Assumption A1)
- [databaserookies.wordpress.com — PostgreSQL Table Rename and Views: An OID Story](https://databaserookies.wordpress.com/2026/01/05/postgresql-table-rename-and-views-an-oid-story/) — confirms OID-based dependency tracking survives a plain rename, contrasted with the riskier table-swap pattern
- WebSearch synthesis on `ALTER TABLE RENAME TO` dependent-object behavior and PostgREST `NOTIFY pgrst` schema-cache reload mechanics

### Tertiary (LOW confidence)
- None — every claim above traces to either direct repo inspection or an official/authoritative documentation source.

## Metadata

**Confidence breakdown:**
- Standard stack: N/A (no new packages) — HIGH confidence there is nothing to add, confirmed by direct grep for generated-types artifacts and package.json inspection
- Architecture (compat-view rename pattern): HIGH — confirmed against official PostgreSQL docs + direct repo migration inspection, not estimation
- DB object enumeration (6 functions, 2 policies, FK auto-naming, index/trigger cosmetic-only names): HIGH — every claim verified via direct `grep`/`sed` of the actual migration files, not inferred
- Symbol-rename scope (87 call sites / 97 files / 20 type importers): HIGH — exact counts from direct grep, cross-checked against the ROADMAP's ~79-file estimate
- security_invoker / GRANT-independence mechanics: HIGH — confirmed via multiple independent authoritative sources (PostgreSQL docs, Supabase docs, pganalyze) that agree
- Assumption A1 (service_role default privileges on views specifically): MEDIUM — inferred from documented table-level defaults + a project-timing argument, not independently verified against this project's live default-privilege configuration for views

**Research date:** 2026-07-24
**Valid until:** 30 days (stable domain — PostgreSQL/Supabase view/grant semantics do not change on a fast cadence; the codebase-specific migration inventory should be re-verified if any new migration touching `artist_profiles` lands between now and execution)
