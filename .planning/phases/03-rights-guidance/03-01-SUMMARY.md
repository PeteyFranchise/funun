---
phase: 03-rights-guidance
plan: "01"
subsystem: rights-data-layer
status: complete
commit: 2f16728
completed_date: "2026-06-28"
duration_seconds: 13
tags:
  - migration
  - types
  - api
  - rights
dependencies:
  requires: []
  provides:
    - vault_projects.copyright_status column
    - vault_projects.pro_registration_status column
    - vault_projects.soundexchange_registered column
    - VaultProject TypeScript type (three new fields)
    - PATCH /api/vault/[projectId]/rights route
  affects:
    - lib/vault/demo.ts
    - lib/vault/demo-store.ts
tech_stack:
  added: []
  patterns:
    - Next.js 15 Promise<params> pattern in PATCH handler
    - allowlist-based column injection prevention
    - ownership enforcement via .eq('user_id', user.id)
key_files:
  created:
    - supabase/migrations/024_vault_project_rights_status.sql
    - app/api/vault/[projectId]/rights/route.ts
  modified:
    - types/index.ts
    - lib/vault/demo.ts
    - lib/vault/demo-store.ts
decisions:
  - Nullable fields on VaultProject (not non-null with defaults) because Supabase
    applies column defaults on INSERT, not retroactively on existing rows — the
    rights page server component treats null as the unset/default state
  - soundexchange_registered stored as BOOLEAN rather than enum because SoundExchange
    registration is binary for MVP; the auto-derive-from-RDR-N path is a future enhancement
  - No new RLS policies needed — existing vault_projects USING (auth.uid() = user_id)
    policy already covers the new columns
  - Migration does not modify calculate_vault_readiness() — rights registration
    tracks filing actions, not data completeness
  - PATCH route returns { ok: true } on success rather than the updated row —
    caller needs no row data back; this keeps the response minimal and avoids
    a .select() round-trip
metrics:
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 3
---

# Phase 03 Plan 01: Rights Data Layer Summary

**One-liner:** Three rights registration status columns on vault_projects, extended VaultProject type, and PATCH-only write route with enum validation and ownership enforcement.

## What Was Delivered

### Task 1: Migration 024 (supabase/migrations/024_vault_project_rights_status.sql)

Added three columns to `vault_projects` using `ADD COLUMN IF NOT EXISTS`:

- `copyright_status TEXT DEFAULT 'not_filed'` with CHECK constraint on `('not_filed', 'filed', 'registered')`
- `pro_registration_status TEXT DEFAULT 'not_registered'` with CHECK constraint on `('not_registered', 'registered')`
- `soundexchange_registered BOOLEAN DEFAULT false`

The migration includes a comment block explaining that these columns track registration _actions_, not data completeness, and do not feed into `calculate_vault_readiness()`.

### Task 2: VaultProject type extension (types/index.ts)

Added three nullable fields after the `distributor` field, with a `// Rights registration status (migration 024)` section comment matching the existing style:

```typescript
copyright_status: 'not_filed' | 'filed' | 'registered' | null
pro_registration_status: 'not_registered' | 'registered' | null
soundexchange_registered: boolean | null
```

### Task 3: PATCH /api/vault/[projectId]/rights (app/api/vault/[projectId]/rights/route.ts)

Single-export PATCH handler following Next.js 15 conventions:
- Awaits `params` as `Promise<{ projectId: string }>`
- `createApiClient()` auth gate — returns 401 if no user
- Enum validation before write — returns 400 with `{ error: 'Invalid status value' }` on bad values
- Allowlist (`ALLOWED_FIELDS`) prevents column injection
- `.eq('user_id', user.id)` on the UPDATE enforces ownership (IDOR defense, T-03-01)
- Returns `{ ok: true }` on success

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] demo-store.ts missing new fields**
- **Found during:** Task 2 (`npm run build`)
- **Issue:** `VaultProjectRow` (derived from `VaultProject`) requires the three new fields; `addDemoProject` in `lib/vault/demo-store.ts` did not include them, causing a TypeScript error.
- **Fix:** Added `copyright_status: null, pro_registration_status: null, soundexchange_registered: null` to the demo project object.
- **Files modified:** `lib/vault/demo-store.ts`
- **Commit:** 2f16728 (included in main plan commit)

**2. [Rule 1 - Bug] demo.ts missing new fields**
- **Found during:** Task 2 second build pass
- **Issue:** The `row()` factory in `lib/vault/demo.ts` also constructs a `VaultProjectRow` and was missing the three new fields.
- **Fix:** Added `copyright_status: null, pro_registration_status: null, soundexchange_registered: null` as defaults in the `row()` spread base.
- **Files modified:** `lib/vault/demo.ts`
- **Commit:** 2f16728 (included in main plan commit)

## Threat Surface Scan

All new surface is captured in the plan's threat model. The PATCH route is the only new network endpoint introduced. T-03-01 (elevation of privilege) mitigated via `.eq('user_id', user.id)`. T-03-02/T-03-03 (tampering) mitigated via enum allowlist validation before write plus Supabase CHECK constraints as defense in depth.

No new threat surface outside the plan's threat model was introduced.

## Known Stubs

None. This plan is a pure data layer — no UI rendering, no data sourced from these fields yet. The rights page UI in Plans 02 and 03 will wire the fields.

## Next Steps

- Apply migration 024 to Supabase (manual step — paste SQL in Supabase SQL Editor)
- Plan 03-02: Rights guidance UI (copyright checklist, PRO registration, SoundExchange panel)
- Plan 03-03: Status persistence wired to the PATCH route

## Self-Check: PASSED

- `supabase/migrations/024_vault_project_rights_status.sql` — FOUND
- `app/api/vault/[projectId]/rights/route.ts` — FOUND
- `types/index.ts` contains `copyright_status`, `pro_registration_status`, `soundexchange_registered` — FOUND
- Commit `2f16728` — FOUND
- `npm run build` — PASSED (28/28 pages, zero TypeScript errors)
