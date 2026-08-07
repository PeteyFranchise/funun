# Phase 17 — Hardening Migration DRAFT (unnumbered)

**Status: DRAFT ONLY.** Not a migration file. Written to avoid colliding with a concurrent session that is also drafting a numbered `supabase/migrations/NNN_*.sql` file. Nothing in this document has been applied, tested against a live database, or committed.

**Source:** the "Open follow-ups" table in `17-RESUME-HERE.md` (lines 81-90), items 1-3. Audited against `supabase/migrations/` via static grep — no live database connection was used to confirm current grants; see "Before applying" below.

---

## Summary

| Item | Finding | Confidence |
|---|---|---|
| 1. TRUNCATE/TRIGGER sweep | Confirmed: **TRUNCATE and TRIGGER are still granted** to `authenticated`/`anon` on all 5 flagged tables (`capability_grants`, `green_room_placements`, `reports`, `dm_threads`, `dm_messages`) — no migration ever revokes either privilege on any of them. TRUNCATE is confirmed via migration 062's own discovery comment; TRIGGER is inferred (never independently observed live). **Additional, wider gap found on `dm_threads`/`dm_messages`** beyond the ticket's ask — see 1b. | High (TRUNCATE); Medium (TRIGGER); High (1b) |
| 2. `calculate_vault_readiness()` SECURITY DEFINER | Confirmed 068 is the newest definition. Draft redefinition below is byte-identical to 068's body except `SECURITY DEFINER` + `SET search_path = ''` + schema-qualified table references (required once search_path is emptied). **Found an adjacent gap**: the function currently has no `EXECUTE` restriction, so flipping to SECURITY DEFINER without also locking down EXECUTE opens a new RLS-bypass oracle. Companion REVOKE drafted, flagged for confirmation. | High |
| 3. Migration 040/063 doctrine | Confirmed: `administrator` and `publisher` (and in fact **every** "private" column on `artist_profiles`, not just these two) retain `anon` UPDATE, `anon`+`authenticated` INSERT, and REFERENCES at the table level — none of these were ever revoked. Migration 063's "zero privileges" claim is correct only for SELECT and for `authenticated`'s UPDATE. Practical exploitability is limited by an ownership-scoped RLS policy (see findings), so this is presented as a judgment call, not a committed fix. | High (finding); N/A (fix is optional/flagged) |

---

## Item 1 — Privilege sweep: TRUNCATE / TRIGGER still granted

### Evidence

Every REVOKE statement touching these five tables, found via `grep -n "REVOKE" supabase/migrations/*.sql`:

| Table | Created in | REVOKE statement found | File:line | TRUNCATE revoked? | TRIGGER revoked? |
|---|---|---|---|---|---|
| `capability_grants` | 042 | `REVOKE INSERT, UPDATE, DELETE ON capability_grants FROM authenticated, anon;` | `042_capability_grants.sql:62` | No | No |
| | | `REVOKE SELECT ON capability_grants FROM anon;` | `042_capability_grants.sql:63` | — | — |
| `green_room_placements` | 057 | `REVOKE INSERT, UPDATE, DELETE ON green_room_placements FROM authenticated, anon;` | `057_green_room_feed.sql:517` | No | No |
| `reports` | 058 | `REVOKE SELECT ON reports FROM authenticated, anon;` | `058_trust_safety_schema.sql:142` | — | — |
| | | `REVOKE INSERT, UPDATE, DELETE ON reports FROM authenticated, anon;` | `058_trust_safety_schema.sql:152` | No | No |
| `dm_threads` | 012 | `REVOKE INSERT, UPDATE ON dm_threads FROM authenticated;` | `056_harden_dm_write_privileges.sql:21` | No | No |
| `dm_messages` | 012 | `REVOKE INSERT, UPDATE ON dm_messages FROM authenticated;` | `056_harden_dm_write_privileges.sql:22` | No | No |

None of these five statements includes `TRUNCATE` or `TRIGGER`. Cross-checked: `grep -n "TRIGGER" supabase/migrations/*.sql | grep -i "GRANT\|REVOKE"` returns **zero results across the entire repo** — no migration has ever revoked TRIGGER from any role on any table.

**Why this means the privilege is actually still granted, not just "never mentioned":** migration 058's own comment confirms the baseline directly — `058_trust_safety_schema.sql:29-30`: *"the REVOKE below removes the table-level grant Supabase applies to newly created public-schema tables by default."* Migration 062's comment (`062_split_sheet_esign_envelopes.sql:76-83`) independently confirms the specific TRUNCATE gap was discovered live: *"Supabase's default grants leave TRUNCATE on authenticated+anon after a REVOKE of only INSERT/UPDATE/DELETE."* Migration 062 is the one place in the repo that actually revokes TRUNCATE (`062_split_sheet_esign_envelopes.sql:84-85`, on `esign_envelopes`/`esign_envelope_signers`) — confirming it as the reference pattern the ticket names it as.

**One caveat on that reference pattern:** migration 062 itself only revokes `INSERT, UPDATE, DELETE, TRUNCATE` — it does **not** revoke `TRIGGER`. So even the "corrected" pattern doesn't close the TRIGGER gap. This draft goes slightly further than 062 by also revoking TRIGGER, per the ticket's explicit "and possibly TRIGGER." Flagging this because it means the fix below is not a pure mirror of 062 — it's 062's pattern plus one more privilege class 062 didn't address anywhere in the repo. Practical risk of TRIGGER is much lower than TRUNCATE: PostgREST does not expose arbitrary DDL to `anon`/`authenticated`, so a role holding TRIGGER can't exploit it without some other SQL-execution path already existing. Revoking it is defense-in-depth, not a closure of a reachable hole the way TRUNCATE is (TRUNCATE bypasses RLS on a command PostgREST already exposes indirectly via the same grant surface).

### Draft SQL

```sql
-- ─── Privilege sweep: close the TRUNCATE/TRIGGER gap (17-RESUME-HERE.md
-- "Open follow-ups", item 1) ────────────────────────────────────────────
-- Every REVOKE previously applied to these five tables (042/056/057/058)
-- stopped at INSERT/UPDATE/DELETE (and SELECT, where applicable) — none
-- touched TRUNCATE or TRIGGER, so Supabase's default full-table grant to
-- authenticated/anon (058's own comment: "the REVOKE below removes the
-- table-level grant Supabase applies to newly created public-schema
-- tables by default") left both standing. TRUNCATE ignores RLS entirely,
-- so a role holding it can empty any of these tables regardless of policy
-- — this is the same class of gap migration 062 found and closed for
-- esign_envelopes/esign_envelope_signers. This statement goes one step
-- further than 062's own pattern by also revoking TRIGGER (062 did not),
-- per this sweep's explicit "and possibly TRIGGER" scope.
REVOKE TRUNCATE, TRIGGER ON capability_grants        FROM authenticated, anon;
REVOKE TRUNCATE, TRIGGER ON green_room_placements    FROM authenticated, anon;
REVOKE TRUNCATE, TRIGGER ON reports                  FROM authenticated, anon;
REVOKE TRUNCATE, TRIGGER ON dm_threads               FROM authenticated, anon;
REVOKE TRUNCATE, TRIGGER ON dm_messages              FROM authenticated, anon;
```

Each REVOKE is a no-op if the privilege turns out not to be held (Postgres does not error on revoking an ungranted privilege), so this is safe to run even if the live-grants check recommended below turns up a surprise.

### Item 1b — additional finding on `dm_threads` / `dm_messages` (beyond the ticket's stated scope)

Not asked for, but found while pulling the evidence above and worth flagging rather than silently omitting: migration 056 (`056_harden_dm_write_privileges.sql:21-22`) only revokes `INSERT, UPDATE` **from `authenticated`**. Compare to `capability_grants`/`green_room_placements`/`reports`, which all revoke `INSERT, UPDATE, DELETE` **from both `authenticated` and `anon`**. For `dm_threads`/`dm_messages`, that leaves:
- `DELETE` still granted to `authenticated` (never revoked at all, on either table).
- `anon` completely untouched — still holds the full default grant (SELECT/INSERT/UPDATE/DELETE, plus TRUNCATE/TRIGGER) on both tables, unless RLS separately blocks it.

RLS mitigates some of this (the participant-scoped SELECT/INSERT policies from migration 012 use `auth.uid()`, which is null for `anon`), but DELETE was never addressed for `authenticated`, and TRUNCATE for `anon` is a real RLS-bypassing gap same as the rest of item 1.

This is presented separately, not folded into the primary fix above, because it's a **wider** gap than what the ticket described (DELETE, not just TRUNCATE/TRIGGER) and I want a deliberate decision rather than quietly expanding scope. If you want to close it in the same migration:

```sql
-- ─── Additional dm_threads/dm_messages gap (found during this audit,
-- NOT explicitly requested by the ticket — confirm before including) ───
-- Migration 056 revoked INSERT/UPDATE from authenticated only. DELETE was
-- never revoked from authenticated on either table, and anon was never
-- touched for any privilege on either table.
REVOKE DELETE ON dm_threads, dm_messages FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON dm_threads, dm_messages FROM anon;
```

Flagged, not asserted: I have not traced every DM code path to confirm nothing relies on an `authenticated` client ever issuing a direct DELETE (e.g., a "delete my message" feature) or an `anon` client ever needing any access here. A quick `grep -rn "\.from('dm_messages')\|\.from('dm_threads')" app/` before applying would confirm.

---

## Item 2 — `calculate_vault_readiness()`: SECURITY INVOKER → SECURITY DEFINER

### Evidence

Confirmed 068 is the newest definition — every `calculate_vault_readiness` redefinition in the repo, in order: `001_initial_schema.sql:369`, `005_stage3_additions.sql:25`, `008_readiness_metadata_cwr.sql:17`, `016_release_distribution.sql:12`, `062_split_sheet_esign_envelopes.sql:157`, `068_split_sheet_coverage_readiness.sql:57`. 068 is the highest-numbered file that redefines it, and no later migration touches it.

068's signature (`068_split_sheet_coverage_readiness.sql:57-60`):
```sql
create or replace function public.calculate_vault_readiness(project_uuid uuid)
returns integer
language plpgsql
as $function$
```
— `language plpgsql`, no `SECURITY` clause at all, which means **SECURITY INVOKER** (Postgres's default). It reads `split_sheets` at lines 126-127 (`LEFT JOIN split_sheets ss ON ss.id = sa.split_sheet_id`), among six other tables — confirming the ticket's premise that this function is exposed to the 42P17 recursion class the moment any of those tables gets a policy that (directly or transitively) re-enters a policy already being evaluated for the calling row. `064_fix_split_sheet_rls_recursion.sql:51` documents that this exact interaction (calculate_vault_readiness reading split_sheets) is what broke the vault write path on 2026-07-20.

### Draft SQL — the redefinition

Established project convention for SECURITY DEFINER functions that need search-path hardening: **`SET search_path = ''` plus fully schema-qualifying every table reference** — not `SET search_path = public`. Confirmed by grepping every `SECURITY DEFINER` function in the repo: `no_block()` (035), `check_handle_not_reserved()` (037), `clear_featured_if_unpublished()` (034), `connections_seed_follows()` (044), `is_split_sheet_initiator()`/`is_split_sheet_party()` (064), `split_sheet_party_response_confirms_collaborator()` (066), and the two green-room visibility helpers (057, 059, 060) all use `SET search_path = ''` with explicit `public.` qualification, each with a comment explicitly citing search-path-hijack prevention as the reason (e.g. `034_member_identity_wave4.sql:128`: *"All table references are schema-qualified to prevent search_path hijack."*). The one outlier, `046_atomic_opportunity_apply.sql:113` (`SET search_path = public`), is a single exception with no comment explaining the deviation — not the established pattern. This draft follows the dominant, documented convention.

```sql
-- ─── calculate_vault_readiness: SECURITY DEFINER hardening
-- (17-RESUME-HERE.md "Open follow-ups", item 2) ─────────────────────────
-- Byte-identical to migration 068's body. The ONLY changes: `security
-- definer` + `set search_path = ''` (closing the 42P17 recursion class
-- documented in migration 064 and .planning/debug/split-sheet-rls-recursion.md
-- — any future RLS added to split_sheets, tracks, vault_documents,
-- vault_assets, tool_outputs, split_sheet_attachments, or vault_projects
-- can no longer re-arm it), and schema-qualifying every table reference
-- with `public.` (required once search_path is emptied — this repo's
-- established SECURITY DEFINER convention, see 034/035/037/044/057/059/
-- 060/064/066). No scoring branch, comment, or logic changed.
--
-- NOTE: unlike 062/068, this redefinition does NOT need a trailing
-- `update vault_projects set vault_readiness_score = calculate_vault_readiness(id)`
-- recompute. The change is access-control only (what the function can SEE
-- while it runs), not a derivation change — for every row that already has
-- a stored score, that score was computed while the triggering caller
-- (the project owner, under existing owner-scoped RLS, or the service
-- role) already had full legitimate visibility into their own project's
-- child rows. SECURITY DEFINER changes what a caller WITHOUT that
-- visibility would see; it does not change any already-correct,
-- already-visible result. Flagging this reasoning rather than asserting
-- it silently — worth a sanity check (spot-compare a few scores
-- before/after) at apply time.
create or replace function public.calculate_vault_readiness(project_uuid uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
DECLARE
  score          INTEGER := 0;
  project_type   TEXT;
  dist           TEXT;
  track_count    INTEGER;
  doc_count      INTEGER;
  coverage_tier  INTEGER;
BEGIN
  SELECT type, distributor INTO project_type, dist FROM public.vault_projects WHERE id = project_uuid;

  -- Snippet: simplified score (unchanged)
  IF project_type = 'snippet' THEN
    IF EXISTS (SELECT 1 FROM public.vault_assets WHERE project_id = project_uuid AND type IN ('lyric_card','snippet_visual')) THEN
      score := score + 40;
    END IF;
    IF EXISTS (SELECT 1 FROM public.tool_outputs WHERE project_id = project_uuid AND tool_slug = 'dropready') THEN
      score := score + 30;
    END IF;
    IF EXISTS (SELECT 1 FROM public.tool_outputs WHERE project_id = project_uuid AND tool_slug = 'soundbait') THEN
      score := score + 30;
    END IF;
    RETURN score;
  END IF;

  -- All other types: full score
  SELECT COUNT(*) INTO track_count FROM public.tracks WHERE project_id = project_uuid;
  IF track_count > 0 THEN score := score + 10; END IF;

  IF EXISTS (SELECT 1 FROM public.vault_assets WHERE project_id = project_uuid AND type = 'cover_art') THEN
    score := score + 10;
  END IF;

  -- Split sheets: legacy wet-sign-upload path (AM-1 universal fallback,
  -- unchanged — wins outright regardless of coverage) OR the new
  -- coverage-based tier across every track that needs a sheet (P18-14).
  SELECT COUNT(*) INTO doc_count FROM public.vault_documents
    WHERE project_id = project_uuid AND type = 'split_sheet' AND status = 'signed';

  -- track_tiers: one row per track this project has (P18-15 — EVERY
  -- track needs a sheet, so this is a LEFT JOIN from tracks, not an
  -- aggregate over split_sheet_attachments alone; an aggregate over the
  -- attachments would silently skip exactly the uncovered tracks whose
  -- absence is the point). A track's own tier is the BEST (max) of every
  -- sheet attached to it via split_sheet_attachments — mirrors
  -- readiness-coverage.ts's trackTier(). Only track-specific attachments
  -- (split_sheet_attachments.track_id IS NOT NULL) count toward a
  -- track's own coverage; a whole-release (track_id IS NULL) attachment
  -- is a separate, project-level fact and does not by itself document
  -- any individual song.
  WITH track_tiers AS (
    SELECT
      t.id AS track_id,
      COALESCE(MAX(
        CASE ss.status
          WHEN 'executed'         THEN 15
          WHEN 'esign_pending'    THEN 10
          WHEN 'approved'         THEN 10
          WHEN 'countered'        THEN 5
          WHEN 'pending_approval' THEN 5
          ELSE 0 -- 'draft'
        END
      ), 0) AS tier
    FROM public.tracks t
    LEFT JOIN public.split_sheet_attachments sa
      ON sa.track_id = t.id AND sa.vault_project_id = project_uuid
    LEFT JOIN public.split_sheets ss
      ON ss.id = sa.split_sheet_id
    WHERE t.project_id = project_uuid
    GROUP BY t.id
  )
  SELECT
    CASE
      -- Every needing track has SOME attached sheet: the pessimistic
      -- MIN across their tiers (unchanged pre-068 semantic, now per
      -- track rather than per project).
      WHEN COUNT(*) FILTER (WHERE tier = 0) = 0 THEN MIN(tier)
      -- At least one needing track has NO sheet at all: proportional
      -- credit (P18-16) rather than a MIN that would collapse to 0.
      ELSE ROUND(AVG(tier))::INTEGER
    END
  INTO coverage_tier
  FROM track_tiers;
  -- A project with zero tracks yields an empty track_tiers set, so
  -- MIN(tier) over zero rows is NULL — the same "no coverage signal at
  -- all" outcome readiness-coverage.ts's coverageTier() returns for an
  -- empty needing set, falling through to the legacy branch below rather
  -- than being treated as zero.

  IF doc_count > 0 THEN
    score := score + 15; -- legacy wet-sign-upload path, unchanged
  ELSIF coverage_tier IS NOT NULL THEN
    score := score + coverage_tier; -- coverage-based tier (P18-14/15/16)
  END IF;

  IF EXISTS (SELECT 1 FROM public.vault_documents WHERE project_id = project_uuid AND type = 'copyright_registration') THEN
    score := score + 15;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tracks WHERE project_id = project_uuid AND isrc IS NOT NULL) THEN
    score := score + 10;
  END IF;

  -- PRO registration proxy: at least one track has an ISWC captured. (trimmed 10 -> 5)
  IF EXISTS (
    SELECT 1 FROM public.tracks
    WHERE project_id = project_uuid AND iswc IS NOT NULL AND iswc <> ''
  ) THEN
    score := score + 5;
  END IF;

  SELECT COUNT(*) INTO doc_count FROM public.vault_documents
    WHERE project_id = project_uuid AND type = 'hire_right' AND status = 'signed';
  IF doc_count > 0 THEN score := score + 10; END IF;

  -- EPK generated (a promo asset). (trimmed 10 -> 5)
  IF EXISTS (SELECT 1 FROM public.tool_outputs WHERE project_id = project_uuid AND tool_slug = 'epkfyi') THEN
    score := score + 5;
  END IF;

  -- Metadata captured: every track has composers whose splits total 100%.
  IF track_count > 0 AND NOT EXISTS (
    SELECT 1 FROM public.tracks t
    WHERE t.project_id = project_uuid
      AND COALESCE((
        SELECT ROUND(SUM((c ->> 'split')::numeric), 2)
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(t.metadata -> 'composers') = 'array'
               THEN t.metadata -> 'composers'
               ELSE '[]'::jsonb END
        ) c
      ), 0) <> 100
  ) THEN
    score := score + 10;
  END IF;

  -- Distributor selected — the hard "ready to upload" gate. (+10)
  IF dist IS NOT NULL AND dist <> '' THEN
    score := score + 10;
  END IF;

  RETURN LEAST(score, 100);
END;
$function$;
```

**Qualification checklist** (every relation the function body touches, confirmed schema-qualified above): `vault_projects` (1 site), `vault_assets` (2), `tool_outputs` (3), `tracks` (5, including the `FROM public.tracks t` in the CTE), `vault_documents` (3), `split_sheet_attachments` (1), `split_sheets` (1). Not qualified, correctly: the `track_tiers` CTE (a query-local construct, not a schema object — schema-qualifying it would be an error), table aliases (`t`, `sa`, `ss`, `c`), and built-ins (`jsonb_array_elements`, `jsonb_typeof`, `ROUND`, `COALESCE`, `LEAST`, etc. — all live in `pg_catalog`, which Postgres always searches first regardless of `search_path`).

### Item 2b — companion finding: EXECUTE grant (found during audit, not explicitly requested)

**This one matters for the safety of the fix itself, not just as a bonus finding.** `grep -n "calculate_vault_readiness" supabase/migrations/*.sql | grep -iE "EXECUTE|GRANT|REVOKE"` returns nothing — no migration has ever touched this function's `EXECUTE` privilege. Migration 064's own comment (`064_fix_split_sheet_rls_recursion.sql:140-143`) states the baseline explicitly: *"Revoke the blanket PostgREST RPC exposure every function in the public schema gets by default"* — confirming that, absent an explicit REVOKE, `calculate_vault_readiness` is callable **today**, by both `anon` and `authenticated`, as a direct PostgREST RPC (`/rest/v1/rpc/calculate_vault_readiness`) with any `project_uuid` — including one they don't own.

Under the **current** SECURITY INVOKER mode this is low-risk: the function's internal reads run as the caller, so RLS still restricts what it can see for a project it doesn't own (mostly returns a degraded/near-zero score). Under the **proposed** SECURITY DEFINER mode, that same direct-RPC path would return the **true, RLS-bypassed** readiness score for *any* project in the system — a caller could enumerate project UUIDs and learn a proxy for whether another user has cover art, an ISRC, a distributor selected, executed split sheets, etc. This is exactly the oracle pattern migration 064 explicitly revoked EXECUTE to prevent for `is_split_sheet_initiator`/`is_split_sheet_party` (`064_fix_split_sheet_rls_recursion.sql:144-148`).

Checked whether the app relies on calling this directly: `grep -rn "calculate_vault_readiness" app/ lib/ components/` finds only a code comment (`app/api/split-sheets/[id]/attach/route.ts:159`, describing a DB trigger firing, not a client RPC call) and an unrelated demo-mode comment (`lib/vault/demo-store.ts:11`). Every actual invocation in the migrations is from inside a trigger function (`017_readiness_distributor_trigger.sql:17`, and `update_vault_readiness()` wired in `003_readiness_triggers_full_events.sql`) or a one-time migration-time bulk `UPDATE` — neither needs a role-level EXECUTE grant, since same-owner PL/pgSQL-to-function calls and trigger bodies don't check the invoking session's own EXECUTE privilege on the callee. This strongly suggests EXECUTE can be revoked from `PUBLIC`, `anon`, and `authenticated` **with no re-grant to anyone**, unlike 064's pattern (which re-granted to `authenticated` because those two helpers are legitimately used inside RLS policies evaluated for authenticated users). There's no equivalent legitimate authenticated-caller use here that I could find.

```sql
-- ─── Companion fix: close the new direct-RPC oracle (found during this
-- audit; NOT explicitly requested — confirm before including) ──────────
-- Without this, SECURITY DEFINER above turns calculate_vault_readiness
-- into a callable oracle: any anon/authenticated caller could invoke it
-- directly with any project_uuid and get the true, RLS-bypassed score for
-- a project they don't own. No app code calls this function directly
-- (grep confirms zero RPC call sites) — every use is trigger-internal,
-- which does not require this grant. Mirrors migration 064's EXECUTE
-- lockdown of is_split_sheet_initiator/is_split_sheet_party, but goes
-- further by not re-granting to authenticated either, since (unlike those
-- two helpers) this function has no legitimate use inside an RLS policy
-- evaluated for an authenticated caller.
REVOKE EXECUTE ON FUNCTION public.calculate_vault_readiness(uuid) FROM PUBLIC, anon, authenticated;
```

Flagged at medium-high confidence: the grep for call sites is thorough, but I did not run the app or exercise every trigger path live, so I can't rule out some UI surface calling this as an RPC for a "preview my score" feature I didn't find by static search. Worth a quick confirm before applying.

---

## Item 3 — Migration 040/063 doctrine: `administrator` does not have "zero privileges"

### Evidence

**What 063 claims** (`063_split_sheet_legal_grade.sql:62-75`): *"administrator is PII/rights-registry data of the same class as publisher, so it inherits that same private-by-default posture the instant it's added: it is NOT in 040's GRANT SELECT/GRANT UPDATE column lists, so authenticated/anon get zero privileges on it."*

**What's actually true, traced through the full grant history of `artist_profiles`:**

1. **Base RLS policy** — `001_initial_schema.sql:29-30`:
   ```sql
   CREATE POLICY "Artists manage own profile" ON artist_profiles
     USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
   ```
   No `FOR` clause (applies to ALL commands: SELECT/INSERT/UPDATE/DELETE) and no `TO` clause (applies to PUBLIC — every role, including `anon`).

2. **Migration 040's actual REVOKEs** — only two privilege types are ever touched for `artist_profiles`, and asymmetrically:
   - `040_artist_profiles_column_privileges.sql:83`: `REVOKE SELECT ON artist_profiles FROM authenticated, anon;` — both roles, then re-granted per-column (lines 84-96). `publisher`/`administrator` correctly excluded from this list — SELECT truly is zero for both.
   - `040_artist_profiles_column_privileges.sql:113`: `REVOKE UPDATE ON artist_profiles FROM authenticated;` — **`authenticated` only**, then re-granted per-column to `authenticated` (lines 114-119), again correctly excluding `publisher`/`administrator`. **`anon`'s original table-level UPDATE grant was never revoked.**
   - **INSERT is never mentioned anywhere in migration 040** (confirmed: `grep -n "artist_profiles" supabase/migrations/*.sql | grep -iE "grant|revoke|insert|references|truncate|trigger"` finds no INSERT/REFERENCES/TRUNCATE/TRIGGER statement for this table in any migration, ever). Supabase's default table-creation grant (INSERT to both `anon` and `authenticated`, on every column) stands untouched.
   - REFERENCES, TRUNCATE, TRIGGER: also never mentioned anywhere for this table.

3. **`publisher`** (added `020_artist_profile_rights_fields.sql:12`) and **`administrator`** (added `063_split_sheet_legal_grade.sql:76-77`) both post-date or are contemporaneous with 040's REVOKE/GRANT lists and are absent from both the SELECT and UPDATE re-grant lists. So: **SELECT is correctly zero for both** (matches 063's claim), and **`authenticated` UPDATE is correctly zero for both** (also matches). But **`anon` UPDATE, `anon`+`authenticated` INSERT, and REFERENCES are all still standing** for both columns — because the "zero privileges" claim only ever accounted for the SELECT/UPDATE column-grant mechanism, not the privilege types 040 never touched.

**This is not unique to `administrator`/`publisher`.** The same gap (anon UPDATE, both-role INSERT, REFERENCES never revoked) applies to *every* column on `artist_profiles` that 040 or later migrations treat as "private by omission" — `pro`, `ipi`, `mlc_id`, `soundexchange_id`, `legal_first_name`, `legal_middle_name`, `legal_last_name`, `legal_name_suffix`, `contact_phone`, `mailing_address`, `isrc_country_code`, `isrc_registrant_code`, `isrc_year_counters`, `verified_at`, `legal_name_locked_at` (066). It's a table-level gap in what 040 revoked, not a column-specific one — `administrator` just happens to be the column the ticket's source doc flagged, and 063's comment is where the "zero privileges" phrasing was written down.

**Practical exploitability — why this is a judgment call, not an obvious must-fix:**
- The RLS policy's `auth.uid() = id` check applies to every command for every role. For `anon`, `auth.uid()` is always null, so `null = id` never evaluates true — meaning `anon`'s residual UPDATE/INSERT grants are **not exploitable via normal PostgREST calls today**, RLS blocks them regardless of the ACL layer. This is a real doctrine inaccuracy, not a live open door, for the `anon` role specifically.
- `authenticated`'s residual INSERT (never column-restricted, unlike UPDATE) is the more interesting case: a signed-in user's own `artist_profiles` row is normally created exactly once, server-side, by the `SECURITY DEFINER` `handle_new_user()` trigger (`001_initial_schema.sql:357`), which bypasses grants entirely — so this gap doesn't affect the normal signup path. It would only matter if some edge case (a failed/raced trigger) left a user without a row yet, at which point that user's own direct PostgREST INSERT — which RLS *would* permit, since `auth.uid() = id` passes for their own id — could set `administrator`, `publisher`, `pro`, `ipi`, or any other "private" column directly, bypassing the app's own service-role-mediated write path. Narrow, but real.

### Recommendation

Flagging rather than asserting, per the ticket's instruction. If a fix is wanted, the two genuinely-open pieces are `anon` UPDATE and both-role INSERT (REFERENCES is lowest priority — same low-practical-risk profile as TRIGGER in item 1, no DDL path exposed to these roles via PostgREST):

```sql
-- ─── OPTIONAL — not committed. Judgment call per 17-RESUME-HERE.md item 3.
-- Closes the gap between 063's "zero privileges" claim and the actual
-- grant history: anon's table-level UPDATE and both roles' table-level
-- INSERT on artist_profiles were never revoked by migration 040 (only
-- SELECT and authenticated's UPDATE were). This statement is TABLE-WIDE,
-- not administrator/publisher-specific — the gap is table-level. Confirm
-- this doesn't break the (likely nonexistent, but unverified) edge case
-- where a client-side INSERT is the recovery path for a missed
-- handle_new_user() row, before applying.
REVOKE INSERT ON artist_profiles FROM authenticated, anon;
REVOKE UPDATE ON artist_profiles FROM anon;
```

Not drafted with confidence as "apply this": doing so table-wide would also affect the columns 040 *did* intend `authenticated` to write (the public-profile fields in the UPDATE grant list, lines 114-119) — those are re-granted separately and would be unaffected by the `authenticated` REVOKE UPDATE above (already revoked and re-granted per-column since 040), but the INSERT REVOKE has no existing per-column re-grant to fall back on, so if any legitimate path relies on a bare authenticated/anon INSERT into `artist_profiles` succeeding (beyond the SECURITY DEFINER trigger, which is unaffected by any of this), it would break. I did not find one in the migrations or the app-code grep, but did not exhaustively trace every signup/onboarding path to be certain.

---

## Before applying

1. **Migration number.** As of this audit, `068_split_sheet_coverage_readiness.sql` is the highest-numbered migration in `supabase/migrations/`. This draft is deliberately unnumbered because a concurrent session is authoring its own migration and the next free number (`069`, or higher if that session also lands first) isn't settled. **Re-check `ls supabase/migrations/ | tail` immediately before turning this draft into a real file** — do not assume 069 is still free.
2. **Human-gated push, always.** Every recent migration in this repo (058, 062, 063, 065, 066, 067, 068) carries an explicit "an executor agent must NEVER run `supabase db push`" comment, with the live push treated as a human checkpoint. This draft's eventual migration file should carry the same comment, and **no agent — including one executing on this draft — should run `supabase db push` for it.** This audit did not run it, and per this task's own instructions, did not even create the numbered file.
3. **Confirm grants live before applying, not just from migration-file analysis.** Everything in this document is static analysis: `grep`-derived, cross-checked against the project's own in-repo comments about Supabase's default-grant behavior (058, 062, 064's comments were treated as ground truth, since they document things this project's own engineers observed directly against the live database in prior migrations). It was not re-verified against `information_schema.role_table_grants` on the actual remote database in this session. Recommended pre-apply check:
   ```sql
   SELECT table_name, grantee, privilege_type
   FROM information_schema.role_table_grants
   WHERE table_name IN ('capability_grants','green_room_placements','reports','dm_threads','dm_messages','artist_profiles')
     AND grantee IN ('anon','authenticated')
   ORDER BY table_name, grantee, privilege_type;

   SELECT grantee, privilege_type
   FROM information_schema.routine_privileges
   WHERE routine_name = 'calculate_vault_readiness';
   ```
4. **Test convention.** This repo's established pattern for migrations that can't be auto-pushed is a string-assertion test reading the raw SQL file (see `__tests__/migration-062.test.ts`, `__tests__/migration-068.test.ts`). Whoever turns this draft into a numbered migration should consider a matching `__tests__/migration-0NN.test.ts` — not written here, since this task's scope is the draft doc only.
5. **Item 2's "no recompute needed" claim** (see inline note in the SQL above) is reasoned, not verified live — worth a quick spot-check of a few `vault_readiness_score` values before/after, same as any other migration in this family.

## Open flags (do not treat as settled)

- TRIGGER privilege on the five item-1 tables: inferred, not independently confirmed live (TRUNCATE has stronger evidence — 062's own discovery comment).
- Item 1b (`dm_threads`/`dm_messages` DELETE + `anon`): a real, evidenced gap, but wider than the ticket asked for — needs an explicit decision to include.
- Item 2b (EXECUTE lockdown on `calculate_vault_readiness`): high-confidence recommendation, but the "no direct caller" conclusion rests on a static grep of `app/`, `lib/`, `components/` — not a live trace of every RPC path.
- Item 3: presented as a finding + optional fix, deliberately not asserted as "apply this" — matches the ticket's explicit framing of this one as a judgment call.
