---
phase: 05-launchpad-checklist
plan: "03"
subsystem: api
tags: [api-routes, launchpad, checklist, progress, rls, tip-gating]
status: complete
completed_date: "2026-06-30"
duration_minutes: 5

dependency_graph:
  requires:
    - supabase/migrations/028_launchpad_checklist.sql (launchpad_checklist_items + launchpad_progress tables)
    - types/index.ts ChecklistItem, LaunchpadProgress, MergedChecklistItem (plan 01)
    - lib/supabase/server.ts createApiClient (existing)
    - app/api/vault/[projectId]/route.ts (auth pattern, async params pattern)
  provides:
    - GET /api/launchpad/[projectId]/checklist (owner-scoped, sort_order-ordered, tip-gated, progress-merged)
    - PATCH /api/launchpad/[projectId]/progress (session-scoped upsert, UNIQUE constraint target)
  affects:
    - plans 04-06 (artist UI and admin routes consume these endpoints)

tech_stack:
  added: []
  patterns:
    - createApiClient() + getUser() + 401 pattern (existing, from app/api/vault/[projectId]/route.ts)
    - async params: params: Promise<{ projectId: string }> + await params (Next.js 15)
    - Ownership check via .eq('user_id', user.id).maybeSingle() → 404 on absent
    - Promise.all parallel fetch (items + progress) with Map merge
    - Destructure-to-exclude pattern for stripping admin-only columns from response
    - Upsert with onConflict: 'user_id,project_id,item_key' (UNIQUE constraint from migration 028)

key_files:
  created:
    - app/api/launchpad/[projectId]/checklist/route.ts
    - app/api/launchpad/[projectId]/progress/route.ts
  modified: []

decisions:
  - Destructure-to-exclude used to strip tip_draft, tip_drafted_at, author from the response object — explicit exclusion is safer than an allowlist spread and compiles cleanly under strict TypeScript
  - user_id sourced exclusively from session user.id in the PATCH handler; body.user_id is never read (T-05-01 mitigation)
  - completed_at cleared to null when completed is false so unchecking a step removes the timestamp

metrics:
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 05 Plan 03: Launchpad Checklist API Routes Summary

**One-liner:** Two Next.js API routes powering the per-project Launchpad room: a GET that merges checklist items with per-user progress and gates unapproved tips, and a PATCH that upserts a completion row scoped to the session user.

## What Was Built

### GET /api/launchpad/[projectId]/checklist

`app/api/launchpad/[projectId]/checklist/route.ts` provides the artist-facing checklist read path:

- **Auth:** `createApiClient()` + `getUser()` → 401 when unauthenticated
- **Ownership:** `.eq('user_id', user.id).maybeSingle()` on `vault_projects` → 404 when project is not owned by the caller
- **Parallel fetch:** `Promise.all` fetches `launchpad_checklist_items` ordered by `sort_order` and `launchpad_progress` filtered to `(project_id, user_id)` concurrently
- **Map merge:** `O(1)` lookup via `new Map(progress.map(p => [p.item_key, p]))`, merged into each item
- **Tip gating (LAUNCH-03):** `tip_body` is returned as-is when `tip_approved` is true, null otherwise
- **Admin field exclusion:** `tip_draft`, `tip_drafted_at`, and `author` are destructured out of each item before spreading into the response — these columns never appear in the artist payload
- **Response:** `{ data: MergedChecklistItem[] }` with `completed` (default `false`) and `completed_at` (default `null`) added per item

### PATCH /api/launchpad/[projectId]/progress

`app/api/launchpad/[projectId]/progress/route.ts` handles completion toggles:

- **Auth:** same pattern — 401 on unauthenticated
- **Input validation:** `item_key` must be a `string`; `completed` must be a `boolean`; 400 returned if either is absent or wrong type
- **Session-scoped write:** `user_id` is always `user.id` from the session — the body is never consulted for this value (T-05-01: RLS `WITH CHECK (auth.uid() = user_id)` provides a second layer of enforcement at the DB level)
- **Upsert:** `.upsert({ ... }, { onConflict: 'user_id,project_id,item_key' })` targets the `UNIQUE (user_id, project_id, item_key)` constraint from migration 028
- **Timestamp:** `completed_at` is set to `new Date().toISOString()` when `completed` is `true`, cleared to `null` when `false`
- **Response:** `{ ok: true }` on success; `{ error: message }` with 500 on DB error

## Deviations from Plan

None — plan executed exactly as written.

The destructure-to-exclude approach for stripping `tip_draft`/`tip_drafted_at`/`author` from the response object was the chosen implementation of the plan's requirement ("DROP tip_draft, tip_drafted_at, and author from the response"). This avoids spreading unknown admin columns from a `select('*')` result and compiles cleanly under TypeScript strict mode.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: GET /api/launchpad/[projectId]/checklist | e322a91 | app/api/launchpad/[projectId]/checklist/route.ts |
| Task 2: PATCH /api/launchpad/[projectId]/progress | e5101d8 | app/api/launchpad/[projectId]/progress/route.ts |

## Known Stubs

None. Both routes are fully functional — they read from and write to the live Supabase tables created in migration 028. No hardcoded values, placeholder text, or mock data.

## Threat Flags

No new trust boundaries beyond those in the plan's threat model.

- T-05-01 (Elevation of Privilege): Mitigated — `user_id` forced to `user.id` in PATCH handler; never read from body.
- T-05-05 (Information Disclosure — tip fields): Mitigated — `tip_body` nulled when `tip_approved` is false; `tip_draft`, `tip_drafted_at`, `author` destructured out of every response object.
- T-05-06 (Information Disclosure — cross-project progress): Mitigated — project ownership check via `.eq('user_id', user.id)` returns 404 for non-owned projects; progress query also scoped by `.eq('user_id', user.id)`.

## Self-Check: PASSED

- `app/api/launchpad/[projectId]/checklist/route.ts` exists: FOUND
- `app/api/launchpad/[projectId]/progress/route.ts` exists: FOUND
- `npm run build` zero TypeScript errors: PASSED
- Commit e322a91 exists: FOUND
- Commit e5101d8 exists: FOUND
