---
phase: 11-presence-messaging
plan: "05"
subsystem: ui
tags: [react, nextjs, supabase-realtime, dm, tailwind]

# Dependency graph
requires:
  - phase: 11-presence-messaging
    provides: "11-03's POST /api/dm/send (connection gate/rate-limit/stacked-cap), GET /api/dm/threads, POST /api/dm/read/[threadId], POST /api/dm/request/{accept,decline,block}/[threadId]; 11-04's MessagesIcon/PresenceTracker/ArtistLayoutClient (MessagesDockContext) and the presence-global Realtime Presence channel; migration 055's dm_threads participant-scoped UPDATE RLS policy"
provides:
  - "app/(artist)/messages/page.tsx — the primary /messages inbox (server component, initial thread list + viewer verified flag)"
  - "MessagesPageClient — two-pane (lg)/single-pane inbox shell, ?thread=/?with= resolution, read-only presence-global sync, D-17 budget projection"
  - "ThreadList — normal threads + separate Requests section (count chip), people-only search, live via Realtime + refetch, presence/unread dots"
  - "ConversationView — two-pane conversation surface: Realtime + 20s poll + optimistic send, auto-read (D-06), presence header, pop-out to dock"
  - "RequestView — recipient accept/decline/block with inline block confirmation (no modal)"
  - "DockedWidget — the real bottom-right floating widget (exact .pf-dm chrome), replacing Plan 04's inline placeholder"
  - "Composer/MessageBubble/RequestsBudgetHint/RateLimitWall — shared composer primitives reused by ConversationView and DockedWidget"
  - "lib/social/dm.ts: buildThreadViews()/ThreadView/ThreadOtherView (moved from the Plan 03 route, extended with createdAt/lastSeenAt) and computeRequestBudget() (client-shared D-17 projection)"
  - "GET /api/dm/messages now also returns isConnection and otherLastSeenAt"
affects:
  - "11-06-PLAN.md: expected to wire ProfileView.tsx's Message button to /messages?with={userId} and ProfilePresenceDot into the .pf-avatar .live slot; DmWidget.tsx's profile-scoped mount removal is also that plan's responsibility"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server page components query Supabase directly via a shared lib/ function (buildThreadViews) rather than self-fetching their own API route — mirrors app/(artist)/vault/page.tsx"
    - "Client-computed rate-limit/budget projections over an already-fetched list (computeRequestBudget over ThreadView[]) instead of a dedicated 'remaining budget' endpoint"
    - "Read-only Realtime Presence consumption: a second component subscribes to the SAME channel name via the memoized client singleton (no second track()/join side-effects) and only reads presenceState() on 'sync', guarded by an `alive` flag since RealtimeChannel has no public per-listener unbind API"

key-files:
  created:
    - components/messages/Composer.tsx
    - components/messages/ThreadList.tsx
    - components/messages/RequestView.tsx
    - components/messages/ConversationView.tsx
    - components/messages/DockedWidget.tsx
    - components/messages/MessagesPageClient.tsx
    - "app/(artist)/messages/page.tsx"
  modified:
    - lib/social/dm.ts
    - app/api/dm/threads/route.ts
    - app/api/dm/messages/route.ts
    - components/nav/ArtistLayoutClient.tsx

key-decisions:
  - "isConnection (per-target composer state) and otherLastSeenAt (D-22 presence bucket) are derived from GET /api/dm/messages?with= (already called by ConversationView/DockedWidget for the open conversation) rather than a new dedicated connection-check endpoint — the existing route already knows both otherId and viewerId, so a single extra isConnected() call there is cheaper than N calls across a thread list"
  - "D-17's remaining-request budget and next-slot-date are computed CLIENT-SIDE (computeRequestBudget() in lib/social/dm.ts) from the viewer's own already-fetched thread list (status/requesterId/createdAt), mirroring countRecentRequests()'s rolling-7-day window exactly — avoids a dedicated 'remaining budget' endpoint entirely"
  - "DockedWidget resolves its other-party snapshot/status/budget from the FULL GET /api/dm/threads list (filtered client-side to the given threadId) since no single-thread GET route exists and the plan's prop signature is threadId-only; the viewer's verified flag is NOT threaded into DockedWidget (conservative BASELINE-limit default) — see Known Limitations"
  - "buildThreadViews()/ThreadView (previously a route-local, unexported function+type in Plan 03's app/api/dm/threads/route.ts) moved into lib/social/dm.ts so the /messages server page can build the identical initial list without an internal self-fetch round-trip — mirrors the Plan 03 SUMMARY's own precedent for relocating chooseSendPath()"

requirements-completed: [CONNECT-03, CONNECT-04, CONNECT-05, PRESENCE-02, PRESENCE-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Composer renders the D-17 RequestsBudgetHint (non-connection, budget > 0) and replaces itself with RateLimitWall (budget == 0, Connect-request CTA) plus the D-18 stacked-message hint/cap; never dangerouslySetInnerHTML"
    requirement: CONNECT-04
    verification:
      - kind: unit
        ref: "grep -q 'aria-label=\"Send\"' components/messages/Composer.tsx && grep -L 'dangerouslySetInnerHTML' components/messages/Composer.tsx"
        status: pass
      - kind: manual_procedural
        ref: "npx tsc --noEmit — 0 errors"
        status: pass
    human_judgment: true
    rationale: "Visual correctness of the wall/hint copy and CTA against the locked UI-SPEC tokens needs a live render — recommend end-of-phase manual UAT per the plan's own <verification> block"
  - id: D2
    description: "ThreadList renders a separate Requests section (status='pending' && requesterId!=viewerId) with a count chip, honors the UI-SPEC empty states, shows an 8x8 presence dot only when the presence map marks the other user online, and an 8x8 unread dot on hasUnread; subscribes to dm_messages INSERT and refetches via the parent (no client-side counter)"
    requirement: CONNECT-03
    verification:
      - kind: unit
        ref: "grep -q 'Requests' components/messages/ThreadList.tsx"
        status: pass
      - kind: manual_procedural
        ref: "npx tsc --noEmit — 0 errors"
        status: pass
    human_judgment: true
    rationale: "Live Realtime refetch behavior and correct request/normal-list partitioning need a seeded live Supabase session — recommend end-of-phase manual UAT"
  - id: D3
    description: "RequestView POSTs to /api/dm/request/{accept,decline,block}/[threadId], shows read-only bubbles, and Block uses an inline confirmation (no modal/dialog element) per D-12"
    requirement: CONNECT-03
    verification:
      - kind: unit
        ref: "grep -q 'request/accept' components/messages/RequestView.tsx"
        status: pass
      - kind: manual_procedural
        ref: "npx tsc --noEmit — 0 errors"
        status: pass
    human_judgment: true
    rationale: "Full accept/decline/block round-trip against the live migration-055 RLS policy needs a live-backend UAT pass, consistent with 11-03-SUMMARY.md's own flagged human-judgment items for these same routes"
  - id: D4
    description: "ConversationView fires POST /api/dm/read/{threadId} on open (D-06, best-effort no-await) and renders a presence status line via formatPresenceStatus(otherLastSeenAt) plus an emerald dot when the presence map marks the other user online"
    requirement: PRESENCE-02
    verification:
      - kind: unit
        ref: "grep -q '/api/dm/read/' components/messages/ConversationView.tsx"
        status: pass
      - kind: manual_procedural
        ref: "npx tsc --noEmit — 0 errors"
        status: pass
    human_judgment: true
    rationale: "Presence bucket correctness (Active now vs Active Xm/h ago vs no status after 7 days) requires a live last_seen_at value and a live presence-global channel join — recommend end-of-phase manual UAT"
  - id: D5
    description: "DockedWidget uses the exact fixed bottom-0 right-8 z-50 w-[336px] .pf-dm chrome, has a pop-out control (aria-label 'Open in Messages') linking to /messages?thread={id} and a close control (aria-label 'Close'), persists via ArtistLayoutClient's useState (never unmounted on SPA navigation), and is desktop-only via the existing hidden lg:block wrapper"
    requirement: PRESENCE-03
    verification:
      - kind: unit
        ref: "grep -q 'fixed bottom-0 right-8' components/messages/DockedWidget.tsx && grep -n 'aria-label=\"Open in Messages\"\\|aria-label=\"Close\"' components/messages/DockedWidget.tsx"
        status: pass
      - kind: manual_procedural
        ref: "npx tsc --noEmit — 0 errors; npm test — 154/154 pass"
        status: pass
    human_judgment: true
    rationale: "Navigation-persistence and unread-badge-clearing behavior needs a live browser session clicking through /messages — recommend end-of-phase manual UAT (also flagged by the plan's own <verification> block)"
  - id: D6
    description: "app/(artist)/messages/page.tsx is a server component fetching the initial thread list (buildThreadViews) and the viewer's verified flag with explicit column lists (never select('*') on artist_profiles); MessagesPageClient renders two-pane at lg / single-pane below, resolving an initial ?with=/?thread= selection"
    requirement: CONNECT-05
    verification:
      - kind: unit
        ref: "grep -n \"select('\\*')\" 'app/(artist)/messages/page.tsx' app/api/dm/messages/route.ts app/api/dm/threads/route.ts lib/social/dm.ts — 0 real matches (only doc comments)"
        status: pass
      - kind: manual_procedural
        ref: "npx tsc --noEmit — 0 errors; npm run build compiles + type-checks cleanly (pre-existing unrelated prerender failure on /update-password documented below)"
        status: pass
    human_judgment: false

# Metrics
duration: 28min
completed: 2026-07-13
status: complete
---

# Phase 11 Plan 05: Messages Inbox — ThreadList, ConversationView, RequestView, DockedWidget, Composer Summary

**The `/messages` two-pane inbox (thread list + conversation), a rate-limit-aware Composer shared with the real DockedWidget, and a Requests section with inline accept/decline/block — wired against the Plan 03 DM API layer and Plan 04's layout-level surfaces**

## Performance

- **Duration:** 28 min
- **Started:** 2026-07-13T19:29:00-04:00
- **Completed:** 2026-07-13T19:37:40-04:00
- **Tasks:** 3
- **Files modified:** 11 (7 created, 4 modified)

## Accomplishments

- `Composer.tsx` (Task 1): shared composer for ConversationView/DockedWidget with optimistic send + revert mirroring `DmWidget.send()`, the D-17 `RequestsBudgetHint`/`RateLimitWall` (rate-limit-exhausted composer replacement with a Connect-request CTA), and the D-18 stacked-message hint/cap; blocked (403) sends stay silently "sent", rate-limited (429) sends revert with a visible error
- `ThreadList.tsx` + `RequestView.tsx` (Task 2): the thread list quarantines pending-received requests into a separate Requests section with a count chip, honors the UI-SPEC empty states, and stays live via a `dm_messages` Realtime subscription that refetches (never a client-side counter); `RequestView` drives Accept/Decline/Block with an inline (non-modal) block confirmation
- `ConversationView.tsx`, `DockedWidget.tsx`, `MessagesPageClient.tsx`, and `app/(artist)/messages/page.tsx` (Task 3): the full two-pane (desktop) / single-pane (mobile) inbox — auto-read on open (D-06), presence status header (D-22), and the real `DockedWidget` (exact `.pf-dm` chrome) now replaces Plan 04's inline placeholder in `ArtistLayoutClient`
- Extended `GET /api/dm/messages` with `isConnection`/`otherLastSeenAt` and moved `buildThreadViews()`/`ThreadView` into `lib/social/dm.ts` (plus a new `computeRequestBudget()` pure helper) so the composer's connection-aware placeholder, D-17 budget hint/wall, and D-22 presence bucket all work without any new dedicated endpoints

## Task Commits

Each task was committed atomically:

1. **Task 1: Composer, RateLimitWall, budget hint, and shared message-bubble rendering** - `a8695af` (feat)
2. **Task 2: ThreadList (with Requests section + presence dots) and RequestView** - `0d8f0b3` (feat)
3. **Task 3: ConversationView, DockedWidget, and the /messages page shell** - `9611636` (feat)

## Files Created/Modified

- `components/messages/Composer.tsx` - shared composer + MessageBubble/RequestsBudgetHint/RateLimitWall
- `components/messages/ThreadList.tsx` - normal threads + Requests section, live via Realtime + refetch
- `components/messages/RequestView.tsx` - recipient accept/decline/block, inline block confirmation
- `components/messages/ConversationView.tsx` - two-pane conversation surface, auto-read, presence header
- `components/messages/DockedWidget.tsx` - the real bottom-right floating widget
- `components/messages/MessagesPageClient.tsx` - two-pane/single-pane inbox shell, presence-global sync
- `app/(artist)/messages/page.tsx` - server component, initial thread list + ?with=/?thread= resolution
- `lib/social/dm.ts` - added `buildThreadViews()`/`ThreadView`/`ThreadOtherView`, `computeRequestBudget()`
- `app/api/dm/threads/route.ts` - now a thin wrapper importing `buildThreadViews`
- `app/api/dm/messages/route.ts` - added `isConnection`/`otherLastSeenAt` to the response
- `components/nav/ArtistLayoutClient.tsx` - swapped the Plan 04 placeholder for the real `DockedWidget`

## Decisions Made

See `key-decisions` in frontmatter. In short: `isConnection`/`otherLastSeenAt` ride on the existing per-conversation `GET /api/dm/messages` call; the D-17 budget/next-slot-date is a pure client-side projection over the already-fetched thread list (`computeRequestBudget()`), avoiding any new "remaining budget" endpoint; `DockedWidget` resolves its context from the full thread list since no single-thread route exists.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `GET /api/dm/messages` extended with `isConnection`/`otherLastSeenAt`**
- **Found during:** Task 3 (ConversationView/DockedWidget)
- **Issue:** The plan's must-have truths require the composer to know whether the current target is a connection (placeholder + budget-hint/wall gating, D-17) and require a presence status line via `formatPresenceStatus(last_seen_at)` (D-22/PRESENCE-02) for the OTHER party in the open conversation. Neither field existed on any API response reachable from a client component (this codebase's established convention is client components never query Supabase tables directly — only via API routes — confirmed via `grep -rl "supabase\.from(" $(grep -rl "'use client'" components app)` returning zero matches).
- **Fix:** Added `isConnection` (via the already-imported `isConnected()`) and `otherLastSeenAt` (one additional `artist_profiles.last_seen_at` select, already granted to `authenticated`/`anon` by migration 054) to `GET /api/dm/messages`'s response — the route already knows both `otherId` and `viewerId` for this exact pair, so this is a single extra query, not an N-query pattern.
- **Files modified:** `app/api/dm/messages/route.ts`
- **Verification:** `npx tsc --noEmit` clean; `npm test` 154/154 pass; DEMO-mode branch updated to match the new shape.
- **Committed in:** `9611636` (Task 3 commit)

**2. [Rule 2 - Missing Critical] `buildThreadViews()`/`ThreadView` moved into `lib/social/dm.ts`; added `createdAt`/`lastSeenAt`; added `computeRequestBudget()`**
- **Found during:** Task 2 (ThreadList needs a `ThreadView` type) and Task 3 (the `/messages` server page needs the same thread-list query, and D-17's budget/next-slot-date needs `createdAt` per thread)
- **Issue:** `app/api/dm/threads/route.ts` (Plan 03) had `buildThreadViews()` as a route-local, unexported function, and its `ThreadView` output omitted `createdAt` (needed for the D-17 rolling-7-day-window projection) and the other party's `last_seen_at` (needed for D-22 presence buckets in the thread list). Without relocating + extending it, either the server page would need a fragile internal self-fetch to its own API route, or the D-17 budget/wall (an explicit must-have truth of THIS plan) would have no data to compute from.
- **Fix:** Moved `buildThreadViews()` + its types into `lib/social/dm.ts` (mirrors the Plan 03 SUMMARY's own precedent of relocating `chooseSendPath()` for the same "route files may only export handlers" / DRY reasons), added `createdAt` and `other.lastSeenAt` to the output, and added a new pure `computeRequestBudget()` helper reused by both `MessagesPageClient` and `DockedWidget`. `app/api/dm/threads/route.ts` is now a thin wrapper.
- **Files modified:** `lib/social/dm.ts`, `app/api/dm/threads/route.ts`
- **Verification:** `npx tsc --noEmit` clean; `npm test` 154/154 pass; no behavior change to the existing `GET /api/dm/threads` contract (additive fields only).
- **Committed in:** `0d8f0b3` (Task 2 commit)

**3. [Rule 3 - Blocking] `components/nav/ArtistLayoutClient.tsx` wired to the real `DockedWidget`**
- **Found during:** Task 3
- **Issue:** 11-04-SUMMARY.md explicitly flagged that its `DockedWidgetPlaceholder` stub was expected to be replaced once `components/messages/DockedWidget.tsx` existed ("Plan 05 is expected to replace this inline placeholder with a real import"). Without this swap, the `DockedWidget` built in this plan would never mount — `openDock()` would still render the Plan 04 stub.
- **Fix:** Removed `DockedWidgetPlaceholder` and its usage; imported and rendered the real `DockedWidget` from `@/components/messages/DockedWidget`, preserving the existing `hidden lg:block` desktop-only wrapper and `MessagesDockContext` plumbing untouched.
- **Files modified:** `components/nav/ArtistLayoutClient.tsx`
- **Verification:** `npx tsc --noEmit` clean; visual inspection confirms the context/provider structure is otherwise unchanged.
- **Committed in:** `9611636` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 missing-critical-functionality, 1 blocking follow-up from a prior plan)
**Impact on plan:** All three are necessary for this plan's own must-have truths (D-17 budget/wall, D-22 presence, DockedWidget actually mounting) to function at all. No architectural changes, no new tables/endpoints beyond additive fields on two already-existing routes.

## Known Limitations

- **`DockedWidget`'s rate-limit budget assumes an unverified viewer** (`computeRequestBudget(rows, viewerId, false)`) — the widget's prop signature per the plan (`{ threadId, viewerId, onClose }`) does not carry the viewer's `verified` flag, and threading it through would require either widening that signature or a further route addition. In practice this only affects a verified member composing a brand-new cold request from inside the docked widget specifically (the primary `/messages` page path, `MessagesPageClient`, computes the budget correctly using the real `viewerVerified` flag fetched server-side). Low-severity: undercounts the budget by up to 20 requests/week for verified members using ONLY the docked widget for cold outreach; does not affect connected-member messaging, accept/decline/block, or the primary page's Composer.
- **`isConnection` for a brand-new (`?with=`, no thread yet) conversation defaults conservatively** based on the pair's live connection state fetched via `GET /api/dm/messages`'s `isConnection` field — this is now accurate (not a heuristic), since Task 3's deviation #1 added a real `isConnected()` check to that route rather than relying on thread `status`.
- Per 11-03-SUMMARY.md and this plan's own coverage rationale, the accept/decline/block round-trip against the live migration-055 RLS policy has not been exercised against a live Supabase session in this plan (no unit test seeds live DB state) — recommend end-of-phase manual UAT per the plan's `<verification>` block, consistent with prior-plan human-judgment items for the same routes.

## Issues Encountered

`RealtimeChannel` (the installed `@supabase/realtime-js` version) has no public per-listener `off()` method — an initial implementation of the read-only presence-sync consumers (`MessagesPageClient`, `DockedWidget`) called a non-existent `channel.off('presence', { event: 'sync' })` on cleanup, caught by `npx tsc --noEmit` (`TS2339: Property 'off' does not exist on type 'RealtimeChannel'`). Fixed by replacing the unbind call with an `alive` flag guard (mirroring `DmWidget.tsx`'s reconcile-poll pattern) checked inside the `sync()` callback before calling `setState` — the shared `presence-global` channel itself is never torn down by these read-only consumers (only `PresenceTracker` owns that lifecycle), so leaving the listener attached-but-inert after unmount is safe and matches the plan's "do NOT open a second presence channel" instruction.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `/messages` is live: two-pane desktop / single-pane mobile, Requests section with count chip, rate-limit budget hint/wall, presence status header, and a real navigation-persistent docked widget
- Plan 06 can now wire `ProfileView.tsx`'s Message button to `/messages?with={userId}` and mount `ProfilePresenceDot` into the `.pf-avatar .live` slot — both explicitly out of this plan's `files_modified` scope per the UI-SPEC's plan boundary
- Recommended end-of-phase manual UAT (per the plan's own `<verification>` block and this SUMMARY's `human_judgment: true` coverage items): two-pane desktop inbox, requests quarantine + accept/decline/block against a live DB, rate-limit wall at zero budget, presence status bucket correctness, and docked-widget persistence across navigation

## Self-Check: PASSED

- `components/messages/Composer.tsx` exists: FOUND
- `components/messages/ThreadList.tsx` exists: FOUND
- `components/messages/RequestView.tsx` exists: FOUND
- `components/messages/ConversationView.tsx` exists: FOUND
- `components/messages/DockedWidget.tsx` exists: FOUND
- `components/messages/MessagesPageClient.tsx` exists: FOUND
- `app/(artist)/messages/page.tsx` exists: FOUND
- All 3 task commits exist in git log: `a8695af`, `0d8f0b3`, `9611636` — FOUND
- `npx tsc --noEmit`: 0 errors — CONFIRMED
- `npm test`: 154/154 pass — CONFIRMED
- `npm run build`: compiles + type-checks cleanly; the later prerender failure on `/update-password` is a pre-existing missing-env-var condition in this worktree (documented identically in 11-03/11-04-SUMMARY.md), unrelated to this plan's files — CONFIRMED
- All task-level acceptance-criteria grep checks (aria-label "Send", no dangerouslySetInnerHTML, "Requests" section label, "request/accept" fetch path, exact DockedWidget chrome string, "/api/dm/read/" auto-read call) — CONFIRMED

---
*Phase: 11-presence-messaging*
*Completed: 2026-07-13*
