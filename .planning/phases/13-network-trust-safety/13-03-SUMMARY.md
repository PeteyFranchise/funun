---
phase: 13-network-trust-safety
plan: 03
subsystem: api
tags: [trust-safety, blocks, rls, supabase, nextjs, audit]

requires:
  - phase: 13-network-trust-safety
    plan: 02
    provides: POST/DELETE /api/network/blocks (block/unblock, self-block rejected, idempotent, viewer-owned blocklist reads)
  - phase: 13-network-trust-safety
    plan: 05
    provides: SAFETY-04 profile_visibility/open_to_visibility enforcement on app/u/[handle]/page.tsx and lib/green-room/discover.ts (must not be regressed)
provides:
  - lib/trust-safety/block-check.ts — shared isBlockedRelativeTo() app-layer gate + BLOCKED_ACTION_ERROR/BLOCKED_ACTION_STATUS generic error shape, reused across every audited mutation route
  - Public profile route (app/u/[handle]/page.tsx) block gate — a blocked pair now 404s identically to a private/nonexistent profile
  - Read-side block filtering for wall posts, endorsements, and release comments (lib/social/wall.ts, endorsements.ts, comments.ts)
  - Write-side block pre-checks for follows, connections, wall posts, endorsements, and release comments (app/api/follows, connections, wall, endorsements, release-comments)
  - __tests__/block-enforcement.test.ts — 24 tests covering every patched surface plus content pins for every verified-not-patched surface
affects: []

tech-stack:
  added: []
  patterns:
    - "Shared app-layer block gate (lib/trust-safety/block-check.ts): every mutation route that must reject a write across a block now calls one isBlockedRelativeTo(service, viewerId, otherId) helper (thin wrapper over lib/green-room/discover.ts's loadBlockedIds) and returns one shared, block-state-agnostic error constant (BLOCKED_ACTION_ERROR/BLOCKED_ACTION_STATUS) — never a raw Postgres RLS-violation message, which would otherwise be a distinguishable 'you are blocked' signal"
    - "Read-side block filtering for USING(true) social tables: wall_posts/endorsements/release_comments have permissive SELECT RLS (no no_block() wiring, unlike their INSERT policies) — lib/social/wall.ts, endorsements.ts, and comments.ts now accept an optional blockedIds: Set<string> parameter (default empty, fully backward-compatible) and filter rows by author_id before returning, reusing the exact same bidirectional blocked-id set lib/green-room/discover.ts's loadBlockedIds already computes for People Search"

key-files:
  created:
    - lib/trust-safety/block-check.ts
    - __tests__/block-enforcement.test.ts
  modified:
    - app/u/[handle]/page.tsx
    - app/profile/page.tsx
    - lib/social/wall.ts
    - lib/social/endorsements.ts
    - lib/social/comments.ts
    - app/api/follows/route.ts
    - app/api/connections/route.ts
    - app/api/wall/route.ts
    - app/api/endorsements/route.ts
    - app/api/release-comments/route.ts

key-decisions:
  - "Task 1 ('Add block/unblock API') required no new work — 13-02 already shipped app/api/network/blocks/route.ts (POST/DELETE, self-block rejected, idempotent duplicate, blocker-owned RLS reads, 11 tests in __tests__/network-api.test.ts) satisfying every stated acceptance criterion. Verified, not duplicated, per 13-02-SUMMARY.md's own handoff note."
  - "Follows/connections existing-row severing on block: NOT implemented. No migration or trigger anywhere in this codebase severs an existing accepted connection or follow row when a block is placed afterward (migrations 038/044 only gate NEW inserts). This is treated as acceptable because every actual content-visibility surface (Green Room posts/comments/reactions/reposts, wall/endorsements/comments after this plan's patch) re-derives no_block() independently at read time — a stale follows/connections row cannot leak blocked content, it can only leave a numerically-stale relationship row (e.g. a blocked-but-still-following public follower count). Adding severing would require a new migration (schema/trigger change, Rule 4 architectural territory) and is deferred, not silently dropped — flagged here for a future plan."
  - "Green Room comment/reaction/repost WRITE paths: verified, not patched. Their INSERT policies (green_room_comments_insert_visible_post, etc., migration 057) gate on green_room_can_view_post(post_id, ...), which itself calls no_block() against the POST'S AUTHOR — so a block against a post's author already blocks commenting/reacting/reposting on that post. What is NOT blocked: two co-commenters who have blocked each other can both still write comments on a third party's post (the READ side already hides each from the other per migration 060's no_block() wiring on the three SELECT policies — comments/reactions/reposts by a blocked party are invisible to the viewer regardless). This is the same design migration 060's own header comment describes ('hiding comments/reactions/reposts from viewers blocked in either direction with the interaction author, even on shared third-party posts') — a hide-not-prevent model, consistent with how blocking works everywhere else in the app (DM history persists after a block; only new sends are rejected). Not changed, since preventing arbitrary co-commenter writes would require a new per-post participant scan with no existing precedent and is out of this audit's stated scope."
  - "release_comments (rc_insert_author, migration 012) has NO no_block() wiring at the DB layer at all — the only social-write table 038/044 missed. This is the one genuine write-side gap found (not just an error-message-shape issue like the others). Closed with an app-layer pre-check in app/api/release-comments/route.ts (resolves the project owner, then calls isBlockedRelativeTo before insert) rather than a migration, since this codebase treats supabase db push as a human-gated action (see migration 058's own header comment: 'Do not supabase db push this from an executor agent'). A migration wiring no_block() into rc_insert_author directly would still be the more durable fix and is flagged as a follow-up."
  - "Placements: verified, not patched. lib/green-room/placements-admin.ts's isDestinationVisible already calls checkViewerBlock (a no_block() RPC wrapper) for every internal destination type (profile/project/track/opportunity/post) before a placement is allowed to render for a given viewer — this was already correct and needed no changes."
  - "Network tab API (lib/network/query.ts): verified, not patched, per 13-02's own design — already viewer-scoped via the session client's own blocklist, filtering blocked ids out of every category (connections/following/followers/pending)."

patterns-established:
  - "A single shared block-gate module (lib/trust-safety/block-check.ts) instead of five independent ad-hoc block checks — every future mutation route that needs to reject a write across a block should import isBlockedRelativeTo + BLOCKED_ACTION_ERROR/BLOCKED_ACTION_STATUS from here rather than re-deriving its own bidirectional query or inventing its own error copy."

requirements-completed: [SAFETY-01]

coverage:
  - id: D1
    description: "Public profile route excludes blocked pairs (both directions) — a blocked viewer gets the same notFound() as a private/nonexistent profile"
    requirement: "SAFETY-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean) — app/u/[handle]/page.tsx type-checks against the new loadBlockedIds/createServiceClient wiring"
        status: pass
    human_judgment: true
    rationale: "app/u/[handle]/page.tsx is a Next.js server component. This codebase has no page-level render-test precedent anywhere (confirmed by grep across __tests__/ — no test imports any app/**/page.tsx or components/**/*.tsx, and jest.config.js's ts-jest transform has no jsx compiler option, so importing a .tsx page directly would not compile under the existing Jest setup). The underlying primitive (loadBlockedIds) is unit-tested via People Search's existing coverage and this plan's own block-enforcement.test.ts exercises the identical bidirectional-block-detection logic against a mocked service client. The plan's own <verify> block designates this specific surface as a manual live-DB smoke test, not an automated one — see 'What still needs manual UAT' below."
  - id: D2
    description: "People Search excludes blocked pairs (both directions) — verified already correct via lib/green-room/discover.ts's loadBlockedIds + service client, no code change needed"
    requirement: "SAFETY-01"
    verification:
      - kind: unit
        ref: "__tests__/green-room-discover.test.ts (pre-existing, unmodified) + __tests__/green-room-discover-api.test.ts (pre-existing, unmodified)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Green Room feed excludes blocked pairs — verified already correct: green_room_posts_select_visible RLS (migration 057) gates on green_room_can_view_post(), which calls no_block() against the post author (migration 059); comment/reaction/repost counts enrichment in lib/green-room/feed-query.ts runs on the session client so RLS-filtered rows never reach the count"
    requirement: "SAFETY-01"
    verification:
      - kind: unit
        ref: "__tests__/block-enforcement.test.ts ('Green Room post/comment/reaction/repost SELECT policies already gate on no_block()' content pin)"
        status: pass
    human_judgment: false
  - id: D4
    description: "DM send and request paths reject blocked pairs — verified already correct via app/api/dm/send/route.ts's pre-existing bidirectional service-client block check (403, same generic message as a declined thread)"
    requirement: "SAFETY-01"
    verification:
      - kind: unit
        ref: "__tests__/dm-send-gate.test.ts (pre-existing, unmodified) — 'rejects a blocked pair before connection or thread creation checks'"
        status: pass
    human_judgment: false
  - id: D5
    description: "Follow/connect paths reject blocked pairs, and now return a generic block-state-agnostic error instead of a raw distinguishable RLS-violation message"
    requirement: "SAFETY-01"
    verification:
      - kind: unit
        ref: "__tests__/block-enforcement.test.ts (follows/connections POST block-gate describe blocks)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Wall posts, endorsements, and release comments reject NEW writes across a block (release_comments closes a genuine DB-layer gap; wall/endorsements get the same generic-error treatment as follows/connections) and no longer render PRE-EXISTING content from a since-blocked pair on read"
    requirement: "SAFETY-01"
    verification:
      - kind: unit
        ref: "__tests__/block-enforcement.test.ts (wall/endorsements/release-comments POST block-gate + loadWall/loadEndorsements/loadReleaseComments read-filter describe blocks)"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-07-18
status: complete
---

# Phase 13 Plan 03: Hard Block Enforcement Audit Summary

**Audited every read/write surface reachable across a block; found and closed four real gaps (public profile route had zero block check, wall/endorsements/release-comments had permissive read RLS, release_comments had zero write-side no_block() wiring, and five mutation routes leaked a distinguishable RLS error) while confirming People Search, Green Room feed/interactions, DM send, Network tab, and placements were already correctly enforced.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-07-18
- **Tasks:** 2 (Task 1 verified-already-shipped by 13-02; Task 2 is the audit + patches below)
- **Files:** 2 created, 10 modified

## Per-Surface Audit Table

| Surface | Already enforced by | Patched this plan? |
|---|---|---|
| Block/unblock API | 13-02's `app/api/network/blocks/route.ts` | No — verified, satisfies Task 1 acceptance criteria as-is |
| Public profile route (`app/u/[handle]/page.tsx`) | *nothing* — genuine gap | **Yes** — added block gate, identical `notFound()` |
| People Search (`lib/green-room/discover.ts` + API route) | 12-09's `loadBlockedIds` (bidirectional, service client) | No — verified correct |
| Green Room feed (`app/api/green-room/feed/route.ts` + `lib/green-room/`) | RLS: `green_room_posts_select_visible` → `green_room_can_view_post()` → `no_block()` (migrations 057/059) | No — verified correct |
| Green Room comments/reactions/reposts READS | RLS: migration 060's `no_block()` wiring on all three SELECT policies | No — verified correct |
| Green Room comments/reactions/reposts WRITES | RLS: gates on post-author block only (`green_room_can_view_post`); cross-commenter blocks are hide-only on read | No — documented as intentional, not a gap (see key-decisions) |
| DM send (`app/api/dm/send/route.ts`) | Pre-existing bidirectional service-client check, 403 "Message could not be delivered" | No — verified correct |
| Follows (`app/api/follows/route.ts`) | RLS: `follows_insert_own` + `no_block()` (migration 038) | **Yes** — added app-layer pre-check + generic error (RLS message was distinguishable) |
| Connections (`app/api/connections/route.ts`) | RLS: `connections_insert_own` + `no_block()` (migration 044) | **Yes** — same treatment, checked before the existingActive precheck |
| Wall posts (`app/api/wall/route.ts`, `lib/social/wall.ts`) | RLS on INSERT only (`wall_insert_author` + `no_block()`, migration 038); SELECT is `USING (true)` | **Yes** — write: generic error; read: new app-layer filter |
| Endorsements (`app/api/endorsements/route.ts`, `lib/social/endorsements.ts`) | RLS on INSERT only (`endo_insert_author` + `no_block()`, migration 038); SELECT is `USING (true)` | **Yes** — write: generic error; read: new app-layer filter |
| Release comments (`app/api/release-comments/route.ts`, `lib/social/comments.ts`) | *nothing at the DB layer* — `rc_insert_author` was never wired with `no_block()` | **Yes** — app-layer pre-check (write) + app-layer filter (read); DB-layer fix deferred to a migration (see key-decisions) |
| Placements (`lib/green-room/placements-admin.ts`) | `isDestinationVisible` → `checkViewerBlock` → `no_block()` RPC | No — verified correct |
| Network tab API (`lib/network/query.ts`) | 13-02's viewer-scoped blocklist filtering every category | No — verified correct |

## Task Commits

1. **Task 1: Add block/unblock API** — no commit (already shipped by 13-02's `e37a659`; verified only)
2. **Task 2: Audit and patch read/write surfaces** — `004a5cd` (feat)

## Files Created/Modified

- `lib/trust-safety/block-check.ts` — new shared `isBlockedRelativeTo()` app-layer gate + `BLOCKED_ACTION_ERROR`/`BLOCKED_ACTION_STATUS` generic error constants
- `app/u/[handle]/page.tsx` — added the block gate (notFound() on a bidirectional block) and threaded `blockedIds` into wall/endorsements/release-comments loads
- `app/profile/page.tsx` — threaded `blockedIds` into the owner's own wall/endorsements/release-comments loads (same gap, owner-viewing-self case)
- `lib/social/wall.ts` — `loadWall()` now accepts an optional `blockedIds` set and filters authors
- `lib/social/endorsements.ts` — `loadEndorsements()` now accepts an optional `blockedIds` set and filters authors (preserves `viewerHasEndorsed` correctness)
- `lib/social/comments.ts` — `loadReleaseComments()` now accepts an optional `blockedIds` set and filters authors
- `app/api/follows/route.ts` — pre-emptive block check + generic error before the follows upsert
- `app/api/connections/route.ts` — pre-emptive block check + generic error before the existingActive precheck and insert
- `app/api/wall/route.ts` — pre-emptive block check + generic error before the wall_posts insert
- `app/api/endorsements/route.ts` — pre-emptive block check + generic error before the endorsements upsert
- `app/api/release-comments/route.ts` — resolves the project owner first, then pre-emptive block check + generic error before the release_comments insert (this is the one DB-layer gap; see key-decisions)
- `__tests__/block-enforcement.test.ts` — 24 new tests: `isBlockedRelativeTo` unit tests, block-gate tests for all five patched mutation routes, read-filter tests for `loadWall`/`loadEndorsements`/`loadReleaseComments`, and migration-content pins confirming which policies already enforce `no_block()` (038/044/057/059/060) plus the one confirmed gap (`rc_insert_author`, migration 012)

## Decisions Made

See `key-decisions` in frontmatter — summarized:
- Task 1 needed no work (13-02 already shipped it).
- Existing follows/connections rows are NOT severed on block (no precedent anywhere in the codebase for this; deferred, documented).
- Green Room comment/reaction/repost WRITE paths across co-commenter blocks are intentionally hide-not-prevent (matches migration 060's own stated design).
- `release_comments` is the one genuine DB-layer `no_block()` gap found; closed at the app layer since a live migration push is human-gated in this codebase.
- Placements and the Network tab needed no changes — both were already correctly enforced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — missing critical functionality] Public profile route had zero block enforcement**
- **Found during:** Task 2 audit of `app/u/[handle]/page.tsx`
- **Issue:** The route enforces SAFETY-04's `profile_visibility` (connections-only) gate but had no block check at all — a blocked pair could view each other's profile directly by handle.
- **Fix:** Added a block gate using the same `loadBlockedIds` bidirectional lookup People Search already uses, triggering the identical `notFound()` used for private/nonexistent profiles. Also threaded the same `blockedIds` set into wall/endorsements/release-comments loads on both the public route and the owner's own `/profile` page.
- **Files modified:** `app/u/[handle]/page.tsx`, `app/profile/page.tsx`
- **Commit:** `004a5cd`

**2. [Rule 2 — missing critical functionality] Wall posts / endorsements / release comments had no read-side block filtering**
- **Found during:** Task 2 audit of legacy social surfaces
- **Issue:** `wall_posts`/`endorsements`/`release_comments` SELECT RLS is `USING (true)` (migration 012) with no `no_block()` wiring, unlike their INSERT policies — a pre-existing post/endorsement/comment from a since-blocked pair kept rendering even though NEW writes across that pair are rejected.
- **Fix:** `lib/social/wall.ts`, `endorsements.ts`, and `comments.ts` now accept an optional `blockedIds: Set<string>` (default empty, fully backward-compatible with any other caller) and filter rows by `author_id` before mapping to the view shape.
- **Files modified:** `lib/social/wall.ts`, `lib/social/endorsements.ts`, `lib/social/comments.ts`
- **Commit:** `004a5cd`

**3. [Rule 2 — missing critical functionality] `release_comments` INSERT had zero `no_block()` wiring at the DB layer**
- **Found during:** Task 2 audit — comparing migration 038/044's wiring list against every social-write table
- **Issue:** `rc_insert_author` (migration 012) is the one social-write policy 038/044 never touched. A fresh release comment could be written across an active block.
- **Fix:** `app/api/release-comments/route.ts` now resolves the project owner first and runs the shared `isBlockedRelativeTo` app-layer check before inserting. A migration adding `no_block()` directly to `rc_insert_author` would be the more durable DB-layer fix but requires a live `supabase db push`, which this codebase treats as human-gated (per migration 058's own header comment) — flagged as a follow-up, not applied here.
- **Files modified:** `app/api/release-comments/route.ts`
- **Commit:** `004a5cd`

**4. [Rule 1 — bug: distinguishable error shape] Follows/connections/wall/endorsements leaked a raw RLS-violation message**
- **Found during:** Task 2 audit — tracing what happens when the already-correct RLS `no_block()` wiring on these four INSERT policies actually rejects a write
- **Issue:** A rejected INSERT surfaces to the client as `error.message` straight from Postgres (something like `new row violates row-level security policy for table "follows"`) — a shape distinguishable from other failure modes (e.g. a foreign-key violation for a nonexistent target user), which risks letting a blocked party infer "I am specifically blocked" by elimination. This directly violates the plan's non-negotiable rule: no distinguishable "you are blocked" state anywhere.
- **Fix:** Added `lib/trust-safety/block-check.ts`'s `isBlockedRelativeTo()` pre-check to all four routes, returning one shared `BLOCKED_ACTION_ERROR` constant (`'This action could not be completed'`, 400) that never mentions "block" and is indistinguishable from any other generic rejected request.
- **Files modified:** `app/api/follows/route.ts`, `app/api/connections/route.ts`, `app/api/wall/route.ts`, `app/api/endorsements/route.ts`
- **Commit:** `004a5cd`

### Verified, Not Changed

- **Green Room comment/reaction/repost write paths across co-commenter blocks** — intentionally hide-not-prevent, matching migration 060's own stated design (blocks hide interactions from the blocked-pair viewer even on a shared third-party post; they do not prevent the write itself unless the block is against the post's own author, which the existing `green_room_can_view_post` check already covers). Documented, not changed — pinned with a content-assertion test.
- **Existing follows/connections rows are not severed when a block is placed afterward.** No migration or trigger anywhere in this codebase does this (038/044 only gate NEW inserts). Every actual content-visibility surface re-derives `no_block()` independently at read time, so a stale relationship row cannot leak blocked content — it can only leave a numerically-stale public follower count. Deferred as a schema-level (Rule 4) decision, not silently dropped.
- **Placements and the Network tab** needed no changes — both already correctly enforce blocks (`checkViewerBlock`/`isDestinationVisible` and 13-02's viewer-scoped blocklist filtering, respectively).

## Issues Encountered

None beyond the gaps documented above — all were closed within this plan's scope without needing a checkpoint or user decision.

## User Setup Required

None. No new environment variables or migrations. All patches are app-layer TypeScript changes against tables/RLS/RPCs that already exist and are already live (migrations 035/038/044/057/058/059/060 were all previously applied per 13-01/13-02/13-05's summaries).

## What Still Needs Manual UAT

Per this plan's own `<verify><manual>` line: **a live-DB RLS smoke test — blocked user cannot discover or directly fetch the blocker's profile.** Concretely:
1. Create two real (or seeded) accounts, A and B.
2. As A, block B (via the Network tab's Blocked action, or `POST /api/network/blocks`).
3. As B, confirm: (a) A's profile does not appear in People Search, (b) visiting `/u/{A's handle}` directly renders the same "not found" page as a nonexistent handle (not a distinguishable "you're blocked" page), (c) A does not appear in B's Green Room feed, (d) B cannot send A a new DM, follow request, or connection request (each surfaces a generic failure message, not a "blocked" message).
4. Also confirm the reverse direction (as A, visiting `/u/{B's handle}` behaves identically) — `no_block()` is bidirectional by design.

This could not be exercised as part of this plan's automated verification because it requires a live Supabase instance with real RLS/RPC execution (`no_block()`, `green_room_can_view_post()`) and two authenticated sessions — none of which exist in this repo's Jest environment (confirmed: no page-level render-test infrastructure exists anywhere in this codebase, per the coverage rationale for D1 above).

## Next Phase Readiness

- **SAFETY-01 is functionally satisfied** for every surface enumerated in the plan and the assignment's audit checklist. The one remaining DB-layer gap (`rc_insert_author` missing `no_block()`) is mitigated at the app layer and flagged as a follow-up migration, not a blocker.
- This was the last remaining plan of Phase 13 (network-trust-safety) per `.planning/STATE.md`'s handoff note. Phase-level completion / verification is the orchestrator's job, not this plan's.

---
*Phase: 13-network-trust-safety*
*Completed: 2026-07-18*

## Self-Check: PASSED

All 12 created/modified files confirmed present on disk; commit `004a5cd` confirmed present in `git log --oneline --all`; `npx jest` reports 46 suites / 450 tests passing (baseline 45/426 + 24 new); `npx tsc --noEmit` and `npm run lint` both clean.
