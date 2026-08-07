# Phase 20: Profile Table Rename (artist_profiles → user_profiles) - Context

**Gathered:** 2026-07-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Rename the canonical profile relation `artist_profiles` → `user_profiles` across all runtime code and effective DB objects, with **zero downtime and no data change**. The *what* is locked by the **ROADMAP Phase 20 entry's "locked inputs" block** (the Codex-verified blast radius + immutability rules) — this discussion captured the *how*. The profile consolidation itself was Phase 19; this phase is the honest rename that was split out of it (former R6), now unblocked because Phase 19 freed the `user_profiles` name.

</domain>

<decisions>
## Implementation Decisions

### Rename strategy — zero-downtime compatibility view
- **D-01:** **Compatibility-view rename.** Migration **076** renames `artist_profiles` → `user_profiles` AND creates a temporary **updatable** `artist_profiles` view over `user_profiles`, so old deployed code keeps working — reads **and** writes pass through — during the deploy gap. Then the new code deploys (reads `user_profiles`). Then migration **077** drops the view. This is the textbook zero-downtime table rename; it eliminates the DB-ahead-of-code race that bit Phase 19.
- **D-02:** **2 human-gated migration pushes with the code deploy between them** (076 → deploy → 077). Safe in both directions and safe to roll back: if the post-076 deploy fails, redeploy the prior code — it still reads `artist_profiles` via the view; nothing to un-migrate.

### Symbol renaming scope
- **D-03:** Rename the DB table + **every** `from('artist_profiles')` query string + the `ArtistProfile` TypeScript type → `UserProfile` (name freed by Phase 19's deletion of the old duplicate `UserProfile`). **Leave** incidental local variable names (`artistProfile`, `myProfileRow`, etc.) as-is — internal, low value, high churn. The `/api/profile` route URL is unchanged. `tsc --noEmit` is the completeness check for any missed reference.

### Smoke-test gate + view drop
- **D-04:** After the code deploy, BEFORE push #2 drops the view, the **full smoke-test set** must pass: signup on all 3 `handle_new_user` branches (artist / industry / curator), public profile (`/u/[handle]`, `/r/[projectId]`), a split sheet, a Settings rights save, a metadata/registration read, and confirm the `NOTIFY pgrst` schema reload took effect.
- **D-05:** **Drop timing** — after smoke tests pass, keep the compat view for a **short soak** (until old warm serverless instances drain / a low-traffic window), THEN push #2 drops it. Cheap insurance against a straggler old instance still calling `artist_profiles`.

### Claude's Discretion
- The precise per-file sequencing of the ~79 runtime reference updates, the generated-types regeneration, the exact `CREATE VIEW` definition + its RLS/write-through mechanics (researcher/planner confirms updatable-view + RLS behavior), and the migration file bodies. Not user-facing decisions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked scope (stands in for a SPEC this phase)
- `.planning/ROADMAP.md` — the **Phase 20 entry's "Locked inputs (verified via Codex sweep)" block**: the ~79 runtime files referencing `artist_profiles`, the ~23 migrations with FK/trigger/function deps to update in a NEW migration (`handle_new_user`, search-vector + `clear_featured` triggers, `capability_grants` + `verification_audit_log` FKs, Green Room SQL functions, RLS, grants, indexes, the re-pointed claim functions), the historical-migration-immutability rule, the deploy-race note, and the "`/api/profile` URL unchanged" constraint. MUST read — it is the locked `what`.

### Origin
- `.planning/phases/19-profile-identity-model-cleanup/19-SPEC.md` — this rename is Phase 19's former R6, split out (see its Boundaries). The canonical profile is `artist_profiles`, now being renamed.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets / Patterns
- **Human-gated migration pattern** (migrations 062–075; headers on 066/070/075) — 076/077 mirror it: human-gated push, `NOTIFY pgrst, 'reload schema'`, and the "executor must NEVER `supabase db push`" header. Next free numbers are **076/077**.
- **The Phase 19 rename precedent within a migration** — 072 already did `CREATE OR REPLACE` of functions reading the table; 073 dropped a table; the rename migration follows the same DDL conventions (schema-qualify under `search_path=''` for DEFINER functions).
- **All `artist_profiles` consumers** — `resolvePartyIdentity` + `split-sheets/[id]/page.tsx`, the split-sheet PDF, metadata/registration pages, public-profile pages (`app/u/`, `app/r/`), the signup trigger `handle_new_user` (migrations 001/027/030/039), plus the FK/trigger/function/RLS list in the ROADMAP locked-inputs — all get their table reference updated.
- **`types/index.ts`** `ArtistProfile` → `UserProfile` (D-03).

### Integration Points
- **Vercel auto-deploy of `main`** is the deploy step between push #1 (076) and push #2 (077).
- **PostgREST schema cache** must be reloaded (`NOTIFY pgrst`) after the rename so the renamed relation + the view are exposed correctly.

</code_context>

<specifics>
## Specific Ideas

- The compat view must be an **updatable single-table view** — `CREATE VIEW artist_profiles AS SELECT * FROM user_profiles` (Postgres auto-updates simple single-table views for INSERT/UPDATE/DELETE) — so old deployed code's writes to `artist_profiles` pass through during the deploy gap. Research must confirm the RLS/write-through behavior (e.g. `security_invoker` semantics) so the view honors the same row scoping as the table.
- **Rollback posture:** if the post-076 deploy fails, redeploy the prior (Phase 19) code — it reads `artist_profiles` via the view, so there's no urgent un-migrate; fix forward and retry the deploy.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (The `industry_profiles` vs `member_type` reconciliation remains a separate future item, unchanged from Phase 19's out-of-scope note.)

</deferred>

---

*Phase: 20-profile-table-rename-artist-profiles-to-user-profiles*
*Context gathered: 2026-07-24*
