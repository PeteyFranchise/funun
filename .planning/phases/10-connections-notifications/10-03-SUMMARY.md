---
phase: 10-connections-notifications
plan: 03
subsystem: api
tags: [nextjs, api-routes, supabase, rls, connections, notifications, typescript]

# Dependency graph
requires:
  - phase: 10-connections-notifications
    provides: "buildConnectRequest/buildRespondTransition (lib/social/connections.ts), buildConnectionRequestNotification/buildConnectionAcceptedNotification/buildMarkAllReadFilter (lib/social/notifications.ts), createNotification() actor-snapshot extension (Plan 01)"
  - phase: 10-connections-notifications
    provides: "migration 044 auto-follow-seed trigger + connections.note column + no_block() wiring (Plan 02, LIVE on remote)"
provides:
  - "POST /api/connections — create a connect request (session-client INSERT, best-effort connection_request notification)"
  - "PATCH /api/connections — accept/decline/withdraw via session-client status transition (RLS two-policy split); single connection_accepted notification on accept only"
  - "GET /api/notifications — cursor-paginated list + fresh unread head-count"
  - "PATCH /api/notifications — scoped mark-all-read (user_id = caller AND read = false)"
affects: [10-04-notification-trigger-wiring, 10-05-notification-bell-panel, 10-06-connect-button]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thin API-route adapter over Plan-01 pure builders: route parses/authenticates, builder shapes the payload/transition, route persists — no note-validation or action->status logic re-implemented in the route"
    - "Session-client for the owned mutation + service-client (try/catch, non-fatal) for the cross-user notification insert (RESEARCH Pattern 1, mirrors opportunities/apply route)"

key-files:
  created:
    - app/api/connections/route.ts
    - app/api/notifications/route.ts
  modified: []

key-decisions:
  - "PATCH /api/connections returns 404 (not 403) on a zero-row UPDATE: RLS filters out unauthorized/non-pending transitions, so the route cannot distinguish 'not yours' from 'not found' without a second query — a single .select().maybeSingle() after the UPDATE keeps it one round-trip and leaks no existence info"
  - "loadActor() reads the caller's OWN artist_profiles row (keyed by auth.uid()) for the notification actor snapshot — never trusts client-supplied actor identity (T-10-07); falls back to name 'Member' and empty handle when the profile row is absent"
  - "Notification inserts are best-effort in try/catch: a failed notify never fails the connect request/accept (the DB state — including the trigger-seeded follows on accept — is already committed)"

requirements-completed: [CONNECT-02, NOTIF-02, NOTIF-03]

coverage:
  - id: D1
    description: "POST /api/connections creates a request via the session client (RLS connections_insert_own + no_block gate) and fires a best-effort connection_request notification to the addressee"
    requirement: "CONNECT-02"
    verification:
      - kind: manual
        ref: "Live-DB / RLS dependent — deferred to /gsd-verify-work (VALIDATION.md): request appears for addressee, note persists, self/blocked requests rejected"
        status: deferred
    human_judgment: true
  - id: D2
    description: "PATCH /api/connections drives accept/decline/withdraw through the SESSION client only; RLS's two-policy split (migration 035) enforces addressee-accepts / requester-withdraws — a requester cannot self-accept (T-10-06)"
    requirement: "CONNECT-02"
    verification:
      - kind: static
        ref: "grep: createServiceClient used only for the notification insert, never the status UPDATE; no follows INSERT in the route (trigger owns the auto-follow seed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Accepting a request fires exactly one connection_accepted notification to the original requester; decline/withdraw fire none"
    requirement: "NOTIF-02"
    verification:
      - kind: static
        ref: "buildConnectionAcceptedNotification is called only inside the `if (target === 'accepted')` branch, recipient = updated.requester_id (server-derived)"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/notifications returns the caller's recent notifications (created_at-cursor paginated, limit 20) plus a fresh COUNT of unread"
    requirement: "NOTIF-03"
    verification:
      - kind: static
        ref: "grep: `{ count: 'exact', head: true }` head-count + `.lt('created_at', before)` cursor + `.limit(20)`; no .range()/offset"
        status: pass
    human_judgment: false
  - id: D5
    description: "PATCH /api/notifications marks only the caller's own unread rows read (user_id = caller AND read = false)"
    requirement: "NOTIF-03"
    verification:
      - kind: static
        ref: "UPDATE scoped via buildMarkAllReadFilter(user.id) -> .eq('user_id', ...).eq('read', false); backstopped by notifications RLS USING auth.uid() = user_id"
        status: pass
    human_judgment: false

metrics:
  duration: 2min
  completed: 2026-07-13
  tasks: 2
  files_created: 2
  files_modified: 0

status: complete
---

# Phase 10 Plan 03: Connections & Notifications API Routes Summary

**Two thin API-route adapters over the Plan-01 pure builders — `app/api/connections/route.ts` (POST create-request, PATCH accept/decline/withdraw with the session/service-client RLS split and single-notification-on-accept) and `app/api/notifications/route.ts` (GET cursor-paginated list + fresh unread head-count, PATCH scoped mark-all-read).**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-07-13T02:17:54Z
- **Completed:** 2026-07-13T02:20:07Z
- **Tasks:** 2
- **Files modified:** 2 (2 created, 0 modified)

## Accomplishments
- Shipped `app/api/connections/route.ts`:
  - **POST** create-request — DEMO short-circuit, session-client INSERT (RLS `connections_insert_own` + `no_block()` gate), note trimmed/validated by `buildConnectRequest()` (400 on 200+ chars or self-target), best-effort `connection_request` notification to the addressee via the service client.
  - **PATCH** respond — `buildRespondTransition()` maps `accept|decline|withdraw` → status (400 on unknown action); the status UPDATE uses the **session client only** so RLS's two-policy split (migration 035) enforces who may accept vs. withdraw; zero-row → 404. No `follows` INSERT (the migration-044 trigger owns the auto-follow seed). Exactly one `connection_accepted` notification on accept, to `requester_id` (server-derived); none on decline/withdraw.
- Shipped `app/api/notifications/route.ts`:
  - **GET** — session-client SELECT scoped to `user_id`, `created_at`-cursor pagination (`before` → `.lt('created_at', …)`, limit 20, no offset), plus a **fresh** unread head-count (`{ count: 'exact', head: true }`) recomputed every call.
  - **PATCH** mark-all-read — scoped to `user_id = caller AND read = false` via `buildMarkAllReadFilter()`, RLS backstop.
- `npx tsc --noEmit` clean across the repo; `npm test` green (80/80, Plan-01 builder tests including `buildMarkAllReadFilter` still pass).

## Task Commits

Each task was committed atomically:

1. **Task 1: connections route — POST request, PATCH accept/decline/withdraw** — `d18b171` (feat)
2. **Task 2: notifications route — GET list + unread count, PATCH mark-all-read** — `bbac74f` (feat)

## Files Created/Modified
- `app/api/connections/route.ts` — POST create-request + PATCH accept/decline/withdraw; session/service-client split; single-notification-on-accept; `loadActor()` reads the caller's own `artist_profiles` snapshot.
- `app/api/notifications/route.ts` — GET cursor-paginated list + fresh unread head-count; PATCH scoped mark-all-read.

## Decisions Made
- **404 (not 403) on a zero-row connect UPDATE** — RLS filters unauthorized/non-pending transitions, so the route keeps a single `.select().maybeSingle()` round-trip and leaks no existence info rather than issuing a second ownership query to differentiate.
- **Actor snapshot from the caller's own row only** — `loadActor()` keys on `auth.uid()`; client-supplied actor identity is never trusted (T-10-07). Fallbacks: name `'Member'`, empty handle when the profile row is absent.
- **Best-effort notifications** — every notification insert is in a `try/catch`; a notify failure never fails the connect request/accept, whose DB state (including the trigger-seeded follows) is already committed.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Compliance
- **T-10-06** (requester self-accept) — mitigated: status UPDATE uses the session client only; RLS two-policy split enforces the transition. Service-role is used ONLY for the cross-user notification insert.
- **T-10-07** (forged actor/recipient) — mitigated: recipient derived from the connection row server-side; actor snapshot read from the caller's own `auth.uid()`-keyed profile.
- **T-10-08** (reading another user's notifications) — mitigated: every GET query scoped to `user_id = user.id`, backstopped by notifications RLS.
- **T-10-09** (offset skip/duplicate) — mitigated: `created_at`-cursor pagination, no offset.

No new threat surface introduced beyond the plan's registered threat model.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- These routes are the server contract Plan 04 (trigger wiring) and Plans 05/06 (bell panel + connect button UI) call. `POST`/`PATCH /api/connections` and `GET`/`PATCH /api/notifications` are live with the documented request/response shapes (`{ data }` / `{ error, status }`).
- Live-DB/RLS behavioral checks (unread-badge accuracy, exactly-one accept notification, mark-all-read scoping, self/blocked-request rejection) are RLS-dependent and deferred to `/gsd-verify-work` per VALIDATION.md.

## Self-Check: PASSED

Both route files confirmed present on disk. Both task commit hashes (`d18b171`, `bbac74f`) confirmed in `git log`. `npx tsc --noEmit` clean; `npm test` 80/80 green.

---
*Phase: 10-connections-notifications*
*Completed: 2026-07-13*
