---
phase: 26-sync-library-inclusion
plan: 10
subsystem: ui
tags: [admin-console, fncon, sync-library, curation, react, nextjs]

# Dependency graph
requires:
  - phase: 26-sync-library-inclusion
    provides: "26-05's staff routes (POST /api/sync-library/invite, POST /api/sync-library/admin/[listingId], POST /api/sync-library/admin/[listingId]/remove) and migration 096's sync_listings state machine"
provides:
  - "Staff-facing admin Sync Library section: invite panel, per-song curation queue (admit/reject), leadership-only Remove action"
  - "/admin/sync-library staff-gated page (leadership + ae)"
  - "Sync Library sidebar link in the admin console"
affects: [26-audit, 26-secure-phase, future self-serve licensing admin work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Admin curation queue composed from three existing analogs (BuyerOrgsAdmin/StaffAdmin toggle-form, CapabilityRequestsAdmin optimistic decision state machine, DealsQueue filter chips + relative time) rather than a new pattern"
    - "Bounded client-filtered artist picker (server loads a capped pool, component filters by name/email/id) in place of a new search-by-email API route"

key-files:
  created:
    - components/admin/SyncLibraryAdmin.tsx
    - app/(admin)/admin/sync-library/page.tsx
  modified:
    - app/(admin)/layout.tsx

key-decisions:
  - "Curation queue's status chips bucket applied/invited/agreement_pending under one 'Needs review' amber chip (staff can't act yet — the artist hasn't reached pending_admit) and reserve indigo 'Ready to admit' for pending_admit, matching the admit/reject route's isValidTransition() legal-edge set exactly"
  - "No new API route added for the invite artist-picker; the page loads a bounded (300) member_type=artist pool with name/email, and the component filters client-side by name/email/id — kept the plan's 3-file scope intact"
  - "/admin/sync-library page gate restricted to leadership + ae (not 'any staff role'), matching the backing routes' requireStaff(['leadership','ae']) exactly; the sidebar link uses the same leadership-or-ae condition, kept out of the layout's existing leadership-only block so ae staff can navigate to a page they can actually use"

requirements-completed: [SYNCLIB-15, SYNCLIB-08, SYNCLIB-09, SYNCLIB-05]

coverage:
  - id: D1
    description: "Admin can invite an artist to the Sync Library via a collapsed toggle-form that searches by name/email and POSTs to /api/sync-library/invite"
    requirement: SYNCLIB-15
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (SyncLibraryAdmin.tsx, page.tsx) — pass"
      - kind: integration
        ref: "npm run build — /admin/sync-library route compiles, 146/146 test suites pass (npx jest)"
        status: pass
    human_judgment: true
    rationale: "No component-level UI tests exist in this codebase for admin components (only lib/route tests) — manual verification of the invite flow (search, select, send, error banner) is deferred per the plan's own <verification> section."
  - id: D2
    description: "Per-song curation queue shows admit/reject actions on pending_admit rows (with optional rejection reason), invited vs self-applied rendered as metadata on one list, oldest-first default filter"
    requirement: SYNCLIB-08
    verification:
      - kind: unit
        ref: "npx tsc --noEmit — pass"
      - kind: integration
        ref: "npm run build — pass; npx jest 146/146 suites — pass"
        status: pass
    human_judgment: true
    rationale: "Admit/reject optimistic UI + server-side transition enforcement needs a human to exercise the actual decision flow end-to-end against seeded sync_listings rows — deferred per plan."
  - id: D3
    description: "Leadership-only 'Remove from Sync Library' action appears only for leadership on an admitted song, with an inline two-button confirm (not browser confirm())"
    requirement: SYNCLIB-09
    verification:
      - kind: unit
        ref: "npx tsc --noEmit — pass"
    human_judgment: true
    rationale: "Requires signing in as both an AE and a leadership account to visually confirm the Remove control's conditional render — deferred per plan's <verification> (\"Manual (deferred): as AE, confirm no Remove action; as leadership, confirm Remove works and audits\")."
  - id: D4
    description: "/admin/sync-library is staff-gated (leadership + ae), lists the curation queue, and a Sync Library sidebar link exists in the admin console"
    requirement: SYNCLIB-05
    verification:
      - kind: unit
        ref: "npx tsc --noEmit — pass"
      - kind: integration
        ref: "npm run build — pass (route /admin/sync-library present in build manifest)"
        status: pass
    human_judgment: false

# Metrics
duration: ~35min
completed: 2026-08-08
status: complete
---

# Phase 26 Plan 10: Admin Sync Library — Invite, Curation Queue, Leadership Remove Summary

**Staff-facing `/admin/sync-library` section composing BuyerOrgsAdmin's toggle-form, CapabilityRequestsAdmin's optimistic decision state machine, and DealsQueue's filter chips into one `.fncon`-token curation surface with a leadership-gated takedown action.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-08T06:22:30Z
- **Tasks:** 2/2 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `SyncLibraryAdmin.tsx`: invite panel (collapsed toggle-form → searchable artist picker → `POST /api/sync-library/invite`), curation queue with `.fncon`-token filter chips (Needs review / Ready to admit / Admitted / Rejected / All, defaulting to Needs review oldest-first), Admit/Reject action pair on `pending_admit` rows with an optional rejection-reason input, and a leadership-only "Remove from Sync Library" action on admitted rows with an inline two-button confirm
- `app/(admin)/admin/sync-library/page.tsx`: staff-gated page (leadership + ae) that loads the full curation queue enriched with artist name/email, song title, and source project title, plus a bounded artist pool for the invite picker
- `app/(admin)/layout.tsx`: added the "Sync Library" sidebar link, visible to leadership + ae

## Task Commits

Each task was committed atomically:

1. **Task 1: SyncLibraryAdmin component (invite panel + curation queue + leadership remove)** - `55272c6` (feat)
2. **Task 2: Staff-gated admin page + sidebar link** - `49b4f51` (feat)

## Files Created/Modified
- `components/admin/SyncLibraryAdmin.tsx` - Invite panel, filterable curation queue, leadership-gated Remove action; all `.fncon` CSS-variable tokens
- `app/(admin)/admin/sync-library/page.tsx` - Staff-gated (leadership+ae) server page; loads + enriches the curation queue and the invite picker's artist pool
- `app/(admin)/layout.tsx` - Adds the "Sync Library" sidebar link (leadership + ae)

## Decisions Made
- **Status-chip bucketing:** `applied`/`invited`/`agreement_pending` all render as one amber "Needs review" chip (not three separate chips) because none of those statuses are legal admit/reject targets per `lib/sync-library/submission.ts`'s `isValidTransition()` — only `pending_admit` is. This keeps the UI's actionability signal aligned with the actual state machine rather than introducing UI states the backend can't act on.
- **No new API route for the invite picker:** the plan's `files_modified` list is exactly 3 files, and the existing `/api/sync-library/invite` route only accepts `profileId` (not email). Rather than add a search endpoint, the page server-loads a bounded (300) `member_type='artist'` pool with name+email, and the component does a client-side substring filter by name/email/id — satisfies "a field to pick the artist (id/email)" from 26-UI-SPEC.md without expanding scope.
- **Page/link gate is leadership+ae, not "any staff role":** the plan's task text says "allow leadership/ae to view the queue, per CONTEXT curation role," which is tighter than a generic `getStaffRole(user) !== null` check. Since the backing admit/reject and invite routes are both `requireStaff(['leadership','ae'])` (bd is excluded), the page gate mirrors that exactly. The sidebar link uses the same `isLeadership || role === 'ae'` condition and is deliberately kept OUTSIDE the layout's existing `isLeadership`-only block (which houses Client Partners/Deals) so ae staff can navigate to a page they are actually permitted to use — this is a minor divergence from the "near Client Partners/Deals" sibling links, which are leadership-only.

## Deviations from Plan

None — plan executed as written. The two clarifications above (status-chip bucketing, page/link role gate) resolve ambiguity within the plan's own text using the already-shipped 26-05 routes as the authority; they don't add or remove scope.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The admin Sync Library section is feature-complete for this phase's scope (invite, curate, leadership remove) and composes entirely from existing admin patterns — no new visual language introduced.
- Manual UAT still needed (per plan's own deferred verification): confirm the invite flow end-to-end, confirm admit/reject transitions against seeded `sync_listings` rows, and confirm the Remove control's leadership-only visibility as both an AE and a leadership account.
- `SYNCLIB-05/08/09/15` should be registered in REQUIREMENTS.md at phase close (per this plan's `<artifacts>` note — they were provisional going in).

---
*Phase: 26-sync-library-inclusion*
*Completed: 2026-08-08*

## Self-Check: PASSED

All created files confirmed present on disk; both task commits (55272c6, 49b4f51) confirmed in git log. `npx tsc --noEmit`, `npx eslint`, `npx jest` (146/146 suites, 1723/1723 tests), and `npm run build` all pass.
