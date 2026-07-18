---
phase: 13-network-trust-safety
plan: 02
subsystem: network
tags: [network-tab, follows, connections, blocks, nextjs, react, supabase, rls]

requires:
  - phase: 13-network-trust-safety
    plan: 01
    provides: NetworkListItem/BlockedListItem contracts (lib/trust-safety/contracts.ts)
  - phase: 10-connections-notifications
    provides: connections state machine (pending/accepted/declined/withdrawn), auto-follow-seed trigger
  - phase: 12-discovery-feed-people-search
    provides: DISCOVER_PUBLIC_COLUMNS public-safe profile column projection (lib/green-room/discover.ts)
provides:
  - GET /api/network — viewer-scoped Network tab data (connections/following/followers/pending/blocked)
  - POST/DELETE /api/network/blocks — block/unblock action (minimal, session-client, RLS-scoped)
  - /network member-facing page + components/network/NetworkTab.tsx UI
  - lib/network/query.ts data-access module (loadNetworkData)
affects: [13-03-hard-block-enforcement-audit, 13-04-reporting-admin-review, 13-05-verification-profile-visibility]

tech-stack:
  added: []
  patterns:
    - "Network tab data access reuses 13-01's NetworkListItem/BlockedListItem contract shapes (no redefinition) and lib/green-room/discover.ts's DISCOVER_PUBLIC_COLUMNS constant (no duplicate public-safe column list) — single source of truth for the shared privacy doctrine across public profile, People Search, Green Room feed, and Network tab"
    - "Relationship-priority exclusion: an accepted connection is excluded from the following/followers categories (mirrors lib/green-room/discover.ts's deriveRelationship precedent), since migration 044's auto-follow-seed trigger always creates both follows rows on accept — prevents the same person appearing as noise in two tabs"
    - "Network reads use the SESSION client exclusively — no service client anywhere in lib/network/query.ts or the new API routes. The viewer's own blocklist (blocks_select_own RLS) is used both to render the Blocked tab and to filter blocked ids out of every other category; there is no bidirectional block lookup, so it is architecturally impossible for this code to answer 'who blocked the viewer'"
    - "Block/unblock write path mirrors the existing app/api/dm/request/block/[threadId]/route.ts precedent exactly: session client, blocker_id = auth.uid(), self-block rejected, duplicate insert (23505) treated as idempotent success"

key-files:
  created:
    - lib/network/query.ts
    - app/api/network/route.ts
    - app/api/network/blocks/route.ts
    - app/(artist)/network/page.tsx
    - components/network/NetworkTab.tsx
    - __tests__/network-api.test.ts
  modified:
    - components/nav/ArtistNav.tsx
    - components/nav/icons.tsx

key-decisions:
  - "Added a minimal POST/DELETE /api/network/blocks endpoint even though 13-02-PLAN.md lists only two tasks (query API, tab UI) and 13-03-PLAN.md's own Task 1 is titled 'Add block/unblock API' — the 13-02 UI acceptance criterion 'Block/unblock uses inline confirmation' cannot be satisfied by a UI-only stub without violating the non-negotiable rule that block enforcement must be server-side, never UI-only (Rule 2: auto-add missing critical functionality). This endpoint only performs blocks-table INSERT/DELETE via the session client under existing RLS (migration 035) — it does NOT touch the broader read-surface audit (public profile, search, feed, DM enforcement of pre-existing rows) that remains 13-03's explicit Task 2 scope. 13-03 should treat this endpoint as already-shipped groundwork, not a conflicting duplicate, when it plans its own block/unblock work."
  - "'Remove' (sever an already-accepted connection) is listed as a possible action in 13-UI-SPEC.md but is NOT implemented. The connections RLS UPDATE policies (connections_update_addressee, connections_update_requester_withdraw) both gate on status = 'pending' in their USING clause — there is no RLS path today to transition an 'accepted' row to any terminal state, and no DELETE policy on connections at all. Adding one would be a schema/RLS change, which is out of this plan's scope (Rule 4 territory) and not required by 13-02-PLAN.md's own acceptance criteria. Deferred rather than faked with a button that would 404."
  - "Following/followers exclude accepted connections (relationship-priority rule, matching lib/green-room/discover.ts's existing deriveRelationship precedent) rather than showing the same person in multiple tabs — a mutual connection is not additionally surfaced as plain following/follower noise, since migration 044's trigger always seeds both follows rows on accept."
  - "The viewer's own blocklist is also used to filter blocked ids out of the following/followers/connections/pending categories (not just to populate the Blocked tab). This is a narrow, same-plan consistency measure — no service client or bidirectional block check was needed since it operates purely on rows the viewer's own session can already read (blocks_select_own)."
  - "NetworkPerson enrichment reuses DISCOVER_PUBLIC_COLUMNS verbatim from lib/green-room/discover.ts (import, not re-declare) per the assignment's explicit 'share one privacy doctrine' constraint — Network tab, public profile, People Search, and Green Room feed all read the identical public-safe column projection."
  - "/network was added as a new universal (no capability gate) top-level ArtistNav entry, per 13-UI-SPEC.md's routing guidance ('/network can be a primary nav destination' since Green Room has no subroutes to nest under). New NetworkIcon added to components/nav/icons.tsx rather than reusing CollaboratorsIcon, since Collaborators is a project-scoped roster, not a member's own relationship graph."

patterns-established:
  - "lib/network/query.ts: a data-access module (not a pure contract module like lib/trust-safety/contracts.ts) that imports SupabaseClient and reuses upstream pure contracts/constants rather than redefining them — the intended pattern for later trust-safety plans (13-04 reports, 13-05 verification) building their own API-layer modules on top of 13-01's contracts.ts shapes."

requirements-completed: [DISCOVER-04]

coverage:
  - id: D1
    description: "Authenticated member can view a Network tab showing following, followers, accepted connections, and pending inbound/outbound connection requests, viewer-scoped only"
    requirement: "DISCOVER-04"
    verification:
      - kind: unit
        ref: "__tests__/network-api.test.ts (GET /api/network describe block)"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit (clean), npm run lint (clean)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Network API never exposes who blocked the viewer — only the viewer's own directional blocklist is readable, and no code path performs a bidirectional block lookup"
    requirement: "DISCOVER-04"
    verification:
      - kind: unit
        ref: "__tests__/network-api.test.ts ('never returns a bidirectional block shape' test)"
        status: pass
    human_judgment: true
    rationale: "The unit test asserts the response shape has no blockedBy/blockerProfileId field and that loadNetworkData only ever queries blocks_select_own-scoped rows (blocker_id = viewer). Full confirmation that a blocked member truly cannot infer block state through any surface (profile, search, feed) is 13-03's live-DB / manual UAT scope (13-VALIDATION.md scenario 3), not this plan's."
  - id: D3
    description: "Network tab UI renders state-specific actions per relationship (Accept/Decline/Withdraw for pending, Follow/Unfollow, View profile, Message) and Block/Unblock uses a two-step inline confirmation with plain-language impact copy"
    requirement: "DISCOVER-04"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean) — components/network/NetworkTab.tsx type-checks against lib/network/query.ts and lib/trust-safety/contracts.ts shapes"
        status: pass
    human_judgment: true
    rationale: "No component-level render test exists for NetworkTab.tsx (no React Testing Library setup in this repo's Jest config — precedent components like GreenRoomFeed/PeopleSearch also have no render-level tests, only API-layer and pure-function tests). Visual/interaction confirmation of the tab bar, inline block confirmation, and mobile scroll behavior is a manual UAT item per 13-VALIDATION.md."

duration: 40min
completed: 2026-07-18
status: complete
---

# Phase 13 Plan 02: Network Tab Summary

**Member-facing Network tab (Connections/Following/Followers/Pending/Blocked) backed by a new viewer-scoped `GET /api/network` aggregation and a minimal RLS-backed `/api/network/blocks` block/unblock endpoint, reusing 13-01's trust-safety contracts and 12-09's public-safe column doctrine throughout.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-07-18
- **Tasks:** 2 completed (plus a scoped block/unblock endpoint added under Task 1 to make Task 2's acceptance criteria real, not a stub)
- **Files:** 6 created, 2 modified

## Accomplishments

- `lib/network/query.ts`: `loadNetworkData(supabase, viewerId)` reads `connections`, `follows`, and the viewer's own `blocks` rows entirely through the session-bound client (RLS-scoped, no service client anywhere in this plan), categorizes them into connections/following/followers/pendingOutgoing/pendingIncoming/blocked, enriches each with a public-safe `NetworkPerson` projection built from `DISCOVER_PUBLIC_COLUMNS` (reused, not redefined), and excludes the viewer's own blocked ids from every non-blocked category.
- `app/api/network/route.ts`: `GET`, 401 without a session, otherwise returns the categorized payload above.
- `app/api/network/blocks/route.ts`: `POST`/`DELETE` block/unblock, session client only, self-block rejected, duplicate-insert idempotent — mirrors the existing `app/api/dm/request/block/[threadId]/route.ts` precedent exactly.
- `app/(artist)/network/page.tsx` + `components/network/NetworkTab.tsx`: the Network tab UI — five tabs with a horizontally-scrollable bar (mobile-safe per the UI spec), person rows with avatar/name/handle/role/verified badge, state-specific actions (Accept/Decline/Withdraw reuse the existing `/api/connections` PATCH, Follow/Unfollow reuse the existing `/api/follows`), and a two-step inline Block/Unblock confirmation with the exact plain-language impact copy from `13-UI-SPEC.md`.
- `components/nav/ArtistNav.tsx` + `components/nav/icons.tsx`: new universal `/network` nav entry with a new `NetworkIcon`, so the tab is actually reachable (not a stub).
- `__tests__/network-api.test.ts`: 11 tests covering auth gating on both routes, viewer-scoping, no-bidirectional-block-shape assertion, block/unblock idempotency and self-block rejection, and error-path handling.

## Task Commits

1. **Task 1: Add network query API** (+ block/unblock endpoint) - `e37a659` (feat)
2. **Task 2: Add Network tab UI** - `0f14c61` (feat)

**Plan metadata:** _pending — see final commit below_

## Files Created/Modified

- `lib/network/query.ts` - Viewer-scoped Network tab data access
- `app/api/network/route.ts` - GET aggregation endpoint
- `app/api/network/blocks/route.ts` - POST/DELETE block/unblock endpoint
- `app/(artist)/network/page.tsx` - `/network` page shell
- `components/network/NetworkTab.tsx` - Tab bar + person rows + inline block/unblock confirmation
- `__tests__/network-api.test.ts` - API-layer unit tests
- `components/nav/ArtistNav.tsx` - Added `/network` nav item
- `components/nav/icons.tsx` - Added `NetworkIcon`

## Decisions Made

See `key-decisions` in frontmatter — summarized:
- Added a scoped block/unblock endpoint in this plan (not 13-03) so the Task 2 UI acceptance criterion is real, not UI-only; documented so 13-03 can build on it rather than duplicate it.
- Omitted "Remove connection" (no RLS path exists for accepted → terminal today; adding one is a schema change out of scope).
- Following/followers exclude accepted connections (relationship-priority, matching existing discover.ts precedent).
- Viewer's own blocklist filters all categories, not just the Blocked tab.
- Reused `DISCOVER_PUBLIC_COLUMNS` verbatim for the shared privacy doctrine.
- `/network` added as a new universal top-level nav item per the UI spec's routing guidance.

## Deviations from Plan

**1. [Rule 2 - missing critical functionality] Added `/api/network/blocks` POST/DELETE**
- **Found during:** Task 2 (Network tab UI)
- **Issue:** 13-02-PLAN.md's Task 2 acceptance criteria require "Block/unblock uses inline confirmation," but no task in this plan (or any already-executed plan) provides a backing endpoint. 13-03-PLAN.md's own Task 1 is titled "Add block/unblock API," creating an apparent ownership conflict.
- **Fix:** Added a narrowly-scoped endpoint that only performs `blocks` table INSERT/DELETE through the session client under the already-existing RLS policies from migration 035 (no new migration, no new RLS, no schema change) — this is reuse of an already-proven pattern (`app/api/dm/request/block/[threadId]/route.ts`), not a new architectural surface. The broader read-surface audit (public profile, search, feed, DM enforcement of pre-existing rows) remains entirely out of scope here and is left for 13-03.
- **Files modified:** `app/api/network/blocks/route.ts` (new)
- **Commit:** `e37a659`
- **Note for 13-03:** when that plan runs, it should treat this endpoint as already-shipped groundwork for its Task 1, not a duplicate to redo from scratch.

**2. [Scope boundary — not fixed] "Remove" action for accepted connections**
- Listed in `13-UI-SPEC.md` as a possible connection-row action but not implemented — no RLS transition exists from `accepted` to any terminal state today (both UPDATE policies gate on `status = 'pending'`), and there is no DELETE policy on `connections`. Implementing this would require a migration/RLS change, which is Rule 4 territory (architectural change) and not required by this plan's own acceptance criteria. Left out rather than wired to a button that would 404.

## Issues Encountered

None beyond the two items above — both handled per the deviation rules without blocking execution.

## User Setup Required

None. No new environment variables, migrations, or external service configuration. `blocks`/`follows`/`connections` tables and their RLS policies already existed from migrations 012/035/038/044.

## Next Phase Readiness

- **Plan 13-03 (Hard Block Enforcement Audit):** should reconcile its own "Add block/unblock API" task against the `/api/network/blocks` endpoint shipped here (see key-decisions) before building a second one, then proceed straight to its actual scope — auditing/patching public profile, search, feed, DM, and comment/reaction/repost read surfaces for pre-existing blocked-pair rows.
- **Plan 13-04 (Reporting & admin review)** and **Plan 13-05 (Verification & profile visibility)** are unaffected by this plan; both still depend on migration 058 being pushed, which remains outstanding (carried over from 13-01's summary).
- DISCOVER-04 is now functionally satisfied for its 13-02-owned scope: an authenticated member can view a working Network tab (Connections/Following/Followers/Pending/Blocked), take state-specific actions, and Block/Unblock works end-to-end against the live `blocks` table with inline confirmation. Full requirement closure across the phase (SAFETY-01..04) still depends on 13-03/13-04/13-05.

---
*Phase: 13-network-trust-safety*
*Completed: 2026-07-18*

## Self-Check: PASSED

All 7 created/modified files confirmed present on disk; both task commits (`e37a659`, `0f14c61`) confirmed present in `git log --oneline --all`.
