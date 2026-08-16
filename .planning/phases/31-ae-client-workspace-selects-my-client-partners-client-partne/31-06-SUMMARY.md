---
phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
plan: 06
subsystem: api
tags: [supabase, zod, service-role, staff-scope, crm]

# Dependency graph
requires:
  - phase: 31-02
    provides: migration 112 (buyer_org_contacts, client_relationship_log, buyer_orgs.website) and the staff-role/requireStaff/isAssignedToOrg gating primitives
provides:
  - lib/client-partners/contacts.ts — contact + relationship-log service-role helpers, CONTACT_EDITABLE_FIELDS allowlist, D-09 zod schemas, canAccessOrgContacts own-book predicate
  - app/api/admin/client-partners/[orgId]/contacts/route.ts — GET/POST/PATCH(incl. set-primary)/DELETE
  - app/api/admin/client-partners/[orgId]/relationship-log/route.ts — GET (read) / POST (append note/conversation)
affects: [my-client-partners-ui, client-partner-workspace, 31.1-slice-2-assignment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Own-book scope predicate composed once (canAccessOrgContacts) and reused identically across both routes, mirroring app/api/admin/buyer-orgs/[id]/route.ts's isAssignedToOrg + 404-on-denial convention"
    - "Nested-resource PATCH/DELETE target the row via an `id` field in the JSON body (not a second dynamic route segment), with a re-verify-ownership read before every mutation"

key-files:
  created:
    - lib/client-partners/contacts.ts
    - lib/client-partners/contacts.test.ts
    - app/api/admin/client-partners/[orgId]/contacts/route.ts
    - app/api/admin/client-partners/[orgId]/relationship-log/route.ts
  modified: []

key-decisions:
  - "setPrimaryContact() does the clear-then-set as two sequential service-role writes (no RPC exists for this yet) — the partial unique index from migration 112 is the DB-layer backstop if a crash lands between the two writes"
  - "canAccessOrgContacts() composes the leadership bypass with the already-tested isAssignedToOrg() rather than duplicating that logic — kept the own-book scope test in this plan's file to a single new predicate instead of re-proving isAssignedToOrg's own cases"
  - "appendRelationshipLog/listRelationshipLog live in the same lib/client-partners/contacts.ts file (not a sibling relationship-log.ts) to match the plan frontmatter's files_modified list exactly"

patterns-established:
  - "pickContactFields() is the CONTACT_EDITABLE_FIELDS mass-assignment allowlist as a pure, independently-testable function — separate from the zod shape schemas, so an unlisted field is rejected even if it slipped past validation"

requirements-completed: [R1, R5, D-05, D-08, D-09]

coverage:
  - id: D1
    description: "Contacts CRUD (list/create/edit/delete) under a buyer_org with the D-08 one-primary invariant, D-09 rich record shape, CONTACT_EDITABLE_FIELDS allowlist, and own-book scope (404 on an uncovered org)"
    requirement: "R1, R5, D-08, D-09"
    verification:
      - kind: unit
        ref: "lib/client-partners/contacts.test.ts#setPrimaryContact (D-08 one-primary invariant) > leaves exactly one primary contact for the org after switching"
        status: pass
      - kind: unit
        ref: "lib/client-partners/contacts.test.ts#pickContactFields (mass-assignment allowlist, T-31-15) > rejects an unlisted field"
        status: pass
      - kind: unit
        ref: "lib/client-partners/contacts.test.ts#canAccessOrgContacts (R5 own-book scope) > a non-leadership AE on an uncovered org is rejected (404-shaped)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "Relationship-log GET (newest-first, optional contact_id filter) and POST (append note/conversation, author stamped server-side, no edit/delete handler) under app/api/admin/client-partners/[orgId]/relationship-log/route.ts"
    requirement: "R1, D-05"
    verification:
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
      - kind: other
        ref: "test -f 'app/api/admin/client-partners/[orgId]/relationship-log/route.ts'"
        status: pass
    human_judgment: true
    rationale: "No HTTP-level or integration test exercises the route's own-book scope check, zod validation, or append-only posture at runtime — only static (tsc/file-existence) checks per this task's acceptance criteria. A human/UAT pass against a live Supabase session is needed to prove the GET/POST wiring actually round-trips."

duration: 25min
completed: 2026-08-15
status: complete
---

# Phase 31 Plan 06: Contacts + Relationship Log Summary

**CRM-lite people layer's API: multi-contact-one-primary rich contact records (D-08/D-09) and an append-only relationship log, both staff-only and own-book-scoped.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-15T22:20:00-04:00 (approx)
- **Completed:** 2026-08-15T22:42:32-04:00
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments
- `lib/client-partners/contacts.ts`: `listContacts`/`createContact`/`patchContact`/`deleteContact`/`setPrimaryContact` service-role helpers, `CONTACT_EDITABLE_FIELDS` allowlist + `pickContactFields()`, D-09 zod schemas (`ContactCreateSchema`/`ContactPatchSchema`), `canAccessOrgContacts()` own-book scope predicate, and `listRelationshipLog`/`appendRelationshipLog` for the org's relationship log.
- `app/api/admin/client-partners/[orgId]/contacts/route.ts`: GET list, POST create, PATCH edit (including `set_primary: true`), DELETE — every handler `requireStaff()`-gated, own-book-scoped, 404 on scope denial, and re-verifies a target `contactId` belongs to the org before mutating it.
- `app/api/admin/client-partners/[orgId]/relationship-log/route.ts`: GET (newest-first, optional `contact_id` query filter), POST (append `note`/`conversation`, author stamped from the session, `contact_id` cross-org guard) — no PATCH/DELETE handler, append-only.
- `lib/client-partners/contacts.test.ts`: proves the exactly-one-primary invariant across a primary switch (and that a different org's primary is untouched), that the allowlist strips `is_primary`/`buyer_org_id`/`id`/arbitrary keys, and that a non-leadership AE on an uncovered org is rejected while leadership and an assigned AE are allowed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Contacts CRUD + one-primary invariant + own-book scope test** - `bbb506f` (feat)
2. **Task 2: Relationship-log append + read route** - `4c0cd9c` (feat)

**Deferred-items documentation:** `a9704b7` (docs)

## Files Created/Modified
- `lib/client-partners/contacts.ts` - Contact + relationship-log service-role helpers, allowlist, zod schemas, own-book predicate
- `lib/client-partners/contacts.test.ts` - Unit tests for the one-primary invariant, allowlist, and scope predicate
- `app/api/admin/client-partners/[orgId]/contacts/route.ts` - Contacts CRUD route
- `app/api/admin/client-partners/[orgId]/relationship-log/route.ts` - Relationship-log read/append route

## Decisions Made
- `setPrimaryContact()` clears-then-sets as two sequential writes rather than a single RPC (none exists yet); migration 112's partial unique index is the DB-layer backstop against a mid-sequence crash.
- `appendRelationshipLog`/`listRelationshipLog` were added to `contacts.ts` itself (the plan's "or a sibling relationship-log.ts" option was not taken) to match the plan frontmatter's `files_modified` list exactly.
- PATCH/DELETE on the contacts route address the target row via an `id` field in the JSON body rather than a second dynamic segment, since `[orgId]` already owns the route — mirrors the plan's literal route path. Every write re-reads the target contact's `buyer_org_id` first so a contact id from a different org can never be mutated through this route.

## Deviations from Plan

None — plan executed exactly as written. One out-of-scope discovery was logged (not fixed) per the Scope Boundary rule:

### Deferred (not fixed — out of scope)

**1. `npm run build` fails on pre-existing, unrelated Phase 32 files**
- **Found during:** Task 1 acceptance-criteria verification (`npm run build`)
- **Issue:** Next.js 15's typed-route validation rejects `app/api/cron/daily-observability-check/route.ts` (`DOC_PATH` export) and `app/api/health/route.ts` (`SUPABASE_CHECK_TIMEOUT_MS` export) during `next build`'s type-check pass. `npx tsc --noEmit` stays clean (this is Next's own route-shape validation, not TypeScript).
- **Evidence it's pre-existing:** both files came from already-merged Phase 32 commits (`68f0258`, `32d2d6a`), present in this worktree's base commit before Plan 31-06 started; `git status --short` at time of discovery showed only this plan's own new paths as untracked.
- **Action:** Logged to `.planning/phases/31-ae-client-workspace-selects-my-client-partners-client-partne/deferred-items.md`. Not fixed — those files belong to Phase 32, outside this plan's scope. Plan 31-06's own acceptance criteria (`npx jest lib/client-partners/contacts.test.ts` and `npx tsc --noEmit`) are both green.

---

**Total deviations:** 0 auto-fixed; 1 out-of-scope issue logged and deferred.
**Impact on plan:** None on this plan's own deliverables — both are code-complete, type-clean, and unit-tested per their acceptance criteria. `npm run build`'s failure is a pre-existing, unrelated blocker the orchestrator/owner should track separately (likely a Phase 32 fix: rename the offending consts or move them out of the `route.ts` files).

## Issues Encountered
None beyond the deferred item above.

## User Setup Required
None - no external service configuration required. (Migration 112 itself is human-gated per project convention — already covered by Plan 31-02's checkpoint, not this plan.)

## Next Phase Readiness
- The contacts + relationship-log API surface is ready for the My Client Partners workspace UI (Contacts + Notes jobs, R1) to read/write through.
- `appendRelationshipLog` and the `client_relationship_log` table's `kind` CHECK constraint already support `status_change`/`assignment` — Slice 2 (31.1) can append those kinds without a schema change; this plan's route intentionally only opens the write path for `note`/`conversation`.
- No blockers. Migration 112 must still be pushed live by the owner (tracked at Plan 31-02) before these routes are reachable against a real database.

---
*Phase: 31-ae-client-workspace-selects-my-client-partners-client-partne*
*Completed: 2026-08-15*

## Self-Check: PASSED

- FOUND: lib/client-partners/contacts.ts
- FOUND: app/api/admin/client-partners/[orgId]/contacts/route.ts
- FOUND: app/api/admin/client-partners/[orgId]/relationship-log/route.ts
- FOUND: .planning/phases/31-ae-client-workspace-selects-my-client-partners-client-partne/31-06-SUMMARY.md
- FOUND commit bbb506f (Task 1)
- FOUND commit 4c0cd9c (Task 2)
- FOUND commit a9704b7 (deferred-items docs)
- FOUND commit c7a0f31 (SUMMARY docs)
