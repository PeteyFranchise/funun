-- ============================================================
-- Funūn — Phase 38.0.1 (workspace-authorization-remediation): Plan 11.
-- Migration 194: public.workspace_catalogue_page — the set-based, paginated
--                catalogue reader that resolves a WHOLE PAGE of permitted
--                project summaries in ONE statement, with the same six-hop
--                authorization migration 192's per-row helper applies.
--
-- HUMAN-GATED — this project never runs `supabase db push`, `supabase db
-- reset`, `supabase migration up`, or `supabase db query` from an agent.
-- That is the standing convention stated verbatim in the headers of
-- migrations 078, 080, 136, 177 and 181-193. This file is authored and
-- text-tested (__tests__/migration-194.test.ts) but must not be applied
-- automatically.
--
-- ─── PUSHED WITH 190, 191, 192, 193 AND 195 — NEVER STAGED ALONE ─────────
-- This migration is pushed TOGETHER with 190, 191, 192, 193 and 195, and
-- with the TypeScript changes from plans 04, 06, 07, 08, 11 and 15, in one
-- window at THIS plan's Task 3 checkpoint — the phase's single joint push.
-- It is never staged ahead of that window: this file's body calls
-- `public.workspace_grant_lineage_live` (migration 192) and joins on
-- `workspace_attachments.relationship_id` and `workspace_grants.
-- relationship_id` as NOT NULL security foreign keys (migration 191), so
-- staging it alone would create a function that cannot be executed. In the
-- other direction, `lib/workspaces/catalogue.ts` calls this function by
-- name from the very commit that removes its per-project loop, so deploying
-- that TypeScript without this migration returns a PostgREST "function does
-- not exist" error on every catalogue read.
--
-- CORRECTION TO THE HEADERS OF 191, 192 AND 193 (orchestrator + planner,
-- 2026-09-06). Those three files each say "PUSHED WITH ... 194" and name
-- plans 04, 06, 08 and 11. Two things changed after they were written and
-- text-locked, and they are deliberately NOT being edited (their own suites
-- lock their text and they are already reviewed and held):
--   * Migration 190 (plan 02, the R-17/WSR-25 custody-immutability trigger)
--     was NOT pushed separately. It is authored and unapplied, its route
--     companion is already deployed, and it joins this window.
--   * Migration 195 (plan 15, R-19/WSR-28's `workspace_permission_requests`)
--     did not exist when they were written and also joins this window.
-- `.planning/ROADMAP.md`'s Phase 38.0.1 LIVE LEDGER is the authoritative
-- statement of what is applied and what is held — read it, not a migration
-- header, before the push.
--
-- MIGRATION NUMBERING (restated CORRECTLY here; 191-193's headers say
-- "195-196 reserved for Phase 38.0.2 / 197-198 for Phase 38.2", which was
-- true when they were written and is now off by one because plan 15 claimed
-- 195): 190 = plan 02 (the vault_projects.user_id immutability trigger).
-- 191 = plan 05 (consent root, delegation lineage, NOT NULL tightening,
-- evidence confirmation). 192 = plan 09 (the six-hop
-- workspace_project_permission helper). 193 = plan 10 (child-table branch
-- removal + the four column-allowlist read functions). 194 (this file) =
-- plan 11. 195 = plan 15 (workspace_permission_requests, the ASK).
-- 196-197 are RESERVED for Phase 38.0.2. 198-199 are RESERVED for Phase
-- 38.2's billing and beta-flag migrations.
--
-- ─── WHY THIS EXISTS (R-10 / WSR-20, finding F18) ────────────────────────
-- `lib/workspaces/catalogue.ts`'s `loadWorkspaceCatalogue` called
-- `resolveEffectivePermissions` once per project inside a `for` loop, and
-- that function itself performs up to FOUR sequential Supabase queries
-- (membership, relationship, evidence tier, grants). The arithmetic is
-- concrete, not estimated: a workspace with 100 attached projects issued 1
-- membership query + 1 attachment query + 100 x 4 = 400 permission queries
-- + 1 holder-name query = 403 sequential round trips inside ONE HTTP
-- request. At 250 projects it is 1003.
--
-- THE FIX IS ONE LIVE QUERY, NOT A CACHED REPEAT. The obvious remedy —
-- memoising the resolved permission set per (workspace, member, project) —
-- is BANNED here, and the ban is the whole point of the design.
-- `lib/workspaces/grant-service.ts`'s header states deliberately that
-- nothing is cached, because D-49 makes revocation take effect on the very
-- next read rather than on a cron tick or a cache expiry; R-10 restates the
-- ban. A memoised permission set would silently reintroduce exactly the
-- staleness D-49 exists to prevent — a grant revoked one second ago would
-- keep authorising reads for as long as the entry lived. So instead of
-- repeating the computation 100 times and then hiding the repetition behind
-- a cache, this function folds the already-correct computation into ONE
-- set-based statement per page. There is nothing left to cache: the
-- function is STABLE, and every hop — attachment, membership, relationship,
-- grant, custody, lineage — is re-read from live rows on every single call.
--
-- WHY A FUNCTION AND NOT A VIEW, restated from migration 193: a view's
-- exposed column list is fixed at creation time and cannot vary with which
-- permission the caller currently holds. A function's `RETURNS TABLE (...)`
-- clause IS the contract, and the body can branch internally to null out a
-- value a specific grant does not cover.
--
-- ─── THE RECURSION DOCTRINE, AS IT APPLIES HERE ──────────────────────────
-- Restated from migrations 192 and 193, not re-argued: a plain SELECT
-- against an RLS-protected table inside a SECURITY DEFINER body owned by a
-- role that bypasses RLS does not re-enter that table's policies, so it
-- cannot recurse (42P17). What recursion forbids, and what this file never
-- writes, is a cross-table EXISTS inlined inside a POLICY body. This file
-- CREATES AND DROPS NO POLICY OF ANY KIND — it adds one function and
-- nothing else. It reads `vault_projects` and the four workspace tables
-- with plain qualified SELECTs inside its own SECURITY DEFINER body, which
-- is safe by the doctrine above, not an exception to it. It reads NONE of
-- `tracks`, `vault_assets`, `vault_documents` or `tool_outputs`.
--
-- ─── THE CALLER-IDENTITY BINDING (added at execution, Rule 2) ────────────
-- `p_uid` is CALLER-SUPPLIED. A SECURITY DEFINER function that trusted it
-- blindly would let any authenticated user read any OTHER user's permitted
-- catalogue simply by passing that user's id — the definer bypasses RLS, so
-- nothing else would stop them. This function therefore requires
-- `p_uid = auth.uid()`: the parameter is kept (it makes the resolution
-- explicit and matches migration 193's read-function signatures) but it can
-- only ever name the caller. `auth.uid()` reads the request JWT claim from
-- a per-transaction GUC, which SECURITY DEFINER does not disturb, so this
-- returns the CALLER's identity, not the definer's. A NULL `auth.uid()`
-- (no JWT, e.g. a service-role connection) matches nothing and the function
-- returns zero rows — fail closed, deliberately: this is a user-facing
-- browsing surface with an RLS-scoped caller, never a back-office reader.
--
-- ─── NO STORAGE PATH, EVER (custody D-01/D-09, D-40) ─────────────────────
-- The declared return column list below contains no storage path, no signed
-- URL, no audio reference, no document payload and no lyric body, under ANY
-- permission — and there is no permission argument that could be widened
-- into one. `access_clean_masters` gets no branch here: clean-master access
-- is not a column read and stays with the existing narrow, asset-class-
-- specific accessor. `__tests__/migration-194.test.ts` slices the declared
-- list and asserts the forbidden names are absent, against the SAME list
-- `__tests__/migration-193.test.ts` locks (that suite's own array is read
-- and compared, so the two cannot drift apart).
--
-- WHY NO BACKFILL EXISTS — this migration creates no table, adds no column
-- and writes no row. It adds one function. There is no UUID default to
-- restate. Nothing in `handle_new_user()`, `member_type`, `industry_roles`,
-- `capability_grants` or `project_members` is touched (D-52).
-- ============================================================

-- ─── The set-based paginated catalogue page (R-10/WSR-20, F18) ───────────
-- THE SIX HOPS, IN THE SAME ORDER AND WITH THE SAME MEANING AS MIGRATION
-- 192's `workspace_project_permission`, applied to a whole page at once:
--   hop 0  public.workspace_access_enabled() — the D-56/WS-31 kill switch,
--          evaluated first, exactly as the per-row helper evaluates it
--          first. FALSE here returns an empty page platform-wide.
--   hop 1  a LIVE attachment in THIS workspace (detached_at IS NULL),
--          optionally narrowed to one project.
--   hop 2  an ACTIVE, UNEXPIRED membership for the caller.
--   hop 3  an ACCEPTED, in-window roster relationship joined through the
--          attachment's OWN relationship_id — no nullable fallback, for the
--          reason migration 191's NOT NULL and migration 192's header both
--          state: a NULL there would match ANY accepted relationship in the
--          workspace and turn hop 5's custody bind into a wildcard.
--   hop 4  an UNREVOKED grant on that SAME relationship — again with no
--          nullable fallback.
--   hop 5  the CUSTODY BINDING: p.user_id = r.member_user_id. Access
--          follows current custody automatically, so a transferred project
--          leaves this page on the very next read, with no cleanup step and
--          no cron. `idx_vault_projects_user_id` backs this join
--          (38.0.1-PREFLIGHT.md P6).
--   hop 6  public.workspace_grant_lineage_live(g.id) — a grant with a
--          revoked ancestor anywhere, or with no live member-consent root,
--          confers nothing.
--
-- ROW VISIBILITY IS `view_summaries`, MATCHING THE RLS BRANCH EXACTLY.
-- Migration 193's surviving `vault_projects_select_owner_or_member` policy
-- admits a workspace caller on `view_summaries`; the HAVING clause below
-- requires the same permission for a project to appear at all. The other
-- two permissions decide FIELD-LEVEL exposure only — a separate axis, and
-- the same separation `lib/workspaces/catalogue.ts` has always made.
--
-- WHY THE FLAGS ARE RETURNED ALONGSIDE THE CASE-GATED VALUES: every
-- conditionally exposed value is wrapped in `CASE WHEN <permission holds>
-- THEN <column> ELSE NULL END`, so the row itself never carries a value the
-- caller is not entitled to — withholding happens in the database, not in
-- the TypeScript. But a withheld value and a genuinely NULL column are then
-- indistinguishable on the wire, and the reader must tell them apart to
-- decide whether to populate its `fields.metadata` key at all. The two
-- booleans report the caller's live permission state for the row so it can,
-- WITHOUT a second query. They are the only reason a second query is not
-- needed, and they leak nothing: they describe the caller's own grants.
--
-- `holder_user_id` IS RETURNED DELIBERATELY, and it is the one name in the
-- list that needs justifying against migration 193's forbidden-column
-- discipline (which bans a bare `user_id` from the four child-table read
-- functions). Here it is the custodian of a project the caller has ALREADY
-- been authorised to see — hop 5 proved `p.user_id = r.member_user_id`, so
-- this value is the roster relationship's own subject Member, whom the
-- caller can already name. The reader needs it for exactly one thing: the
-- single batched display-name lookup that turns it into a human-readable
-- holder name. It is not joined to `user_profiles` in here on purpose —
-- that would read a table this function has no business bypassing RLS on.
CREATE OR REPLACE FUNCTION public.workspace_catalogue_page(
  p_workspace_id UUID,
  p_uid UUID,
  p_limit INT,
  p_offset INT,
  p_project_id UUID DEFAULT NULL
)
RETURNS TABLE (
  project_id                          UUID,
  holder_user_id                      UUID,
  title                               TEXT,
  type                                TEXT,
  release_date                        DATE,
  vault_readiness_score               INTEGER,
  can_view_metadata                   BOOLEAN,
  can_view_private_rights_identifiers BOOLEAN,
  genre                               TEXT,
  sub_genre                           TEXT,
  label                               TEXT,
  publisher                           TEXT,
  c_line                              TEXT,
  p_line                              TEXT,
  copyright_year                      INTEGER,
  primary_language                    TEXT,
  contact_name                        TEXT,
  contact_email                       TEXT,
  contact_phone                       TEXT,
  upc                                 TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    q.project_id,
    q.holder_user_id,
    q.title,
    q.type,
    q.release_date,
    q.vault_readiness_score,
    q.can_view_metadata,
    q.can_view_private_rights_identifiers,
    -- Field-level exposure, decided in the database. A caller without
    -- `view_metadata` receives NULL in every one of these columns, not a
    -- value the TypeScript then remembers to drop.
    CASE WHEN q.can_view_metadata THEN q.genre            ELSE NULL::TEXT    END,
    CASE WHEN q.can_view_metadata THEN q.sub_genre        ELSE NULL::TEXT    END,
    CASE WHEN q.can_view_metadata THEN q.label            ELSE NULL::TEXT    END,
    CASE WHEN q.can_view_metadata THEN q.publisher        ELSE NULL::TEXT    END,
    CASE WHEN q.can_view_metadata THEN q.c_line           ELSE NULL::TEXT    END,
    CASE WHEN q.can_view_metadata THEN q.p_line           ELSE NULL::TEXT    END,
    CASE WHEN q.can_view_metadata THEN q.copyright_year   ELSE NULL::INTEGER END,
    CASE WHEN q.can_view_metadata THEN q.primary_language ELSE NULL::TEXT    END,
    CASE WHEN q.can_view_metadata THEN q.contact_name     ELSE NULL::TEXT    END,
    CASE WHEN q.can_view_metadata THEN q.contact_email    ELSE NULL::TEXT    END,
    CASE WHEN q.can_view_metadata THEN q.contact_phone    ELSE NULL::TEXT    END,
    -- D-40's bundle-excluded tier: ticked individually, never implied by
    -- `view_summaries` and never implied by `view_metadata`.
    CASE
      WHEN q.can_view_private_rights_identifiers THEN q.upc
      ELSE NULL::TEXT
    END
  FROM (
    SELECT
      p.id                    AS project_id,
      p.user_id               AS holder_user_id,
      p.title                 AS title,
      p.type                  AS type,
      p.release_date          AS release_date,
      p.vault_readiness_score AS vault_readiness_score,
      p.genre                 AS genre,
      p.sub_genre             AS sub_genre,
      p.label                 AS label,
      p.publisher             AS publisher,
      p.c_line                AS c_line,
      p.p_line                AS p_line,
      p.copyright_year        AS copyright_year,
      p.primary_language      AS primary_language,
      p.contact_name          AS contact_name,
      p.contact_email         AS contact_email,
      p.contact_phone         AS contact_phone,
      p.upc                   AS upc,
      bool_or(g.permission = 'view_metadata')
        AS can_view_metadata,
      bool_or(g.permission = 'view_private_rights_identifiers')
        AS can_view_private_rights_identifiers
    FROM public.workspace_attachments a
    JOIN public.workspace_members m
      ON m.workspace_id = a.workspace_id
     AND m.user_id = p_uid
     AND m.status = 'active'
     AND (m.expires_at IS NULL OR m.expires_at > now())
    JOIN public.workspace_roster_relationships r
      ON r.workspace_id = a.workspace_id
     AND r.id = a.relationship_id
     AND r.state = 'accepted'
     AND (r.effective_from IS NULL OR r.effective_from <= CURRENT_DATE)
     AND (r.terminates_on IS NULL OR r.terminates_on > CURRENT_DATE)
    JOIN public.workspace_grants g
      ON g.workspace_id = a.workspace_id
     AND g.relationship_id = r.id
     AND g.revoked_at IS NULL
     AND (g.project_id IS NULL OR g.project_id = a.project_id)
     -- Only these three permissions can affect this page: one decides
     -- whether the row appears, two decide which values it carries. Every
     -- other grant on the relationship is irrelevant here, and excluding
     -- them bounds both the aggregation and the number of lineage walks.
     AND g.permission IN (
       'view_summaries',
       'view_metadata',
       'view_private_rights_identifiers'
     )
    JOIN public.vault_projects p
      ON p.id = a.project_id
     AND p.user_id = r.member_user_id
    WHERE public.workspace_access_enabled()
      -- The caller-identity binding — see the header. p_uid names the
      -- caller or it names nobody.
      AND p_uid = (SELECT auth.uid())
      AND a.workspace_id = p_workspace_id
      AND a.detached_at IS NULL
      AND (p_project_id IS NULL OR a.project_id = p_project_id)
      AND public.workspace_grant_lineage_live(g.id)
    GROUP BY p.id
    HAVING bool_or(g.permission = 'view_summaries')
    -- Deterministic: title, then id as the tiebreaker, so a page boundary
    -- never straddles two equally-titled projects in an unstable order.
    ORDER BY p.title ASC, p.id ASC
    -- THE CLAMP. An unbounded page on a SECURITY DEFINER function is a
    -- denial-of-service surface: one caller could ask for every attached
    -- project in the workspace and force a lineage walk per grant across
    -- all of them, in one statement the planner cannot interrupt. 200 is
    -- the ceiling and 50 the default for a NULL or absent argument;
    -- `lib/workspaces/catalogue.ts` clamps to the SAME numbers on its side,
    -- so a caller cannot reach past it from either direction.
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  ) q
  ORDER BY q.title ASC, q.project_id ASC
$$;

-- Unlike migration 192's policy helpers, this IS a client-invoked RPC —
-- `lib/workspaces/catalogue.ts` calls it through supabase.rpc() — so
-- `authenticated` keeps EXECUTE. `anon` never has legitimate workspace
-- access and is revoked explicitly alongside PUBLIC.
REVOKE EXECUTE ON FUNCTION public.workspace_catalogue_page(uuid, uuid, int, int, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.workspace_catalogue_page(uuid, uuid, int, int, uuid) TO authenticated;

COMMENT ON FUNCTION public.workspace_catalogue_page(uuid, uuid, int, int, uuid) IS
  'One page of the workspace catalogue, resolved in ONE statement (migration 194, R-10/WSR-20, finding F18). Replaces lib/workspaces/catalogue.ts''s per-project resolveEffectivePermissions loop, which issued roughly four queries per project (403 round trips for a 100-project workspace). THE DECLARED RETURN COLUMN LIST IS THE SECURITY CONTRACT: it is the complete set of facts a workspace caller can obtain about a project from this surface, a caller cannot request anything outside it, and adding a column to it must be reviewed exactly as carefully as widening an RLS policy. It NEVER returns a storage path, a signed URL, an audio reference, a raw document payload or a lyric body under ANY permission, and takes no permission argument that could be widened into one (custody D-01/D-09, D-40) — access_clean_masters gets no branch here. Applies the SAME six hops as migration 192''s workspace_project_permission, set-based for the whole page: the D-56 kill switch first, then a live attachment, an active unexpired membership, an accepted in-window relationship joined through the attachment''s own relationship_id, an unrevoked grant on that same relationship, the custody binding p.user_id = r.member_user_id, and a live delegation lineage. A row appears only under view_summaries, matching the surviving vault_projects RLS branch exactly; view_metadata and view_private_rights_identifiers decide field-level exposure only, are applied as CASE expressions so a withheld value never leaves the database, and are reported as two booleans so the reader can distinguish "withheld" from "genuinely null" without a second query. p_uid must equal auth.uid(): the parameter is explicit but can only ever name the caller, and a NULL auth.uid() returns zero rows. STABLE and NOTHING IS CACHED ANYWHERE: every hop is re-read from live rows on every single call, so a revoked grant, a terminated relationship, an expired seat or a custody transfer takes effect on the very next read (D-49) — a memoised permission set here would reintroduce exactly the staleness this design exists to prevent, which is why the N+1 was fixed by folding the computation into one query rather than by caching it (R-10). p_limit is clamped to at most 200 (default 50) inside the function because an unbounded page on a SECURITY DEFINER function is a denial-of-service surface.';

-- ─── Schema-cache reload ──────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
