# Project Research Summary

**Project:** Funūn — Wave 4: The Green Room (v1.2)
**Domain:** Professional social network for the music industry ("LinkedIn for artists")
**Researched:** 2026-07-03
**Confidence:** MEDIUM

## Executive Summary

Wave 4 turns Funūn's thin, already-live social layer (follow, wall, endorsements, comments, activity feed, 1:1 DMs) into a full professional network, making industry members (producers, songwriters, music supervisors, A&R, execs) first-class alongside artists. This is a classic brownfield integration, not a greenfield build: the existing Supabase (PostgreSQL + RLS + Storage + Realtime) and Next.js 15 stack already carries every primitive needed. Research confirms the milestone is achievable with **zero new infrastructure services** — native Supabase Realtime Presence, Postgres full-text search (pg_trgm/tsvector), and Storage image transforms cover presence, search, and avatar/banner handling respectively. Only two small npm packages are needed (`date-fns`, `lucide-react`).

The recommended approach is **identity-first, then graph-aware**: extend the existing `artist_profiles` table with a `member_type` discriminant rather than creating a parallel table, ship the hero profile screen from the locked design handoff to validate that model in the browser, then layer connections, notifications, presence, and discovery on top in that order. This sequencing exists specifically to avoid the milestone's two highest-risk failure modes.

The critical risk is privacy and trust/safety on a now-public, now-networked identity table: (1) row-level RLS restricts *rows* but not *columns*, so any authenticated user can read private fields (phone, legal name) directly via PostgREST unless a column-level `REVOKE`/`GRANT` migration is applied — Wave 3 already hit and solved this exact bug (migration 031), and Wave 4 must apply the same pattern proactively; (2) block relationships must be enforced in RLS policies, not just the UI, or blocked users can read a blocker's data by calling PostgREST directly. Both are solved problems with in-codebase precedent — the risk is skipping the pattern under time pressure, not inventing a new one.

## Key Findings

### Recommended Stack

Everything Wave 4 needs beyond the existing stack is either a tiny library or a native Supabase capability already paid for. **`date-fns@^4.x`** gives relative timestamps ("3 minutes ago") across feeds/notifications/DMs (~2–3KB, pure functions, server-safe). **`lucide-react@^0.513.0`** provides exact icon parity with the locked design handoff, which specifies Lucide-style inline SVG throughout. No new infrastructure: Supabase Realtime Presence handles "Active now" status via heartbeat-driven channel tracking; Postgres `pg_trgm` + `tsvector` (both native, no install) handle people search via GIN indexes — sufficient through low tens of thousands of members, no Algolia/Typesense needed; Supabase Storage's built-in `transform` params on `getPublicUrl()` handle avatar/banner resizing, no Cloudinary/Imgix needed. Explicitly rejected: Pusher/Ably/Firebase (Supabase Realtime already does this), Redis/Upstash, `socket.io`, `sharp`, and any new auth provider — industry members are a column addition to `artist_profiles`, not a new auth system.

**Core technologies:**
- `date-fns` v4: relative timestamps — tree-shaken, no browser API dependency, safe in server components
- `lucide-react` v0.513+: icon system — matches locked design spec exactly, tree-shakes per import
- Supabase Realtime Presence (already installed via `@supabase/supabase-js`): online/"Active now" status — native, no new service
- Postgres `pg_trgm` + `tsvector` (bundled Supabase extension): people search — native, RLS-safe, no sync pipeline
- Supabase Storage transforms (already configured buckets pattern): avatar/banner delivery — no new media CDN

### Expected Features

The locked hi-fi design (`user-profile.html`) specifies the hero profile; research contextualizes it against LinkedIn/Vampr/SoundBetter-style networks and defines a trust/safety floor required for any network where cold outreach between strangers happens.

**Must have (table stakes):**
- Rich profile header — banner, avatar with presence dot, pronouns, verified check, multi-role badges, location, tenure, "Open to" chips, Follow/Message actions (public) vs. Edit/Share/Analytics (owner)
- Owner-vs-public view switching on `/u/[handle]`
- Global people search with role/genre/open-to filters; Discover tab + Network tab
- Supabase Realtime Presence (online dot + "Active now" in DM widget) + unread badges (messages + notifications)
- Message request flow for cold outreach (accept/decline/block) — the trust/safety floor for a network where strangers message each other
- Block user (hard, bidirectional) + report user/message
- Rate limiting on cold message requests (10/week)
- Notifications: new follower, connection/message request, DM, comment, endorsement, wall post — with a bell badge and mark-all-read panel

**Should have (differentiators, v1.x — add after validation):**
- Explicit "Connect" (mutual relationship, distinct from asymmetric Follow) — upgrade once message-request volume justifies it
- Typing indicator in DM widget
- "Industry member viewed your profile" notification
- Digest email for low-priority notifications

**Defer (v2+):**
- Readiness/sync-cleared filters in discovery (needs richer readiness data first)
- AI-assisted discovery recommendations, profile analytics (viewer stats)
- Automated verified-badge self-application workflow
- Group messaging / team channels (separate wave)

### Architecture Approach

Extend `artist_profiles` as the single unified member-identity table (add `member_type`, `location`, `open_to`, `pronouns`, `banner_url`, `bio`, `featured_project_id`, `search_vector`) rather than introducing a parallel `industry_profiles`/`member_profiles` table — every existing social table (`follows`, `wall_posts`, `endorsements`, `dm_threads`, `activity_events`) already keys on `auth.users(id)` and is indifferent to which profile table backs the display data. This is the single most important architectural decision in the milestone and research is confident in it.

**Major components:**
1. **Schema foundation** — `artist_profiles` extension, new `connections` (mutual request/accept, distinct from asymmetric `follows`) and `blocks` tables, extended `notifications` (actor snapshot columns + realtime publication), new `dm_thread_reads` table, GIN trigram index, and a `no_block()` SECURITY DEFINER helper gating inserts on wall/endorsements/DMs/activity.
2. **Rich member profile** — upgraded `ProfileView`/`/u/[handle]`, owner-vs-public switch, `ConnectButton` (Follow/Connect/Message) — the design-handoff hero screen, and the first place the identity model is exercised end-to-end.
3. **Connections & notifications layer** — request/accept API, notifications list + unread badge (realtime `postgres_changes` + slow-poll fallback), nav bell.
4. **Presence & DM widget** — single shared `presence-global` Realtime Presence channel coexisting with existing per-thread DM channels; `dm_thread_reads` powers DM-specific unread counts without per-message read receipts.
5. **Discovery & people search** — server-side-only search route (never direct PostgREST) enforcing `is_public` + block exclusion, backed by the GIN trigram/tsvector index.
6. **Network tab & trust/safety** — connections list, `isFollowing`/`isConnected`/`isBlocked` graph helpers, block enforcement in RLS, reporting.

### Critical Pitfalls

1. **Column-level exposure of private fields via PostgREST** — row-level RLS on `artist_profiles` doesn't stop an authenticated user from reading private columns (phone, legal name) directly. **Avoid by:** applying the same `REVOKE`/`GRANT` column-privilege migration pattern from Wave 3's migration 031 to every new/existing private column, in the same migration that adds it — never as a follow-up.
2. **Block enforcement only in the UI, not in RLS** — a blocked user can still read the blocker's wall/activity/DMs via a direct PostgREST call if enforcement is app-layer only. **Avoid by:** a `no_block()` SECURITY DEFINER function referenced from RLS SELECT policies on every socially-exposed table.
3. **Industry-member identity race with `handle_new_user()`** — if `app_metadata.role` is set via a post-insert UPDATE (instead of at `admin.createUser()` time), the trigger has already created a phantom `artist_profiles` row and middleware/routing breaks. **Avoid by:** setting the role at creation time and adding an explicit industry early-return branch to `handle_new_user()`, mirroring the Wave 3 curator-account pattern exactly.
4. **Presence channel leakage / ghost "Active now" / multi-tab duplication** — Realtime Presence channels not torn down on SPA navigation leak connections toward the project's concurrent-connection quota; tab-close doesn't always fire cleanup; multiple tabs for one user create duplicate presence keys. **Avoid by:** explicit `unsubscribe()` on unmount, `visibilitychange`-driven re-track, and a user-scoped (not tab-scoped) presence key.
5. **Notification write-amplification and unread-count drift** — fanning out a notification write to every follower on high-fan-out events, or caching an unread count that silently drifts from the true row count. **Avoid by:** 1:1 notification events only (no broad fan-out) and computing unread via `COUNT` queries, not a cached counter.

## Implications for Roadmap

Based on research, suggested phase structure (continuing numbering from Wave 3's Phase 7 → **starting at Phase 8**):

### Phase 8: Identity & Schema Foundation
**Rationale:** Zero UI surface, but every later phase depends on it — the architecture and pitfalls research both independently converge on schema-first sequencing.
**Delivers:** Extended `artist_profiles` (member_type, location, open_to, pronouns, banner_url, bio, featured_project_id, search_vector), new `connections` + `blocks` tables with RLS, extended `notifications` (actor snapshot columns + realtime publication), new `dm_thread_reads` table, GIN trigram index, `no_block()` helper, column-level privilege lockdown migration.
**Addresses:** Foundation for all FEATURES.md categories.
**Avoids:** CRITICAL-1 (column exposure), CRITICAL-2 (block bypass), CRITICAL-3 (identity race) — all three are schema/migration-time fixes, cheapest to apply before any UI exists.

### Phase 9: Rich Member Profile
**Rationale:** Ships the design handoff's hero screen and is the first end-to-end exercise of the Phase 8 identity model — validates the architectural bet in the browser before building the network layer on top of it.
**Delivers:** Upgraded `ProfileView`/`/u/[handle]` (banner, avatar, role badges, "Open to" chips, stats sidebar, owner-vs-public switching), `ConnectButton`, profile edit form + image upload.
**Uses:** Supabase Storage transforms (STACK.md), extended `artist_profiles` schema.
**Implements:** Rich Member Profile component boundary (ARCHITECTURE.md).

### Phase 10: Connections & Notifications
**Rationale:** Notifications need Phase 8's table and Phase 9's profile page as a navigation target; must exist before presence/DMs need a bell to update.
**Delivers:** Connection request API (send/accept/decline/withdraw), notifications list + unread badge (realtime + poll fallback), notification panel, nav bell integration, `emitNotification()` helper following the existing `emitActivity()` best-effort contract.

### Phase 11: Presence & DM Widget Upgrade
**Rationale:** Highest-risk phase per PITFALLS.md (3 of 9 moderate pitfalls are presence-specific); isolating it lets verification focus tightly on channel lifecycle correctness.
**Delivers:** DM widget with Presence subscription + "Active now" dot, `dm_thread_reads`-backed DM unread count, cold-outreach rate limiting.
**Avoids:** MOD-1 (channel leakage), MOD-2 (ghost presence), MOD-3 (multi-tab duplication), MINOR-4 (DM abuse).

### Phase 12: Discovery & People Search
**Rationale:** Depends on Phase 8's GIN index and Phase 9's member card component; putting search after presence means users can be found *and* seen as live, which is the more complete discovery experience.
**Delivers:** Server-side-only `searchMembers()` + `/api/network/search`, `PeopleSearch` + `MemberCard` components, `/discover` page, global search in topbar, `middleware.ts` updates for new protected routes.
**Avoids:** MOD-6 (private/blocked-profile leakage via search) by keeping search server-side-only and never exposed to direct PostgREST.

### Phase 13: Network Tab & Trust & Safety
**Rationale:** Closes the loop — connections list UX plus the safety mechanisms (block enforcement, reporting) that should be live before the network is opened to a wider audience.
**Delivers:** `/network` page (connections + pending requests), `ConnectionList`, `isFollowing`/`isConnected`/`isBlocked` graph helpers, block enforcement wired into RLS across all socially-exposed tables, report user/message flow.
**Avoids:** CRITICAL-2 (block bypass, enforced end-to-end here), MINOR-1 (self-claimed verified badge), MINOR-3 (handle squatting).

### Phase Ordering Rationale

- Schema always first — every research document (architecture, pitfalls, features dependency graph) independently confirms this is the correct root of the dependency tree.
- Profile before network actions — the hero screen validates the identity model before connections/notifications are built against it.
- Notifications before presence — the notification table and delivery pattern established in Phase 10 is reused (not rebuilt) for DM unread counts in Phase 11.
- Presence before discovery — surfacing "who's online" is more valuable once there's a live network to discover into.
- Trust & safety last but not deferred — block/report mechanisms ship in the same milestone (Phase 13), not pushed to a later wave, because message-request cold outreach is live starting Phase 10.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 11 (Presence & DM Widget):** Realtime Presence has subtle, hard-to-test failure modes (channel leakage, ghost users, multi-tab dedup) that benefit from an explicit test harness or research-phase pass before implementation.
- **Phase 12 (Discovery & People Search):** pg_trgm/tsvector performance is unvalidated at 10K+ profiles; confirm via `EXPLAIN ANALYZE` against a production-scale sample during planning.

Phases with standard patterns (skip research-phase):
- **Phase 8:** Column-privilege and identity-timing patterns are proven in-codebase (migrations 030/031); this is direct reuse, not novel design.
- **Phase 9:** Design is locked hi-fi; upload/edit patterns are standard CRUD over existing profile-edit conventions.
- **Phase 10:** Notifications/connections are standard relational primitives with an existing `notifications` table to extend.
- **Phase 13:** Primarily CRUD + RLS wiring against patterns established in Phase 8.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Supabase Presence/Storage/postgres_changes verified against official docs; pg_trgm cross-checked across multiple community sources; both new npm packages version-verified. No risky or novel integrations. |
| Features | MEDIUM | Locked hi-fi design is HIGH confidence (concrete spec); competitor analysis (LinkedIn/Vampr/SoundBetter) is MEDIUM (web sources); MVP scope is well-bounded with explicit v1.x/v2+ deferrals. |
| Architecture | MEDIUM | Direct codebase inspection of existing tables/patterns is HIGH; the unified-identity-table recommendation is well-reasoned from that inspection but structurally unvalidated until Phase 9 ships. |
| Pitfalls | MEDIUM | The 3 CRITICAL pitfalls have direct Wave 3 precedent (migrations 030/031) — high confidence these are real and the fix is known-good. Moderate/minor pitfalls are sourced from Supabase docs and community/security write-ups (some LOW-confidence individual sources) but the pattern (presence lifecycle, write-amplification) is well-established generally. |

**Overall confidence:** MEDIUM — high confidence on the two decisions that matter most (unified identity table, column-privilege-first schema work); medium confidence on presence/search behavior at scale, which is exactly why those two phases are research-flagged above.

### Gaps to Address

- **People-search performance at scale:** pg_trgm/tsvector recommended for a network in the hundreds-to-low-thousands range; no load testing performed. Validate with `EXPLAIN ANALYZE` during Phase 12 planning before committing to the plain GIN-index approach at higher member counts.
- **Realtime connection budgeting:** Supabase Pro tier has a concurrent-connection ceiling; no monitoring/alerting strategy defined yet. Set up Realtime connection monitoring during Phase 11 planning.
- **Industry member onboarding/routing:** the identity model (extend `artist_profiles` + `member_type`) is sound, but the actual signup flow — where `app_metadata.role` gets set, what the post-auth redirect is, whether industry members need distinct onboarding from artists — is not yet designed. Resolve during Phase 8 planning, before the migration is finalized.
- **Verified-badge granting workflow:** currently assumed admin-manual with no UI; acceptable for Wave 4 scope but should be explicitly confirmed (not silently deferred) during Phase 13 planning.
- **Handle-reservation list:** squatting risk (MINOR-3) identified but no concrete reserved-handle list exists yet. Needs a product decision (which handles/brands to protect) during Phase 8–9 planning, not purely an engineering call.

## Sources

### Primary (HIGH confidence)
- Supabase Realtime Presence docs (track/untrack/presenceState API): https://supabase.com/docs/guides/realtime/presence
- Supabase postgres_changes subscription + RLS requirement: https://supabase.com/docs/guides/realtime/postgres-changes
- Supabase Storage image transformations: https://supabase.com/docs/guides/storage/image-transformations
- Supabase Full Text Search (tsvector, websearch_to_tsquery, GIN): https://supabase.com/docs/guides/database/full-text-search
- In-codebase precedent: `supabase/migrations/031_curators_column_privileges.sql` (column-level privilege lockdown), `supabase/migrations/030_curators_pitch_history.sql` (identity-timing fix), `supabase/migrations/009_antenna_notifications.sql`, `supabase/migrations/014_dm_realtime.sql`, `lib/social/activity-emit.ts`
- Locked hi-fi design handoff: `docs/design/wave-4-social-layer/README.md`, `user-profile.html`

### Secondary (MEDIUM confidence)
- Supabase Realtime Presence heartbeat/config discussion: https://github.com/orgs/supabase/discussions/30058
- pg_trgm vs tsvector comparison for name/text matching: https://medium.com/@daniel.tooke/performant-text-searching-and-indexes-in-psql-trigrams-like-and-full-text-search-784c000efaa6
- Postgres RLS footguns (views, materialized views, SECURITY DEFINER bypass patterns): https://www.bytebase.com/blog/postgres-row-level-security-footguns/
- date-fns v4 release notes: https://blog.date-fns.org/v40-with-time-zone-support/
- NNG: notification/indicator UX patterns: https://www.nngroup.com/articles/indicators-validations-notifications/

### Tertiary (LOW confidence)
- Real-world Supabase misconfiguration exploitation writeup (PostgREST filter bypass): https://deepstrike.io/blog/hacking-thousands-of-misconfigured-supabase-instances-at-scale
- Social platform fan-out on write vs. read tradeoffs: https://rurutia1027.medium.com/system-design-social-platforms-fan-out-on-write-vs-fan-out-on-read-trade-offs-3a9a6eb339f0
- MagicBell / GetStream blog posts on notification design and block-list/trust-safety patterns (vendor blogs, directionally useful, not verified against Funūn's constraints)

---
*Research completed: 2026-07-03*
*Ready for roadmap: yes*
