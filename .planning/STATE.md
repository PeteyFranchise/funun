---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: "— Wave 4: The Green Room"
current_phase: 08
current_phase_name: identity-schema-foundation
status: verifying
stopped_at: Phase 9 context gathered
last_updated: "2026-07-06T04:50:59.285Z"
last_activity: 2026-07-05
last_activity_desc: Phase 08 execution started
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 6
  completed_plans: 6
  percent: 17
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-03)

**Core value:** Funūn is where an independent artist's whole career lives — and where the industry comes to find them. The Green Room turns a profile into a professional identity and a network: artists connect with producers, supervisors, A&R, and execs, and real relationships — not just tools — keep them on the platform.
**Current focus:** Phase 08 — identity-schema-foundation

## Current Position

Phase: 08 (identity-schema-foundation) — EXECUTING
Plan: 6 of 6
Status: Phase complete — ready for verification
Last activity: 2026-07-05 — Phase 08 execution started

## Roadmap Snapshot (v1.2 — Phases 8–13)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 8 | Identity & Schema Foundation | (foundation — none mapped) | Planned |
| 9 | Rich Member Profile | PROFILE-01..09 (9) | Not started |
| 10 | Connections & Notifications | CONNECT-01,02 · NOTIF-01,02,03 (5) | Not started |
| 11 | Presence & Messaging | PRESENCE-01,02,03 · CONNECT-03,04,05 (6) | Not started |
| 12 | Discovery & People Search | DISCOVER-01,02,03 (3) | Not started |
| 13 | Network Tab & Trust & Safety | DISCOVER-04 · SAFETY-01,02,03,04 (5) | Not started |

Coverage: 28/28 v1 requirements mapped ✓ (Phase 8 is schema foundation with no user-facing requirement).

## Performance Metrics

**Velocity:**

- Total plans completed: 18 (Wave 3) + 14 (Wave 2) = cumulative across shipped milestones
- Average duration: -
- Total execution time: 0 hours (v1.2 not started)

**By Phase (v1.2):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 08 | 6 | - | - |
| 09 | TBD | - | - |
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

### Pending Todos

- Resolve during Phase 8 planning: industry-member signup/routing flow (where `app_metadata.role` is set, post-auth redirect, distinct onboarding), and a reserved-handle list (squatting risk MINOR-3) — product decision, not purely engineering
- Confirm during Phase 11 planning: Supabase Realtime concurrent-connection budgeting / monitoring strategy
- Confirm during Phase 12 planning: pg_trgm/tsvector performance at 10K+ profiles via EXPLAIN ANALYZE before committing to plain GIN-index approach
- Confirm during Phase 13 planning: verified-badge grant is admin-manual (no self-application UI) — explicit, not silent deferral

### Blockers/Concerns

currently.

- [Phase 08] Task 3 (schema push, migrations 034-040) could not run in this sandbox: no supabase/config.toml, no linked Supabase project, SUPABASE_ACCESS_TOKEN unset. Manual-intervention gap -- see 08-05-SUMMARY.md for exact commands a human must run before Phase 8 is verified.

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
| Verification (v1.0) | Phase 01 verification | human_needed — legacy v1.0, shipped 2026-06-29 | v1.1 close |
| Verification (v1.0) | Phase 04 verification | human_needed — legacy v1.0, shipped 2026-06-29 | v1.1 close |
| UAT (v1.0) | Phase 04 UAT (partial, 0 pending scenarios) | legacy v1.0, shipped 2026-06-29 | v1.1 close |

## Session Continuity

**Resume file:** .planning/phases/09-rich-member-profile/09-CONTEXT.md

Last session: 2026-07-06T04:50:59.271Z
Stopped at: Phase 9 context gathered
Resume file: None

## Operator Next Steps

- Execute Phase 8 with `/gsd-execute-phase 8` (Identity & Schema Foundation — 6 plans, 3 waves)
- Phases 9–13 are all UI-forward (design handoff locked at `docs/design/wave-4-social-layer/`); `/gsd-ui-phase` is enabled and applicable
