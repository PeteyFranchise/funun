# Deferred items — Phase 30

Out-of-scope discoveries made during plan execution that were NOT fixed
(per the executor's scope-boundary rule: only auto-fix issues directly
caused by the current task's changes). Logged here for owner triage.

## [CRITICAL] `tracks.has_sample` / `tracks.sample_details` missing on the live remote — discovered during 30-04

**Found during:** 30-04 Task 1 (wiring `evaluateInclusionGate()` into the admit route), while performing the DB round-trip verification specified in the plan.

**What's wrong:** The live remote database (`wgfjakfiyeewzfuxkgyo`, confirmed via `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`) does **not** have the `has_sample` / `sample_details` columns on `public.tracks`, even though:

- `supabase/migrations/005_stage3_additions.sql` adds them (`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS has_sample BOOLEAN DEFAULT false, ADD COLUMN IF NOT EXISTS sample_details TEXT;`).
- `supabase migration list` reports migration `005` as applied on **both** local and remote (`{"local":"005","remote":"005",...}`) — the CLI's migration-history bookkeeping says it ran.
- The columns are missing regardless of how they're queried — a bare `select('has_sample')` on `tracks` directly, and the embedded-relation select `vault_projects.select('...tracks(...has_sample...)')`, both fail identically:
  ```
  column tracks.has_sample does not exist
  column tracks_1.has_sample does not exist
  ```

**Why this matters beyond 30-04:** `lib/deals/catalog-query.ts`'s `loadCatalogPage()` — the **already-shipped, live** function backing `GET /api/buyer/catalog` and `app/sync/catalog/page.tsx` (the buyer-facing Crate) — selects the exact same `has_sample, sample_details` columns in its `PROJECT_COLUMNS` constant, and calls `computeStage3()` with the result. This was verified directly against the live remote:

```
catalog-query.ts EXACT PROJECT_COLUMNS select (loadCatalogPage): ERROR: column tracks_1.has_sample does not exist
```

**Practical impact today:** `sync_listings` currently has 0 rows in production, so this hasn't yet surfaced as a live admit-flow failure. But `loadCatalogPage()` runs on every buyer catalog page load regardless of `sync_listings` row count — if this remote is genuinely serving buyer traffic, `GET /api/buyer/catalog` and `/sync/catalog` are very likely already erroring (or silently falling back to fixture data, depending on error handling upstream) on every request that reaches a real `vault_projects` row. This needs the owner's immediate attention independent of Phase 30.

**Impact on 30-04 specifically:** Task 1's admit route (`app/api/sync-library/admin/[listingId]/route.ts`) was built to mirror `catalog-query.ts`'s `PROJECT_COLUMNS` shape exactly, per the plan's explicit instruction ("mirror catalog-query's batched select and stage3 usage"). Its gate-signal query (`PROJECT_GATE_COLUMNS`) therefore also selects `has_sample`/`sample_details`, and **will 500 on every real admit attempt** until this schema drift is corrected — this is not a bug in the new code; it's inherited from the documented, existing production contract those columns are supposed to satisfy.

**Why not fixed here:** Out of this plan's declared file scope (`files_modified` in `30-04-PLAN.md` frontmatter is limited to the two curation routes) and outside the current task's causal scope (the drift predates 30-04 and afflicts already-shipped Phase 16/22/26 code). CLAUDE.md and this execution's explicit instructions require migrations to be owner-run, never agent-applied — and this isn't even clearly a "missing migration" so much as a live-vs-migration-history mismatch that needs the owner's own investigation (possible causes: the ALTER TABLE silently no-op'd against a differently-named table at some point, the migration history was repaired/backfilled without the DDL actually running, or a prior schema restore dropped columns without updating migration bookkeeping).

**Recommended next step for the owner:** Run `ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS has_sample BOOLEAN DEFAULT false, ADD COLUMN IF NOT EXISTS sample_details TEXT;` directly against the remote (idempotent, matches migration 005's original DDL exactly) via `supabase db push` after confirming the actual cause, then re-verify `GET /api/buyer/catalog` and the 30-04 admit flow. Also worth an audit of whether any *other* migration in the 001-096 range has a similar migration-history-vs-actual-schema mismatch, given this one went undetected until now.

**Verification method:** Direct service-role queries against the live remote (read-only column probes; a temporary scratch `sync_listings` row was inserted, exercised, and deleted for the quality-route round-trip — see 30-04-SUMMARY.md). No schema was altered by this session.
