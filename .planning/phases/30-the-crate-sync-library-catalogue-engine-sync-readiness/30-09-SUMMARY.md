---
phase: 30-the-crate-sync-library-catalogue-engine-sync-readiness
plan: 09
subsystem: admin
tags: [next.js, react, typescript, sync-library, staff-access, fncon]
status: complete

# Dependency graph
requires:
  - phase: 30-05
    provides: GET /api/sync-library/worklist + lib/sync-library/worklist.ts (buildWorklist/shapeWorklistRow) — the pure shaper this plan's page assembly and component both consume
  - phase: 30-04
    provides: leadership-only admit/reject route with the evaluateInclusionGate() 409 needs-completion response, and the leadership-only quality-review route (quality_ok/quality_note/staff_notes)
provides:
  - "components/admin/SyncReadinessWorklist.tsx — staff-facing worklist rendering every incomplete track's exact missing[] items, with leadership-only quality/notes controls"
  - "Sync Readiness section on /admin/sync-library, assembled server-side via buildWorklist() over the page's existing batched loads"
  - "Leadership-gated Admit/Reject in SyncLibraryAdmin.tsx + inline 409 needs-completion handling"
affects: [31 (AE workspace / Selects) — the AE browse-only pattern here (worklist + queue, no curation writes) is the precedent for the AE workspace's read surfaces]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-side worklist assembly reusing buildWorklist() directly in the page (no client round-trip to the GET route) — avoids drift by sharing the exact same pure shaper as 30-05's route"
    - "Leadership-only UI gating as defense-in-depth, never the security boundary — mirrors the existing Remove-action pattern (isLeadership && ...) applied identically to Admit/Reject"
    - "409-as-not-yet-eligible, not error: the admit route's needs-completion response is branched separately from res.ok, surfaced inline per-row, row state left unchanged"

key-files:
  created:
    - components/admin/SyncReadinessWorklist.tsx
  modified:
    - app/(admin)/admin/sync-library/page.tsx
    - components/admin/SyncLibraryAdmin.tsx

key-decisions:
  - "Worklist section renders server-assembled via buildWorklist() directly in the page rather than a client fetch to GET /api/sync-library/worklist — the page already batch-loads listings/tracks/projects/artists, so widening those loads minimally (quality_ok/staff_notes, isrc/iswc/metadata, project type, one new vault_documents query) and calling the same pure shaper avoids a redundant round-trip while guaranteeing the two surfaces (route + page) can never compute different missing[] for the same track."
  - "Quality review UI is Pass/Fail buttons + an optional note, POSTing quality_ok (+ quality_note when provided) to the quality route immediately on click — no separate 'save' step for the pass/fail verdict itself, matching the low-friction 'the team guides the artist' framing from CONTEXT.md. Staff guidance notes (staff_notes) get their own textarea + explicit Save button since that field is free-form prose, not a binary decision."
  - "The optional 'compact gate-signal indicator per pending_admit row' mentioned in the plan's action text was NOT added — SyncLibraryQueueRow (the curation queue's row shape) does not carry quality_ok/rights/metadata fields, and the plan explicitly gated this on 'if the data is available on the row.' The 409 needs-completion message itself already tells leadership why a specific admit attempt was blocked, so no data plumbing was added to surface a pre-emptive signal."
  - "A non-leadership viewer of a pending_admit row now sees an explicit 'Awaiting a leadership admit/reject decision' note instead of an empty gap where the buttons used to be — not required by the acceptance criteria, but keeps the AE's read-only queue view legible."

patterns-established:
  - "Sync Readiness section lives directly under the existing curation queue on the same /admin/sync-library page (not a separate tab/route) — 'e.g. a section' per the plan's own wording; both share the same isLeadership boolean resolved once at the top of the page."

requirements-completed: [CRATE-03, CRATE-05]

coverage:
  - id: D1
    description: "SyncReadinessWorklist renders every worklist row's exact missing[] items as chips, sourced entirely from the passed rows — no client-side readiness recompute"
    requirement: "CRATE-03"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (component compiles against WorklistRow's real shape from lib/sync-library/worklist.ts)"
        status: pass
      - kind: unit
        ref: "npx jest lib/sync-library app/api/sync-library — 153 tests, all pre-existing suites still green (buildWorklist/shapeWorklistRow untouched by this plan)"
        status: pass
      - kind: manual_procedural
        ref: "grep confirms the component only ever reads row.missing/row.qualityOk/row.staffNotes from props — no readiness/gate function is imported or called client-side"
        status: pass
    human_judgment: false
  - id: D2
    description: "Quality-review + staff-notes controls render only for isLeadership; an AE sees the same worklist rows read-only"
    requirement: "CRATE-03"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: manual_procedural
        ref: "grep 'isLeadership' components/admin/SyncReadinessWorklist.tsx confirms the quality/notes block is gated on isLeadership ? ... : (staffNotes-only read-only branch); no logged-in staff session was reachable in this sandbox to click-test the POST round-trip"
        status: pending
    human_judgment: true
    rationale: "No staff session (leadership or AE) is reachable in this sandbox — confirmed by the unauth curl smoke test (307 to /signin). A human with a real leadership session must confirm the Pass/Fail buttons and staff-notes Save actually persist against a live sync_listings row (re-read after POST), and that an AE session renders the same rows with zero interactive controls."
  - id: D3
    description: "Admit/Reject controls in SyncLibraryAdmin render only for isLeadership, mirroring the existing Remove guard; AE sees a plain awaiting-decision note"
    requirement: "CRATE-05"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: automated
        ref: "grep 'isLeadership' components/admin/SyncLibraryAdmin.tsx — confirms `row.status === 'pending_admit' && isLeadership &&` on the Admit/Reject block, matching the pre-existing `row.status === 'admitted' && isLeadership &&` Remove pattern exactly"
        status: pass
      - kind: manual_procedural
        ref: "No staff session reachable in this sandbox to visually confirm leadership-vs-AE control visibility on a real pending_admit row"
        status: pending
    human_judgment: true
    rationale: "Same sandbox constraint as D2 — needs a human with both a leadership and an AE session to visually confirm."
  - id: D4
    description: "The admit route's 409 needs-completion response is surfaced inline on the row (not the generic error banner) and leaves the row's status untouched"
    requirement: "CRATE-05"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
      - kind: automated
        ref: "npx jest app/api/sync-library/admin — the admit route's own 409 test coverage (lib/sync-library/gate.test.ts, route.test.ts) still passes unmodified; this plan only changed the client that consumes the response, not the route itself"
        status: pass
      - kind: manual_procedural
        ref: "No live sync_listings row in a gate-failing state was reachable in this sandbox to trigger a real 409 end-to-end"
        status: pending
    human_judgment: true
    rationale: "Requires a human with a leadership session and a pending_admit track that fails the inclusion gate (e.g. quality_ok not yet set to true) to click Admit and confirm the inline amber message appears and the row stays pending_admit."

metrics:
  duration: "~40 minutes"
  completed: "2026-08-13"
---

# Phase 30 Plan 09: Sync Library Backstage UI — Worklist + Leadership-Only Curation Summary

Built the Sync Library backstage UI: a Sync Readiness worklist showing every incomplete track with exactly what's missing (chips) plus inline leadership-only quality-review and guidance-notes controls, and tightened the existing curation queue so Admit/Reject render only for leadership — with the admit route's new 409 "needs completion" response surfaced as a clear inline message instead of a generic error.

## What was built

**Task 1 — `components/admin/SyncReadinessWorklist.tsx` (new).** A client component that renders `WorklistRow[]` (the exact shape `GET /api/sync-library/worklist` and the page's server-side `buildWorklist()` both produce) in the dark `.fncon` Team Console theme. Each row shows song/project/artist, applied age, an open-status label, a quality badge (pass/fail/not-reviewed), and the row's `missing[]` items as amber chips — or a green "Checklist complete" chip when nothing is missing. For `isLeadership`, an inline quality-review block (Pass/Fail buttons + optional note, POSTing immediately to the leadership-only `/api/sync-library/admin/[listingId]/quality` route) and a guidance staff-notes textarea + Save button render below the chips. For any other staff role, the same rows render read-only, with the current staff note (if any) shown as plain text.

**Task 2 — `app/(admin)/admin/sync-library/page.tsx` (extended).** Widened the page's existing batched loads (`sync_listings` gained `quality_ok`/`staff_notes`; `tracks` gained `isrc`/`iswc`/`metadata`; `vault_projects` gained `type`) and added one new batched `vault_documents` query, then assembled the Sync Readiness worklist server-side by calling the same `buildWorklist()` shaper the 30-05 route uses — avoiding a client round-trip while guaranteeing the queue and worklist can never disagree about what's missing for a track. A new "Sync Readiness" section renders `SyncReadinessWorklist` beneath the existing curation queue, with `isLeadership` passed through to both. The existing queue's rendering and behavior are unchanged.

**Task 3 — `components/admin/SyncLibraryAdmin.tsx` (extended).** Wrapped the Admit/Reject block in `isLeadership &&`, mirroring the existing Remove-action guard exactly; a non-leadership viewer of a `pending_admit` row now sees "Awaiting a leadership admit/reject decision" instead of a control-less gap. Added a `needsCompletionByListing` state keyed by listing id: `handleDecision` now branches on `res.status === 409` for the `admit` path *before* falling through to the generic error handler, extracts the route's own message, and renders it inline on the row (amber text, pointing at the Sync Readiness worklist below) without touching the row's status — matching CONTEXT.md's "incomplete ≠ rejected." The file's header comment was expanded to state explicitly that hiding these controls is a UX mirror, not the security boundary — both the admit/reject and quality routes independently enforce `requireStaff(['leadership'])` regardless of what renders client-side.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs or blocking issues were hit; all three tasks matched the plan's scope directly against the already-shipped 30-04/30-05 contracts.

### Scope notes (not deviations, documented per plan's own "optionally")

- The plan's Task 3 action text mentions an *optional* "compact gate-signal indicator per pending_admit row... if the data is available on the row." `SyncLibraryQueueRow` does not carry `quality_ok`/rights/metadata fields, so this was not added — the 409 needs-completion message already communicates why a specific admit attempt was blocked, and adding new data plumbing to the queue row was outside this plan's stated `files_modified`.

## Known Stubs

None. All rendered data flows from real props passed by the page (worklist rows from `buildWorklist()`, queue rows from the existing listings query) — no hardcoded/placeholder values.

## Threat Flags

None. This plan only extends UI surfaces the threat model (T-30-01, T-30-05, T-30-06) already covers — no new network endpoints, auth paths, or schema access were introduced; the worklist page reuses the existing `getStaffRole`/`requireStaff` gates, and all writes route through the already-leadership-gated 30-04 routes.

## Verification

- `npx tsc --noEmit` — clean after every task (confirmed 4 times: baseline, and after each of the 3 tasks).
- `npx jest lib/sync-library app/api/sync-library` — 153 tests, all pre-existing suites green, unmodified by this plan.
- `npx jest` (full suite) — **2141 tests, 179 suites, all green** — matches the pre-plan baseline exactly (no regressions).
- `curl http://localhost:3000/admin/sync-library` (no auth cookie) — `307` redirect to `/signin?next=%2Fadmin%2Fsync-library`, confirming the page's `requireStaff`-equivalent (`getStaffRole` + redirect) gate is intact and unbroken by these changes.
- `grep 'isLeadership' components/admin/SyncLibraryAdmin.tsx` — confirms `row.status === 'pending_admit' && isLeadership &&` gates Admit/Reject, matching the pre-existing `row.status === 'admitted' && isLeadership &&` Remove pattern exactly.
- `grep 'fnbl\|bg-ink\|text-lav'` across both touched/created components — matches found only inside prohibition comments, never in an actual class name.

## What needs a human staff-session pass

No logged-in staff session (leadership or AE) was reachable in this sandbox — confirmed by the unauth redirect above; there is no way to exercise a real cookie-authenticated session here. A human with real `leadership` and `ae` staff accounts should:

1. Visit `/admin/sync-library` as **leadership**: confirm the Sync Readiness worklist section renders below the curation queue with accurate missing-item chips per incomplete track; click Pass/Fail on a row's quality review and confirm it persists (re-read on refresh); save a guidance note and confirm it persists; confirm Admit/Reject render on `pending_admit` queue rows.
2. Visit the same page as **AE**: confirm the worklist renders read-only (no Pass/Fail buttons, no notes textarea — any existing staff note shows as plain text), and confirm Admit/Reject are absent from the queue (replaced by "Awaiting a leadership admit/reject decision").
3. As leadership, attempt to Admit a `pending_admit` track whose inclusion gate isn't clear yet (e.g. `quality_ok` not yet `true`, or an incomplete Sync Readiness checklist) and confirm the inline amber "needs completion" message appears on that row, pointing at the worklist, and the row stays `pending_admit` (not silently rejected or stuck in a bad state).
4. Confirm, via a direct API call (e.g. curl with an AE session cookie) that `POST /api/sync-library/admin/[listingId]` and the `/quality` route both still return `403` for an AE — the UI hiding is cosmetic, the route is authoritative (already covered by existing route-level Jest tests, but a live confirmation closes the loop).

## Self-Check: PASSED

- FOUND: `/Users/peterzora/Desktop/funun/components/admin/SyncReadinessWorklist.tsx`
- FOUND: `/Users/peterzora/Desktop/funun/app/(admin)/admin/sync-library/page.tsx` (modified)
- FOUND: `/Users/peterzora/Desktop/funun/components/admin/SyncLibraryAdmin.tsx` (modified)
- FOUND commit `e00dec9` (Task 1)
- FOUND commit `35c632e` (Task 2)
- FOUND commit `aecfd29` (Task 3)
