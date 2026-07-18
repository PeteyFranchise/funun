---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: "— Wave 4: The Green Room"
current_phase: 13
current_phase_name: network-trust-safety
status: executing
stopped_at: Completed 13-03-PLAN.md (Hard Block Enforcement Audit) — last plan of Phase 13, ready for phase verification
last_updated: "2026-07-18T19:06:15.936Z"
last_activity: 2026-07-18
last_activity_desc: Phase 13 execution started
progress:
  total_phases: 16
  completed_phases: 15
  total_plans: 86
  completed_plans: 81
  percent: 94
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Funūn is where an independent artist's whole career lives — and where the industry comes to find them. The Green Room turns a profile into a professional identity and a network: artists connect with producers, supervisors, A&R, and execs, and real relationships — not just tools — keep them on the platform.
**Current focus:** Phase 13 — network-trust-safety

## Current Position

Phase: 13 (network-trust-safety) — EXECUTED, goal-verified with human UAT pending
Plan: 5 of 5 done (13-01 → 13-02 → 13-04 → 13-05 → 13-03). All requirements
(DISCOVER-04, SAFETY-01..04) functionally satisfied per 13-VERIFICATION.md
(9/9 must-haves verified in code; 46 suites / 450 tests, tsc/lint clean;
migrations 058–060 confirmed live). Overall verdict: human_needed — 4 manual
UAT items remain: (1) live two-account block smoke test, (2) 13-VALIDATION.md
scenario 7 admin verify + self-grant negative, (3) scenario 8 connections-only
exclusion, (4) scenario 9 hidden open_to persistence. Two documented deferrals:
release_comments DB-layer no_block RLS (app-layer mitigated; needs future
migration) and no severing of pre-existing follows/connections on block.
goal-verified (12-VERIFICATION.md, 21/21 requirements met). Full repo suite green
(280 tests), tsc/lint/build clean; migrations 054–057 live. NOT formally complete —
gated on: (1) two visual UAT items in 12-BROWSER-UAT-CHECKLIST.md, (2) Codex
adversarial review, (3) PR #37 merge. ROADMAP Phase 12 stays [ ] until then.
Last activity: 2026-07-18 — Phase 13 execution started
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

### Pending Todos

- Resolve during Phase 8 planning: industry-member signup/routing flow (where `app_metadata.role` is set, post-auth redirect, distinct onboarding), and a reserved-handle list (squatting risk MINOR-3) — product decision, not purely engineering
- Confirm during Phase 12 planning: pg_trgm/tsvector performance at 10K+ profiles via EXPLAIN ANALYZE before committing to plain GIN-index approach
- Confirm during Phase 13 planning: verified-badge grant is admin-manual (no self-application UI) — explicit, not silent deferral

### Blockers/Concerns

**Resolved 2026-07-07 (schema push verified live):**

- ~~[Phase 08] migrations 034-040 unpushed~~ — RESOLVED: `supabase migration list` (run by Pete after `supabase login` + `link --project-ref wgfjakfiyeewzfuxkgyo`) confirmed LOCAL=REMOTE for ALL migrations 001–042. Migrations 034–040 were already live on the remote database; the recorded gap was stale. Phase 8's SC-4/SC-5 live-DB smoke assertions (08-VERIFICATION.md human-verification items) remain individually unexecuted but the push-blocker itself is gone.
- ~~[Phase 15-01] Task 3 schema push for migration 042~~ — RESOLVED: Pete ran `supabase db push` (applied 041 + 042) and all 3 DB-level checks passed: D-12 backfill (5 artist/approved/backfill rows, zero industry rows correct — no industry accounts exist yet), column lockdown (42501 permission denied as authenticated), partial unique index (duplicate pending insert rejected). See 15-01-SUMMARY.md.

~~Phase 09-01b Task 4 BLOCKING checkpoint: migration 043 (artist_profiles.allow_resharing) authored locally but not yet pushed to the remote database.~~ — RESOLVED 2026-07-12: Operator ran `supabase db push`; `npx supabase migration list` confirms 043 populated in both LOCAL and REMOTE columns, matching migrations 001-042. Plan 09-01b is complete; Plans 09-02..09-05 (which depend on this DB/API layer) are unblocked.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260706-3bp | Fix TypeScript type error in AddressAutocomplete.tsx by installing @types/google.maps and restoring proper Google Maps types | 2026-07-06 | b41a133 | [260706-3bp-fix-typescript-type-error-in-addressauto](./quick/260706-3bp-fix-typescript-type-error-in-addressauto/) |
| 260710-q9j | Add password-reset flow (/forgot-password + /update-password) to Supabase email/password auth, harden auth callback + middleware, document auth setup in README. Merged as 06319e5 (PR #27) — production deploy confirmed successful, live on funun.studio | 2026-07-10 | 06319e5 | [260710-q9j-add-password-reset-flow-to-supabase-emai](./quick/260710-q9j-add-password-reset-flow-to-supabase-emai/) |
| 260711-2nt | Fix Next.js 15.5.x clientReferenceManifest build regression: root cause was a silent route collision (app/page.tsx vs app/(admin)/page.tsx both resolving to `/`) orphaning the latter and breaking Vercel's build. Merged as 88700bb (PR #28) — production deploy confirmed successful; unblocks PR #27/#26 | 2026-07-11 | 88700bb | [260711-2nt-fix-next-js-15-5-x-clientreferencemanife](./quick/260711-2nt-fix-next-js-15-5-x-clientreferencemanife/) |
| 260701-vx5 | Fix broken admin sidebar links (/admin/checklist, /admin/tips 404'd — route group strips `/admin`). Done and verified on an orphaned worktree branch (`claude/funny-davinci-143e00`) that was never merged; discovered during 2026-07-12 cleanup. No action needed — current `main`'s `app/(admin)/layout.tsx` already has the correct `/checklist`/`/tips` links, independently fixed by later Phase 8 work (admin/members). Recorded here for audit-trail completeness only | 2026-07-01 (discovered 2026-07-12) | n/a — superseded, never merged | (orphaned, not recreated — see `claude/funny-davinci-143e00` branch if historical detail is ever needed) |

### Roadmap Evolution

- Phase 15 added: Account Capability Model — cross-cutting identity change (member_type single value -> capability grants), scheduled after Phase 13, deferred until after beta testing begins

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

Last session: 2026-07-18T19:06:15.918Z
Stopped at: Completed 13-03-PLAN.md (Hard Block Enforcement Audit) — last plan of Phase 13, ready for phase verification
Resume file: None

## Operator Next Steps

- Phase 11 (Presence & Messaging) implementation is complete on PR #37 (`codex/phase-11-presence-messaging`): six plans executed, review findings fixed, lint/TypeScript/Jest/build/Vercel pass, and migrations 054/055 are verified LOCAL=REMOTE. Remaining work is human UAT only: two-session presence, request accept/decline/block, unread clearing, docked widget persistence, rate-limit wall, and connected-direct-message flow.
- Phase 15 (Account Capability Model) is done — `member_type` is now backed by `capability_grants`, with a unified nav, a self-serve request CTA, and an admin approval queue. Manual UAT items from 15-03-SUMMARY.md and 15-04-SUMMARY.md are still outstanding (multi-capability nav visibility, live approve/deny flow).
- PR #26 (Phase 14 — Playback Room Refinement) is still waiting on Thomas's local UAT before it can be merged.
- Phase 12 (Discovery & People Search) is the next unstarted Green Room phase; it is UI-forward with the design handoff locked at `docs/design/wave-4-social-layer/`, and `/gsd-ui-phase` is enabled and applicable.
