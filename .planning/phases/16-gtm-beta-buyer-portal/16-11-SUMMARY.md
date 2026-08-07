---
phase: 16-gtm-beta-buyer-portal
plan: 11
subsystem: metadata
tags: [ddex, identifiers, typescript, jest, ern-export, csv-export, code-generation]

# Dependency graph
requires: []
provides:
  - lib/metadata/identifier-guide.ts (IDENTIFIER_GUIDE — single source of identifier explainer content, DDEX-level-tagged, assignment guidance)
  - migration 082 (vault_projects.grid/catalog_number, user_profiles.isni, artist-held prefix columns, platform_identifier_config)
  - ERN export identifier emission at correct DDEX levels (GRid/CatalogNumber in ReleaseId)
  - lib/metadata/code-sheet.ts + GET /api/metadata/code-sheet — cross-project catalog CSV export
  - lib/metadata/generate.ts + POST /api/metadata/generate-identifier — structurally-gated identifier generation (platform-issued GRid, artist-prefix UPC/catalog_number)
  - Identifiers reference page + Metadata Studio inline explainers
affects: [buyer-catalog-browsing, sync-license-delivery, distributor-handoff]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "assignment.mode discriminant (platform_issued | self_assign_with_prefix | centrally_allocated | no_authority) drives eligibility structurally inside generateIdentifier() itself — no client-supplied force flag, no override path"
    - "Platform-issued GRid draws release numbers from a single service-role-owned global counter row (platform_identifier_config), never a per-artist counter — closes a cross-artist collision class explicit in the plan's threat model (T-16-11-9)"
    - "Provenance tracking (generated/imported/manual) recorded per identifier so a Funūn-minted code is never confused with a distributor-assigned one"

key-files:
  created:
    - supabase/migrations/082_ddex_party_release_identifiers.sql
    - lib/metadata/identifier-guide.ts
    - lib/metadata/identifier-guide.test.ts
    - lib/metadata/code-sheet.ts
    - lib/metadata/code-sheet.test.ts
    - lib/metadata/generate.ts
    - lib/metadata/generate.test.ts
    - app/api/metadata/code-sheet/route.ts
    - app/api/metadata/generate-identifier/route.ts
    - app/(artist)/vault/[projectId]/metadata/identifiers/page.tsx
    - components/vault/IdentifierGuide.tsx
  modified:
    - lib/metadata/schema.ts
    - lib/metadata/bundle.ts
    - lib/metadata/export.ts
    - components/vault/MetadataStudio.tsx

key-decisions:
  - "user_profiles.isni kept PRIVATE (no column-level SELECT grant), consistent with the existing pro/ipi/mlc_id posture established at migration 040. Reasoning documented directly in migration 082's header comment: no consuming public-profile code path (app/u/[handle]/page.tsx, lib/profile/load.ts's buildProfileData()) currently surfaces any sibling identifier column, so granting isni alone would be an inconsistent one-off widening with no reader — exactly the kind of accidental grant the task instructions warned against. A future plan can revisit this as a deliberate product decision if ISNI-as-directory-identifier becomes a real use case."
  - "platform_identifier_config.grid_issuer_code seeded NULL — Funūn is not yet IFPI-registered for its own GRid issuer code. The single config row is seeded via INSERT ... ON CONFLICT DO NOTHING so the generate route can always UPDATE ... WHERE id = 1 atomically; a null issuer code means platform-issued GRid generation is structurally unavailable until Funūn's real code is registered and configured — no placeholder value was seeded, since a fabricated code would emit invalid GRids under a non-existent authority (T-16-11-6-adjacent harm)."
  - "page.tsx / ProfileForm read-wiring: the identifiers reference page and Metadata Studio popovers both read from the single IDENTIFIER_GUIDE source, and the guide/stored-field sync test (identifier-guide.test.ts) asserts every persisted identifier field has a corresponding guide entry, so a future stored identifier added without an explainer fails CI rather than silently shipping unexplained."
  - "Eligibility (canGenerate) lives inside generateIdentifier() itself, not the UI — no force flag, no client-trusted eligibility result. The route re-runs canGenerate server-side against the caller's own profile and platform config before minting."
  - "Distributor-GRid conflict rule: generation refused whenever the release's GRid field is already non-empty, regardless of provenance — one release, one GRid."

# Metrics
duration: unknown (continuation/finalization pass; original execution session not timed by this agent)
completed: 2026-08-03
status: complete
---

# Phase 16 Plan 11: DDEX Identifier Guide, Missing Party/Release Identifiers & Code Sheet Summary

**Inline explainers for every industry identifier Funūn stores, three missing DDEX-level identifiers added at their correct levels (migration 082: vault_projects.grid/catalog_number, user_profiles.isni), correct-level ERN emission, a cross-project code-sheet export, and structurally-gated identifier generation (platform-issued GRid via a global counter, artist-prefix UPC/catalog_number, centrally-allocated identifiers permanently unreachable) — migration 082 is now live (LOCAL=REMOTE), confirmed via `supabase migration list` and a service-role schema read.**

## What Was Built

- **`lib/metadata/identifier-guide.ts`**: `IDENTIFIER_GUIDE` — every identifier entry (party/work/resource/release level) carries `identifies`/`issuedBy`/`howToGet`/`unlocks`/`officialUrl` plus an `assignment` block (`mode`, `prefixRequired`, `whoShouldGenerate`, `whoShouldNotGenerate`, `importFrom`). Content is factual and process-oriented, never recommends a specific PRO/society/distributor. A sync test asserts every stored identifier field has a guide entry (drift guard) and that the `platform_issued`/`centrally_allocated` sets stay disjoint from the generator's supported list.
- **Migration 082** (`supabase/migrations/082_ddex_party_release_identifiers.sql`): `vault_projects.grid`/`catalog_number` (release-level, no column-level revoke — matches that table's existing pattern), `user_profiles.isni` (party-level, kept PRIVATE — see decision below), artist-held prefix columns (`gs1_company_prefix`, `grid_issuer_code` override, `catalog_number_prefix`, `identifier_counters` JSONB) mirroring the ISRC prefix/counter pattern from migration 007, and a new `platform_identifier_config` single-row table holding Funūn's own `grid_issuer_code` (seeded NULL) and a `grid_release_counter` (global, service-role-only writes). `identifier_sources` JSONB provenance tracking added on `vault_projects` and via the existing `tracks.metadata` key pattern.
- **ERN export** (`lib/metadata/export.ts`, `lib/metadata/bundle.ts`): `<GRid>` and `<CatalogNumber>` now emit inside `ReleaseId` alongside the existing `<ICPN>`, with the ProprietaryId fallback preserved for releases with none of the three.
- **`lib/metadata/code-sheet.ts`** + `GET /api/metadata/code-sheet`: pure `buildCodeSheet()` (one row per track across the caller's entire catalog, sorted by release date desc/track number asc, CSV-escaped, header-only for zero-project artists) and a session-scoped route deriving ownership strictly from the caller's session (no projectId parameter to tamper with).
- **`lib/metadata/generate.ts`** + `POST /api/metadata/generate-identifier`: `canGenerate()`/`generateIdentifier()` implementing three assignment modes — platform-issued GRid (Funūn's own issuer code or an artist-owned override, drawing from the correct owning counter), artist-prefix UPC/catalog_number, and permanently-unreachable centrally-allocated schemes (ISWC/IPI/ISNI/IPN/MLC/DPID). Correct, distinct check-digit algorithms per scheme (GS1 mod-10 for UPC, ISO 7064:1983 Mod 37,36 for GRid, existing `iswcCheckDigit` untouched for ISWC). Global platform counter is a dedicated service-role-owned row, advanced under atomic increment — never a per-artist value. Distributor-GRid conflict rule refuses a second mint when the release already carries a GRid. Route re-validates `canGenerate` server-side; no client-trusted eligibility.
- **Identifiers reference page + `components/vault/IdentifierGuide.tsx` + `MetadataStudio.tsx` explainers**: DDEX-level-grouped reference view with present/missing state, provenance display, prefix-entry surface alongside existing ISRC registrant-code settings, and inline popovers on every identifier field in Metadata Studio. No readiness-scoring changes (explicitly out of scope per plan instruction).

## Deviations from Plan

### None beyond the plan's own explicit instructions

The `user_profiles.isni` grant decision and the `platform_identifier_config.grid_issuer_code` NULL-seed were both explicit, argued decisions the plan's Task 2 action required be made and documented — not mid-execution deviations. They are recorded above under Key Decisions per the plan's own instruction to make them "an argued decision, not an accident."

## Task Commits

1. **Task 1 (RED): Identifier guide module test** — `e0de095` (test) — identifier-guide.test.ts written to the behavior block first, including the stored-field/guide-entry sync test.
2. **Task 2: Migration 082** — `35ece40` (feat) — vault_projects.grid/catalog_number, user_profiles.isni (private), artist prefix columns, platform_identifier_config; ReleaseRights type extended.
3. **Task 3: ERN emission at correct DDEX levels** — `a7fcf07` (feat) — GRid/CatalogNumber added to ReleaseId; grid/catalog_number carried through bundle and the export route's column list.
4. **Task 4: Cross-project code sheet + export route** — `ae94122` (feat) — buildCodeSheet() + GET /api/metadata/code-sheet, session-scoped.
5. **Task 4b: Generalized identifier generator** — `f624644` (feat) — generate.ts + POST /api/metadata/generate-identifier, global GRid counter, structural eligibility gating.
6. **Task 5: Identifiers reference page + Metadata Studio explainers** — `ab0846c` (feat) — IdentifierGuide.tsx component, identifiers page, MetadataStudio inline popovers.

## Live Migration Push — Approved

The Task 6 checkpoint (`checkpoint:human-verify`, gate `blocking-human`) required a human to run `supabase db push` — never an executor agent. The operator pushed migrations 080, 081, and 082 together, in order:

- `supabase migration list` shows **LOCAL=REMOTE through 082**.
- PostgREST recognizes the new schema (service-role read returned 200 against `buyer_orgs`; `vault_projects.grid`/`catalog_number`, `user_profiles.isni`, and `platform_identifier_config` land in the same push).
- Operator response: **"approved."**

This confirms the migration is live **at the schema level** (service-role read, which bypasses RLS).

## Outstanding / Deferred — Behavioral Adversarial Checks

The following checks named in this plan's Task 6 `how-to-verify` steps have **NOT** been executed and are recorded here as **DEFERRED**, not passed:

- **In-app explainer/outbound-link check** (Metadata Studio field explainers render and resolve to the correct issuing body) — requires a live browser session against a running app instance; not exercised in this continuation.
- **Multi-project code sheet download check** — requires a live artist account with tracks across multiple projects; not exercised.
- **DDEX export identifier-emission check** (ReleaseId carries ICPN/GRid/CatalogNumber) — requires exporting a real release through the live app; not exercised.
- **UPC generation-safety check** (no working Generate control without a GS1 prefix; correct barcode-valid output once a prefix is added) — requires a live artist profile with and without a prefix configured; not exercised.
- **Centrally-allocated no-Generate-affordance check** (ISWC/IPI/ISNI/IPN/MLC/DPID) — requires the same live browser session.
- **Platform GRid global-counter check** (two different artists' releases receive distinct release numbers) — requires Funūn's real GRid issuer code to be registered and `platform_identifier_config.grid_issuer_code` populated, which per this plan's own design is intentionally NOT yet done (seeded NULL). This check is structurally blocked until that separate, later registration step happens — it is not merely undone, it is currently impossible to run.

These are tracked as outstanding for the phase verifier. The UPC/GRid generation-safety and centrally-allocated-guardrail checks in particular require a live buyer-adjacent or artist UAT pass once a real artist profile and (for platform GRid) Funūn's registered issuer code exist.

## Threat Flags

None beyond the plan's own threat model (T-16-11-1 through T-16-11-10), which are addressed by the artifacts above. No new surface introduced outside the plan's scope.

## Self-Check

- `supabase/migrations/082_ddex_party_release_identifiers.sql` — FOUND
- `lib/metadata/identifier-guide.ts` — FOUND
- `lib/metadata/identifier-guide.test.ts` — FOUND
- `lib/metadata/code-sheet.ts` — FOUND
- `lib/metadata/code-sheet.test.ts` — FOUND
- `lib/metadata/generate.ts` — FOUND
- `lib/metadata/generate.test.ts` — FOUND
- `app/api/metadata/code-sheet/route.ts` — FOUND (present under app/api/metadata/)
- `app/api/metadata/generate-identifier/route.ts` — FOUND (present under app/api/metadata/)
- `components/vault/IdentifierGuide.tsx` — FOUND
- Commit `e0de095` — FOUND in git log
- Commit `35ece40` — FOUND in git log
- Commit `a7fcf07` — FOUND in git log
- Commit `ae94122` — FOUND in git log
- Commit `f624644` — FOUND in git log
- Commit `ab0846c` — FOUND in git log
- Migration 082 confirmed LOCAL=REMOTE per operator-reported `supabase migration list` output (schema-level only, not independently re-run by this agent — no live-DB commands executed per this continuation's constraints).

---
*Phase: 16-gtm-beta-buyer-portal*
*Completed: 2026-08-03*

## Self-Check: PASSED

All listed artifacts and task commits confirmed present on disk / in git log. Live migration push confirmed via operator-reported `supabase migration list` (LOCAL=REMOTE through 082) and PostgREST schema recognition — this agent did not run any live-DB command itself. Behavioral adversarial checks (in-app explainer rendering, multi-project code sheet, DDEX export emission, UPC/GRid generation safety, centrally-allocated guardrail, platform GRid global counter) remain DEFERRED — the platform GRid check is additionally blocked on Funūn's real issuer-code registration, a separate future step.
