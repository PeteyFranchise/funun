---
phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
plan: 09
subsystem: ui
tags: [nextjs, react, supabase, admin-console, crm]

requires:
  - phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
    provides: "31-06 contacts + relationship-log routes (lib/client-partners/contacts.ts); 31-04 Selects CRUD (GET /api/admin/selects, lib/selects/persistence.ts)"
provides:
  - "ClientWorkspace — the four-job company/person workspace shell (Contacts · Activity · Curation/Selects · Notes+status)"
  - "ContactsPanel + PersonContactPanel — the D-08/D-09 CRM-lite contacts UI"
  - "Rebuilt company workspace page (app/(admin)/admin/client-partners/[orgId]/page.tsx)"
  - "New person workspace page (app/(admin)/admin/clients/[personId]/page.tsx)"
affects: ["31-08 (My Client Partners list — drills into these workspace routes)", "31-10 (Selects builder — Build Selects CTA hands off to /admin/selects/[id])", "31.1 (Game Plan panel mounts into the marked person-view slot)"]

tech-stack:
  added: []
  patterns:
    - "Secondary underline-tab row (text tabs + --indigo underline indicator) for in-workspace job switching, distinct from the primary pill-tab switcher"
    - "Own-book scope gate (notFound()-not-403) applied identically on both the company and person workspace pages, mirroring the shipped [orgId] pattern"
    - "Person = a buyer_org_contacts row; the person page is not a separate table/entity, just ClientWorkspace mode=\"person\" scoped to one contact id — the adjacency edge (R1) falls out of reusing the same record"

key-files:
  created:
    - components/admin/ClientWorkspace.tsx
    - components/admin/ContactsPanel.tsx
    - app/(admin)/admin/clients/[personId]/page.tsx
  modified:
    - app/(admin)/admin/client-partners/[orgId]/page.tsx

key-decisions:
  - "Deleted components/admin/ClientPartnerDetail.tsx (superseded by ClientWorkspace, plan explicitly calls this a replacement, and the component became fully unreferenced after the rebuild)"
  - "Address and custom_fields (both free-form jsonb) rendered as a single-line address input and a repeatable key/value list rather than a generic JSON editor — keeps the D-09 rich record usable without over-building a schema-less editor"
  - "Curation/Selects tab's Build Selects CTA creates the Selects via POST /api/admin/selects then navigates to /admin/selects/{id} — anticipates 31-10's builder detail route (parallel plan in this wave)"
  - "Person-mode relationship-log entries are scoped to the person's contact_id on append and on the initial read (listRelationshipLog(..., { contactId })); company-mode reads/writes the full org log"

requirements-completed: [R1, R5, D-05, D-08, D-09]

coverage:
  - id: D1
    description: "ContactsPanel lists multiple contacts with the primary flagged, and set-primary re-renders exactly one primary"
    requirement: "D-08"
    verification:
      - kind: manual_procedural
        ref: "Open a company workspace's Contacts tab, click 'Set primary' on a non-primary contact, confirm exactly one Primary chip renders after"
        status: unknown
    human_judgment: true
    rationale: "No test harness exists for this admin UI; requires a live Supabase-backed session to exercise the 31-06 route end-to-end"
  - id: D2
    description: "The rich D-09 contact fields (title/email/phone/linkedin/timezone/tags/address/notes/custom_fields) render and save through the 31-06 route"
    requirement: "D-09"
    verification:
      - kind: manual_procedural
        ref: "Edit a contact's full field set, save, reload the page, confirm all fields persisted"
        status: unknown
    human_judgment: true
    rationale: "Requires a live DB round-trip through the requireStaff()-gated route; not covered by an automated test in this plan"
  - id: D3
    description: "Both /admin/client-partners/[orgId] and /admin/clients/[personId] return notFound() (not 403) for a non-leadership AE not assigned to the org; leadership opens any"
    requirement: "R5"
    verification:
      - kind: manual_procedural
        ref: "Sign in as a non-leadership AE, hit an uncovered org's workspace URL and an uncovered person's URL directly, confirm 404"
        status: unknown
    human_judgment: true
    rationale: "Auth-scoped page behavior requires a real session per role; no test harness renders these server components with mocked auth in this repo"
  - id: D4
    description: "A person appearing under a company's Contacts tab and in the Clients tab opens the same contact record (one record, two entry points)"
    requirement: "R1"
    verification:
      - kind: manual_procedural
        ref: "Open a contact from the company workspace's Contacts tab (note its id), then visit /admin/clients/{that id} directly and confirm identical data"
        status: unknown
    human_judgment: true
    rationale: "Structural/architectural claim (single buyer_org_contacts row, two routes) — verified by inspection of the two page.tsx files' shared data source, not a runnable assertion"
  - id: D5
    description: "npx tsc --noEmit is clean; npm run build succeeds except the pre-existing, out-of-scope Phase 32 route-type failures"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (exit 0, no output); npm run build (fails only on app/api/cron/daily-observability-check/route.ts, documented pre-existing)"
        status: pass
    human_judgment: false

duration: ~55min
completed: 2026-08-16
status: complete
---

# Phase 31 Plan 09: Client Workspace — Four Jobs + Rich Contacts CRM Summary

**Four-job AE client workspace (Contacts · Activity · Curation/Selects · Notes+status) built as a shared ClientWorkspace shell, driving both the rebuilt company page and a new person page that resolve to the same one-record contact via the R1 adjacency edge.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-08-16T03:17:36Z
- **Tasks:** 3
- **Files modified:** 5 (3 created, 1 rebuilt, 1 deleted)

## Accomplishments
- `ContactsPanel` — multi-contact CRM list with the primary visibly flagged, a rich D-09 record (title/email/phone/linkedin/timezone/tags/address/notes/custom_fields) editable via the 31-06 route, add/edit/set-primary, and one-tap email/call on the primary
- `PersonContactPanel` — the same rich record, person-scoped (single record, no list/add/set-primary), reused by the person workspace
- `ClientWorkspace` — the four-job shell (Contacts/Activity/Curation·Selects/Notes+status) as a secondary underline-tab row, company website slot, empty-Curation "Build Selects" CTA, and a marked-but-empty 31.1 Game Plan mount slot (person view)
- Rebuilt `app/(admin)/admin/client-partners/[orgId]/page.tsx` to server-fetch org + contacts + Selects + relationship log + Activity (briefs/license requests) and render `ClientWorkspace mode="company"`, replacing the old member-list `ClientPartnerDetail`
- New `app/(admin)/admin/clients/[personId]/page.tsx`: resolves the person (a `buyer_org_contacts` row) to its org, applies the identical own-book `notFound()` gate, and renders `ClientWorkspace mode="person"` — the person and the same contact reached from the company's Contacts tab are the same record (R1 adjacency edge)

## Task Commits

Each task was committed atomically:

1. **Task 1: ContactsPanel — multi-contact list + rich record + set-primary** - `a371a42` (feat)
2. **Task 2: ClientWorkspace shell — four jobs + relationship log + Selects list** - `2d85640` (feat)
3. **Task 3: Rebuild company page + new person page (own-book, one-record adjacency)** - `ab62252` (feat)

_Note: Task 3's commit also includes the `ClientWorkspace.tsx` contact_id-scoping wire-up needed for the person page's Notes job, and the deletion of the now-superseded `ClientPartnerDetail.tsx`._

## Files Created/Modified
- `components/admin/ContactsPanel.tsx` - Multi-contact CRM list + rich D-09 record form + `PersonContactPanel` person-scoped variant
- `components/admin/ClientWorkspace.tsx` - Four-job workspace shell (Contacts/Activity/Curation/Notes), company + person modes
- `app/(admin)/admin/client-partners/[orgId]/page.tsx` - Rebuilt: server-fetches org/contacts/Selects/log/Activity, renders `ClientWorkspace mode="company"`, own-book gated
- `app/(admin)/admin/clients/[personId]/page.tsx` - New: resolves person → org, own-book gated, renders `ClientWorkspace mode="person"`
- `components/admin/ClientPartnerDetail.tsx` - Deleted (superseded by ClientWorkspace; became fully unreferenced after the rebuild)

## Decisions Made
- Deleted `ClientPartnerDetail.tsx` rather than leaving it as dead code — the plan explicitly frames the company page rebuild as "replaces ClientPartnerDetail," and after the rebuild nothing imports it.
- Rendered `address`/`custom_fields` (both free-form `jsonb`) as a single-line address field and a repeatable key/value list rather than a generic JSON textarea — keeps the D-09 "rich record" usable without building a schema-less JSON editor out of scope for this plan.
- Build Selects CTA (Curation/Selects tab) posts to `/api/admin/selects` then navigates to `/admin/selects/{id}` — this anticipates 31-10's builder detail route, which is a parallel plan in this same wave and not yet merged at execution time; the route will exist once the wave integrates.
- Person-mode relationship-log reads/writes are scoped to the person's `contact_id` (via `listRelationshipLog(..., { contactId })` and `POST { contact_id }`), while company-mode reads/writes the full org-level log — the plan's Notes+status description covers both without specifying this split, so it follows the same "person view is scoped" principle applied to Contacts.

## Deviations from Plan

None - plan executed exactly as written. (Auth/scope logic was ported verbatim from the shipped `[orgId]` page's own-book pattern per the plan's read_first instructions; no bugs or missing-critical-functionality gaps were found that required a Rule 1/2/3 fix beyond what's captured in Decisions Made above.)

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `ClientWorkspace` is ready for 31-08's My Client Partners list to drill into (`/admin/client-partners/[orgId]` and `/admin/clients/[personId]` both exist and are own-book gated).
- The Curation/Selects tab's Build Selects CTA is wired to the route 31-10 will populate (`/admin/selects/[id]`) — no further wiring needed once 31-10 merges.
- The person view's Game Plan mount slot is marked (`data-slot="game-plan-31-1"`) but intentionally empty — ready for 31.1 to fill in.
- No blockers.

---
*Phase: 31-ae-client-workspace-selects-my-client-partners-client-partne*
*Completed: 2026-08-16*

## Self-Check: PASSED

- FOUND: components/admin/ContactsPanel.tsx
- FOUND: components/admin/ClientWorkspace.tsx
- FOUND: app/(admin)/admin/client-partners/[orgId]/page.tsx
- FOUND: app/(admin)/admin/clients/[personId]/page.tsx
- CONFIRMED DELETED: components/admin/ClientPartnerDetail.tsx (intentional, per Decisions Made)
- FOUND commit: a371a42 (Task 1)
- FOUND commit: 2d85640 (Task 2)
- FOUND commit: ab62252 (Task 3)
