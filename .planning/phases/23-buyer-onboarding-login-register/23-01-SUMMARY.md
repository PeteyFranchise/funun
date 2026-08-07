---
phase: 23-buyer-onboarding-login-register
plan: 01
subsystem: database
tags: [supabase, postgres, migration, rls, column-privilege, buyer-orgs]

# Dependency graph
requires:
  - phase: 25-funun-team-accounts-ae
    provides: buyer_orgs.ae_user_id (migration 090), staff RBAC, admin buyer-org PATCH allowlist convention (STAFF_EDITABLE_BUYER_ORG_FIELDS)
  - phase: 16-gtm-beta-launch (buyer_orgs foundation)
    provides: buyer_orgs/buyer_members tables, migration 080's column-grant allowlist doctrine
provides:
  - "buyer_orgs.status lifecycle column (pending_onboarding -> active) — drafted, not yet live"
  - "buyer_orgs lead-qualifying columns (use_case, contact_name, contact_email, contact_phone, contact_role, source) — drafted, not yet live"
  - "BuyerOrg TS type extended with status + use_case; BuyerOrgStatus union + BUYER_ORG_STATUS_VALUES exported"
affects: [23-02, 23-03, 23-04, 23-05, 23-06, 23-07, 23-08, 24-model-b-self-serve]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Column-privilege doctrine applied per-field in the same migration that adds the column (mirrors migration 090's precedent): status/use_case explicitly added to migration 080's authenticated GRANT SELECT allowlist; contact_*/source explicitly excluded as staff-only"

key-files:
  created:
    - supabase/migrations/095_buyer_org_lead_fields.sql
    - __tests__/migration-095.test.ts
  modified:
    - lib/buyers/schema.ts

key-decisions:
  - "status defaults to 'pending_onboarding' with a CHECK constraint (not a separate buyer_leads table) — register creates a real account immediately, per 23-CONTEXT.md's 'NOT a bare lead' decision"
  - "status + use_case granted to authenticated (buyer-readable, portal shows onboarding status); contact_name/contact_email/contact_phone/contact_role/source kept staff-only, mirroring ae_user_id's private-by-default precedent"
  - "source (register/sales_rep) is a plain discriminant column, not a schema fork — both doors write to the same buyer_orgs row shape (23-RESEARCH Answer 4)"

patterns-established:
  - "BUYER_ORG_STATUS_VALUES tuple as the single source of truth for status validation, mirroring the existing BUYER_ROLE_VALUES convention — 23-06's staff-edit route should import this rather than re-declaring the union"

requirements-completed: [SYNC-01]

coverage:
  - id: D1
    description: "Migration 095 adds buyer_orgs.status (pending_onboarding default, CHECK-constrained to pending_onboarding/active) and five lead-qualifying columns (use_case, contact_name, contact_email, contact_phone, contact_role, source)"
    requirement: "SYNC-01"
    verification:
      - kind: unit
        ref: "__tests__/migration-095.test.ts#095 adds status with the pending_onboarding/active CHECK and default"
        status: pass
      - kind: unit
        ref: "__tests__/migration-095.test.ts#095 adds each qualifying column"
        status: pass
    human_judgment: false
  - id: D2
    description: "Explicit per-column privilege split: status+use_case granted to authenticated; contact_*/source deliberately excluded from the authenticated grant (Pitfall 6 doctrine)"
    requirement: "SYNC-01"
    verification:
      - kind: unit
        ref: "__tests__/migration-095.test.ts#095 grants status and use_case to authenticated"
        status: pass
      - kind: unit
        ref: "__tests__/migration-095.test.ts#095 does NOT grant any contact_* column to authenticated (staff-only privacy)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Migration carries the HUMAN-GATED banner and was never pushed by this executor (supabase db push not run)"
    verification:
      - kind: unit
        ref: "__tests__/migration-095.test.ts#095 is human-gated"
        status: pass
      - kind: manual_procedural
        ref: "Owner confirms `supabase migration list` still shows LOCAL(095) != REMOTE until the 23-08 checkpoint push"
        status: unknown
    human_judgment: true
    rationale: "Confirming the migration was genuinely not pushed to the remote database requires the owner's own `supabase migration list` check against their live project — not something this executor can self-certify from inside the repo."
  - id: D4
    description: "BuyerOrg TS type extended with status/use_case (buyer-readable columns), BuyerOrgStatus union + BUYER_ORG_STATUS_VALUES exported; contact_*/source NOT added to the type"
    requirement: "SYNC-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit -p tsconfig.json (0 errors in lib/buyers/schema.ts; full repo typecheck also clean)"
        status: pass
    human_judgment: false

# Metrics
duration: 2min
completed: 2026-08-07
status: complete
---

# Phase 23 Plan 01: buyer_orgs lifecycle + lead-qualifying schema Summary

**Drafted (not pushed) migration 095 adding buyer_orgs.status lifecycle + five lead-qualifying columns with an explicit per-column privilege split, plus the matching BuyerOrg TS type extension.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-08-07T04:37:00-04:00
- **Completed:** 2026-08-07T04:38:49-04:00
- **Tasks:** 3/3 completed
- **Files modified:** 3

## Accomplishments
- Authored `supabase/migrations/095_buyer_org_lead_fields.sql`: `status text NOT NULL DEFAULT 'pending_onboarding' CHECK (status IN ('pending_onboarding','active'))` plus `use_case`, `contact_name`, `contact_email`, `contact_phone`, `contact_role`, and `source text NOT NULL DEFAULT 'register' CHECK (source IN ('register','sales_rep'))` — all additive to the live `buyer_orgs` table (migration 080).
- Applied the column-privilege doctrine explicitly and deliberately: `GRANT SELECT (status, use_case) ON public.buyer_orgs TO authenticated;` (additive to migration 080's existing `id, name, is_personal, verified, created_at` grant); `contact_name`/`contact_email`/`contact_phone`/`contact_role`/`source` are staff-only and intentionally excluded from the authenticated grant, mirroring migration 090's `ae_user_id` precedent.
- Wrote `__tests__/migration-095.test.ts` mirroring `__tests__/migration-089-090.test.ts`'s structural-assertion convention — 6 assertions covering the CHECK/default, all six columns, the grant line, the staff-only exclusion, the HUMAN-GATED banner, and the schema-cache reload. Green on first run.
- Extended `lib/buyers/schema.ts`: `BuyerOrg` now includes `status: BuyerOrgStatus` and `use_case: string | null`; added exported `BuyerOrgStatus` union and `BUYER_ORG_STATUS_VALUES` tuple (mirrors the existing `BUYER_ROLE_VALUES` convention) as the single source of truth for future staff-edit validation (23-06).
- Migration 095 was drafted and text-tested only — `supabase db push` was never run. The file carries the standing HUMAN-GATED banner (copied in shape from migration 090's) documenting that the owner pushes via Codex at the 23-08 checkpoint.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author migration 095 — buyer_orgs status + lead-qualifying fields + per-column grants** - `6bfb01c` (feat)
2. **Task 2: Structural text-test for migration 095** - `b32e523` (test)
3. **Task 3: Extend the BuyerOrg type with the buyer-readable lifecycle fields** - `36db4e3` (feat)

**Plan metadata:** committed separately (see final commit below)

## Files Created/Modified
- `supabase/migrations/095_buyer_org_lead_fields.sql` - New migration: buyer_orgs status lifecycle + 5 lead-qualifying columns + explicit column-grant split; HUMAN-GATED, not pushed
- `__tests__/migration-095.test.ts` - Structural text-test asserting the migration's CHECK constraints, columns, grant split, banner, and reload notify
- `lib/buyers/schema.ts` - `BuyerOrg` extended with `status`/`use_case`; new `BuyerOrgStatus` type + `BUYER_ORG_STATUS_VALUES` export

## Decisions Made
- `status` and `use_case` were the only two new columns judged buyer-readable — `status` because the buyer portal needs to show onboarding progress, `use_case` because the buyer typed it in themselves at register. The five contact/CRM fields (`contact_name`, `contact_email`, `contact_phone`, `contact_role`) and the `source` discriminant were judged staff-only, following the exact reasoning migration 090 already established for `ae_user_id`.
- `BuyerOrg` (the TypeScript type) was extended only with the buyer-readable columns (`status`, `use_case`), keeping the type provably honest to the authenticated column-grant allowlist — a downstream plan reading `BuyerOrg.contact_email` would be a type-system-caught bug, not a silent runtime `undefined`.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. Migration number 095 was confirmed correct against the live `supabase/migrations/` directory (094 is the current HEAD) before authoring.

## User Setup Required
None yet for this plan specifically. Migration 095 remains unpushed — the owner will push it (alongside any other Phase 23 migrations) via Codex at the 23-08 human-verify checkpoint, per this plan's locked directive.

## Next Phase Readiness
`BuyerOrg.status`/`use_case` and `BuyerOrgStatus`/`BUYER_ORG_STATUS_VALUES` are ready for downstream Phase 23 plans (register endpoint, AE onboarding surface, buyer portal status display, 23-06's staff-edit allowlist extension). No blockers — the only outstanding item is the human-gated `supabase db push` for migration 095 itself, deferred by design to the 23-08 checkpoint (this migration will be pushed together with whatever other Phase 23 migrations land before then).

---
*Phase: 23-buyer-onboarding-login-register*
*Completed: 2026-08-07*

## Self-Check: PASSED

All created/modified files verified present on disk; all 4 task/docs commit hashes (6bfb01c, b32e523, 36db4e3, 09b5523) verified present in git log.
