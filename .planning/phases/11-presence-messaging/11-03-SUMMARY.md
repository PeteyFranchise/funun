---
phase: 11-presence-messaging
plan: "03"
subsystem: api
tags: [nextjs, supabase, rls, rate-limiting, notifications, dm]

# Dependency graph
requires:
  - phase: 11-presence-messaging
    provides: "11-01's countRecentRequests/isConnected/countPendingMessagesFrom/hasUnread + BASELINE/VERIFIED/PENDING_STACK_CAP constants + message_request/new_dm builders; 11-02's dm_threads.status/requester_id + artist_profiles.last_seen_at columns"
provides:
  - "POST /api/dm/send — connection gate + rate limit + stacked-request cap enforced server-side (CONNECT-03/04/05)"
  - "chooseSendPath() — pure, unit-tested send-gate decision core in lib/social/dm.ts"
  - "GET /api/dm/threads — thread list with other-party snapshot, last-message preview, fresh hasUnread; ?unread=true count over status=direct threads (PRESENCE-03)"
  - "POST /api/dm/read/[threadId] — auto-read marker upsert (D-06)"
  - "POST /api/presence/heartbeat — throttled last_seen_at write via service client (PRESENCE-01/02)"
  - "POST /api/dm/request/accept|decline|block/[threadId] — recipient-only request-lifecycle transitions (CONNECT-03)"
affects:
  - 11-04-PLAN.md (messages page + docked widget consume /api/dm/threads, /api/dm/read, /api/dm/request/*)
  - 11-05-PLAN.md (thread list / request view UI wired to these routes)
  - 11-06-PLAN.md (presence dot rendering consumes last_seen_at via /api/dm/threads and profile reads)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure decision-core functions live in lib/ (not route.ts) — Next.js route files may only export HTTP method handlers; any other export fails route-type validation at build time"
    - "Service-role client used only for cross-user reads/writes that RLS would otherwise block (dm_thread_reads freshness check, dm_threads status transitions, artist_profiles.last_seen_at write) — session client used everywhere the caller's own row suffices (blocks insert, dm_thread_reads own-marker upsert)"

key-files:
  created:
    - __tests__/dm-send-gate.test.ts
    - app/api/dm/threads/route.ts
    - "app/api/dm/read/[threadId]/route.ts"
    - app/api/presence/heartbeat/route.ts
    - "app/api/dm/request/accept/[threadId]/route.ts"
    - "app/api/dm/request/decline/[threadId]/route.ts"
    - "app/api/dm/request/block/[threadId]/route.ts"
  modified:
    - app/api/dm/send/route.ts
    - lib/social/dm.ts

key-decisions:
  - "chooseSendPath() (the send-gate decision core) lives in lib/social/dm.ts, not app/api/dm/send/route.ts — Next.js's route-export validator rejected any non-handler export from route.ts, breaking npm run build; relocating it follows this codebase's established pure-function lib-module pattern (mirrors lib/social/presence.ts)"
  - "new_dm suppression reads the recipient's dm_thread_reads row via the SERVICE client, not the session client — dm_thread_reads_select_own RLS scopes SELECT to auth.uid() = user_id, so the sender's session client cannot see the recipient's read marker at all"
  - "The grandfather-edge flip (pending thread -> direct once a connection forms) and the pending-stamp on a freshly-created thread both use the service client with an .eq('status', ...) guard, per the plan's explicit instruction — dm_threads has no RLS UPDATE policy at all (only SELECT/INSERT), so a session-client UPDATE would silently affect zero rows"

patterns-established:
  - "Cross-user notification-suppression reads (checking another user's freshness marker before firing a notification) always go through the service client, never the session client, even when the write path is otherwise session-scoped"

requirements-completed: [CONNECT-03, CONNECT-04, CONNECT-05, PRESENCE-01, PRESENCE-02, PRESENCE-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "chooseSendPath() pure decision core: connected->direct, stacked<3->stack, >=3->reject-stack, over-limit->reject-rate (baseline 10 / verified 30), under-limit->request"
    requirement: CONNECT-05
    verification:
      - kind: unit
        ref: "__tests__/dm-send-gate.test.ts#chooseSendPath"
        status: pass
    human_judgment: false
  - id: D2
    description: "POST /api/dm/send checks isConnected() and countRecentRequests() before ensureThread() is ever called — the connection gate cannot be bypassed by a client-trust shortcut (T-11-06)"
    requirement: CONNECT-05
    verification:
      - kind: unit
        ref: "__tests__/dm-send-gate.test.ts#POST /api/dm/send — gate call order"
        status: pass
    human_judgment: false
  - id: D3
    description: "Rate-limit rejection returns 429 with { remaining: 0 } before any thread is created; stacked-cap rejection returns 400 (CONNECT-04, D-18)"
    requirement: CONNECT-04
    verification:
      - kind: unit
        ref: "__tests__/dm-send-gate.test.ts#POST /api/dm/send — gate call order#rejects with 429 when the rate limit is reached"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/dm/threads returns thread list with other-party snapshot, last-message preview, and hasUnread computed via timestamp comparison (not a cached counter); ?unread=true counts only status='direct' threads"
    requirement: PRESENCE-03
    verification: []
    human_judgment: true
    rationale: "Requires a live Supabase session + seeded dm_threads/dm_messages/dm_thread_reads rows to exercise the full query; no unit test was authored for this route in this plan (11-04/11-05's UI wiring will exercise it end-to-end) — verifier should route this to manual/live-backend UAT."
  - id: D5
    description: "POST /api/dm/read/[threadId] upserts the caller's dm_thread_reads marker with onConflict thread_id,user_id; POST /api/presence/heartbeat throttles last_seen_at writes via the service client with a NULL first-write branch"
    requirement: PRESENCE-01
    verification: []
    human_judgment: true
    rationale: "No live-DB integration test authored in this plan; both routes are straightforward wrappers verified by tsc/build only. Recommend a live-backend smoke check during 11-04/11-06 UAT."
  - id: D6
    description: "Accept/decline/block routes enforce recipient-only transitions (self-accept/self-decline/self-block rejected 403), decline fires no notification (D-11 silent), block inserts via the session client and is idempotent on 23505"
    requirement: CONNECT-03
    verification: []
    human_judgment: true
    rationale: "KNOWN GAP: dm_threads has no RLS UPDATE policy at all (only dmt_select_participant/dmt_insert_participant exist — confirmed via grep across all migrations). The session-client .update({status:...}).eq('status','pending') guard these three routes rely on will affect ZERO rows against the live database regardless of caller, always returning 404/403 in production until a companion migration adds participant-scoped UPDATE policies for dm_threads (mirroring migrations 035's connections_update_addressee/connections_update_requester_withdraw split). This plan's own action text explicitly instructed NOT to author that migration here (\"do NOT create a new migration in this plan — flag it\") since it requires a live-push checkpoint incompatible with this plan's autonomous:true frontmatter. Flagging for a follow-up migration (055) before 11-04/11-05 ship the accept/decline/block UI live."
  - id: D7
    description: "message_request notification fires exactly once per cold thread (never re-fired on stacked messages); new_dm notification fires on a direct message only when the recipient's last_read_at is absent or older than 60s"
    requirement: CONNECT-03
    verification:
      - kind: unit
        ref: "grep: buildMessageRequestNotification / buildNewDmNotification each appear in exactly one call site, wrapped in try/catch"
        status: pass
    human_judgment: true
    rationale: "The 60s suppression window and once-per-thread notification firing are structurally correct (grep-verified) but not exercised against a live DB/timer in this plan — recommend a live-backend smoke check."

# Metrics
duration: 8min
completed: 2026-07-13
status: complete
---

# Phase 11 Plan 03: DM API Layer — Send Gate, Threads/Unread/Read, Presence Heartbeat, Request Lifecycle Summary

**Server-side connection gate + rolling rate limit + stacked-request cap on POST /api/dm/send, plus six new routes (thread list/unread, auto-read marker, throttled presence heartbeat, and accept/decline/block) — the single trust boundary for "who may message whom, how often" in Funūn's DM system**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-13T18:59:07-04:00
- **Completed:** 2026-07-13T19:06:43-04:00
- **Tasks:** 3
- **Files modified:** 9 (2 modified, 7 created)

## Accomplishments

- `POST /api/dm/send` now enforces the connection gate server-side (CONNECT-05): mutually-connected pairs message directly with no request step; non-connections enter a rate-limited (10/week baseline, 30/week verified, rolling 7-day window), stack-capped (3 messages) message-request flow (CONNECT-03/04)
- `chooseSendPath()` — a pure, fully unit-tested decision core covering all five outcomes (direct/stack/request/reject-rate/reject-stack) — lives in `lib/social/dm.ts`, wired to the route's real `isConnected`/`countRecentRequests`/`countPendingMessagesFrom` queries
- A direct-message `new_dm` notification is suppressed when the recipient's `dm_thread_reads` marker is fresher than 60 seconds, avoiding per-message notification spam in active conversations (RESEARCH Open Question #2)
- `GET /api/dm/threads` returns the full thread list (other-party snapshot, last-message preview, fresh `hasUnread`) and, via `?unread=true`, the topbar badge count computed only over `status='direct'` threads (D-07)
- `POST /api/dm/read/[threadId]` and `POST /api/presence/heartbeat` ship the auto-read marker and the throttled (60s) presence write, the latter using the service client since `artist_profiles.last_seen_at` has no authenticated UPDATE grant (T-11-04)
- `POST /api/dm/request/{accept,decline,block}/[threadId]` enforce recipient-only transitions, silent decline (D-11), and an immediately-effective block insert via the session client

## Task Commits

Each task was committed atomically:

1. **Task 1: DM send-gate — connection check, rate limit, stacked-request cap** - `3c5e7a1` (feat)
2. **Task 2: thread-list/unread, auto-read marker, presence heartbeat routes** - `26f1fd2` (feat)
3. **Fix: move chooseSendPath out of route.ts into lib/social/dm.ts** - `b7a6651` (fix, found while verifying Task 1/2 with `npm run build`)
4. **Task 3: request-lifecycle routes — accept, decline, block** - `3879bd7` (feat)

## Files Created/Modified

- `app/api/dm/send/route.ts` — connection gate, rate limit, message-request flow, suppressed new_dm notification
- `lib/social/dm.ts` — added `chooseSendPath()` + `SendPathKind` (relocated from route.ts)
- `__tests__/dm-send-gate.test.ts` — 9 tests: 6 pure `chooseSendPath` cases + 2 gate-call-order integration tests (isConnected/countRecentRequests before ensureThread) + 1 rate-limit-429 test
- `app/api/dm/threads/route.ts` — thread list + `?unread=true` count
- `app/api/dm/read/[threadId]/route.ts` — auto-read marker upsert
- `app/api/presence/heartbeat/route.ts` — throttled `last_seen_at` write
- `app/api/dm/request/accept/[threadId]/route.ts` — recipient-only accept + new_dm notification
- `app/api/dm/request/decline/[threadId]/route.ts` — recipient-only silent decline
- `app/api/dm/request/block/[threadId]/route.ts` — session-client blocks insert, idempotent on 23505

## Decisions Made

- `chooseSendPath()` moved to `lib/social/dm.ts` (see Deviations — required for `npm run build` to pass)
- new_dm suppression check reads the recipient's `dm_thread_reads` row via the **service** client, not session — RLS's `dm_thread_reads_select_own` policy scopes SELECT to `auth.uid() = user_id`, so the sender could never see the recipient's own marker through their own session
- The pending-thread stamp (`requester_id`/`status='pending'`) and the connected-pair grandfather flip (`status='pending'` → `'direct'`) both use the service client with an `.eq('status', ...)` guard, exactly as the plan specified, given `dm_threads` has no RLS UPDATE policy at all

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `chooseSendPath` export broke `npm run build`**

- **Found during:** Task 1 verification (running the plan's `npm run build` check ahead of Task 3)
- **Issue:** Next.js validates that `route.ts` files export only recognized HTTP method handlers / route config fields. Exporting `chooseSendPath` (as the plan's action text allowed, calling it "cleaner") failed the build with `"chooseSendPath" is not a valid Route export field.`
- **Fix:** Moved `chooseSendPath()` and its `SendPathKind` type into `lib/social/dm.ts` (alongside the rate-limit constants it consumes), matching the codebase's established pure-function lib-module pattern (`lib/social/presence.ts`). `app/api/dm/send/route.ts` now imports it; `__tests__/dm-send-gate.test.ts` updated its import accordingly.
- **Files modified:** `lib/social/dm.ts`, `app/api/dm/send/route.ts`, `__tests__/dm-send-gate.test.ts`
- **Verification:** `npm run build` compiles and passes Next.js's route-type validation cleanly (the build's later prerender failure on `/forgot-password` is a pre-existing environment issue — no `.env.local`/Supabase env vars configured in this worktree — unrelated to this plan's files); full test suite 147/147 pass; `npx tsc --noEmit` clean.
- **Committed in:** `b7a6651`

---

**Total deviations:** 1 auto-fixed (1 build-breaking bug)
**Impact on plan:** Necessary correctness fix, no scope creep — the fix relocates code without changing behavior; all existing tests continued passing unchanged.

## Known Gaps (flagged per plan instruction, not fixed in this plan)

**`dm_threads` has no RLS UPDATE policy** — confirmed via `grep -rn "dm_threads" supabase/migrations/*.sql`: only `dmt_select_participant` (SELECT) and `dmt_insert_participant` (INSERT, migrations 012/038) exist; no UPDATE policy was ever added. This means the session-client `.update({status: ...}).eq('id', threadId).eq('status', 'pending')` calls in `app/api/dm/request/accept/[threadId]/route.ts`, `.../decline/[threadId]/route.ts`, and the pending-thread stamp in `app/api/dm/send/route.ts` will affect **zero rows** against the live database regardless of who calls them — RLS silently filters out all UPDATE targets when no policy grants the command. In production this means accept/decline currently always 404, and the send-route's pending-stamp/grandfather-flip updates are no-ops (the message itself still sends; only the `status`/`requester_id` bookkeeping silently fails to persist).

This plan's own `<action>` text explicitly anticipated this ("If a stricter RLS UPDATE policy is needed to prevent the requester updating status, add it here as a small additive migration note in the SUMMARY (do NOT create a new migration in this plan — flag it)") — a new migration requires a live `supabase db push` blocking checkpoint (per migration 054's own precedent in 11-02), which is incompatible with this plan's `autonomous: true` frontmatter. All code here is written and tested exactly as the plan specified (mocked-client unit tests pass; `tsc`/build are clean), but **a follow-up migration is required before the accept/decline/block UI (Plans 04/05) can work against a live database.**

**Recommended follow-up migration (055), mirroring migration 035's `connections_update_addressee`/`connections_update_requester_withdraw` split:**

```sql
-- dm_threads: participant-scoped UPDATE policies for the request-lifecycle
-- transitions (accept/decline/block) and the send-route's pending-stamp.
CREATE POLICY "dmt_update_participant" ON dm_threads FOR UPDATE TO authenticated
  USING (a_id = auth.uid() OR b_id = auth.uid())
  WITH CHECK (a_id = auth.uid() OR b_id = auth.uid());
```

(A tighter split mirroring `connections`' addressee/requester separation is also viable if a future audit wants finer-grained enforcement — e.g. only the non-requester participant may transition `pending -> direct/declined` — but the participant-only policy above is sufficient to unblock the currently-broken zero-row behavior and matches this table's existing SELECT/INSERT policy shape.)

## Issues Encountered

None beyond the build-breaking export issue documented above (resolved same session).

## User Setup Required

None for this plan's own tasks. **Operator action needed before Plans 04/05 ship live:** author and push a migration adding an UPDATE policy to `dm_threads` (see "Known Gaps" above) — without it, accept/decline/block will 404 against the live database even though all code and tests in this plan pass.

## Next Phase Readiness

- `POST /api/dm/send`, `GET /api/dm/threads`, `POST /api/dm/read/[threadId]`, `POST /api/presence/heartbeat`, and the three request-lifecycle routes all exist, typecheck clean, and are unit-tested where a live DB isn't required
- Plans 04-06 (UI) can proceed against these routes' contracts immediately
- **Blocker for live functionality (not for continued planning/UI work):** the `dm_threads` RLS UPDATE-policy gap above must be closed via a pushed migration before accept/decline/block or the pending-thread stamp will work against the live database — flagged for the next available migration slot (055)

## Self-Check: PASSED

- `app/api/dm/send/route.ts` exists: FOUND
- `lib/social/dm.ts` exists and exports `chooseSendPath`: FOUND
- `__tests__/dm-send-gate.test.ts` exists: FOUND
- `app/api/dm/threads/route.ts` exists: FOUND
- `app/api/dm/read/[threadId]/route.ts` exists: FOUND
- `app/api/presence/heartbeat/route.ts` exists: FOUND
- `app/api/dm/request/accept/[threadId]/route.ts` exists: FOUND
- `app/api/dm/request/decline/[threadId]/route.ts` exists: FOUND
- `app/api/dm/request/block/[threadId]/route.ts` exists: FOUND
- All 4 commits exist in git log: `3c5e7a1`, `26f1fd2`, `b7a6651`, `3879bd7` — FOUND
- `npm test -- --testPathPatterns='dm-send-gate|dm-request|dm-unread'`: 31/31 pass — CONFIRMED
- Full test suite: 147/147 pass — CONFIRMED
- `npx tsc --noEmit`: 0 errors — CONFIRMED
- `npm run build`: compiles + route-type validation clean (prerender failure on unrelated `/forgot-password` page is a pre-existing missing-env-var condition in this worktree, not caused by this plan) — CONFIRMED

---
*Phase: 11-presence-messaging*
*Completed: 2026-07-13*
