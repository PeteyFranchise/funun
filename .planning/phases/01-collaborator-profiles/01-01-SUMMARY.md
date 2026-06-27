---
phase: 01-collaborator-profiles
plan: "01"
subsystem: collaborator-roster
tags: [collaborators, rls, supabase, api-routes, crud, next15, ui-components]
status: complete

dependency_graph:
  requires: []
  provides:
    - collaborators-table
    - split-sheets-table
    - split-sheet-parties-table
    - collaborator-invites-table
    - CollaboratorProfile-type
    - sanitizeCollaborator
    - GET-POST-api-collaborators
    - PATCH-DELETE-api-collaborators-id
    - CollaboratorRoster-component
    - CollaboratorCard-component
    - CollaboratorForm-component
    - CollaboratorPicker-component
    - collaborators-page
  affects:
    - components/nav/ArtistNav.tsx
    - components/nav/icons.tsx
    - middleware.ts

tech_stack:
  added: []
  patterns:
    - EDITABLE_FIELDS allowlist sanitizer (profile/route.ts pattern)
    - Next.js 15 Promise<params> dynamic route typing
    - EditProjectForm modal toggle (confirm-delete flow)
    - RLS user-scoped tables keyed by user_id

key_files:
  created:
    - supabase/migrations/018_collaborators_split_sheets.sql
    - lib/collaborators/index.ts
    - app/api/collaborators/route.ts
    - app/api/collaborators/[id]/route.ts
    - app/(artist)/collaborators/page.tsx
    - components/collaborators/CollaboratorCard.tsx
    - components/collaborators/CollaboratorForm.tsx
    - components/collaborators/CollaboratorRoster.tsx
    - components/collaborators/CollaboratorPicker.tsx
  modified:
    - components/nav/icons.tsx
    - components/nav/ArtistNav.tsx
    - middleware.ts

decisions:
  - "params typed as Promise<{ id: string }> in dynamic routes — required by Next.js 15 (was inlined RouteContext type)"
  - "mailing_address stored as { raw: string } JSONB in Phase 1 — structured sub-fields deferred to future phase"
  - "CollaboratorRoster manages client-side list state for optimistic updates without full re-fetch"
  - "CollaboratorPicker closes on outside click via mousedown listener — consistent with existing modal patterns"

metrics:
  duration: "~45 minutes"
  completed: "2026-06-27"
  tasks_completed: 3
  tasks_total: 4
  files_created: 9
  files_modified: 3
---

# Phase 01 Plan 01: Collaborator Roster Summary

**One-liner:** Global collaborator roster with full RLS-protected CRUD API, card-grid UI, create/edit/delete modal, CollaboratorPicker for Wave 2 reuse, and nav + middleware integration.

---

## What Was Built

This plan delivered the foundational collaborator slice for Wave 2: a user can now create, view, edit, and delete a global collaborator from a dedicated `/collaborators` page. Every subsequent Wave 2 feature (composer-row picker, split-sheet auto-fill) reads from the tables and API built here.

### Migration 018

Four RLS-protected tables added to `supabase/migrations/018_collaborators_split_sheets.sql`:

- **collaborators** — global roster keyed by `user_id`; no `default_split` column (D-17)
- **split_sheets** — standalone, `vault_project_id` nullable (D-18)
- **split_sheet_parties** — per-party rows with `approval_token` column for token-based approval flow (D-15)
- **collaborator_invites** — invite tracking with 30-day token expiry (D-08)

All tables use `uuid_generate_v4()` PKs, `ENABLE ROW LEVEL SECURITY`, and at least one RLS policy. No `artist_id` reference anywhere (Pitfall 5 avoided).

**Note:** The project has no `supabase/config.toml` (no local CLI config). The migration file is ready — the developer must apply it via the Supabase dashboard SQL editor or by running `supabase db push` after linking the project.

### lib/collaborators/index.ts

- `COLLABORATOR_EDITABLE_FIELDS` — SCREAMING_SNAKE_CASE constant, allowlist for mass-assignment defense (T-01-02)
- `CollaboratorProfile` — PascalCase type with full field set
- `sanitizeCollaborator()` — strips unknown keys, trims strings, maps empty → null, accepts JSONB object for `mailing_address`

### CRUD API Routes

- `GET /api/collaborators` — user-scoped list ordered by name; 401 gate
- `POST /api/collaborators` — creates with allowlist; requires `name`; inserts `user_id` server-side
- `PATCH /api/collaborators/[id]` — dual `.eq('id').eq('user_id')` ownership chain (T-01-03)
- `DELETE /api/collaborators/[id]` — dual `.eq` ownership chain (T-01-03)

All four handlers use `createApiClient()` + `supabase.auth.getUser()` 401 gate (T-01-04).

### UI Components

- **CollaboratorCard** — name at 14.5px bold, PRO label, IPI status badge (brandindigo "IPI on file" / amber "IPI missing"), amber left-border accent when IPI absent (D-11)
- **CollaboratorForm** — create/edit modal following EditProjectForm toggle pattern; all 9 fields in 2-column grid; confirm-delete flow with "Yes, delete"/"Keep" (D-12); PRO select from PRO_VALUES/PRO_LABELS
- **CollaboratorRoster** — card grid `grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`; inline create/edit toggle; empty state with people icon and CTA
- **CollaboratorPicker** — fetches `GET /api/collaborators` on mount; search input; aria-haspopup/aria-expanded; inline "Add new collaborator" opens CollaboratorForm inside dropdown; outside-click close handler

### Nav + Middleware

- **CollaboratorsIcon** — people/group SVG appended to `icons.tsx`, follows Svg wrapper pattern exactly
- **ArtistNav** — `/collaborators` entry added after Contract Locker (rights-adjacent per D-10)
- **middleware.ts** — isProtected adds `/collaborators` and `/split-sheets`; `/approve` and `/join` explicitly left public (comment added, D-15, D-08)

### /collaborators Page

`app/(artist)/collaborators/page.tsx` — `force-dynamic` server component; fetches collaborators with `createServerClient()`; renders `<CollaboratorRoster>` with Topbar chrome consistent with other artist pages.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Next.js 15 params type incompatibility**
- **Found during:** Task 2 — first `npm run build`
- **Issue:** `RouteContext = { params: { id: string } }` type alias rejected by Next.js 15's route handler type checker: "Type 'RouteContext' is not a valid type for the function's second argument"
- **Fix:** Inlined `{ params }: { params: Promise<{ id: string }> }` in each handler — matching the pattern used in `app/api/vault/[projectId]/route.ts` (line 112)
- **Files modified:** `app/api/collaborators/[id]/route.ts`
- **Commit:** 36a8deb

### Environment Notes

**Schema push not automated:** The project has no `supabase/config.toml` (CLI not initialized for this repo). The migration file `018_collaborators_split_sheets.sql` is created and verified but must be applied manually. Developer action required before Task 4 verification can succeed.

---

## Known Stubs

None. All data flows from the live database (once migration is applied). No hardcoded empty values, placeholder text, or unconnected data sources in the components built here.

---

## Threat Surface Scan

All security-relevant surfaces were in the plan's threat model and mitigated:

| T-ID | File | Status |
|------|------|--------|
| T-01-01 (info disclosure) | GET /api/collaborators | Mitigated — RLS + `.eq('user_id')` filter |
| T-01-02 (tampering/mass-assign) | POST /api/collaborators | Mitigated — `sanitizeCollaborator()` allowlist |
| T-01-03 (elevation) | PATCH + DELETE /[id] | Mitigated — dual `.eq('id').eq('user_id')` |
| T-01-04 (spoofing) | All routes | Mitigated — `createApiClient()` + `getUser()` 401 gate |

No new security surfaces beyond the plan's threat model.

---

## Self-Check: PASSED

**Files exist:**
- supabase/migrations/018_collaborators_split_sheets.sql: FOUND
- lib/collaborators/index.ts: FOUND
- app/api/collaborators/route.ts: FOUND
- app/api/collaborators/[id]/route.ts: FOUND
- app/(artist)/collaborators/page.tsx: FOUND
- components/collaborators/CollaboratorCard.tsx: FOUND
- components/collaborators/CollaboratorForm.tsx: FOUND
- components/collaborators/CollaboratorRoster.tsx: FOUND
- components/collaborators/CollaboratorPicker.tsx: FOUND

**Commits exist:**
- 8ae3f5d: feat(01-01): migration 018
- 36a8deb: feat(01-01): collaborator type, sanitizer, and CRUD API routes
- 4d31ffe: feat(01-01): roster page, components, nav icon, and middleware protection

**Build:** green (no TypeScript errors, no ESLint errors)
**Acceptance checks:** all 12 grep/file-existence checks passed
