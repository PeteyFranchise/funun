---
phase: 05-launchpad-checklist
plan: "01"
subsystem: database
tags: [migration, types, supabase, rls, launchpad]
status: complete
completed_date: "2026-06-30"
duration_minutes: 4

dependency_graph:
  requires:
    - supabase/migrations/001 (uuid_generate_v4 extension + update_updated_at function)
    - supabase/migrations/001 (vault_projects table for FK reference)
  provides:
    - launchpad_checklist_items table (admin-managed item definitions + tips)
    - launchpad_progress table (per-user per-project completion state)
    - ChecklistItem TypeScript type
    - LaunchpadProgress TypeScript type
    - MergedChecklistItem TypeScript type
  affects:
    - plans 02-06 (all read from these two tables)

tech_stack:
  added: []
  patterns:
    - uuid_generate_v4() for PK defaults (matching migration 001–027 convention)
    - ENABLE ROW LEVEL SECURITY immediately after CREATE TABLE (CVE-2025-48757)
    - Reused update_updated_at() trigger function (migration 001)
    - FK ON DELETE CASCADE for item_key to enforce orphan-free hard deletes
    - ON CONFLICT (key) DO NOTHING for idempotent seed inserts

key_files:
  created:
    - supabase/migrations/028_launchpad_checklist.sql
  modified:
    - types/index.ts

decisions:
  - FK on launchpad_progress.item_key → launchpad_checklist_items(key) ON DELETE CASCADE chosen over API-level cascade (simpler, DB-enforced, eliminates orphan risk)
  - uuid_generate_v4() used throughout (not gen_random_uuid() which is in CONTEXT.md DDL but inconsistent with migrations 001–027)
  - tip_draft and author excluded from artist-facing ChecklistItem type; those columns exist in DB for admin workflow but must never surface to artist API responses
  - Seed INSERT written in single block covering all 20 items across 4 sections

metrics:
  tasks_completed: 3
  tasks_total: 3
  files_created: 1
  files_modified: 1
---

# Phase 05 Plan 01: Launchpad Data Layer Summary

**One-liner:** Supabase migration creating `launchpad_checklist_items` and `launchpad_progress` tables with RLS, cascade FK, 20 seeded items, and three artist-facing TypeScript types.

## What Was Built

### Migration 028 — Two tables, RLS, seed data

`supabase/migrations/028_launchpad_checklist.sql` defines the full data layer for Phase 5:

**`launchpad_checklist_items`** — admin-managed item definitions:
- UUID PK via `uuid_generate_v4()` (matching codebase convention across migrations 001–027)
- `key TEXT NOT NULL UNIQUE` — slug identifier used as FK target and in API paths
- All tip fields: `tip_body` (approved), `tip_draft` (pending admin review), `tip_approved` flag, `author`, `tip_drafted_at`
- RLS enabled immediately after CREATE TABLE; `"Anyone can read checklist items"` SELECT policy (approved-tip filtering enforced at API layer)
- `set_launchpad_checklist_items_updated_at` trigger reusing `update_updated_at()` from migration 001
- `idx_launchpad_checklist_items_section` index on `(section, sort_order)`

**`launchpad_progress`** — per-user per-project completion state:
- `item_key TEXT NOT NULL REFERENCES launchpad_checklist_items(key) ON DELETE CASCADE` — resolves RESEARCH Open Question 1; DB enforces orphan cleanup atomically
- `UNIQUE (user_id, project_id, item_key)` constraint for upsert conflict target
- RLS enabled; `"Users manage own progress"` ALL-verb policy with `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
- `idx_launchpad_progress_user_project` index on `(user_id, project_id)`

**Seed data:** 20 items across 4 sections seeded idempotently via `ON CONFLICT (key) DO NOTHING`. All items seed with `tip_approved = false` and `tip_body = NULL`.

### TypeScript types — types/index.ts

Three new exported types appended following the existing `VaultProject` named-export pattern:

- `ChecklistItem` — artist-facing item type; `section` narrowed to 4-value union; `action_type` narrowed to `'internal_tool' | 'external_url'`; nullable columns typed with `| null`; `tip_draft` intentionally excluded (admin-only)
- `LaunchpadProgress` — per-user per-project completion state
- `MergedChecklistItem = ChecklistItem & { completed: boolean; completed_at: string | null }` — for artist-facing components after server-side merge

`npm run build` type-checks clean.

## Deviations from Plan

None — plan executed exactly as written. The seed INSERT was included in the same migration file rather than as a strictly separate task (Tasks 1 and 2 were written in a single `Write` call), which matches the plan's intent. Both were committed atomically as a single commit.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Tasks 1+2: Migration 028 (tables + seed) | d60e49a | supabase/migrations/028_launchpad_checklist.sql |
| Task 3: TypeScript types | 9ec9f53 | types/index.ts |

## Known Stubs

None. This plan is data-layer only — no UI components or API routes are built here. No stubs to track.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what the plan's threat model covers. Both T-05-01 (RLS on launchpad_progress) and T-05-03 (FK cascade for orphan cleanup) are fully mitigated in migration 028 as planned.

## Self-Check: PASSED

- `supabase/migrations/028_launchpad_checklist.sql` exists: FOUND
- `types/index.ts` contains `ChecklistItem`, `LaunchpadProgress`, `MergedChecklistItem`: FOUND
- `npm run build` zero TypeScript errors: PASSED
- Commit d60e49a exists: FOUND
- Commit 9ec9f53 exists: FOUND
