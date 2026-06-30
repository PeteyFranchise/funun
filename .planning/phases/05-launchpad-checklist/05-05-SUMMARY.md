---
phase: 05-launchpad-checklist
plan: "05"
subsystem: admin-api
tags: [admin, checklist, tips, api, auth-gate, crud]
dependency_graph:
  requires: ["05-01"]
  provides: [LAUNCH-05, LAUNCH-03-admin]
  affects: ["05-06"]
tech_stack:
  added: [lib/admin/gate.ts]
  patterns: [verifyAdmin-gate, EDITABLE_FIELDS-allowlist, service-client-post-gate, async-params]
key_files:
  created:
    - app/api/admin/checklist/route.ts
    - app/api/admin/checklist/[itemKey]/route.ts
    - app/api/admin/tips/route.ts
    - app/api/admin/tips/[itemKey]/route.ts
    - lib/admin/gate.ts
  modified: []
decisions:
  - verifyAdmin() extracted to lib/admin/gate.ts so it is imported by all four route files rather than copied
  - Reorder PATCH uses sequential per-item updates (not upsert) to handle partial failures with a clear 500 response
  - Tip approve accepts optional tip_text body field so admin can edit draft text before promotion without a separate write
metrics:
  duration: "~8 minutes"
  completed: "2026-06-30"
  tasks_completed: 3
  files_created: 5
status: complete
---

# Phase 05 Plan 05: Admin API — Checklist CRUD, Reorder, and Tip Approval Summary

Admin REST API for checklist item management and tip draft promotion: per-route is_admin gate using service-role client, EDITABLE_FIELDS allowlist, atomic reorder, and approve/reject tip workflow.

## What Was Built

Six HTTP handlers across four route files behind a shared `verifyAdmin()` gate:

- **GET /api/admin/checklist** — lists all items including admin-only fields (tip_draft, author)
- **POST /api/admin/checklist** — creates items with key regex, section/action_type literal validation, and 409 on duplicate key
- **PATCH /api/admin/checklist** — atomic reorder: accepts full `{ order: [{key, sort_order}] }` array, updates all items sequentially
- **PATCH /api/admin/checklist/[itemKey]** — edits EDITABLE_FIELDS only; validates section/action_type literals; rejects empty update
- **DELETE /api/admin/checklist/[itemKey]** — hard-deletes; relies on FK CASCADE for progress rows (no manual delete)
- **GET /api/admin/tips** — lists items where `tip_draft IS NOT NULL`, ordered by `tip_drafted_at`
- **PATCH /api/admin/tips/[itemKey]** — approve (copies draft→body, sets approved=true, clears draft) or reject (clears draft only); optional `tip_text` override for admin edits before promotion

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|-----------|
| T-05-02 (EoP) | verifyAdmin() runs first on every handler; createServiceClient() invoked only after gate passes |
| T-05-07 (Tampering) | EDITABLE_FIELDS allowlist; section/action_type validated against fixed literal arrays |
| T-05-08 (Tampering) | itemKey validated against `/^[a-z0-9_]+$/` before use in WHERE clause |
| T-05-05 (Info Disclosure) | tip_draft only reaches artists after approve sets tip_approved=true; reject discards without publishing |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed named non-HTTP exports from route file**
- **Found during:** Task 1 verification (build)
- **Issue:** Next.js 15 route files reject any export that is not a valid HTTP method (GET/POST/PATCH etc.). The initial implementation re-exported `verifyAdmin`, `EDITABLE_FIELDS`, etc. directly from route.ts, causing a build failure: "X is not a valid Route export field."
- **Fix:** Extracted all shared helpers and constants into `lib/admin/gate.ts`. Route files import from there — no extra exports in route modules.
- **Files modified:** `lib/admin/gate.ts` (new), `app/api/admin/checklist/route.ts` (updated)
- **Commit:** 328d2ee

**2. [Rule 1 - Bug] Fixed TypeScript union-return-type syntax on async function**
- **Found during:** Task 1 verification (build)
- **Issue:** Used `| Promise<X> | Promise<Y>` syntax on the `verifyAdmin` function signature — TypeScript requires `Promise<X | Y>` for async functions.
- **Fix:** Introduced a `VerifyAdminResult` union type and declared the return as `Promise<VerifyAdminResult>`.
- **Files modified:** `lib/admin/gate.ts`
- **Commit:** 328d2ee

## Known Stubs

None. This plan is pure API — no UI data rendering stubs.

## Threat Flags

None. All new surface is gated by `verifyAdmin()` before any data access.

## Self-Check: PASSED

Files exist:
- /Users/peterzora/Desktop/funun/app/api/admin/checklist/route.ts — FOUND
- /Users/peterzora/Desktop/funun/app/api/admin/checklist/[itemKey]/route.ts — FOUND
- /Users/peterzora/Desktop/funun/app/api/admin/tips/route.ts — FOUND
- /Users/peterzora/Desktop/funun/app/api/admin/tips/[itemKey]/route.ts — FOUND
- /Users/peterzora/Desktop/funun/lib/admin/gate.ts — FOUND

Commits exist:
- 328d2ee feat(05-05): admin checklist list/create/reorder route
- b0347f4 feat(05-05): admin checklist edit/delete route
- 01ee857 feat(05-05): admin tips list and approve/reject route

Build: `npm run build` passes with zero TypeScript errors.
