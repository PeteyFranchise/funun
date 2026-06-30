---
phase: 05-launchpad-checklist
plan: "02"
subsystem: routing
tags: [middleware, admin, launchpad, dnd-kit, auth-gate]
dependency_graph:
  requires: []
  provides:
    - middleware /launchpad and /admin protection
    - (admin) route group with is_admin gate
    - app/(artist)/launchpad/[projectId] scaffold page
    - "@dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities installed"
  affects:
    - Plans 04 (artist launchpad room — attaches to [projectId] page scaffold)
    - Plan 06 (admin UI — attaches ChecklistAdmin and TipsAdmin to (admin) pages)
    - Plan 05 (admin API routes — reuses is_admin gate pattern from layout)
tech_stack:
  added:
    - "@dnd-kit/core 6.3.1"
    - "@dnd-kit/sortable 10.0.0"
    - "@dnd-kit/utilities 3.2.2"
  patterns:
    - is_admin gate via user.app_metadata cast + strict === true comparison
    - async params pattern (params: Promise<{ projectId: string }>) per Next.js 15
    - force-dynamic on all dynamic server-rendered pages
key_files:
  created:
    - app/(admin)/layout.tsx
    - app/(admin)/page.tsx
    - app/(admin)/checklist/page.tsx
    - app/(admin)/tips/page.tsx
    - app/(artist)/launchpad/[projectId]/page.tsx
  modified:
    - middleware.ts
    - package.json
    - package-lock.json
decisions:
  - Used force-dynamic on all (admin) pages to prevent static rendering errors caused by layout calling createServerClient() (cookie access at build time)
  - Admin sidebar is inline HTML in layout.tsx — no ArtistNav reuse per plan spec
  - Admin index page uses redirect() inside a standard (non-async) server component to keep it minimal
metrics:
  duration: "~12 minutes"
  completed: "2026-06-30"
  tasks_completed: 3
  tasks_total: 3
status: complete
---

# Phase 05 Plan 02: Routing Foundation and Dependencies Summary

Route architecture and dependency foundation established for Launchpad and Admin surfaces. Three @dnd-kit packages installed, middleware extended to protect two new path prefixes, (admin) route group created with is_admin gate, and the per-project Launchpad room page scaffolded — all with zero TypeScript build errors.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add /launchpad and /admin to middleware + install @dnd-kit | d0eabd1 | middleware.ts, package.json, package-lock.json |
| 2 | Create (admin) route group — is_admin gate, nav, three pages | a4b88ee | app/(admin)/layout.tsx, app/(admin)/page.tsx, app/(admin)/checklist/page.tsx, app/(admin)/tips/page.tsx |
| 3 | Scaffold per-project Launchpad room page | 9a97afa | app/(artist)/launchpad/[projectId]/page.tsx |

## What Was Built

**Middleware guard extension** — `isProtected` OR chain in `middleware.ts` now includes `pathname.startsWith('/launchpad')` and `pathname.startsWith('/admin')`. The Phase 4 claim-collaborators fire-and-forget block and `export const config` matcher are unchanged.

**@dnd-kit install** — Three packages landed in `package.json` dependencies: `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2 (all pre-audited OK in RESEARCH.md; 18M+ weekly downloads, same source repo, MIT license).

**(admin) route group** — `app/(admin)/layout.tsx` is an async server component. It calls `createServerClient()`, gets the user via `supabase.auth.getUser()`, redirects to `/signin` if no user, then casts `user.app_metadata as { is_admin?: boolean }` and redirects to `/` if `is_admin !== true`. The admin sidebar links to `/admin/checklist` and `/admin/tips`. `/admin` immediately redirects to `/admin/checklist`. Both admin content pages render scaffold headings; Plan 06 replaces their bodies.

**Launchpad project page** — `app/(artist)/launchpad/[projectId]/page.tsx` uses Next.js 15 async params (`params: Promise<{ projectId: string }>`). Fetches `id, title, release_date` from `vault_projects` scoped by `user_id`. Calls `notFound()` on miss. Renders `<Topbar>` with `"{project.title} — Launchpad"` title and "Your post-release action plan — week by week" subtitle per UI-SPEC copywriting. Placeholder body for Plan 04.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added force-dynamic to all (admin) pages**
- **Found during:** Task 2 — first npm run build attempt
- **Issue:** The (admin) layout calls `createServerClient()` which accesses cookies. Next.js attempted to statically pre-render `/checklist` and `/tips` pages, producing `Dynamic server usage: Route /checklist couldn't be rendered statically because it used cookies` build error.
- **Fix:** Added `export const dynamic = 'force-dynamic'` to app/(admin)/checklist/page.tsx, app/(admin)/tips/page.tsx, and app/(admin)/page.tsx.
- **Files modified:** app/(admin)/checklist/page.tsx, app/(admin)/tips/page.tsx, app/(admin)/page.tsx
- **Commit:** a4b88ee (included in same task commit)

## Verification

All acceptance criteria passed:

- middleware.ts isProtected chain contains both new path prefixes
- The Phase 4 claim block and `export const config` matcher are unchanged
- package.json dependencies contains all three @dnd-kit packages
- app/(admin)/layout.tsx casts user.app_metadata and compares is_admin strictly to true
- app/(admin)/page.tsx contains redirect('/admin/checklist')
- app/(admin)/checklist/page.tsx and app/(admin)/tips/page.tsx render headings "Checklist Items" and "Tips"
- app/(artist)/launchpad/[projectId]/page.tsx uses async params and selects release_date
- notFound() called on project miss
- `npm run build` completed with zero TypeScript errors

## Known Stubs

| File | Stub | Reason |
|------|------|--------|
| app/(admin)/checklist/page.tsx | "Checklist loading…" placeholder paragraph | Plan 06 replaces with ChecklistAdmin client component |
| app/(admin)/tips/page.tsx | "Admin tips management UI loads here" placeholder | Plan 06 replaces with TipsAdmin client component |
| app/(artist)/launchpad/[projectId]/page.tsx | "Checklist loading…" placeholder paragraph | Plan 04 replaces with LaunchpadRoom client component + parallel data fetches |

These stubs are intentional scaffolds. The plan objective explicitly states: "Plans 04 and 06 attach client components to these page shells."

## Threat Flags

No new security surface introduced beyond what the plan's threat model specifies. The is_admin gate (T-05-02) and middleware guard (T-05-04) are implemented as planned.

## Self-Check: PASSED

- app/(admin)/layout.tsx: EXISTS
- app/(admin)/page.tsx: EXISTS
- app/(admin)/checklist/page.tsx: EXISTS
- app/(admin)/tips/page.tsx: EXISTS
- app/(artist)/launchpad/[projectId]/page.tsx: EXISTS
- Commit d0eabd1: EXISTS (middleware + @dnd-kit)
- Commit a4b88ee: EXISTS ((admin) route group)
- Commit 9a97afa: EXISTS (launchpad [projectId] scaffold)
- npm run build: PASSED with zero errors
