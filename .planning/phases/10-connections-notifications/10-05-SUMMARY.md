---
phase: 10-connections-notifications
plan: 05
subsystem: notifications-ui
status: complete
tags: [notifications, realtime, ui, layout, connections]
requires:
  - "10-03: /api/notifications (GET list+count, PATCH mark-all-read), /api/connections (PATCH accept/decline/withdraw)"
  - "10-01: lib/social/notifications.ts (NOTIFICATION_TYPES catalog), types/index.ts Notification type"
provides:
  - "components/nav/NotificationBell.tsx — global Realtime + poll unread badge, mounted app-wide"
  - "components/nav/NotificationPanel.tsx — dropdown list, mark-all-read, inline accept/decline, cursor pagination"
  - "app/(artist)/layout.tsx — net-new sticky authenticated header row hosting the bell"
affects:
  - "Every authenticated (artist) route now renders a header row + notification bell"
tech-stack:
  added: []
  patterns:
    - "Global Supabase Realtime postgres_changes subscription with a stable per-user channel name + always-return removeChannel cleanup (Pitfall 5)"
    - "Unread badge derived exclusively from a fresh COUNT fetch, never client-incremented (T-10-16)"
    - "IntersectionObserver + created_at cursor pagination (before=<iso>), not offset (D-11)"
    - "Copied inline timeAgo() helper (no date-fns) — bespoke design system, hand-rolled SVG icons"
key-files:
  created:
    - components/nav/NotificationBell.tsx
    - components/nav/NotificationPanel.tsx
  modified:
    - app/(artist)/layout.tsx
decisions:
  - "NotificationPanel is imported by NotificationBell but committed in Task 2; both files present on disk for every build/tsc run, so each commit's build passed atomically (sequential-on-main sequencing)"
  - "Resolved connection-request rows use a sentinel type '__resolved__' in local state to swap the row title + drop inline actions in place without a refetch (D-10)"
  - "IntersectionObserver root is the scroll container (sentinel.parentElement) with an 80px rootMargin so older pages prefetch just before the sentinel is visible"
metrics:
  duration: 3min
  tasks_completed: 2
  files_touched: 3
  completed: 2026-07-13
---

# Phase 10 Plan 05: Notification Bell + Panel + Authenticated Header Row Summary

Built the first-ever UI on top of the `notifications` table: a global notification bell with a live, COUNT-derived unread badge mounted once in a net-new sticky authenticated header row, plus a dropdown panel with explicit mark-all-read, inline connection-request Accept/Decline, and created_at-cursor scroll pagination — all on the bespoke Tailwind system with zero new packages.

## What Was Built

### Task 1 — NotificationBell + header row (commit 4d6f7ab)
- `components/nav/NotificationBell.tsx` (`'use client'`, props `{ userId }`).
- **Global** Realtime subscription (D-13 — no open-gate, unlike DmWidget): `.channel(\`notifications-${userId}\`)` on `postgres_changes` INSERT filtered to `user_id=eq.${userId}`; memoized browser client (`useMemo`); always returns `removeChannel` cleanup (Pitfall 5 / T-10-14).
- On any INSERT, the count is **refetched** (`/api/notifications?unread=true`) — never client-incremented (Anti-Patterns guard / T-10-16).
- ~25s reconcile poll fallback with an `alive` unmount guard (mirrors DmWidget).
- Fuchsia numbered pill badge (min 16×16, 2px card ring, 10px/800 tabular-nums white), `9+` cap at ≥10, renders nothing at 0.
- Click toggles the panel; outside-mousedown closes it (ProfileMoreMenu pattern). Opening does **not** clear the badge (D-09).
- `app/(artist)/layout.tsx`: added a `sticky top-0 z-40 … backdrop-blur-[20px]` header row above `{children}`, mounting `<NotificationBell userId={user.id} />` exactly once (Pitfall 4 — net-new surface).

### Task 2 — NotificationPanel (commit e62d69d)
- `components/nav/NotificationPanel.tsx` (`'use client'`): `absolute right-0 top-full mt-2`, 380px, card bg, 1px hair border, the UI-SPEC shadow recipe.
- Header: `Notifications` (16px/800) + `Mark all read` (13px/600 indigo, `opacity-50 cursor-not-allowed` when unread=0).
- Mark-all-read → `PATCH /api/notifications`, clears every local row's unread state, calls `onMarkedAllRead()`.
- Rows: 36px actor-avatar image (when `actor_avatar_url`) else a hand-rolled per-type SVG tile from `NOTIFICATION_TYPES` (gradient-tinted for `connection_request`); title (14px/600 truncate) + optional 2-line-clamp body + `timeAgo()` timestamp; unread rows get `card2` bg + an 8px fuchsia left dot; row click navigates to `notification.link`.
- `connection_request` rows (detected via `NOTIFICATION_TYPES[type].inlineAction === 'connection_respond'`) render compact Accept (gradient) / Decline (ghost) that `PATCH /api/connections` with `{ connectionId: data.connectionId, action }`, `stopPropagation()`, swap the row title in place, and call `onRespondedToRequest()`.
- Cursor pagination: an `IntersectionObserver` sentinel auto-fetches `?before=<oldest created_at>`, de-duplicating by id, stopping when a short page returns; `Loading…` shown during fetch.
- Empty + error states use the exact Copywriting Contract strings, with a `Retry` action on fetch failure.
- Copied inline `timeAgo()` from `Wall.tsx` — no `date-fns` (import lines confirmed clean; the string only appears in two comments).

## Verification

- `npx tsc --noEmit` — clean across the whole tree (no errors in the two components or the layout).
- `npm test` — 80/80 passing, 11 suites.
- `npm run build` — production build succeeded; the artist layout (mounting the bell) renders in the build graph across every authenticated route.
- Greps confirmed: stable per-user channel name, `removeChannel` cleanup, no client-increment, `Mark all read`, `timeAgo`, `before=` cursor, `inlineAction`, no `date-fns`/`lucide-react` imports.

## Threat Model Adherence

- **T-10-14 (channel leakage / TooManyChannels):** stable `notifications-${userId}` channel + always-return `removeChannel` + memoized client. ✔
- **T-10-16 (badge drift):** count set only from a fresh COUNT fetch, never incremented. ✔
- **T-10-15 (XSS):** all titles/bodies render as plain JSX text; no `dangerouslySetInnerHTML`. ✔
- **T-10-SC (installs):** no packages installed; bespoke Tailwind + hand-rolled SVG + copied `timeAgo`. ✔

## Deviations from Plan

None — plan executed exactly as written. (The Task 1 build/tsc depends on NotificationPanel.tsx existing on disk; it was authored before the Task 1 commit and committed under Task 2, so every build/tsc run in this plan saw both files. This is intentional sequential-on-main sequencing, not a deviation.)

## Known Stubs

None. Both components are fully wired to the live `/api/notifications` and `/api/connections` endpoints from Plan 10-03.

## Human Verification (deferred to end-of-phase UAT)

Per this project's `workflow.human_verify_mode = end-of-phase`, Task 3's `checkpoint:human-verify` was NOT halted on mid-flight. The automated portions were completed (production `npm run build` proving compile + layout render in the build graph). The browser-and-Realtime behaviors below are not unit-testable (no E2E runner exists — VALIDATION.md) and are captured verbatim for the phase verifier to harvest into the phase UAT file:

1. Sign in, navigate across several authenticated routes (dashboard, vault, a profile). Confirm the header row + bell render on each, and the browser console shows NO `TooManyChannels` error after navigating (Pitfall 5 — stable channel + cleanup).
2. From a second account, follow / send a connection request / post on your wall. Within ~25s (or instantly via Realtime), confirm the bell badge increments to the correct number (capped `9+` at >=10). Confirm the count matches the actual unread rows.
3. Click the bell — the dropdown opens listing recent notifications; confirm the badge does NOT clear on open (D-09).
4. On a connection-request row, click Accept — confirm the row updates in place (inline buttons gone, title reflects accepted) without closing the panel or navigating, and the requester's Connect button would now read Connected (cross-check with Plan 06 if merged).
5. Click `Mark all read` — confirm the badge clears to nothing and rows lose the unread treatment.
6. Scroll the list to the bottom with >20 notifications seeded — confirm older ones auto-load (Loading… briefly) with no duplicates/skips.

**Resume signal (for UAT):** "approved" or describe what failed (no TooManyChannels? badge accurate? mark-all-read clears? inline accept works? pagination loads?).

## Self-Check: PASSED

- FOUND: components/nav/NotificationBell.tsx
- FOUND: components/nav/NotificationPanel.tsx
- FOUND: app/(artist)/layout.tsx (modified — mounts bell in sticky header)
- FOUND commit 4d6f7ab (Task 1)
- FOUND commit e62d69d (Task 2)
