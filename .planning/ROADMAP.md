# Roadmap: Funūn

## Milestones

- ✅ **v1.0 — Wave 2: Rights & Registration Rails** — Phases 1–4 (shipped 2026-06-29)
- ✅ **v1.1 — Wave 3: Launchpad** — Phases 5–7 (shipped 2026-07-04)
- 🚧 **v1.2 — Wave 4: The Green Room** — Phases 8–13 (in progress)
- 🚧 **v1.2 — Sound Vault: Playback Room Refinement** — Phase 14 (in progress; cross-domain addition, tracked alongside v1.2 for scheduling purposes only — this is Wave 1 Sound Vault work, not a Green Room networking feature)
- ✅ **v1.2 — Account Capability Model** — Phase 15 (shipped 2026-07-12; cross-cutting identity change, tracked alongside v1.2 for scheduling only — not part of the Green Room feature set)
- 📝 **v1.3 — GTM Beta Launch & Buyer Portal** — Phase 16 (planned 2026-07-18; integrated sync-buyer portal, license-request workflow, deal room, and GTM metrics)

## Phases

<details>
<summary>✅ v1.0 — Wave 2: Rights & Registration Rails (Phases 1–4) — SHIPPED 2026-06-29</summary>

- [x] Phase 1: Collaborator Profiles (4/4 plans) — completed 2026-06-27
- [x] Phase 2: Document Lifecycle (3/3 plans) — completed 2026-06-28
- [x] Phase 3: Rights Guidance (3/3 plans) — completed 2026-06-29
- [x] Phase 4: Collaborator Identity Reconciliation (4/4 plans) — completed 2026-06-29

Full detail: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 — Wave 3: Launchpad (Phases 5–7) — SHIPPED 2026-07-04</summary>

- [x] Phase 5: Launchpad Checklist (6/6 plans) — completed 2026-07-01
- [x] Phase 6: Playlist Curator Pitching (6/6 plans) — completed 2026-07-02
- [x] Phase 7: Social Campaign Planner (6/6 plans) — completed 2026-07-03

Full detail: `.planning/milestones/v1.1-ROADMAP.md`

</details>

### 🚧 v1.2 — Wave 4: The Green Room (In Progress)

**Milestone Goal:** Turn Funūn's thin social layer into a full professional network for the music industry — rich member profiles, discovery, connections, notifications, and real-time presence — recreated pixel-faithfully from the locked hi-fi design handoff.

- [x] **Phase 8: Identity & Schema Foundation** - Extend the member-identity table and stand up the connection/block/notification/presence schema with column-privilege and block-enforcement guarantees baked in (completed 2026-07-05)
- [x] **Phase 9: Rich Member Profile** - Ship the hi-fi hero profile (banner, avatar, role badges, "Open to" chips, stats, releases grid, Featured spotlight) with owner-vs-public view switching and image upload (completed 2026-07-12)
- [ ] **Phase 10: Connections & Notifications** - Follow + Connect request/accept relationships and a notifications bell with unread badge and mark-all-read panel (all 6 plans executed; pending human UAT — /gsd-verify-work 10)
- [x] **Phase 11: Presence & Messaging** - Realtime presence dots + "Active now", floating DM widget with unread badge, cold message-request flow with rate limiting, and direct messaging once connected (implementation complete 2026-07-13; human UAT pending)
- [ ] **Phase 12: Discovery, Feed & People Search** - Green Room feed plus global people search with filters and a Discover tab organized by role and genre, enforced server-side with block/visibility exclusion
- [ ] **Phase 13: Network Tab & Trust & Safety** - Network tab (follows/connections/pending), hard bidirectional block, member/message reporting, admin verified-badge grant, and profile visibility controls

### 🚧 Sound Vault — Playback Room Refinement (In Progress)

**Not part of The Green Room milestone theme.** Surfaced during Phase 9 discussion: the private artist-facing Playback room (`playback.html` design — tracklist editing, WAV/stems upload, credits & splits editing, metadata editing) is existing Wave 1 Sound Vault functionality (`app/(artist)/vault/[projectId]/play/page.tsx`, `components/vault/PlaybackView.tsx`) that needs its own refinement pass, separate from Phase 9's public-player split work.

- [ ] **Phase 14: Playback Room Refinement** - Polish the private Playback room and ship "Export pack" (bundling metadata/stems/master/MP3 for a music supervisor) — scope TBD pending discussion (execution complete 2026-07-06; awaiting UAT — see 14-UAT.md)

### ✅ Account Capability Model (Complete)

**Cross-cutting identity change — not part of The Green Room feature set.** Surfaced during a discussion about the artist/industry account split: today `member_type` is a single exclusive value set at account creation, so one login can never hold both artist and industry capabilities. Replaced with a `capability_grants` table (D-01/D-02) and a unified, capability-aware nav (D-05/D-08); the artist→instant / industry→admin-approved asymmetric gate (D-02) plus the in-app approval queue (D-03) closed the loop.

- [x] **Phase 15: Account Capability Model** - Replace the single `member_type` value with multiple capability grants on one account (4/4 plans executed 2026-07-12)

### 📝 v1.3 — GTM Beta Launch & Buyer Portal (Planned)

**Milestone Goal:** Turn the external GTM/business plan into a product-backed beta launch motion. Phase 16 creates the buyer-side pathway for Hook-style sync buyers to discover rights-ready catalog, submit structured license requests, track request status, and move through a founder/admin deal workflow that links back to Sound Vault, Contract Locker, and e-sign state.

- [ ] **Phase 16: GTM Beta Launch & Buyer Portal** - Specialized sync-buyer account/portal planning, first-class `license_requests`, safe "Request License" entry points, deal-room/admin workflow, Contract Locker/e-sign handoff, and GTM beta metrics.

## Phase Details

### Phase 8: Identity & Schema Foundation

**Goal**: The database is ready to back a professional network — one unified member-identity model with the connection, block, notification, and presence-read tables in place, and private fields locked down before any UI can expose them.
**Depends on**: Phase 7 (previous milestone)
**Requirements**: (foundation — no user-facing requirement lands here; every requirement in Phases 9–13 depends on this schema)
**Success Criteria** (what must be TRUE):

  1. `artist_profiles` carries the extended identity columns (member_type, location, pronouns, banner_url, bio, open_to, featured_project_id, search_vector) with a GIN trigram index for search
  2. New `connections` (mutual request/accept) and `blocks` (bidirectional) tables exist with RLS enabled, and a `no_block()` SECURITY DEFINER helper gates inserts on socially-exposed tables
  3. The `notifications` table is extended with actor-snapshot columns and added to the realtime publication; a `dm_thread_reads` table exists for DM unread counts
  4. A column-level REVOKE/GRANT migration ships in the same migration that adds any private column, so no authenticated user can read private fields via direct PostgREST
  5. Industry-member identity is created without a `handle_new_user()` phantom-row race (role set at `admin.createUser()` time, early-return branch added)

**Design references**: none in the design bundle — schema-only phase, no user-facing requirement. The one small UI surface (admin industry-member invite page) is ad hoc, not a hi-fi mockup from `docs/design/wave-4-social-layer/`.

**Plans**: 6/6 plans complete

- [x] 08-01-PLAN.md
- [x] 08-02-PLAN.md
- [x] 08-03-PLAN.md
- [x] 08-04-PLAN.md
- [x] 08-05-PLAN.md
- [x] 08-06-PLAN.md

### Phase 9: Rich Member Profile

**Goal**: A member's `/u/[handle]` profile renders the locked hi-fi hero screen and behaves differently for the owner versus a visitor — proving the unified-identity model end-to-end in the browser.
**Depends on**: Phase 8
**Requirements**: PROFILE-01, PROFILE-02, PROFILE-03, PROFILE-04, PROFILE-05, PROFILE-06, PROFILE-07, PROFILE-08, PROFILE-09
**Success Criteria** (what must be TRUE):

  1. User sees a rich profile header — banner, avatar with presence dot, name, pronouns, verified badge, and multi-role badges with the lead role highlighted, plus a standard-or-custom title
  2. User sees location, tenure ("On Funūn since [year]"), "Open to" status chips, a stats sidebar (followers, monthly listeners, placements, avg. readiness), and a releases grid with readiness rings on any profile
  3. User can pin one release as a "Featured" spotlight on their profile
  4. Profile owner sees Edit profile / Share / View analytics actions and can upload/edit their banner and avatar; a visitor sees Follow / Message / more-options instead

**Plans**: 6/6 plans complete

Plans:

- [x] 09-01a-PLAN.md — Wave 0 foundation (autonomous): four RED Jest scaffolds + `"test": "jest"` script + additive `TrackLyrics.synced` (D-13) + `OPEN_TO_VALUES` export
- [x] 09-01b-PLAN.md — DB/API layer: `lib/profile/validate.ts` validators (GREEN) + PATCH allowlist/featured pre-check + placements stat + migration 043 (`allow_resharing`) + [BLOCKING] schema push
- [x] 09-02-PLAN.md — Avatar/banner upload route + `AvatarBannerUpload` component (vault-assets bucket, PROFILE-09)
- [x] 09-03-PLAN.md — Public `PublicPlaybackView` (+ own `PublicTrackView` type) + `LyricsPanel` + `/r/[projectId]` render swap (D-01..D-14)
- [x] 09-04-PLAN.md — Settings roles/open-to/resharing editors + `ShareButton` + `ProfileMoreMenu` + `FeaturedPicker` (PROFILE-02/04/05/08)
- [x] 09-05-PLAN.md — ProfileView + `/u/[handle]` integration: presence dot, placements row, mount share/upload/picker/menu, server-resolved absolute `profileUrl` (PROFILE-01/03/06/08/09)

**Wave 1**: 09-01a (Wave 0 tests + additive types — autonomous)
**Wave 2** *(blocked on 09-01a)*: 09-01b (validators GREEN + allowlist + placements + migration 043 + [BLOCKING] push)
**Wave 3** *(blocked on 09-01b)*: 09-02 ‖ 09-03 ‖ 09-04 (parallel — zero file overlap)
**Wave 4** *(blocked on 09-01b, 09-02, 09-04)*: 09-05 (ProfileView + page integration)

**UI hint**: yes
**Design references**: `docs/design/wave-4-social-layer/user-profile.html` (primary — header, roles, stats, releases grid, Featured spotlight, owner-vs-visitor actions), `artist-profile.html` (the new public "now playing" player, D-01), `playback.html` (contrast only — stays the private working room, out of this phase's scope). Full detail already gathered in `09-CONTEXT.md`.

### Phase 10: Connections & Notifications

**Goal**: Members can build an explicit graph — follow one-way or send a mutual Connect request — and get told when something happens to them, via a bell with an accurate unread count.
**Depends on**: Phase 9
**Requirements**: CONNECT-01, CONNECT-02, NOTIF-01, NOTIF-02, NOTIF-03
**Success Criteria** (what must be TRUE):

  1. User can follow another member with no approval, and can send a Connect request that the recipient can accept or decline to establish a mutual connection
  2. User receives a notification for each of: new follower, connection request, connection accepted, message request, new DM, release comment, endorsement received, and wall post received
  3. User sees an unread-count badge on the notifications bell that is separate from the messages-icon badge
  4. User can open a notification panel, see the list, and mark all as read

**Plans**: 6/6 plans complete

Plans:

- [x] 10-01-PLAN.md — Foundation (Wave 0/1): 3 RED Jest scaffolds + notification type catalog & per-type builders + connect payload/transition builders + `createNotification()`/`Notification` actor-snapshot extension
- [x] 10-02-PLAN.md — Migration 044 (`connections.note` + `no_block()` gap close + SECURITY DEFINER auto-follow-seed trigger) + [BLOCKING] schema push
- [x] 10-03-PLAN.md — API routes: `app/api/connections/route.ts` (request/accept/decline/withdraw) + `app/api/notifications/route.ts` (list+unread COUNT, mark-all-read)
- [x] 10-04-PLAN.md — Notification trigger wiring into 4 existing routes (follows→new_follower, wall→wall_post, endorsements→endorsement, release-comments→release_comment)
- [x] 10-05-PLAN.md — NotificationBell (global Realtime+poll badge) + NotificationPanel (dropdown, mark-all-read, inline accept/decline, cursor pagination) + net-new authenticated header row
- [x] 10-06-PLAN.md — ConnectButton (3-state + note composer + inline accept/decline) + ProfileView mount + `#wall`/`#endorsements` anchors + page connect-state derivation

**Wave 1**: 10-01 (autonomous — pure builders + type extensions + Wave-0 tests)
**Wave 2** *(blocked on 10-01)*: 10-02 (migration 044 + [BLOCKING] schema push — not autonomous)
**Wave 3** *(blocked on 10-01, 10-02)*: 10-03 ‖ 10-04 (parallel — zero file overlap: new API routes vs. modified existing routes)
**Wave 4** *(blocked on 10-03)*: 10-05 ‖ 10-06 (parallel — zero file overlap: nav/layout surfaces vs. profile surfaces; both end in a human-verify checkpoint)

**UI hint**: yes
**Design references**: `docs/design/wave-4-social-layer/user-profile.html` — only partial precedent exists: the Follow/Message profile actions (`.pf-actions`) and the topbar notification bell with unread dot (`.pf-iconbtn .dotn`, top-right). **Gap**: no notification panel/dropdown (the actual list shown when the bell is clicked, with mark-all-read) exists anywhere in the design bundle — net-new screen design captured in `10-UI-SPEC.md` (header row, bell+badge+panel, ConnectButton+note composer).

### Phase 11: Presence & Messaging

**Goal**: The network feels alive — members see who is online, message strangers safely through a rate-limited request flow, and message connections directly, all from a floating DM widget that shows unread counts and live "Active now" status.
**Depends on**: Phase 10
**Requirements**: PRESENCE-01, PRESENCE-02, PRESENCE-03, CONNECT-03, CONNECT-04, CONNECT-05
**Success Criteria** (what must be TRUE):

  1. User sees an online presence dot on another member's avatar when they are actively on the platform, and "Active now" / "Active X ago" in the DM widget header
  2. The floating DM widget shows an unread message-count badge
  3. User can send a message request to a non-connection; the recipient can accept (opens a DM thread), decline, or block
  4. User is rate-limited on outbound cold message requests (e.g. 10/week), and can message a mutual connection directly with no request step

**Plans**: 6/6 plans complete

Plans:

- [x] 11-01-PLAN.md — Wave 0 (autonomous): RED tests + pure helpers — `lib/social/presence.ts` (D-21 buckets), `dm.ts` gate/rate-limit/unread helpers + constants (10/30/3), `notifications.ts` message_request/new_dm builders + catalog
- [x] 11-02-PLAN.md — Migration 054 (`dm_threads.status`+`requester_id`, `artist_profiles.last_seen_at` + column GRANT) + [BLOCKING] schema push
- [x] 11-03-PLAN.md — DM API layer: `/api/dm/send` connection-gate + rate limit + request flow; net-new threads/read/request(accept·decline·block)/presence-heartbeat routes
- [x] 11-04-PLAN.md — Nav surfaces: `MessagesIcon` (unread badge) + `PresenceTracker` (single presence-global channel + heartbeat) + `ArtistLayoutClient` docked-widget host + layout/nav wiring
- [x] 11-05-PLAN.md — `/messages` inbox: page + `MessagesPageClient` two-pane, `ThreadList` (+Requests section), `ConversationView`, `RequestView`, `DockedWidget`, `Composer` (budget hint + rate-limit wall)
- [x] 11-06-PLAN.md — Profile surface: live `ProfilePresenceDot` Online pill + Message button → `/messages?with=` link; retire in-place `DmWidget`

**Wave 1**: 11-01 (autonomous — RED tests + pure helpers)
**Wave 2** *(blocked on 11-01)*: 11-02 (migration 054 + [BLOCKING] schema push — not autonomous)
**Wave 3** *(blocked on 11-01, 11-02)*: 11-03 ‖ 11-04 (parallel — API routes vs. nav/layout surfaces; zero file overlap)
**Wave 4** *(blocked on 11-03, 11-04)*: 11-05 ‖ 11-06 (parallel — messages inbox surfaces vs. profile surfaces; zero file overlap)

**UI hint**: yes
**Design references**: `docs/design/wave-4-social-layer/user-profile.html` — strong existing precedent, fully designed already: the floating DM widget (`.pf-dm` — header with avatar + "Active now" presence status, message bubbles for both sides, date divider, composer + send button) and the profile avatar's online-presence dot (`.pf-avatar .live`, green dot + "Online" label). **Gap**: no message-request (cold-outreach accept/decline/block) screen or rate-limit UI exists in the bundle — net-new design captured in `11-UI-SPEC.md`; the DM widget itself is recreated directly (`DockedWidget`/`ConversationView`).

### Phase 12: Discovery, Feed & People Search

**Goal**: Members can find each other — a Green Room feed, global search bar, and Discover tab surface artists and industry pros through public activity, name, role, genre, and availability, enforced server-side so private and blocked profiles never leak.
**Depends on**: Phase 11
**Requirements**: DISCOVER-01, DISCOVER-02, DISCOVER-03, FEED-01 through FEED-18
**Success Criteria** (what must be TRUE):

  1. User can click "The Green Room" in the left-side app navigation and land on the feed as the room's default home
  2. User can open a Green Room feed showing recent public activity from followed/connected members plus discoverable public members
  3. Feed cards include actor context and exploration actions: avatar, name, role, handle, activity type, timestamp, profile/release links, and follow/connect/message where appropriate
  4. User can search for members by name, role, or keyword via a global search bar
  5. User can filter search/discovery results by role, "Open to" status, location, and genre
  6. User can browse a Discover tab organized by role category and genre
  7. Feed, search, and discovery run server-side only and exclude blocked members, non-public profiles, and activity the viewer is not allowed to see
  8. Feed layout reserves clearly labeled promotional/sponsored slots for future monetization without shipping paid ad buying, targeting, or billing in v1
  9. Secondary Green Room entry points may exist (for example header shortcut or dashboard card), but they route to the same feed destination and do not create duplicate feed logic
  10. User can create structured feed posts from a guided composer with visibility controls, linked Funūn objects, lightweight comments/reactions, and strongly safeguarded repost/share behavior
  11. Green Room launches with For You, Following, Discover, and Opportunities tabs, with a hybrid opportunity model that keeps formal opportunities in Antenna while allowing lighter opportunity/collab posts in the feed
  12. Admin-curated sponsored/featured placements can promote members, public releases/projects, opportunities/open calls, partner cards, or curated programs, with self-serve paid ads intentionally deferred

**Plans**: `12-01` through `12-10` drafted; `12-03` through `12-08` implemented on `codex/phase-11-presence-messaging`; People Search execution notes live in `.planning/phases/12-discovery-feed-people-search/12-09-EXECUTION-NOTES.md`; Thomas review packet lives in `.planning/phases/12-discovery-feed-people-search/12-PR-REVIEW-PACKET.md`
**UI hint**: yes
**Design references**: `docs/design/wave-4-social-layer/user-profile.html` — only a static topbar search input (`.pf-search`, placeholder "Search artists, producers, supervisors…") exists as precedent; it is not wired to any results UI. **Gap**: no feed layout, composer, search-results layout, filter panel, or Discover-tab screen exists anywhere in the design bundle. `docs/design/wave-4-social-layer/antenna.html`'s filter-panel *pattern* (checkboxes with counts, a "minimum match" slider, tag chips) is a plausible structural reference to adapt, though it was designed for opportunity matching, not people search. The existing left sidebar (`components/nav/ArtistNav.tsx`) is the primary entry point: add a universal "The Green Room" item that routes to the feed landing page (likely `/green-room` or `/green-room/feed`, to be finalized in Phase 12 planning). The existing profile wall/activity surfaces and `activity_events`/`wall_posts` models are the brownfield feed substrate, but Phase 12 needs its own net-new screen design during `/gsd-ui-phase`. See `.planning/quick/260715-green-room-feed-plan/DISCUSSION-LOG.md` for the locked product decisions behind FEED-01 through FEED-18.

### Phase 13: Network Tab & Trust & Safety

**Goal**: The network closes the loop and is safe to open — members manage their relationships in a Network tab and are protected by hard blocks, reporting, admin verification, and visibility controls before wider outreach goes live.
**Depends on**: Phase 12
**Requirements**: DISCOVER-04, SAFETY-01, SAFETY-02, SAFETY-03, SAFETY-04
**Success Criteria** (what must be TRUE):

  1. User can browse a Network tab showing people they follow, are connected with, or have pending requests with
  2. User can block another member, and a blocked member cannot view the blocker's profile, message them, or see them in search/discovery results (enforced in RLS, not just the UI)
  3. User can report a member profile or a specific message for admin review, and an admin can grant a verified badge to a member profile
  4. User can set profile visibility (public / connections-only) and can hide their "Open to" status from public view

**Plans**: 3/5 plans executed

- [x] 13-01-PLAN.md
- [x] 13-02-PLAN.md
- [ ] 13-03-PLAN.md
- [x] 13-04-PLAN.md
- [ ] 13-05-PLAN.md

**UI hint**: yes
**Design references**: none. No file in the design bundle (`docs/design/wave-4-social-layer/`) shows a Network tab, block/report flow, admin verified-badge grant UI, or visibility-control settings — this phase has **zero existing visual precedent** and needs full net-new UI design during its `/gsd-ui-phase` run.

### Phase 14: Playback Room Refinement

**Goal**: The private Playback room (`playback.html`'s design) is polished for the artist's own working use, and a music supervisor or other industry recipient can be handed a complete export (stems, master, MP3, credits, metadata) without needing app access — distinct from Phase 9's public-only "now playing" share player, which stays deliberately stripped of this detail.
**Depends on**: None (existing Wave 1 Sound Vault feature — independent of the Phase 8–13 Green Room chain)
**Requirements**: TBD — pending `/gsd-discuss-phase 14`
**Success Criteria** (what must be TRUE):

  1. Clicking a Sound Vault project card lands on the playback room; the management page is reachable from it (D-01)
  2. Real stems (250MB ZIP) + instrumental support: Master/Instrumental toggle swaps the audio source, "Download stems" is a separate button, both upload direct-to-storage (D-03..D-08)
  3. A readiness-score widget appears in the topbar and inline, linking to the management page (D-02)
  4. Export Pack bundles every available artifact (master, MP3, stems, instrumental) + credits/splits PDF + metadata PDF, delivered as an immediate download or a 7-day expiring shareable link (D-10..D-12)

**Plans**: 6/6 plans complete
**Wave 1**

- [x] 14-01-PLAN.md — Storage config (250MB + ZIP MIME) + schema readers + packages (archiver/@react-pdf/renderer/tus-js-client)
- [x] 14-02-PLAN.md — D-01 navigation: project card → playback room; management page → playback room link

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 14-03-PLAN.md — Stems + instrumental JSON-only metadata routes (direct-to-storage, no byte proxy)
- [x] 14-04-PLAN.md — Export Pack manifest builder + credits/metadata PDF templates

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 14-05-PLAN.md — Playback room rework: Master/Instrumental toggle, uploads, Download-stems, readiness widgets, signed-URL playback fix

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 14-06-PLAN.md — Export Pack route (assemble→upload→signed URL, Hobby-safe) + delivery-choice panel

**UI hint**: yes
**Design references**: `docs/design/wave-4-social-layer/playback.html` (primary target), `sound-vault.html` (D-01 project-card link target), `release-readiness.html` (D-02 widget link target — this phase adds a link to it, does not rebuild it), `artist-profile.html` (contrast only — Phase 9's public player, NOT this phase's scope). Full detail already gathered in `14-CONTEXT.md` / `14-RESEARCH.md`.

### Phase 15: Account Capability Model

**Goal:** A member can hold both artist and industry capabilities on a single account — `member_type` becomes a set of granted capabilities rather than one exclusive value, so a songwriter who is also an industry contact doesn't need a second signup to use both Sound Vault and Antenna.
**Requirements**: TBD (no REQUIREMENTS.md IDs yet — this predates that scoping; decisions D-01..D-14 in 15-CONTEXT.md are the acceptance source)
**Depends on:** Phase 13 (sequencing only — not a technical blocker; scheduled after Green Room ships and beta testing begins, per explicit user decision)
**Plans:** 6/6 plans complete

**Wave 1**

- [x] 15-01-PLAN.md — capability_grants schema (migration 042) + lib/capabilities grant/check helpers + Wave 0 tests + [BLOCKING] schema push (D-01/D-02/D-10/D-12/D-14 foundation)

**Wave 2** *(blocked on Wave 1)*

- [x] 15-02-PLAN.md — capabilities request + admin approve API routes; D-14 server-side hasCapability() enforcement on opportunity posting

**Wave 3** *(blocked on Wave 2)*

- [x] 15-03-PLAN.md — unified capability-aware ArtistNav (D-05/D-08), (industry) layout retirement + route relocation (D-06/D-07), D-09 footer request CTA (depends on 15-02's /api/capabilities/request route)
- [x] 15-04-PLAN.md — admin capability-requests approval queue page + component (D-03/D-11)

### Phase 16: GTM Beta Launch & Buyer Portal

**Goal:** Build the product foundation for founder-led sync buyer deals: a specialized buyer account/portal, structured license requests, safe buyer discovery/request entry points, admin deal workflow, Contract Locker/e-sign handoff, and metrics that validate whether the GTM motion is repeatable.
**Requirements**: TBD (planning source: `.planning/phases/16-gtm-beta-buyer-portal/16-CONTEXT.md` decisions D-01 through D-10)
**Depends on:** Phase 13 for broad buyer visibility and trust/safety enforcement; Phase 15 capability model as precedent for specialized account capabilities. Invite-only/founder-assisted beta work can be planned before full broad rollout if privacy gates are explicit.
**Plans:** 0/5 executed; 5/5 drafted

**Wave 1**

- [ ] 16-01-PLAN.md — buyer identity, capability, verification model, and permission tiers

**Wave 2** *(blocked on Wave 1)*

- [ ] 16-02-PLAN.md — `license_requests` schema, lifecycle states, buyer/admin API route plan, and privacy doctrine

**Wave 3** *(blocked on Wave 2)*

- [ ] 16-03-PLAN.md — buyer portal MVP, request composer, request status dashboard, and safe "Request License" entry points

**Wave 4** *(blocked on Wave 3)*

- [ ] 16-04-PLAN.md — deal room/admin workflow, Contract Locker handoff, and e-sign provider decision checkpoint

**Wave 5** *(blocked on Wave 4)*

- [ ] 16-05-PLAN.md — GTM beta metrics, enablement artifacts, and rollout gates for broader outreach/AE hiring

**Planning note:** The external GTM plan's Tally/Typeform bridge is intentionally reframed here. Manual intake may exist only as a temporary founder/admin fallback that writes into the same product tables and workflows. The default product direction is an integrated buyer portal with specialized sync-buyer accounts, not a long-lived external form sidecar.

## Future Roadmap Candidates

### Contract Locker Intelligence & Deal Audit

**Product note added 2026-07-15:** The Contract Locker should evolve from upload/status tracking into a secure legal-document intelligence layer for artists and industry members. The future version should securely store, organize, and bulk-analyze the legal documents the music industry relies on, while also helping draft simple, standard documents that do not require bespoke legal negotiation.

**Core capabilities to plan:**

1. Securely store and organize uploaded agreements, split sheets, work-for-hire docs, producer agreements, publishing/admin deals, distribution deals, label/record offers, licensing paperwork, and related legal PDFs
2. Bulk-analyze document sets so an artist can ask cross-document questions, compare terms, surface conflicts, and see obligations across multiple agreements
3. Summarize uploaded offers and agreements into artist-readable key points: parties, term, territory, rights granted, exclusivity, recoupment, royalty/split terms, audit rights, delivery obligations, termination windows, and unusual/risky clauses
4. Draft simple music-industry documents from structured inputs, while routing complex or high-risk drafting to qualified legal review
5. Feed suggested next steps into Rights Coach: what to verify, who to contact, what documents are missing, what registration or notification should happen next, and when an entertainment attorney or specialized professional should be involved
6. Support a trusted-help pathway: if Funūn has an entertainment attorney, legal partner, or approved service provider available, eligible members can be guided toward those services without the product pretending to provide legal advice itself
7. Model earnings/audit scenarios from all relevant documents: song splits, publishing-admin terms, distribution/label terms, recoupment, fees, royalty rates, territories, payment schedules, and DSR/earnings imports where available
8. Help artists audit counterparties by comparing expected earnings against reported/paid earnings and highlighting discrepancies, missing statements, suspicious deductions, or contract terms that require human review

**Guardrails:** This should be positioned as legal-document organization, summaries, issue spotting, workflow guidance, and earnings modeling — not as a substitute for counsel. Any "deal risk" or attorney-access feature needs legal/compliance review before implementation.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Collaborator Profiles | v1.0 | 4/4 | Complete | 2026-06-27 |
| 2. Document Lifecycle | v1.0 | 3/3 | Complete | 2026-06-28 |
| 3. Rights Guidance | v1.0 | 3/3 | Complete | 2026-06-29 |
| 4. Collaborator Identity Reconciliation | v1.0 | 4/4 | Complete | 2026-06-29 |
| 5. Launchpad Checklist | v1.1 | 6/6 | Complete | 2026-07-01 |
| 6. Playlist Curator Pitching | v1.1 | 6/6 | Complete | 2026-07-02 |
| 7. Social Campaign Planner | v1.1 | 6/6 | Complete | 2026-07-03 |
| 8. Identity & Schema Foundation | v1.2 | 6/6 | Complete   | 2026-07-05 |
| 9. Rich Member Profile | v1.2 | 6/6 | Complete    | 2026-07-12 |
| 10. Connections & Notifications | v1.2 | 6/6 | Verifying  | - |
| 11. Presence & Messaging | v1.2 | 6/6 | Complete   | 2026-07-13 |
| 12. Discovery & People Search | v1.2 | 0/TBD | Not started | - |
| 13. Network Tab & Trust & Safety | v1.2 | 3/5 | In Progress|  |
| 14. Playback Room Refinement | v1.2 (Sound Vault) | 6/6 | Complete   | 2026-07-07 |
| 15. Account Capability Model | v1.2 (cross-cutting) | 4/4 | Complete | 2026-07-12 |
| 16. GTM Beta Launch & Buyer Portal | v1.3 | 0/5 | Planned | Docs-only plan set drafted 2026-07-18 |
