---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: "— Wave 4: The Green Room"
current_phase: 30
current_phase_name: the-crate-sync-library-catalogue-engine-sync-readiness
status: executed
stopped_at: "Phase 30 (The Crate — catalogue engine + Sync Readiness) EXECUTED 2026-08-13 — all 9 plans committed on feat/lane1-catalogue-menu-help (73 commits ahead of main; production build + 2141 tests + tsc green). Migrations 107 (sync_listings quality-review + staff_notes) + 108 (funun_staff adds 'anr' A&R role) + 109 (migration-005 column drift reconcile) LIVE on remote. CRATE-01..10 registered in REQUIREMENTS.md. DEPLOYED 2026-08-13 — feat fast-forwarded to main (7cb3902..64c5ca0), LIVE on funun.studio (production build green; funun.studio/help + /sync/catalog verified 200). PENDING: human staff-session UAT only — role-aware Crate staff layers, backstage curation leadership-vs-AE, tag-propose->approve, admit-409 — all session-gated, DEFERRED + tracked in 30-UAT.md (resume via /gsd-verify-work 30). NEXT: /gsd-plan-phase 31 (AE Client Workspace + Selects). NOTE: Lane 1 buyer/Crate work (Phases 22-30) ran after Phase 27; the current_phase pointer skipped 27->30. The progress: counters below are stale/approximate pending a full /gsd-docs-update recompute."
last_updated: "2026-08-13T00:00:00.000Z"
last_activity: 2026-08-13
last_activity_desc: Phase 30 executed — The Crate catalogue engine + Sync Readiness (9/9 plans, migrations 107-109 live)
progress:
  total_phases: 28
  completed_phases: 23
  total_plans: 173
  completed_plans: 167
  percent: 82
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Funūn is where an independent artist's whole career lives — and where the industry comes to find them. The Green Room turns a profile into a professional identity and a network: artists connect with producers, supervisors, A&R, and execs, and real relationships — not just tools — keep them on the platform.
**Current focus:** Phase 30 — The Crate (catalogue engine + Sync Readiness) — EXECUTED 2026-08-13; deploy + human staff-session UAT pending

## Current Position

Phase: 30 (the-crate-sync-library-catalogue-engine-sync-readiness) — EXECUTED 2026-08-13
Plan: 9 of 9 (all committed on feat/lane1-catalogue-menu-help; 73 commits ahead of main; not pushed)
Migrations 107/108/109 live on remote; CRATE-01..10 registered. DEPLOYED 2026-08-13 (main 64c5ca0 → live on funun.studio). Pending: human staff-session UAT only (30-UAT.md, DEFERRED — resume via /gsd-verify-work 30). Next: /gsd-plan-phase 31 (AE Client Workspace + Selects).
(Historical Phase 10-13 notes below retained; counters stale pending /gsd-docs-update recompute.)
(DISCOVER-04, SAFETY-01..04) satisfied per 13-VERIFICATION.md (9/9 must-haves
verified in code; 46 suites / 450+ tests, tsc/lint clean). Phases 11-13 merged
to main via PR #37 (1db5fbf, 2026-07-18). Migrations 058-061 live — 061 closed
the release_comments DB-layer no_block deferral. The 4 human UAT items (block
smoke test, admin verify negative, connections-only exclusion, hidden open_to
persistence) and Phase 12's 2 browser checks were WAIVED by owner directive
2026-07-18 without execution — recorded in 13-VERIFICATION.md frontmatter and
12-BROWSER-UAT-CHECKLIST.md; those checklists double as repro scripts if a
related issue surfaces. Remaining documented deferral: follows/connections
rows not severed on later block (read-time no_block re-derivation prevents
any content leak).
goal-verified (12-VERIFICATION.md, 21/21 requirements met). Full repo suite green
(280 tests), tsc/lint/build clean; migrations 054–057 live. NOT formally complete —
gated on: (1) two visual UAT items in 12-BROWSER-UAT-CHECKLIST.md, (2) Codex
adversarial review, (3) PR #37 merge. ROADMAP Phase 12 stays [ ] until then.
Last activity: 2026-08-09 — Phase 27 execution started
summaries backfilled; goal-backward verification written.

Note: the cumulative `progress:` counters in frontmatter are stale/approximate and will
be recomputed authoritatively by the phase-completion flow when Phase 12 is closed.

## Roadmap Snapshot (v1.2 — Phases 8–13)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 8 | Identity & Schema Foundation | (foundation — none mapped) | Structurally verified; live DB/UAT checks still recorded as human_needed |
| 9 | Rich Member Profile | PROFILE-01..09 (9) | Passed |
| 10 | Connections & Notifications | CONNECT-01,02 · NOTIF-01,02,03 (5) | Passed |
| 11 | Presence & Messaging | PRESENCE-01,02,03 · CONNECT-03,04,05 (6) | Implementation complete; human UAT pending |
| 12 | Discovery, Feed & People Search | DISCOVER-01,02,03 · FEED-01..18 (21) | Goal-verified (21/21); visual UAT + Codex review + merge pending |
| 13 | Network Tab & Trust & Safety | DISCOVER-04 · SAFETY-01,02,03,04 (5) | Not started |

Coverage: 28/28 v1 requirements mapped ✓ (Phase 8 is schema foundation with no user-facing requirement).

## Performance Metrics

**Velocity:**

- Total plans completed: 12 (Wave 3) + 14 (Wave 2) = cumulative across shipped milestones
- Average duration: -
- Total execution time: 0 hours (v1.2 not started)

**By Phase (v1.2):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 08 | 6 | - | - |
| 09 | 6 | - | - |
| 10 | TBD | - | - |
| 11 | TBD | - | - |
| 12 | TBD | - | - |
| 13 | TBD | - | - |

**Recent Trend:**

- Last 5 plans: n/a (v1.2 not started)
- Trend: n/a

*Updated after each plan completion*
| Phase 08 P01 | 12min | 2 tasks | 4 files |
| Phase 08 P02 | 8min | 2 tasks | 2 files |
| Phase 08 P03 | 6min | 1 tasks | 1 files |
| Phase 08 P04 | 9min | 2 tasks | 2 files |
| Phase 08 P05 | 20min | 2 tasks | 5 files |
| Phase 08 P06 | 30min | 4 tasks | 7 files |
| Phase 14-playback-room-refinement P01 | 10min | 4 tasks | 6 files |
| Phase 14 P02 | 2min | 2 tasks | 3 files |
| Phase 14 P03 | 2min | 2 tasks | 2 files |
| Phase 14-playback-room-refinement P04 | 8min | 3 tasks | 3 files |
| Phase 14 P05 | 5min | 3 tasks | 4 files |
| Phase 14 P06 | 424 | 3 tasks | 5 files |
| Phase 09 P01a | 15min | 2 tasks | 7 files |
| Phase 09 P02 | 12min | 2 tasks | 2 files |
| Phase 09 P03 | 25min | 3 tasks | 3 files |
| Phase 09 P04 | 25min | 3 tasks | 7 files |
| Phase 09 P05 | 15min | 3 tasks | 3 files |
| Phase 10 P01 | 2min | 4 tasks | 7 files |
| Phase 10 P02 | checkpoint-spanning | 2 tasks | 1 files |
| Phase 10 P03 | 2min | 2 tasks | 2 files |
| Phase 10 P04 | 2min | 2 tasks | 4 files |
| Phase 10 P05 | 3min | 2 tasks | 3 files |
| Phase 10 P06 | 4min | 2 tasks | 3 files |
| Phase 11 P01 | 4min | 4 tasks | 6 files |
| Phase 11 P02 | checkpoint-spanning | 2 tasks | 2 files |
| Phase 11 P03 | 28min | 6 tasks | 11 files |
| Phase 11 P04 | 8min | 3 tasks | 5 files |
| Phase 11 P05 | 28min | 3 tasks | 11 files |
| Phase 11 P06 | 8min | 2 tasks | 5 files |
| Phase 11 Review Fix | codex follow-up | 7 findings fixed | 8 files |
| Phase 13 P01 | 16min | 2 tasks | 4 files |
| Phase 13 P02 | 40min | 2 tasks | 8 files |
| Phase 13 P04 | 50min | 2 tasks | 12 files |
| Phase 13 P05 | 35min | 2 tasks | 18 files |
| Phase 13 P03 | 55min | 2 tasks | 12 files |
| Phase 17 P01 | 40min | 3 tasks | 11 files |
| Phase 17 P03 | 40min | 1 tasks | 4 files |
| Phase 17 P04 | 35min | 2 tasks | 6 files |
| Phase 17-split-sheet-esign P05 | 55min | 3 tasks | 8 files |
| Phase 17-split-sheet-esign P08 | 22min | 3 tasks | 15 files |
| Phase 17 P09 | 55min | 3 tasks | 17 files |
| Phase 17 P07 | 75min | 2 tasks | 10 files |
| Phase 18 P05 | ~35min+checkpoint | 4 tasks | 9 files |
| Phase 18 P03 | ~25min+checkpoint+gate | 4 tasks | 12 files |
| Phase 18-split-sheet-home P04 | 40min+checkpoint+gate | 4 tasks | 11 files |
| Phase 18 P01 | 25min | 4 tasks | 22 files |
| Phase 18 P02 | 20min | 3 tasks | 7 files |
| Phase 19 P01 | 5min | 3 tasks | 4 files |
| Phase 19 P02 | 35min | 2 tasks | 4 files |
| Phase 19 P03 | 25min | 3 tasks | 4 files |
| Phase 19 P04 | 12min | 3 tasks | 3 files |
| Phase 19 P05 | 25min | 3 tasks | 8 files |
| Phase 19 P06 | 15min | 2 tasks | 6 files |
| Phase 20 P01 | 20min | 2 tasks | 2 files |
| Phase 20 P02 | 6min | 3 tasks | 89 files |
| Phase 21 P01 | checkpoint-spanning | 3 tasks | 5 files |
| Phase 21 P03 | 8min | 2 tasks | 4 files |
| Phase 21-cross-account-collaboration-sheet-sync P04 | 15min | 3 tasks | 5 files |
| Phase 21-cross-account-collaboration-sheet-sync P02 | checkpoint-spanning | 3 tasks | 2 files |
| Phase 21 P05 | 27min | 3 tasks | 3 files |
| Phase 16 P00 | 20min | 3 tasks | 5 files |
| Phase 16 P03 | 15min | 3 tasks | 10 files |
| Phase 16 P04 | 35min | 3 tasks | 7 files |
| Phase 16 P06 | 30min | 3 tasks | 8 files |
| Phase 16 P07 | 14min | 3 tasks | 9 files |
| Phase 16 P05 | ~12min | 3 tasks | 11 files |
| Phase 16 P10 | ~25min (partial) | 2/3 tasks | 8 files |
| Phase 22 P01 | 3min | 2 tasks | 0 files |
| Phase 22 P02 | 45min | 3 tasks | 4 files |
| Phase 22-buyer-catalogue-light-ui P03 | 25min | 3 tasks | 7 files |
| Phase 22 P04 | 20min | 3 tasks | 7 files |
| Phase 28 P01 | 15min | 3 tasks | 5 files |
| Phase 28 P02 | ~5min | 3 tasks | 6 files |
| Phase 28 P03 | 20min | 3 tasks | 4 files |
| Phase 28 P04 | 12min | 2 tasks | 3 files |
| Phase 28 P05 | ~20min (2/3 tasks, checkpoint-blocked) | 2 tasks | 2 files |
| Phase 25 P01 | 15min | 2 tasks | 4 files |
| Phase 25 P02 | 10min | 2 tasks | 4 files |
| Phase 25 P03 | 15min | 3 tasks | 3 files |
| Phase 25 P04 | ~20min | 3 tasks | 6 files |
| Phase 25 P05 | ~20min | 3 tasks | 4 files |
| Phase 25 P06 | ~20min | 3 tasks | 5 files |
| Phase 25 P08 | ~30min | 3 tasks | 8 files |
| Phase 25 P09 | ~20min | 2 tasks | 5 files |
| Phase 25 P10 | 20min | 2 tasks | 2 files |
| Phase 23 P01 | 2min | 3 tasks | 3 files |
| Phase 23-buyer-onboarding-login-register P02 | 25min | 3 tasks | 19 files |
| Phase 23-buyer-onboarding-login-register P03 | 15min | 2 tasks | 3 files |
| Phase 23 P04 | 15min | 3 tasks | 5 files |
| Phase 23 P05 | 20min | 3 tasks | 6 files |
| Phase 23 P06 | 20min | 3 tasks | 6 files |
| Phase 23-buyer-onboarding-login-register P07 | ~20min | 3 tasks | 4 files |
| Phase 27 P01 | 15min | 2 tasks | 3 files |
| Phase 27 P02 | 10min | 3 tasks | 9 files |
| Phase 27 P03 | 8min | 2 tasks | 2 files |
| Phase 27 P04 | 35min | 3 tasks | 5 files |
| Phase 27 P05 | 15min | 2 tasks | 4 files |
| Phase 27 P07 | 20min | 2 tasks | 4 files |
| Phase 27 P06 | 25min | 2 tasks | 4 files |
| Phase 27 P08 | 30min | 3 tasks | 6 files |
| Phase 27 P09 | 20min | 2 tasks | 2 files |
| Phase 27 P10 | 25min | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work (v1.2 The Green Room):

- Wave 4 roadmap: continue phase numbering from Wave 3 — v1.2 spans Phases 8–13 (6 phases, standard granularity)
- Wave 4 roadmap: schema-first — Phase 8 is a pure-infrastructure foundation phase (no user-facing requirement); all 28 v1 requirements land in Phases 9–13
- Wave 4 roadmap: CONNECT-02 (mutual Connect relationship) is IN v1 scope per user decision (not deferred), mapped to Phase 10
- Wave 4 research: extend `artist_profiles` with a `member_type` discriminant — one unified member-identity table, NOT a parallel industry_profiles table (single most important architectural bet)
- Wave 4 research: zero new infrastructure — native Supabase Realtime Presence (presence dots / "Active now"), Postgres pg_trgm/tsvector (people search), Storage transforms (avatar/banner); only `date-fns` + `lucide-react` added
- Wave 4 research (CRITICAL): apply the migration-031 column-level REVOKE/GRANT pattern to every new/existing private column in the SAME migration that adds it — row-level RLS restricts rows, not columns
- Wave 4 research (CRITICAL): enforce block relationships in RLS via a `no_block()` SECURITY DEFINER helper on every socially-exposed table — UI-only block enforcement is bypassable via direct PostgREST
- Wave 4 research (CRITICAL): set industry-member `app_metadata.role` at `admin.createUser()` time + add a `handle_new_user()` early-return branch — post-insert UPDATE causes a phantom artist_profiles row (mirror the Wave 3 curator pattern)
- Wave 4 research (Phase 11 flag): Realtime Presence needs explicit `unsubscribe()` on unmount, `visibilitychange`-driven re-track, and a user-scoped (not tab-scoped) presence key to avoid channel leakage / ghost users / multi-tab dupes
- Wave 4 research (Phase 12 flag): keep people search server-side-only (never direct PostgREST) so `is_public` + block exclusion cannot be bypassed; validate pg_trgm/tsvector with EXPLAIN ANALYZE at scale during Phase 12 planning
- Wave 4 research: notifications are 1:1 events only (no fan-out on write); compute unread via COUNT, never a cached counter that can drift
- [Phase 08]: Migration 034 confirms `vault_projects.is_public` as the publish-status column used by the D-16 featured-spotlight integrity triggers
- [Phase 08]: Migration 034's `search_vector` wraps each `array_to_string()` call in `coalesce(..., '')` to guard against NULL `genres`/`industry_roles` arrays silently nulling the entire generated column (Rule 1 fix on the RESEARCH skeleton)
- [Phase ?]: [Phase 08 P02]: connections uses a single-row-per-pair state machine with a partial unique index (WHERE status IN ('pending','accepted')) instead of a plain UNIQUE, allowing re-request after a terminal decline/withdrawal
- [Phase ?]: [Phase 08 P02]: no_block() SECURITY DEFINER helper has EXECUTE revoked from PUBLIC/anon and granted only to authenticated, intended for RLS policy bodies not client RPC (RESEARCH Assumption A2)
- [Phase ?]: No GRANT/REVOKE touched on notifications — only ADD COLUMN and the idempotent realtime publication guard (RESEARCH Pitfall 6)
- [Phase ?]: [Phase 08 P04]: no_block() enforcement extended to dm_messages (via its parent dm_threads row) rather than the plan's minimum of 4 tables, closing a gap where a block placed after a thread exists wouldn't cover further messages in it
- [Phase ?]: [Phase 08 P04]: handle_new_user() industry branch keeps slug->ProfileRole preset mapping in TypeScript (plan 08-06), reading only two pre-built raw_user_meta_data keys (role_badges, profile_roles) rather than embedding the mapping in PL/pgSQL
- [Phase ?]: [Phase 08 P05]: Added genre + sound_identity to migration 040's GRANT SELECT list and app/u/[handle]/page.tsx's explicit column list -- buildProfileData() reads both legacy fields for the public tags display, undetected by the plan's drafted D-11 PUBLIC set
- [Phase ?]: [Phase 08 P05]: settings/page.tsx's user_profiles select('*') left on the session-bound client (separate table from artist_profiles, unaffected by migration 040) rather than swapped to createServiceClient()
- [Phase ?]: .planning/phases/08-identity-schema-foundation/08-06-SUMMARY.md
- [Phase ?]: readStems and readInstrumental mirror readMasterAudio defensive-parse pattern as single canonical API for Plans 03/04/05
- [Phase ?]: JSON-only metadata PATCH pattern: stems/instrumental routes accept JSON body, no FormData — browser already uploaded directly to Storage before calling these routes (D-07/Pitfall 1)
- [Phase ?]: buildExportManifest() pure transform — I/O stays in Plan 06 route
- [Phase ?]: archiver v8 uses ZipArchive named export — thin factory alias added
- [Phase ?]: This project's ts-jest runs transpile-only (root tsconfig.json isolatedModules: true) -- TS type errors don't fail Jest runs; schema-lyrics.test.ts's RED/GREEN contract is enforced via tsc --noEmit instead
- [Phase 09-01b]: isFeaturableProjectRow/sanitizeProfileRoles implemented to match 09-01a's RED test literal assertions (hyphenated 'not-found'/'rejected-not-public'; sanitizeProfileRoles always returns [] never null), not PLAN.md's prose description — The RED test files are the binding machine-checked contract per this plan's read_first instruction
- [Phase 09-01b]: sanitize() in app/api/profile/route.ts made async, taking (body, service, userId), returning { update } | { error, status } -- enables the featured_project_id ownership/is_public DB pre-check inside the same allowlist loop — Needed to return friendly 404/400 before the DB trigger exception reaches the client
- [Phase 09-01b]: Task 4 checkpoint approved 2026-07-12 — migration 043 (allow_resharing) confirmed live on remote via independent `npx supabase migration list` re-check; plan complete, Wave 3 (09-02/09-03/09-04) unblocked
- [Phase ?]: [Phase 09-02]: AvatarBannerUpload renders only the upload affordance overlay (not the image itself) -- Plan 05 wraps existing ProfileView banner/avatar divs in relative containers and mounts this on top, avoiding re-render of already-correct image display logic
- [Phase ?]: [Phase 09-03]: PublicTrackView is a standalone exported type (no split/splitTotal) rather than Omit<TrackView,...> — keeps the private and public track shapes fully decoupled per the plan's Warning-1 resolution
- [Phase ?]: [Phase 09-03]: allow_resharing defaults to false when null/absent on artist_profiles, gating the visitor Share affordance server-side (D-07) rather than via CSS
- [Phase 09-04]: shareOrCopy() exported from ShareButton.tsx as a shared helper so ProfileMoreMenu's Copy-profile-link item reuses the exact Web-Share/clipboard mechanism instead of re-implementing the synchronous-first-call rule
- [Phase 09-04]: Open-to editor maps 'Brand deals' to the existing 'management' OpenTo slug -- no dedicated brand_deals member exists in the union, plan authorized closest-slug substitution
- [Phase 09-04]: Added ArtistProfile.allow_resharing to types/index.ts -- migration 043's column and 09-01b's API allowlist already existed but the shared type was never extended (blocking gap, Rule 3)
- [Phase ?]: [Phase 09-05]: app/profile/page.tsx updated alongside ProfileView.tsx and app/u/[handle]/page.tsx (not in this plan's files_modified) because ProfileView's new profileUrl/allowResharing props are required -- Rule 3 blocking-issue auto-fix to keep npm run build green
- [Phase ?]: [Phase 09-05]: FeaturedPicker mounted inside the existing data.featured conditional rather than always-rendered -- owner mode derives data.featured from ALL projects (not just public), so the picker is reachable whenever the owner has at least one project
- [Phase ?]: [Phase 10-01]: new_follower notifications suppressed for connect-accept trigger-seeded follows -- only connection_accepted fires on accept (RESEARCH Open Question #1)
- [Phase ?]: [Phase 10-01]: buildConnectRequest()/buildRespondTransition() throw descriptive Error instances rather than returning an {error} result shape, matching lib/capabilities/grant.ts's established convention
- [Phase 10-02]: Migration 044 pushed live and DB-verified by human operator via supabase db push + supabase migration list (LOCAL=REMOTE for 001-044), per established schema-push convention
- [Phase 10-02]: no_block() gate on connections_insert_own closes the migration-038 gap before Phase 13 populates blocks -- inert today, DB-verified via rollback smoke test
- [Phase 10-02]: connections_seed_follows() SECURITY DEFINER trigger seeds both follows directions atomically on accept -- verified live via smoke test showing exactly 2 rows with matching timestamps
- [Phase 10]: 10-03: connect status transition uses session client only; RLS two-policy split enforces addressee-accepts / requester-withdraws (T-10-06). Service-role only for the cross-user notification insert.
- [Phase 10]: 10-03: PATCH /api/connections returns 404 on a zero-row RLS-filtered UPDATE (single round-trip, no existence leak) rather than 403.
- [Phase ?]: Plan 10-04: notification triggers are best-effort try/catch side effects AFTER the primary mutation (never block follow/post/endorse/comment)
- [Phase ?]: Plan 10-04: release_comment resolves the project owner (vault_projects.user_id) and suppresses self-comment notifications
- [Phase 10-05]: NotificationBell subscribes to notifications Realtime GLOBALLY (stable notifications-${userId} channel, memoized client, removeChannel cleanup) — not panel-gated like DmWidget (D-13); unread badge always from a fresh COUNT fetch, never client-incremented
- [Phase 10-05]: app/(artist)/layout.tsx gains a net-new sticky authenticated header row (Pitfall 4 — no topbar existed) mounting the bell once so the Realtime subscription is app-wide
- [Phase 10-05]: NotificationPanel resolves connection_request rows in place via a __resolved__ sentinel type; cursor pagination uses IntersectionObserver + before=<created_at>, not offset
- [Phase 10-06]: ConnectButton owns the primary gradient slot and Follow stays ghost — satisfies the UI-SPEC visual-weight decision without a second gradient in the row; declined/withdrawn read as `none` (state query filters to pending/accepted) enabling re-request via the partial unique index; #wall/#endorsements anchors use scroll-mt-88 so the sticky header doesn't overlap deep-link targets; connect state derived from the connections table via connections_select_participant RLS mirroring the follow derivation
- [Phase 10 UAT]: Live-backend UAT completed 2026-07-13; 8/8 checks passed after fixing FollowButton's ghost styling and replacing notification pagination's created_at-only cursor with a compound created_at/id cursor for same-timestamp rows
- [Phase 10 WR-04]: PATCH /api/connections now filters transition updates with `status = 'pending'`, so double-submit/retry on an already accepted/declined/withdrawn row returns 404 and cannot emit duplicate `connection_accepted` notifications
- [Phase 13-01]: Trust/safety contracts + migration 058 drafted: reports table private-by-default with server-owned writes (mirrors migration 056); verification_audit_log admin-only via zero-policy RLS; profile_visibility/open_to_visibility additive columns
- [Phase ?]: 13-02: Added a scoped POST/DELETE /api/network/blocks endpoint so the Network tab's Block/unblock acceptance criterion is real, not UI-only; 13-03 should build on it rather than duplicate it.
- [Phase ?]: 13-02: Omitted the 'Remove' action for already-accepted connections - no RLS transition exists from accepted to a terminal state today; adding one is a schema change out of scope.
- [Phase ?]: 13-02: Following/followers tabs exclude accepted connections (relationship-priority rule matching lib/green-room/discover.ts precedent) so a mutual connection isn't also shown as following/follower noise.
- [Phase 13]: 13-04: report-target visibility mirrors currently-enforced rules (is_public/thread-participancy/green_room_can_view_post), not 13-05's not-yet-enforced profile_visibility column
- [Phase 13]: 13-04: admin content-action routing reuses existing hide/remove/pause columns (moderation_status, deleted_at, placements status) instead of inventing new moderation state
- [Phase 13]: 13-04: fixed jest.config.js worktree-self-exclusion bug (testPathIgnorePatterns) that made it impossible to run tests from inside an isolated executor worktree
- [Phase 13]: 13-05: verification grant/revoke audits every action unconditionally (even idempotent re-grants), since a single verified_at column cannot capture repeated admin actions on its own
- [Phase 13]: 13-05: connections_only profiles 404 identically to private/nonexistent ones on the public profile route and are excluded entirely from People Search for non-connections — no distinguishable teaser state
- [Phase 13]: 13-05: hidden open_to blanks the rendered/returned data only; the stored setting is never touched, so re-enabling visibility restores prior selections exactly
- [Phase ?]: 13-03: release_comments (rc_insert_author) had no no_block() DB wiring at all — mitigated at the app layer (isBlockedRelativeTo pre-check); a migration to close the DB-layer gap is a follow-up, not applied by this executor (live db push is human-gated)
- [Phase ?]: 13-03: existing follows/connections rows are not severed when a block is placed afterward — no precedent trigger exists; every content-read surface re-derives no_block() independently, so this is a data-hygiene deferral, not a leak
- [Phase 17]: 17-01: DocuSeal webhook signature format defined as {timestampMs}.{hexHmac} HMAC-SHA256; documented for 17-07 to verify against live payload
- [Phase 17]: 17-01: SPLIT_SHEET_TIER_MAP is the single source of truth both the DB trigger (17-02) and TS twin must consume to prevent tier-parity drift
- [Phase 17]: 17-01: VOIDED_ENVELOPES_COUNT_TOWARD_CAP is a single named flag (currently false) pending Pete's DocuSeal void-billing provider-verification pass
- [Phase 17-03]: partyRoleTag(index) = Party${index+1} — deterministic, DocuSeal-safe role tag shared by the PDF's literal signature text tag and (in 17-06) the mint route's submitters[].role
- [Phase 17-03]: jest.config.js + new jest.babel-plugins.js: added a scoped ESM transform (babel-jest + next/babel) and an import.meta.url shim for @react-pdf/renderer's ESM-only dependency tree (first exercised by a test in this codebase) — no new npm packages installed; full suite 47->48 suites / 455->462 tests, zero regressions
- [Phase ?]: 17-04: resolvePartyPhase() splits /approve/[token] gating into token-validity vs. lifecycle-phase questions, fixing RESEARCH Pitfall 1 (approved parties no longer see 'expired')
- [Phase ?]: 17-04: first_viewed_at stamp implemented in app/approve/[token]/page.tsx (GET render) rather than the POST-only approve route named in the plan, since a page-visit signal must fire on page load
- [Phase 17-05]: document_data.split_sheet_id joins a fanned-out vault_documents row back to its split_sheets row (no FK on JSONB) — buildFanoutRows writes it, Contract Locker's standalone-row builder and the attach route read it
- [Phase 17-05]: Attach route requires split_sheets.status='executed' before allowing attach (Rule 2 — required by the plan's own must_haves truth)
- [Phase 17-05]: Reconcile route/UI use a GET-computes/POST-confirms split so composers[] write-back can only happen via an explicit {action:'confirm'} request, never silently
- [Phase 17-08]: SHIPPED-BUG FIX — @react-pdf/renderer's standard-14 fonts (WinAnsi encoding) silently dropped/mangled non-Latin-1 characters in every generated PDF (ć dropped, ū mangled: "Funūn"→"Funkn"); found at the 2026-07-20 provider-verification gate. Fixed by vendoring Noto Sans (SIL OFL) behind a single registerFunuunPdfFonts() module all three renderers import; regression proven with exact-string extraction against real rendered PDF bytes (no PDF-parsing dependency — Node zlib only). No backfill of previously generated documents; they regenerate correctly on next export.
- [Phase 17-08]: initiatorName widened to string | null | undefined on SplitSheetDocument/renderSplitSheet — the dangling "Prepared by " label bug (P17-08 bug 2) is now a representable, tested type state rather than a caller convention.
- [Phase 17]: 17-09 followed 17-SPLIT-SHEET-TEMPLATE-SPEC.md as authoritative over the plan body: songwriting/publishing-only document, no rights_scope/master-share/sample-disclosure/ISWC-ISRC columns — Approved by Pete 2026-07-20; a fixed master-ownership Guidance Note replaces a master-split section entirely
- [Phase 17]: Migration 063 adds administrator to artist_profiles, split_sheet_parties, split_sheets, and collaborators (6 columns total), all nullable/additive — administrator is the only decision-3a prefill source with no existing home; artist_profiles.administrator inherits migration 040's private-by-default column-privilege posture with no new REVOKE/GRANT
- [Phase 17]: ESIGN-16/ESIGN-17 left un-marked-complete in REQUIREMENTS.md pending human review — ESIGN-16 requirement text predates the approved spec (references excluded scope/sample/ISWC-ISRC elements); ESIGN-17 requirement describes attorney review having occurred, which has not happened yet (COUNSEL_REVIEW_STATUS unreviewed)
- [Phase 18]: [Phase 18-05]: Migration 066 (collaborators.legal_name/status, artist_profiles.legal_name_locked_at, two status-confirmation triggers) pushed live and DB-verified via npx supabase migration list (LOCAL=REMOTE 001-066); direct SQL introspection unavailable in push environment, migration-list parity used as recorded evidence per established convention
- [Phase 18]: [Phase 18-05]: resolvePartyIdentity() overwrite semantics (not COALESCE) live only in the new lib/split-sheets/live-identity.ts module -- backfill_claimed_collaborators()/claim_collaborators() (026) stay untouched and additive for their own callers
- [Phase 18]: 18-03: Migration 067 (split_sheets.track_id/source, split_sheet_attachments join table with two NULL-comparison-safe partial unique indexes, opposite-cascade FKs) applied live via supabase db push; LOCAL=REMOTE migration-list parity confirmed for 001-067
- [Phase 18]: 18-03: attach v2 removes the executed-only status gate entirely (P18-04) and, on a second/third project attach, updates the caller's primary vault_documents row only when it is unattached or unchanged -- a repeat attach never moves or duplicates that document
- [Phase 18]: 18-03: fuzzy suggestTrackMatches() reuses reconciliation.ts's normalizeName rather than a second normalization, and marks a leading candidate only above a confidence threshold so a renamed track never produces a confident wrong suggestion
- [Phase ?]: 18-04: coverage-based readiness replaces all-or-nothing split-sheet gate — proportional points (ROUND(AVG)), strict ALL-covered status (P18-16 supersedes MIN-for-points); migration 068 live, LOCAL=REMOTE 001-068
- [Phase ?]: 18-04: tracksNeedingSheet() returns every track, no solo-written exemption (P18-15) — no acknowledgment field/route/UI anywhere in the codebase
- [Phase ?]: 18-04: shared coverage-fixtures.ts scenario table is the parity anchor for the TypeScript derivation and migration 068's SQL twin, structurally proxy-tested since Jest cannot execute PL/pgSQL
- [Phase 18]: PartyPicker is a wholly separate component from CollaboratorPicker.tsx (option b) -- zero risk to MetadataStudio's untested ComposerEditor caller
- [Phase 18]: The initiator's self-row identity in edit mode is always re-derived fresh from current artist_profiles, never matched against a persisted party-1 row by heuristic
- [Phase 18]: A non-initiator account-holding party visiting /split-sheets/[id] gets a read-only summary, not the full interactive builder -- only the initiator can PATCH server-side
- [Phase ?]: buildAttentionSections() reuses 18-01's fetchSplitSheetsForUser() merge directly rather than re-implementing the initiated+party-of query a second time in lib/contracts/locker-rows.ts
- [Phase ?]: 'Songs with no sheet' and 'unattached executed' are computed from the fetched sheets' own track_id/vault_project_id origin fields, not a second split_sheet_attachments join, keeping the pure attention module simple
- [Phase ?]: [Phase 19]: 19-01: lib/split-sheets/live-identity.test.ts already existed (Phase 18-05) and already fully covers R3's freeze-boundary acceptance criteria -- no new file/commit needed for Task 3, re-verified green with zero source changes
- [Phase ?]: [Phase 19]: 19-01: semantic-blank.ts and claim-prefill.ts twins take an explicit RescueKind ('text'|'json') parameter rather than runtime type-detection, so one predicate pair serves both plain-text fields and the JSONB mailing_address field without a generic isEmpty() utility
- [Phase ?]: [Phase 19]: 19-02: Cloned licenseeNoteBox/licenseeNote with long-hand border props instead of reusing guidanceBox's borderLeft shorthand, to avoid colliding with the existing Guidance Notes test's style-based View selector
- [Phase ?]: [Phase 19]: 19-02: Rendered NOTE_TO_LICENSEES inside SplitApprovalView's PageShell (single choke point across all phase branches) rather than threading a new prop through app/approve/[token]/page.tsx, since the note is a static constant, not request-scoped data
- [Phase ?]: [Phase 19]: 19-03: correction-flag route resolves the claimed party two ways (party.user_id direct link OR party.collaborator_id -> collaborators.claimed_by), matching the existing resolvePartyIdentity batch-loader pattern in split-sheets/[id]/page.tsx rather than inventing a new resolution path
- [Phase ?]: [Phase 19]: 19-03: owner email for the R4 dual notification resolved via service.auth.admin.getUserById(initiator_user_id), reusing the pattern already established in app/api/approve/[token]/route.ts
- [Phase ?]: [Phase 19]: 19-04: Migration 071's stranded-value audit count is computed BEFORE the rescue UPDATE runs (not after, as RESEARCH.md's illustrative snippet's literal statement order would produce a misleading ~0 post-rescue count)
- [Phase ?]: [Phase 19]: 19-04: R2 reverse pre-fill (migration 072) scoped to the 5 fields shared by artist_profiles and collaborators (pro/ipi/publisher/contact_phone/mailing_address) -- bio/artist_name stay rescue-only (071), never claim-pre-filled
- [Phase ?]: [Phase 19]: 19-04: backfill_claimed_collaborators() re-pointed to artist_profiles but does NOT receive the R2 reverse pre-fill -- that logic lives exclusively in claim_collaborators(), matching the plan/SPEC's claim-path-only scope
- [Phase ?]: 19-05: claim_prefill imports ClaimPrefillEntry from lib/profile/claim-prefill.ts rather than re-declaring the shape, keeping migration 072 and the confirm UI from drifting
- [Phase ?]: 19-05: CLAIM_PREFILL_FIELDS covers pro/ipi/publisher/administrator/contact_phone/mailing_address in both ProfileForm.tsx and api/profile/route.ts, even though migration 072's reverse pre-fill only populates 5 of the 6 today -- forward-compatible, no badge renders for administrator until/if 072 is extended
- [Phase 19]: 19-06: Locker flag entry targets the viewer's own resolved party id once per sheet card (not per-party-row) -- functionally satisfies R4's own-row-only scoping without a second client lookup
- [Phase 19]: 19-06: A non-owner claimed party's document row for an ATTACHED executed sheet is not currently reachable in Contract Locker (pre-existing project-nested query gap, not fixed by this plan) -- executed-sheet flag coverage is scoped to standalone/reachable rows
- [Phase ?]: Included migration 058's profile_visibility/open_to_visibility columns in the 076 view's SELECT grant list, beyond the plan's literal 040/043/054 wording, after direct grep confirmed 058 is a real 4th grant-extending migration
- [Phase ?]: Left prose comments mentioning artist_profiles unchanged per plan instruction, even where they document a since-renamed call site — D-03 explicitly scopes the rename to query strings and the type identifier, not documentation prose
- [Phase ?]: Left migration-content assertion tests (migration-054/055/057/058/063/066, claim-collaborators-rpc) unchanged — They assert against the literal text of immutable historical migration files, which legitimately still say artist_profiles
- [Phase ?]: Left lib/trust-safety/reports.ts's local ArtistProfileVisRow type name unchanged — Incidental local identifier unrelated to the imported types/index.ts type; word-boundary rename correctly did not touch it
- [Phase 21]: 21-01: Editor/co-owner write scope permitted at RLS layer but the app/api/vault/** ownership-check API-route audit is DEFERRED to a later phase -- v1 functional edit affordances ship owner-path only
- [Phase 21]: 21-01: Guest-list management API (app/api/vault/[projectId]/members/route.ts) DEFERRED -- only membership write path in v1 is the SECURITY DEFINER auto-membership trigger (Plan 21-02) plus migration 078's owner backfill
- [Phase 21]: 21-01: Migration 078 (project_members + RLS rewrite) pushed live and human-approved 2026-08-02 -- LOCAL=REMOTE through 078, PostgREST schema reloaded, full RLS access-matrix smoke passed
- [Phase ?]: [Phase 21]: 21-03: SharedProjectBadge is rendered from the opposite corner (top-right) of the existing status chip (top-left) so neither idiom collides with the readiness ring (bottom-right); shared lane excludes memberships by both role='owner' filter and an ownedProjectIds set-difference
- [Phase ?]: [Phase 21]: 21-03: First .test.tsx in the repo — no jsdom/testing-library installed (jest testEnvironment is node); used react-dom/server renderToStaticMarkup + string assertions instead of adding a new test dependency
- [Phase ?]: [Phase 21]: 21-04: mapComposersToParties excludes role='producer' composer rows -- a producer credit added directly in Metadata Studio (never negotiated on the sheet) is the project-only case; a producer who IS a sheet party still syncs via name match
- [Phase ?]: [Phase 21]: 21-04: reverse sync only refreshes an already name-matched party (role/pro/ipi/split) -- never inserts a new party from a project-side composer edit, so no new money-mutation path is created
- [Phase ?]: [Phase 21]: 21-02: Migration 079 (auto-membership SECURITY DEFINER trigger keyed off collaborators.claimed_by, gated to linked non-draft sheets, viewer-only, idempotent via ON CONFLICT DO NOTHING) pushed live 2026-08-02 alongside 077/078 -- LOCAL=REMOTE through 079, PostgREST schema-cache recognizes project_members (200 OK read); full behavioral RLS/auto-membership smoke (three orderings + draft-gate + idempotency vs real second accounts) is OUTSTANDING, not yet executed
- [Phase 21]: buildNextMoves() classifies pinned rows by sheet.status (mirroring buildAttentionSections' AWAITING_SIGNATURE_STATUSES bucket), gated on viewer being initiator/named party
- [Phase 21]: Your next moves feed renders regardless of owned-project count since the inclusion rule is cross-account waiting-on-you, not ownership
- [Phase ?]: 16-00: built the first controlled mood vocabulary in the codebase (MOOD_VALUES, 40 terms) — antenna_opportunities.mood_tags and SoundIdentity.mood_tags stay free-form string[] until 16-05/Antenna converge onto it
- [Phase ?]: 16-00: descriptorEnergy/descriptorVocal stored as plain string on StudioTrack (matching the existing originalPurpose convention), not the narrow EnergyLevel/VocalType union — server sanitizeDescriptors() is the single validation authority
- [Phase ?]: 16-01/02/11: Operator approved live push of migrations 080-082 together (LOCAL=REMOTE through 082, buyer_orgs schema recognized via service-role read) — Wave 0 (16-00/01/02/11) is now complete; behavioral adversarial checks (buyer stage-UPDATE denial, admin-column exclusion, phantom-row guard, UPC/GRid generation safety) are DEFERRED pending a real buyer account from Wave 2 buyer signup
- [Phase ?]: 16-01: added is_buyer_org_member() SECURITY DEFINER helper (Rule 2) to buyer_members/buyer_orgs RLS, avoiding a 42P17 self-referential-recursion class already fixed at migrations 064/078
- [Phase ?]: 16-02: license_requests SELECT column-grant excludes admin_notes/owner_id/commission_pct/artist_net_cents; artist-visibility arm scoped by explicit vault_projects.user_id match (C4), not a bare RLS-visible subquery, since migration 078 widened vault_projects SELECT to owner-OR-member
- [Phase ?]: 16-11: user_profiles.isni kept PRIVATE (consistent with pro/ipi/mlc_id); platform_identifier_config.grid_issuer_code seeded NULL since Funun is not yet IFPI-registered -- platform GRid generation is structurally unavailable until that registration lands
- [Phase ?]: 16-03: Added GET /api/admin/buyer-orgs/[id]/members (Rule 2) so the admin per-org member list has a real data source; POST was the only handler explicitly named in the plan.
- [Phase ?]: 16-03: Deliberately left app/(admin)/layout.tsx untouched -- 16-07 (wave 3, depends_on 16-03) is the declared sole owner of that file this wave and adds the Buyer orgs sidebar link together with its own Deals entry.
- [Phase ?]: 16-03: plan frontmatter references requirements BUYER-03/BUYER-04/BUYER-06 but REQUIREMENTS.md still has no Phase 16 section registering them (requirements.mark-complete returned not_found for all 3) -- same pre-existing gap noted at 16-00/16-01/16-02/16-11, deferred to the same future /gsd-docs-update pass, not fixed by this executor.
- [Phase 16]: 16-04: Deals room artist-visibility scoping resolves owned vault_projects id set first, then filters license_requests to that set (never a bare vault_projects-visible subquery) -- migration 078 widened vault_projects SELECT to owner-OR-member (C4)
- [Phase 16]: 16-04: Requester individual display name resolved via service.auth.admin.getUserById().user_metadata.display_name (not a table read) -- buyer accounts have no user_profiles row (D-11 fully-separate-account model)
- [Phase 16]: 16-04: licensing route ownership check returns 404 (not 403) for a non-owned/nonexistent project, mirroring the app/api/connections PATCH 404-on-zero-rows precedent (10-03)
- [Phase 16]: 16-06: Routes built under app/(buyer-portal)/buyers/requests/* (not the plan's literal path) to match BuyerPortalNav's established /buyers/requests URL contract from 16-03. — Rule 1 routing bug fix — the literal plan path would have shipped a dead nav link.
- [Phase 16]: 16-06: Added lib/deals/request-target.ts (authorizeRequestTarget) shared by the POST route and the composer, standing in for 16-05's not-yet-built isRightsReady. — Rule 2 — avoids duplicating the security-critical rights-ready/visibility/block gate across two call sites.
- [Phase 16]: No migration for admin-created manual-intake provenance — recorded as a tagged line inside admin_notes rather than a new column.
- [Phase 16]: Manual intake (POST /api/admin/deals) deliberately re-implemented rather than sharing code with POST /api/buyer/requests, mirroring the existing admin-route-mirrors-member-route precedent.
- [Phase ?]: [Phase 16]: 16-05: isRightsReady/buildCatalogFilter (lib/deals/catalog.ts) is the single tunable rights-ready + filter-vocabulary helper; buyer_shortlists RLS reuses is_buyer_org_member().
- [Phase ?]: [Phase 16]: 16-05: Catalog/shortlists pages built under app/(buyer-portal)/buyers/* (Rule 1) matching BuyerPortalNav's URL contract; catalog query I/O extracted to lib/deals/catalog-query.ts (Rule 3) after a route.ts non-handler-export build failure.
- [Phase ?]: [Phase 16]: 16-05: Migration 083 (buyer_shortlists + tracks.metadata GIN index) approved and live -- LOCAL=REMOTE through 083, service-role read 200 -- schema-level only; buyer-session adversarial RLS check (42501 write denial, cross-org zero-rows) is OUTSTANDING/DEFERRED pending a real buyer account.
- [Phase 16]: 16-10 executed as a deliberate PARTIAL: Task 2 (GTM metrics module + admin dashboard) and Task 3 (REQUIREMENTS.md registration of all 34 Phase 16 IDs) built and committed; Task 1 (export-pack delivery unlock) explicitly deferred alongside 16-09's undecided signing model. — isDeliveryUnlocked requires a signed-AND-paid deal; 16-09 (signing) is deferred and 16-08 (payment) awaits the owner's Stripe setup + migration 084 push, so no real signed-contract state exists yet to build or test delivery against.
- [Phase ?]: 22-01: Record-only baseline plan for buyer catalogue slices 1/2a/2b - no source code changed, existing CatalogBrowserLight.tsx/catalog-sample.ts/catalog page verified present+wired+type-clean; four deferrals recorded (preview audio, logo, Similarity/Playlists tabs, live-data/inclusion gate)
- [Phase ?]: 22-02: buildRequestBody strips currency formatting client-side and rounds to integer cents rather than requiring a pre-cleaned numeric input — Matches the modal's free-text Offer field UX while still producing the route's required integer budget_cents
- [Phase ?]: 22-02: Media has no home in license_requests, so it folds into buyer_notes as an optional 'Media: {value}' line instead of a schema change — Avoids a migration for a single display-only dimension the route doesn't need to validate
- [Phase ?]: 22-02: SAMPLE_CATALOG_ROWS fixture rows carry synthetic vaultProjectId/tracks; a submit over the fixture is expected to 404 at authorizeRequestTarget by design — Correct-by-construction per T-22-02-02 — real deals require live rows (slice 1.5 / 22-05)
- [Phase ?]: 22-02: plan frontmatter references requirement license-request-wiring but REQUIREMENTS.md has no Phase 22 section registering it (requirements.mark-complete returned not_found) — Same pre-existing gap noted at 16-03/16-11/22-01 -- deferred to a future /gsd-docs-update pass, not fixed by this executor (out of this plan's scope)
- [Phase 22]: 22-03: Dark ink family (--ink/--ink-2/--ink-3) uses lavender tones rather than plain white, per the plan's explicit fallback instruction -- distinct from the artist dark theme's white-primary convention
- [Phase 22]: 22-03: BuyerTopNav carries its own scoped nav CSS (duplicated from CatalogBrowserLight's original .top/.navlink/brandmark rules) rather than folding into FNBL_CSS -- FNBL_CSS stays tokens-only; the nav renders on shortlists/requests pages where CatalogBrowserLight never mounts
- [Phase 22]: 22-03: plan frontmatter references requirements nav-reconciliation/theme-light-buyer/dark-toggle but REQUIREMENTS.md has no Phase 22 section registering them (requirements.mark-complete returned not_found for all 3) -- same pre-existing gap noted at 22-01/22-02, deferred to a future /gsd-docs-update pass, not fixed by this executor
- [Phase ?]: Indigo-accent CTA/badge pills use border-[line] bg-[wash-2] text-[indigo] hover:bg-[wash], matching CatalogBrowserLight's own .lic/.chip idiom — Keeps the light re-theme visually consistent with the existing catalogue surface rather than inventing a new indigo-tinted surface not present in FNBL_CSS
- [Phase ?]: terms_agreed/contract deal-stage badges use the neutral wash/line surface with only the accent text color changed (indigo/fuchsia) — FNBL_CSS has no dedicated indigo-bg/indigo-line or fuchsia-bg/fuchsia-line token families -- only ok/part/req have full bg/line/fg triples
- [Phase 28]: 28-01: capability_grants stays authoritative for capability checks; member_type kept in lockstep going forward (other 6+ member_type read sites deferred, mirroring the Phase 19/20 blast-radius split)
- [Phase 28]: 28-01: industry_profiles table left untouched (out of scope); only the Antenna route's dead read of it was removed
- [Phase ?]: Green Room app-layer gate reads member_type only (never an independent capability_grants read), matching lib/green-room/discover.ts's existing convention (28-02)
- [Phase ?]: FUNUN_STAFF_EMAIL_DOMAINS is an inert/forward-safe email-domain heuristic standing in for the unshipped Phase 25 funun_staff table; blocks @funun.studio from posting (INDUSTRY-07, 28-02)
- [Phase ?]: [Phase 28]: 28-03: provisionIndustryAccount() extracted into lib/industry/createIndustryMember.ts (not a new module) as the shared email-free account-creation primitive; the curator claim route's DuplicateIndustryMemberError catch resolves the existing account's id via generateLink's returned user, matching the pre-existing existing-account fallback shape
- [Phase 28]: Curator directory relocation kept navigation-only: PitchPlug link added with zero curator data wiring; admin /admin/curators route href unchanged, only label relabeled to PitchPlug · Curators
- [Phase 28]: 28-05: migration 085's capability_grants insert lives inside handle_new_user()'s SECURITY DEFINER trigger (not app code) so it is the single writer, atomic with the user_profiles insert, and covers both the admin-invite and repointed curator-claim (28-03) creation paths for free; source='signup' for the trigger write, source='backfill' for the idempotent existing-account backfill (both already valid per migration 042's CHECK, no new enum value)
- [Phase 28]: 28-05: green_room_posts_insert_own RLS policy DROP+CREATE replaced (not stacked) with a member_type IN ('artist','industry') EXISTS gate alongside the existing author_id check — the DB-authoritative backstop mirroring 28-02's app-layer greenRoomPosterGate()
- [Phase 25]: requireStaff() is the single authority every staff route calls before createServiceClient() -- no parallel auth path (D-01)
- [Phase 25]: is_admin===true treated as an implicit leadership fallback (D-02/A1) so the owner's bootstrap account isn't locked out on deploy
- [Phase ?]: [Phase 25]: 25-02: logStaffAction is the ONE write-through call every staff write (25-04, 25-05) will invoke -- centralizes D-04's audit requirement into a single code-review surface
- [Phase ?]: [Phase 25]: 25-02: logStaffAction never throws -- mirrors createNotification's { ok, error } convention; the caller decides whether a log failure blocks the primary write
- [Phase ?]: [Phase 25]: 25-02: Notification builders reuse the existing notifications table + createNotification (no new table/queue) -- notifications.type is unconstrained TEXT so 'ae_assigned'/'lead_routed' need no migration
- [Phase ?]: [Phase 25]: 25-02: Phase 23's buyer-signup lead-routing call site is documented in-file, not wired -- that mutation has not landed yet; 25-05 wires buildAeAssignedNotification after an AE (re)assignment write instead
- [Phase ?]: 25-03: Migrations authored as 089/090 (not 085/086) -- Phase 28 already landed 085-088 live on this branch; renumbering already reflected in the plan frontmatter/critical_constraints
- [Phase ?]: 25-03: funun_staff.staff_role stays a DISPLAY COPY of the authoritative app_metadata.staff_role (Pitfall 1) -- documented in the table COMMENT so a future role-change route writes both in the same handler
- [Phase ?]: 25-03: buyer_orgs.ae_user_id deliberately omitted from migration 080's authenticated GRANT SELECT allowlist (Pitfall 2, D-03) -- private/staff-only by construction, documented in the column COMMENT
- [Phase ?]: 25-03: plan frontmatter references requirement TEAM-02 but REQUIREMENTS.md has no Phase 25 section registering it (requirements.mark-complete returned not_found) -- same pre-existing gap noted at Phases 16/22/28, deferred to a future /gsd-docs-update pass, not fixed by this executor
- [Phase ?]: [Phase 25]: 25-04: createStaffAccount cleans up the phantom user_profiles/subscriptions rows handle_new_user() creates for staff accounts (migration 086 has no staff early-return branch) -- Rule 2, mirrors createBuyerAccount's identical buyer-branch-timing reconciliation
- [Phase ?]: [Phase 25]: 25-04: funun_staff has no invited_by column (migration 089 as authored) -- omitted from the insert; invitedBy still flows into app_metadata.user_metadata.invited_by for provenance
- [Phase ?]: [Phase 25]: 25-04: deactivation semantics -- funun_staff has no active/deactivated_at column (migration 089 unpushed, out of this plan's edit scope), so PATCH { active:false } clears app_metadata.staff_role to null via the same admin.updateUserById() call used for role change -- a real, immediate access revocation with zero schema change; funun_staff.staff_role keeps its last-known value as a historical display record only
- [Phase 25]: 25-05: STAFF_EDITABLE_BUYER_ORG_FIELDS = ['name'] only for v1 (A3); ae_user_id is never in the edit allowlist, closing AE self-assignment (T-25-19)
- [Phase 25]: 25-05: scope denial on PATCH /api/admin/buyer-orgs/[id] returns 404 (not 403) for both an unassigned-to-this-AE org and a nonexistent org, avoiding existence leakage
- [Phase 25]: 25-05: GET /api/admin/buyer-orgs scoped identically to the write path — non-leadership callers get .eq('ae_user_id', caller) appended, leadership stays unscoped (Pitfall 4)
- [Phase ?]: [Phase 25]: 25-06: layout gate widened to any staff role; leadership-only sidebar links + Team Members management link wrapped in isLeadership conditional; My Client Partners + Directory render for every staff role
- [Phase ?]: [Phase 25]: 25-06: /admin/team-members and /admin/my-client-partners each carry their own inline per-page staff/leadership self-guard, matching the codebase convention of not relying on the layout gate alone (Pitfall 3)
- [Phase ?]: [Phase 25]: 25-06: grep-confirmed every pre-existing /admin/* page already had a leadership self-guard before this plan ran -- no page needed one added
- [Phase ?]: [Phase 25]: 25-08: Console token names/values are direct 1:1 lifts from tailwind.config.ts's existing dark colors (ink/card/card2/lav/lavdim/hair/hairstrong) + the verified FNBL_CSS light palette -- zero new colors invented
- [Phase ?]: [Phase 25]: 25-08: SignOutButton.tsx (shared with ArtistNav) left unmodified -- wrapped in a Tailwind arbitrary-child-selector override inside the admin layout only, avoiding a cross-context shared-component edit
- [Phase ?]: [Phase 25]: 25-08: team-members/page.tsx and my-client-partners/page.tsx h1 headlines tokenized (Rule 2) though outside this task's declared files_modified -- required by the plan's own both-themes truth
- [Phase 25]: 25-09: changedAwayFromPrevAe = prevAeUserId !== null && prevAeUserId !== aeUserId — one predicate covers reassign/unassign-with-prior-AE/same-AE-reconfirm for the /ae route's notify-both behavior, reusing the single existing assign_ae audit path
- [Phase 25]: 25-09: app/(admin)/admin/buyer-orgs/page.tsx stays leadership-only (getStaffRole(user)==='leadership' self-guard, same scope as the pre-plan is_admin check) — AE/BD already have their own scoped queue at /admin/my-client-partners (25-06)
- [Phase 25]: Gate uses getStaffRole(user) === null (admits leadership/AE/BD) rather than requireStaff(['leadership']) used by the management page — the all-roles/read-only distinction for the Team Member Directory
- [Phase 23]: 23-01: status/use_case granted to authenticated (buyer-readable); contact_name/contact_email/contact_phone/contact_role/source kept staff-only in migration 095, mirroring migration 090's ae_user_id precedent
- [Phase 23]: 23-01: BUYER_ORG_STATUS_VALUES tuple exported from lib/buyers/schema.ts as the single source of truth for status validation, mirroring the existing BUYER_ROLE_VALUES convention
- [Phase ?]: [Phase 23]: 23-02: /sync layout stops force-redirecting logged-out visitors; auth moved into each authenticated sub-page (catalog/shortlists/requests self-gate to /sync/access) so a future public page under the same layout needs no auth check at all
- [Phase ?]: [Phase 23]: 23-02: /sync landing page's featured teaser uses SAMPLE_CATALOG_ROWS directly (not loadCatalogPage) to avoid RESEARCH.md Pitfall 3's anon-viewer UUID crash -- that fix is 23-03's scope
- [Phase ?]: [Phase 23]: 23-02: plan frontmatter references requirement SYNC-09 but REQUIREMENTS.md has no Phase 23 section registering it (requirements.mark-complete returned not_found) -- same pre-existing gap noted at 16-03/22-01/22-02/22-03, deferred to a future /gsd-docs-update pass, not fixed by this executor
- [Phase ?]: [Phase 23]: 23-03: loadCatalogPage's buyerUserId widened to string | null on the single implementation (no parallel public function) -- anonymous callers skip loadBlockedIds entirely rather than passing an empty sentinel into its uuid .or() filter (RESEARCH Pitfall 3)
- [Phase ?]: [Phase 23]: 23-03: public /sync/catalog render uses CatalogBrowserLight isPublic (its own self-contained header + Login button), not embedded -- BuyerTopNav stays authenticated-member-only
- [Phase ?]: [Phase 23]: 23-04: buildRegisterPayload allowlists exactly company/contactName/email/phone/role/useCase/source, never spreading the request body; invalid/missing source falls back to register rather than erroring
- [Phase ?]: [Phase 23]: 23-04: routeLead (best-effort lead routing) fires on both the success path and the caught-DuplicateBuyerAccountError path, since buyer_orgs row creation is unconditional either way
- [Phase ?]: [Phase 23]: 23-04: Duplicate-email registration returns the exact same 201 shape as success (account-enumeration avoidance), leaving the created org row in place; rate limiting is an in-memory per-key Map (IP + email, 5/15min), explicitly beta-acceptable per plan directive
- [Phase ?]: 23-05: postSignInPath buyer branch checked before staff/default resolution (a buyer is never staff, per plan's literal precedence instruction)
- [Phase ?]: 23-05: app/auth/callback/route.ts passes the raw (un-defaulted) next param into postSignInPath rather than pre-defaulting to /vault -- pre-defaulting would make the explicit-next branch always win and defeat role-based fallback for buyer/staff callbacks with no explicit next
- [Phase ?]: 23-05: createBuyerAccount's recovery generateLink call needed an explicit options.redirectTo (/auth/callback?next=/update-password), mirroring forgot-password's own recovery redirectTo -- not named in the plan's action text but required to satisfy the task's own done criteria
- [Phase ?]: 23-06: GET /api/admin/buyer-orgs's request param made required (Request), not optional -- Next.js typed-route checker rejects Request|undefined; test call sites updated to pass a Request
- [Phase ?]: 23-06: cross-company purchase visibility (SYNC-10) confirmed already satisfied by migration 081 RLS + app/sync/requests/page.tsx -- no new code, no new RLS needed
- [Phase ?]: 23-06: plan frontmatter references requirements SYNC-06/SYNC-10 but REQUIREMENTS.md has no Phase 23 section registering them (requirements.mark-complete returned not_found for both) -- same pre-existing gap noted at 23-01/23-02/23-04, deferred to a future /gsd-docs-update pass, not fixed by this executor
- [Phase ?]: 23-07: Login errors show a single fixed generic message (never the raw Supabase error) -- T-23-23 account-enumeration mitigation; postSignInPath's next is always null in the modal (no client-controlled redirect surface exists)
- [Phase ?]: 23-07: SyncAuthCTAs.tsx added as a new client-boundary file beyond the plan's literal files_modified -- Next.js requires 'use client' at whole-module scope, so the server-component /sync landing page cannot inline modal-open state (Rule 3)
- [Phase 27]: 27-01: REVOKE ALL (not DML-only REVOKE) applied to artist_invites/artist_waitlist from the outset, proactively closing the TRUNCATE/TRIGGER/REFERENCES gap migration 091 had to retroactively fix for funun_staff/staff_audit_log
- [Phase 27]: 27-01: plan frontmatter references requirement INVITE-02 but REQUIREMENTS.md has no Phase 27 section registering it (requirements.mark-complete returned not_found) -- same pre-existing gap noted at 16-03/22-01/22-02/22-03, deferred to a future /gsd-docs-update pass, not fixed by this executor
- [Phase 27]: 27-02: lib/email/buyerInvite.ts's third esc() duplicate left untouched — plan scoped Task 3 to industryInvite.ts/staffInvite.ts only — Out-of-scope for this plan; not introduced or worsened by this work
- [Phase 27]: 27-02: requirements.mark-complete returned not_found for INVITE-07/INVITE-10 — REQUIREMENTS.md has no Phase 27 section registering them — Same pre-existing gap noted at 16-03/16-11/22-01/22-02/22-03 — deferred to a future /gsd-docs-update pass, not fixed by this executor (out of this plan's scope)
- [Phase 27]: Invite gate is the first statement inside handle_new_user()'s default (artist) branch only, after curator/buyer/industry RETURN NEW blocks — never a separate BEFORE INSERT trigger (D-02). — Matches RESEARCH Pattern 1; guarded by an automated placement test.
- [Phase 27]: 27-05: All three templates import esc() from lib/email/esc.ts (27-02) — no re-derived escaper
- [Phase 27]: 27-05: Personal templates (A/B) omit unsubscribe; commercial reopen broadcast (C) mandates it in both html and text (D-19/CAN-SPAM)
- [Phase 27]: 27-05: plan frontmatter references requirement INVITE-10 but REQUIREMENTS.md has no Phase 27 section registering it (requirements.mark-complete returned not_found) — same pre-existing gap noted at 16-03/16-11/22-01/22-02/22-03, deferred to a future /gsd-docs-update pass, not fixed by this executor
- [Phase 27-07]: Auto-resubscribe upsert implemented as select-by-email then branch (update/insert), not a literal ON CONFLICT — artist_waitlist's uniqueness (migration 097) is a functional index on LOWER(email), which PostgREST's on_conflict merge param can't target; sanitizeWaitlistEntry always lowercases email so a plain .eq('email', ...) select reliably finds the same row.
- [Phase ?]: check-invite rate-limits ip then email and returns identical {allowed,existingAccount} shape for allowed/denied/malformed inputs (enumeration mitigation, T-27-02)
- [Phase ?]: invite/[token] resolver checks artist_invites first then falls back to collaborator_invites; inviterName resolved best-effort via user_profiles.artist_name, never admits by token (T-27-03)
- [Phase 27]: 27-08: idempotent duplicate/already-converted paths skip logStaffAction (no write occurred), mirroring the collaborator-invite cooldown-skip convention
- [Phase 27]: 27-08: reopen broadcast actionLink is a bare /signup announcement link, not a per-recipient token — personal tokened invites stay the convert route's job
- [Phase 27]: Deep-link resolution always re-runs check-invite before rendering allowed; token resolver only supplies pre-fill data, never admission (D-02).
- [Phase 27]: Editing the deep-link email structurally falls back to the plain gate state (deepLink cleared, gateState reset) rather than only hiding the inviter framing (D-09).
- [Phase 27]: Turnstile integrated via next/script + memoized callback ref, no new npm dependency; fixed-height slot degrades safely when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unprovisioned (D-12).
- [Phase 27]: Extends 27-11 scope (D-18/INVITE-11/T-27-17 self-lockout resilience) — added scripts/break-glass.ts (service-role CLI: grant-artist-invite, create-staff) + docs/BREAK-GLASS.md (3-layer runbook with dashboard-SQL equivalents) so the owner always has a way past the artist-invite gate; added tsx as devDependency (no ts-node/tsx previously installed) to run it.
- [Phase ?]: 27-10: Per-row Invited state derives from the waitlist row's own converted_to_invite_at, not a join against initialInvites
- [Phase ?]: 27-10: Search input reuses StaffAdmin's panel-2/border input treatment; no literal var(--input) token exists in console-theme.ts
- [Phase 27]: 27-CODEX-REVIEW.md pre-cutover DB-gate fixes (B1/M1/M2/M3/M4/L1) landed via a fix-forward migration 099 (never edits 098 in place — mirrors the 085→086 pattern): (1) B1 — added a dedicated staff early-return branch to handle_new_user() keyed on app_metadata.staff_role, positioned before the artist gate, closing the bug where createStaffAccount.ts's staff_role (not role) fell through to the gated artist branch; (2) M3 — the gate now identifies and consumes only the ONE specific active artist_invites row that authorized a signup (v_invite_id), never a blanket "every pending row for this email" update, and never touches an invite row when admission came from a collaborators match; (3) M4 — added a partial UNIQUE index on lower(email) scoped to status='pending' to close a concurrent-duplicate-invite race (index predicates must be IMMUTABLE, so expiry can't be folded in — a follow-up expired-invite-reissue flow, H1, stays out of scope); (4) L1 — redefined email_has_account() with search_path='' + pg_catalog-qualified lower(); (5) M1 — lib/invites/allowlist.ts's isArtistEmailAllowed() now escapes ILIKE wildcard characters (single shared exactCaseInsensitiveEmailPattern() helper) instead of passing raw user input to .ilike(), matching the SQL gate's exact-equality semantics; (6) M2 — __tests__/migration-099-gate.test.ts (new, authoritative parity test; migration-098-gate.test.ts untouched, still valid for 098's frozen text — mirrors the 085-test/086-test split) adds structural whole-branch-body comparison against migration 086 plus a hand-authored executable behavioral model of the gate algorithm; lib/invites/allowlist.test.ts's ILIKE mock was upgraded to genuinely simulate Postgres wildcard semantics, with 4 new wildcard-injection regression fixtures added to the shared lib/invites/invite-fixtures.ts twin table. docs/BREAK-GLASS.md Layer 2 updated to reflect the script path now creates zero phantom rows and to flag a caveat the fix does NOT close: the raw-SQL/Dashboard "Add user" fallback still can't set app_metadata at creation time, so it still needs the phantom-row cleanup and can still be rejected by the gate if used cold. Migration 099 is TEXT/TEST-ONLY, matching 097/098's standing human-gated convention — NOT pushed to the live DB; full suite (162 suites / 1905 tests), tsc, lint, and build all verified clean.
- [Phase 27]: 27-CODEX-REVIEW.md Blocker B2 fix (unsubscribe never set unsubscribed_at): added POST /api/waitlist/unsubscribe, symmetrical with resubscribe/route.ts — filters ONLY on unsubscribe_token (never id/email, T-27-05 IDOR mitigation), rate-limited via the shared ip limiter, generic 404 on invalid/missing token, and idempotent (looks up the row first so an already-unsubscribed row is a true no-op and never overwrites the original opt-out timestamp). app/unsubscribe/page.tsx no longer renders the confirmation on load — added a 'checking' state that calls the new endpoint and only shows "You've unsubscribed" after the mutation succeeds; missing/invalid token still falls to the pre-existing error state. No client-testing-library infra exists in this repo, so the page's on-load call is exercised only by TypeScript + manual verification, not a rendered-component test; the route itself has full unit coverage. 163 suites / 1912 tests, tsc, lint, build all clean. No migration involved — not gated on the live DB push.

### Pending Todos

- Resolve during Phase 8 planning: industry-member signup/routing flow (where `app_metadata.role` is set, post-auth redirect, distinct onboarding), and a reserved-handle list (squatting risk MINOR-3) — product decision, not purely engineering
- Confirm during Phase 12 planning: pg_trgm/tsvector performance at 10K+ profiles via EXPLAIN ANALYZE before committing to plain GIN-index approach
- Confirm during Phase 13 planning: verified-badge grant is admin-manual (no self-application UI) — explicit, not silent deferral

### Blockers/Concerns

**Resolved 2026-07-07 (schema push verified live):**

- ~~[Phase 08] migrations 034-040 unpushed~~ — RESOLVED: `supabase migration list` (run by Pete after `supabase login` + `link --project-ref wgfjakfiyeewzfuxkgyo`) confirmed LOCAL=REMOTE for ALL migrations 001–042. Migrations 034–040 were already live on the remote database; the recorded gap was stale. Phase 8's SC-4/SC-5 live-DB smoke assertions (08-VERIFICATION.md human-verification items) remain individually unexecuted but the push-blocker itself is gone.
- ~~[Phase 15-01] Task 3 schema push for migration 042~~ — RESOLVED: Pete ran `supabase db push` (applied 041 + 042) and all 3 DB-level checks passed: D-12 backfill (5 artist/approved/backfill rows, zero industry rows correct — no industry accounts exist yet), column lockdown (42501 permission denied as authenticated), partial unique index (duplicate pending insert rejected). See 15-01-SUMMARY.md.

~~Phase 09-01b Task 4 BLOCKING checkpoint: migration 043 (artist_profiles.allow_resharing) authored locally but not yet pushed to the remote database.~~ — RESOLVED 2026-07-12: Operator ran `supabase db push`; `npx supabase migration list` confirms 043 populated in both LOCAL and REMOTE columns, matching migrations 001-042. Plan 09-01b is complete; Plans 09-02..09-05 (which depend on this DB/API layer) are unblocked.

- 17-09 checkpoint 1: migration 063 (split-sheet legal-grade fields) authored but NOT pushed — requires a human to run supabase db push and the additive/adversarial review in 17-09-PLAN.md
- 17-09 checkpoint 2 (P17-09a): AGREEMENT_CLAUSES operative language requires licensed-attorney review before COUNSEL_REVIEW_STATUS can flip to reviewed — assertCounselReviewedForProduction() blocks production minting until then
- Phase 17 BLOCKING checkpoint outstanding (17-07 Task 3): live end-to-end 3-signer mobile signing run. Prereqs: push migration 065; fix pre-existing npm run build failure in contracts page (from 17-05); set DOCUSEAL_WEBHOOK_SECRET and ESIGN_FROM_EMAIL; DocuSeal Pro purchase; attorney review of AGREEMENT_CLAUSES.
- 21-02 checkpoint: migration 079 (auto-membership trigger) pushed live and schema-verified 2026-08-02, but the full behavioral RLS/auto-membership access-matrix smoke (three event orderings + draft-gate + idempotency, against real second accounts, per 21-02-PLAN.md Task 3 how-to-verify steps 3-4) has NOT been executed -- outstanding human verification
- 16-00: plan frontmatter references requirements META-01/META-02 but REQUIREMENTS.md has no Phase 16 section registering them yet (requirements.mark-complete returned not_found) -- pre-existing documentation gap, not fixed by this executor; a future plan or /gsd-docs-update pass should register Phase 16's requirement IDs in REQUIREMENTS.md
- 16-01/02/11: same pre-existing gap extends to BUYER-01/02/05/07, DEAL-01..07, and META-03/04/05 (requirements.mark-complete returned not_found for all 14) -- REQUIREMENTS.md still has no Phase 16 section; deferred to the same future /gsd-docs-update pass, not fixed by this finalization
- Wave 0 of Phase 16 (16-00/01/02/11) is code-complete and migrations 080/081/082 are approved-and-live (LOCAL=REMOTE through 082, confirmed by operator via `supabase migration list` + a service-role PostgREST read on buyer_orgs returning 200). This confirms schema-level correctness only. Each of 16-01/16-02/16-11's own listed behavioral adversarial checks (buyer cannot UPDATE license_requests.stage -- 42501; admin_notes/owner_id/commission_pct/artist_net_cents not selectable by a buyer; phantom-row guard `SELECT COUNT(*) FROM user_profiles WHERE buyer role = 0`; UPC/GRid generation safety and the platform GRid global-counter check) remain OUTSTANDING -- they require a live buyer account, which Wave 2 buyer signup has not yet shipped. Track these in the phase verifier before Phase 16 is marked passed.
- 22-01: plan frontmatter references requirements catalogue-browse/audio-player but REQUIREMENTS.md has no Phase 22 section registering them yet (requirements mark-complete returned not_found for both) -- same pre-existing gap pattern as Phase 16, deferred to a future /gsd-docs-update pass, not fixed by this executor
- 28-01: plan frontmatter references requirements INDUSTRY-01/INDUSTRY-06 but REQUIREMENTS.md has no Phase 28 section registering them yet (requirements.mark-complete returned not_found for both) -- same pre-existing gap pattern as Phases 16/22/23, deferred to a future /gsd-docs-update pass, not fixed by this executor
- 28-05 checkpoint (Task 3, BLOCKING): migration 085 (supabase/migrations/085_industry_capability_green_room_gate.sql -- handle_new_user() industry capability_grants write + backfill + green_room_posts_insert_own RLS member_type gate) is drafted, text-tested (commits fba75e1/0575a97), and NOT pushed -- requires a human with Supabase CLI/dashboard access to review, confirm the live role='curator' account count, run `supabase db push`, confirm LOCAL=REMOTE through 085, and execute the 4-scenario post-push smoke (industry account posts an Antenna opportunity; artist+industry can post in Green Room; a non-member is RLS-rejected; a @funun.studio account is app-layer-blocked). Full steps in 28-05-SUMMARY.md's Checkpoint section and 28-05-PLAN.md Task 3. This is the last open item in Phase 28.
- 25-01: plan frontmatter references requirement TEAM-01 but REQUIREMENTS.md has no Phase 25 section registering it yet (requirements.mark-complete returned not_found) -- same pre-existing gap pattern as Phases 16/22/28, deferred to a future /gsd-docs-update pass per the plan's own instruction, not fixed by this executor
- 25-02: plan frontmatter references requirements TEAM-05/TEAM-06 but REQUIREMENTS.md has no Phase 25 section registering them yet (requirements.mark-complete returned not_found for both) -- same pre-existing gap pattern as 25-01/16/22/28, deferred to a future /gsd-docs-update pass, not fixed by this executor
- 25-04: plan frontmatter references requirement TEAM-03 but REQUIREMENTS.md still has no Phase 25 section registering it (requirements.mark-complete returned not_found) -- same pre-existing gap pattern as 25-01/25-02/16/22/28, deferred to a future /gsd-docs-update pass, not fixed by this executor
- 25-04: funun_staff (migration 089, unpushed) has no active/deactivated_at column -- PATCH /api/admin/staff/[id]'s { active:false } deactivate signal clears app_metadata.staff_role to null (real, immediate access revocation) but leaves no queryable "deactivated" flag on funun_staff for a future Team Members list UI to render. Candidate follow-up if a migration author revisits funun_staff.
- 23-01: plan frontmatter references requirement SYNC-01 but REQUIREMENTS.md has no Phase 23 section registering it (requirements.mark-complete returned not_found) -- same pre-existing gap pattern as Phases 16/22/25/28, deferred to a future /gsd-docs-update pass, not fixed by this executor

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260706-3bp | Fix TypeScript type error in AddressAutocomplete.tsx by installing @types/google.maps and restoring proper Google Maps types | 2026-07-06 | b41a133 | [260706-3bp-fix-typescript-type-error-in-addressauto](./quick/260706-3bp-fix-typescript-type-error-in-addressauto/) |
| 260710-q9j | Add password-reset flow (/forgot-password + /update-password) to Supabase email/password auth, harden auth callback + middleware, document auth setup in README. Merged as 06319e5 (PR #27) — production deploy confirmed successful, live on funun.studio | 2026-07-10 | 06319e5 | [260710-q9j-add-password-reset-flow-to-supabase-emai](./quick/260710-q9j-add-password-reset-flow-to-supabase-emai/) |
| 260711-2nt | Fix Next.js 15.5.x clientReferenceManifest build regression: root cause was a silent route collision (app/page.tsx vs app/(admin)/page.tsx both resolving to `/`) orphaning the latter and breaking Vercel's build. Merged as 88700bb (PR #28) — production deploy confirmed successful; unblocks PR #27/#26 | 2026-07-11 | 88700bb | [260711-2nt-fix-next-js-15-5-x-clientreferencemanife](./quick/260711-2nt-fix-next-js-15-5-x-clientreferencemanife/) |
| 260719-uat | Fix Phase 12 UAT blockers: mount orphaned SignOutButton (artist sidebar footer + admin nav) and add scripts/provision-test-admin.mjs (idempotent is_admin promotion via GoTrue admin API) | 2026-07-19 | b0c9c85 | [260719-uat-signout-admin-account](./quick/260719-uat-signout-admin-account/) |
| 260701-vx5 | Fix broken admin sidebar links (/admin/checklist, /admin/tips 404'd — route group strips `/admin`). Done and verified on an orphaned worktree branch (`claude/funny-davinci-143e00`) that was never merged; discovered during 2026-07-12 cleanup. No action needed — current `main`'s `app/(admin)/layout.tsx` already has the correct `/checklist`/`/tips` links, independently fixed by later Phase 8 work (admin/members). Recorded here for audit-trail completeness only | 2026-07-01 (discovered 2026-07-12) | n/a — superseded, never merged | (orphaned, not recreated — see `claude/funny-davinci-143e00` branch if historical detail is ever needed) |
| 260806-wqr | 25-11 login-routing (Option A, Phase 25 fast-follow): role-aware post-sign-in routing — staff → /admin/my-client-partners, else → /vault, explicit same-origin ?next= wins. Extracted client-safe getStaffRole into lib/admin/staff-role.ts (re-exported from gate.ts); pure postSignInPath helper (6 tests) + open-redirect guard; wired into the sign-in page. Full suite 129/1553 green, build clean | 2026-08-07 | 25b528b | [260806-wqr-login-routing](./quick/260806-wqr-login-routing/) |

### Roadmap Evolution

- Phase 15 added: Account Capability Model — cross-cutting identity change (member_type single value -> capability grants), scheduled after Phase 13, deferred until after beta testing begins
- Phase 19 added: Profile & Identity Model Cleanup — delete the duplicate user_profiles + re-point both DB readers (claim_collaborators + backfill_claimed_collaborators) to the canonical artist_profiles, and formalize collaborator-becomes-user reconciliation (confirmable pre-fill, preserve existing live-link, flag-for-fix). Surfaced by the Phase 18 duplicate-rights bug (saved PRO reads "None"). Decisions locked in 19-SPEC.md; corrected against a Codex verification sweep.
- Phase 20 added: Profile Table Rename (artist_profiles → user_profiles) — split out of Phase 19 (2026-07-23) after the Codex sweep showed the rename is ~79 runtime files + ~23 migrations + a live deploy race (a different risk class). Phase 19 keeps R1–R5; Phase 20 carries the rename and depends on Phase 19 freeing the user_profiles name. Verified scope captured in the ROADMAP Phase 20 locked-inputs block.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| E-sign | Dropbox Sign live implementation | Blocked — paid account needed | Wave 2 init |
| Integrations | Songtrust API integration | Blocked — BD conversation pending | Wave 2 init |
| Integrations | SoundExchange direct filing | Blocked — partner agreement required | Wave 2 init |
| Social | Direct post scheduling / publishing (Meta/TikTok OAuth) | Deferred — later wave | Wave 3 init |
| Social | Direct Later/Buffer API calendar push | Deferred — later wave | Wave 3 init |
| Social | SOCIAL-08 Buffer API integration (research spike) | Deferred — later wave | Wave 3 close |
| Curators | Automated curator directory seeding (scraping/API) | Deferred — later wave; manual + claim shipped | Wave 3 init |
| Notifications (v2) | NOTIF-04 digest email · NOTIF-05 "industry member viewed your profile" | v1.x — after network validation | Wave 4 init |
| Presence (v2) | PRESENCE-04 typing indicator (Realtime Broadcast) | v1.x — after DM widget validation | Wave 4 init |
| Discovery (v2+) | Readiness/sync-cleared filters · AI discovery recs · profile analytics view | v2+ — needs network density / ML infra | Wave 4 init |
| Social (later) | Industry Round Table (live panels/replays/Q&A) | Candidate follow-on milestone (SEED-001) | Wave 4 init |
| Design refresh | Contract Locker visual restyle — `contract-locker.html` (Wave 4 design bundle) restyles the existing Document Lifecycle/Rights Guidance UI + AI contract-verification panel to match the new dark indigo/fuchsia system, but no roadmap phase owns porting the live feature to it | Deferred — unscoped, no phase assigned; candidate future phase if prioritized | Phase 14 planning (2026-07-06) |
| Verification (v1.0) | Phase 01 verification | human_needed — legacy v1.0, shipped 2026-06-29 | v1.1 close |
| Verification (v1.0) | Phase 04 verification | human_needed — legacy v1.0, shipped 2026-06-29 | v1.1 close |
| UAT (v1.0) | Phase 04 UAT (partial, 0 pending scenarios) | legacy v1.0, shipped 2026-06-29 | v1.1 close |
| Infrastructure | Migrate off Vercel serverless functions (4.5MB body cap, plan-tier-gated `maxDuration`) to a container platform or AWS, if limits become a recurring blocker | Deferred — see team-sizing note below; Vercel Pro/Enterprise upgrade is the low-cost first option | Phase 14 planning (2026-07-06) |

**Infrastructure scaling note (Phase 14, 2026-07-06):** Confirmed during Phase 14 planning that this project runs on Vercel **Hobby** tier (hard 10s `maxDuration`, 4.5MB request body cap, both non-configurable). If these limits become a recurring blocker beyond a single phase's workaround (Phase 14 routes around it via direct-to-storage uploads + assemble-then-sign delivery, no migration needed yet), three tiers of alternative exist, roughly by team investment required:

- **Vercel Pro/Enterprise upgrade** — no team needed beyond whoever already manages deploys today; a billing/config change only (Fluid Compute raises `maxDuration` well past 10s), zero migration work, zero new skills required.
- **Container PaaS (Cloud Run / Fly.io / Render)** — buildable by ~1 engineer with light DevOps familiarity: containerize the app (Dockerfile), adjust CI/CD (image build+deploy vs. git-push), re-implement `vercel.json`'s cron job elsewhere. Ongoing management is on the order of a few hours/month for a team this size — typically absorbed by an existing full-stack engineer, not a dedicated hire.
- **AWS (ECS/Fargate or Lambda + API Gateway)** — a genuine infrastructure project (VPC, IAM, load balancer, CI/CD via IaC). Realistically wants at least one dedicated or fractional DevOps/cloud engineer to both build and own it (security, cost, incident response) — likely overkill unless a specific enterprise/compliance requirement (data residency, existing AWS footprint) forces the move.

Recommendation if/when this becomes necessary: exhaust the Vercel upgrade path first; reach for container PaaS (not AWS) unless a concrete compliance/footprint reason justifies the extra complexity.

## Session Continuity

Last session: 2026-08-09T13:56:04.065Z
Stopped at: Phase 27 CODE-COMPLETE + hardened through 3 Codex review rounds (all findings resolved; L2 accepted) + Turnstile scoped-hardening pass (env var renamed TURNSTILE_SECRET_KEY -> TURNSTILE_SECRET, fail-closed guards, action marker, widget reset-on-failure, token-aware submit gate). Migrations 097-103 written + tested (1971 green), NOT pushed. Break-glass in place (docs/BREAK-GLASS.md). NEXT = owner cutover (27-11): (1) Cloudflare Turnstile keys -- set NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET (corrected name) + SUPABASE_ACCESS_TOKEN, (2) approve 3 email copies, then Codex Prompt 1 (read-only pre-flight) -> Prompt 2 (supabase db push 097-103 + gate smoke). Bootstrap already safe (owner has 2 artist accounts). THEN /gsd-docs-update (register INVITE-01..12), /gsd-verify-work, /gsd-ship. HOLD the reopen broadcast until BD/counsel CAN-SPAM clearance.
Resume file: None
Last session: 2026-08-06T01:06:36.617Z
Stopped at: Completed 28-03-PLAN.md
malformed ROADMAP (Phase 18 had a summary checklist entry but no `### Phase 18:`
detail section; Phase 17's detail block was also misplaced inside Future
Candidates). Research (18-RESEARCH.md) surfaced findings beyond the reconciliation
session: the live-link chain in the deliberation points at `user_profiles` which
lacks legal_name/administrator (must read `artist_profiles`); `CollaboratorPicker`
has an untested third caller (MetadataStudio's ComposerEditor); §9 auto-party-1 +
relaxed validation are shared create/edit logic; and three schema gaps
(collaborators.legal_name, collaborators.status, artist_profiles.legal_name_locked_at)
had no owner. Result: added a wave-1 identity-foundation plan (18-05: migration 066

+ live-identity resolver + Settings legal-name lock, human-gated push) that

living-draft depends on; rewrote 18-01 (living-draft — new separate PartyPicker,
auto-party-1, §7 recipient advanced-info) and 18-02 (Locker — 3-state
invited/opened/signed derived from existing columns, zero new schema). 18-03/18-04
left byte-identical. Plan set: 5 plans / 3 waves. plan-checker PASSED (no revision
loop). Requirements 12/12 covered. Decision-coverage gate returned could-not-parse
(project uses P18-NN IDs, gate expects D-NN) with uncovered:[] — a parser mismatch,
not a real gap; proceeded with override, verify-phase may re-surface. Session-locked
decisions: separate PartyPicker (not a shared-picker rewrite); collaborators.status
flips confirmed on signup OR sheet-response whichever first; initiator's party-1 row
non-removable; mint-envelope live-write-back deferred as a Phase 17 follow-up.
Resume file: 

None
Resume file: .planning/phases/18-split-sheet-home/18-CONTEXT.md

## Operator Next Steps

- Phase 11 (Presence & Messaging) implementation is complete on PR #37 (`codex/phase-11-presence-messaging`): six plans executed, review findings fixed, lint/TypeScript/Jest/build/Vercel pass, and migrations 054/055 are verified LOCAL=REMOTE. Remaining work is human UAT only: two-session presence, request accept/decline/block, unread clearing, docked widget persistence, rate-limit wall, and connected-direct-message flow.
- Phase 15 (Account Capability Model) is done — `member_type` is now backed by `capability_grants`, with a unified nav, a self-serve request CTA, and an admin approval queue. Manual UAT items from 15-03-SUMMARY.md and 15-04-SUMMARY.md are still outstanding (multi-capability nav visibility, live approve/deny flow).
- PR #26 (Phase 14 — Playback Room Refinement) is still waiting on Thomas's local UAT before it can be merged.
- Phase 12 (Discovery & People Search) is the next unstarted Green Room phase; it is UI-forward with the design handoff locked at `docs/design/wave-4-social-layer/`, and `/gsd-ui-phase` is enabled and applicable.
