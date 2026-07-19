# Roadmap: Funūn

## Milestones

- ✅ **v1.0 — Wave 2: Rights & Registration Rails** — Phases 1–4 (shipped 2026-06-29)
- ✅ **v1.1 — Wave 3: Launchpad** — Phases 5–7 (shipped 2026-07-04)
- 🚧 **v1.2 — Wave 4: The Green Room** — Phases 8–13 (in progress)
- 🚧 **v1.2 — Sound Vault: Playback Room Refinement** — Phase 14 (in progress; cross-domain addition, tracked alongside v1.2 for scheduling purposes only — this is Wave 1 Sound Vault work, not a Green Room networking feature)
- ✅ **v1.2 — Account Capability Model** — Phase 15 (shipped 2026-07-12; cross-cutting identity change, tracked alongside v1.2 for scheduling only — not part of the Green Room feature set)
- 📝 **v1.3-pre — Split-Sheet E-Sign** — Phase 17 (decided 2026-07-19; EXECUTES BEFORE Phase 16 — free embedded mobile-first e-signed split sheets for all artists, DocuSeal hosted; access model per `.planning/deliberations/esign-split-sheet-economics.md` AM-1..AM-5)
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
- [x] **Phase 10: Connections & Notifications** - Follow + Connect request/accept relationships and a notifications bell with unread badge and mark-all-read panel (UAT passed 2026-07-13, 16/16 truths — checkbox was stale; corrected 2026-07-18)
- [x] **Phase 11: Presence & Messaging** - Realtime presence dots + "Active now", floating DM widget with unread badge, cold message-request flow with rate limiting, and direct messaging once connected (implementation complete 2026-07-13; human UAT waived by owner 2026-07-18)
- [x] **Phase 12: Discovery, Feed & People Search** - Green Room feed plus global people search with filters and a Discover tab organized by role and genre, enforced server-side with block/visibility exclusion (goal-verified 21/21 2026-07-18; browser UAT waived by owner — see 12-BROWSER-UAT-CHECKLIST.md waiver record)
- [x] **Phase 13: Network Tab & Trust & Safety** - Network tab (follows/connections/pending), hard bidirectional block, member/message reporting, admin verified-badge grant, and profile visibility controls (completed 2026-07-18)

### 🚧 Sound Vault — Playback Room Refinement (In Progress)

**Not part of The Green Room milestone theme.** Surfaced during Phase 9 discussion: the private artist-facing Playback room (`playback.html` design — tracklist editing, WAV/stems upload, credits & splits editing, metadata editing) is existing Wave 1 Sound Vault functionality (`app/(artist)/vault/[projectId]/play/page.tsx`, `components/vault/PlaybackView.tsx`) that needs its own refinement pass, separate from Phase 9's public-player split work.

- [x] **Phase 14: Playback Room Refinement** - Polish the private Playback room and ship "Export pack" (bundling metadata/stems/master/MP3 for a music supervisor) (execution complete 2026-07-06; UAT waived by owner 2026-07-18 — see 14-UAT.md waiver record; HOBBY-1 large-upload check is the notable residual risk)

### ✅ Account Capability Model (Complete)

**Cross-cutting identity change — not part of The Green Room feature set.** Surfaced during a discussion about the artist/industry account split: today `member_type` is a single exclusive value set at account creation, so one login can never hold both artist and industry capabilities. Replaced with a `capability_grants` table (D-01/D-02) and a unified, capability-aware nav (D-05/D-08); the artist→instant / industry→admin-approved asymmetric gate (D-02) plus the in-app approval queue (D-03) closed the loop.

- [x] **Phase 15: Account Capability Model** - Replace the single `member_type` value with multiple capability grants on one account (4/4 plans executed 2026-07-12)

### 📝 v1.3 — GTM Beta Launch & Buyer Portal (Planned)

**Milestone Goal:** Turn the external GTM/business plan into a product-backed beta launch motion. Phase 16 creates the buyer-side pathway for Hook-style sync buyers to discover rights-ready catalog, submit structured license requests, track request status, and move through a founder/admin deal workflow that links back to Sound Vault, Contract Locker, and e-sign state.

- [ ] **Phase 16: GTM Beta Launch & Buyer Portal** - Specialized sync-buyer account/portal planning, first-class `license_requests`, safe "Request License" entry points, deal-room/admin workflow, Contract Locker/e-sign handoff, and GTM beta metrics.

### 📝 v1.3-pre — Split-Sheet E-Sign (Planned — EXECUTES BEFORE PHASE 16)

**Sequencing note:** numbered 17 but ships first (per AM-5, deliberation session 2026-07-19) — artist-side value and stickiness before the buyer portal. This becomes Funūn's FIRST live e-sign integration; 16-09's SignWell adapter lands second and reuses this phase's webhook/route patterns.

**Goal:** Any artist can generate a split sheet from project metadata and get it e-signed by all collaborators without anyone leaving Funūn — embedded, mobile-first (the studio-with-only-a-phone scenario is the canonical test), free to every artist within structural guardrails.

**Locked inputs (do not re-litigate in discuss-phase):** D-18b (embedded + mobile-first requirements, dual-provider architecture), AM-1..AM-5 (access model: free with guardrails, $500/mo re-decision trigger, template-only envelope, ~10/mo soft cap, readiness minimum, DocuSeal hosted ~$0.20/completed doc).

**Planning prerequisites (human):** DocuSeal trial account → inspect a real Certificate of Signature, confirm white-label scope/price, run the 3-signer async multi-party test, check deliverability. Spikes 006a/006b/007 carry the verified groundwork.

- [ ] **Phase 17: Split-Sheet E-Sign** - DocuSeal adapter behind lib/esign/provider.ts, split-sheet template generation from vault metadata (composers/splits/IPI already captured), multi-party embedded signing flow, signed-PDF + certificate landing in Contract Locker, per-artist cap + readiness gate, usage/cost telemetry feeding the AM-3 trigger.

**Current-state map (read before discuss-phase — investigated 2026-07-19):**

The split-sheet pipeline is further along than the Wave 2 "upload-only" story — AND fractured into three systems that never touch:

1. **Approval pipeline (lives in `split_sheets` + `split_sheet_parties`, migration 018):** Any authenticated user (producer, writer, or artist — no project required; `vault_project_id` nullable) initiates via `SplitSheetBuilder` at `/split-sheets` or from Contract Locker. CollaboratorPicker pre-fills parties from Wave 2 collaborator profiles (name/email/PRO/IPI); even-split helper; hard 100.000% total gate (client + server). "Send for approval" mints a per-party 64-char crypto token (30-day expiry), flips sheet to `pending_approval`, and emails each party (Resend) the proposed split table + a link to the PUBLIC `/approve/[token]` page — no account needed, token IS the identity. Each party independently Approves or **Counters** (first-class: sheet → `countered`, initiator notified). Last approval auto-flips sheet → `approved` + `all_approved_at`. **No PDF is ever generated; nothing is signed.** Statuses: draft → pending_approval → approved/countered.
2. **Document/readiness system (`vault_documents`, Wave 2):** readiness's 15-point "Split sheets signed" gate checks ONLY uploaded docs of type `split_sheet` (`signedOf()`: none → missing; uploaded-not-signed → warning; all marked signed → complete). The approval pipeline NEVER moves this — a unanimously approved sheet scores 0/15.
3. **Metadata studio composer splits (`tracks.metadata.composers[]`):** a third splits representation; Contract Locker cross-checks it (flags ≠100%) but neither of the above reads or writes it.

**Readiness behavior across the lifecycle — TODAY vs proposed (proposal = discussion input, NOT locked):**

| Lifecycle point | Readiness today | Proposed for discussion |
|---|---|---|
| Sheet initiated (draft) | missing (0/15) | missing — drafting shouldn't score |
| Sent; awaiting opens/approvals | missing | warning tier 1 (e.g. ~5/15) — "sent, awaiting responses" with per-party chips |
| Counter received | missing | back to warning tier 1 with a visible "renegotiating" flag — a counter is progress, not regression, but must not score higher than consensus |
| All parties approved (terms agreed), e-sign not yet sent/complete | missing (!) | warning tier 2 (e.g. ~10/15) — "terms agreed, signatures pending"; this is the moment the DocuSeal envelope mints (AM-2: only from approved data) |
| Partially signed (some parties executed) | n/a (no e-sign exists) | stays warning tier 2 with per-party signed chips |
| Fully executed (all signatures + Certificate) | complete ONLY via manual upload marked signed | complete (15/15) — signed PDF + Certificate auto-land in `vault_documents` as `split_sheet`/`signed`, moving the existing gate with zero readiness-schema change |

**Phase 17 is therefore a CONVERGENCE phase, not an add-a-feature phase.** Natural shape: approval pipeline stays the negotiation front-end (KEEP approve-then-sign two-step — don't burn $0.20 envelopes on contested splits); unanimous approval triggers PDF generation (the missing split-sheet renderer alongside lib/vault/pdf/metadata-sheet + credits-sheet) → DocuSeal envelope; approval tokens map to signer identities; execution lands signed PDF + Certificate in vault_documents (readiness moves via the EXISTING gate); approved splits reconcile with metadata-studio composer splits instead of living beside them.

**Discuss-phase agenda (beyond the locked AM-1..5 / D-18b):** (1) confirm approve-then-sign vs sign-is-approve; (2) the readiness stage-mapping above (tier scores; whether the split_sheets item description changes; NOTE any point-value change redistributes every project's score — deliberate decision, AM-2 precedent applies); (3) standalone sheets (`vault_project_id = null` — industry-initiated) have no readiness to move and no project metadata to reconcile: define their e-sign + storage story; (4) counter-after-approval and re-negotiation after envelope mint (void/reissue rules, cap interaction); (5) three-way splits reconciliation (approval parties vs composers[] vs signed PDF) — which is authoritative after execution; (6) notification surfaces for the initiator (per-party opened/approved/countered/signed chips — Phase 10 notifications + where they render).

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

**Plans**: 5/5 plans complete

- [x] 13-01-PLAN.md
- [x] 13-02-PLAN.md
- [x] 13-03-PLAN.md
- [x] 13-04-PLAN.md
- [x] 13-05-PLAN.md

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
**Requirements**: BUYER-01..07 · DEAL-01..07 · PORTAL-01..05 · ARTIST-01,02 · ADMIN-01..03 · MONEY-01..03 · PAPER-01..04 · DELIVERY-01 · METRICS-01,02 (34 IDs; registered in REQUIREMENTS.md by plan 16-10, planning source: `16-CONTEXT.md` decisions D-01 through D-20)
**Depends on:** Phase 13 for broad buyer visibility and trust/safety enforcement (shipped 2026-07-18 — prerequisite satisfied); Phase 15 capability model as precedent only (D-11 deliberately does NOT use it). Phase 14 export pack is reused unchanged for buyer delivery.
**Plans:** 0/10 executed; 10/10 drafted (replanned 2026-07-18 after the discuss-phase session locked D-11..D-20; supersedes the earlier 5-plan draft)

**Wave 1** *(schema + contracts — parallel, disjoint files)*

- [ ] 16-01-PLAN.md — buyer org/member schema, `handle_new_user` buyer early-return branch, permission tiers (migration 062, human-gated push)
- [ ] 16-02-PLAN.md — `license_requests`/`license_request_tracks`/`project_license_terms` schema, sync-license document type, matching + commission logic (migration 063, human-gated push)

**Wave 2** *(account/org machinery + artist surfaces)*

- [ ] 16-03-PLAN.md — admin-created buyer orgs, org-admin employee invites, buyer portal gate + access landing
- [ ] 16-04-PLAN.md — artist pre-cleared terms (Marmoset five) settings and the artist Deals room

**Wave 3** *(portal surfaces + deal pipeline)*

- [ ] 16-05-PLAN.md — filtered rights-ready catalog browse + org-shared shortlists (migration 064, human-gated push)
- [ ] 16-06-PLAN.md — request composer with server-side pre-cleared matching + org request dashboard
- [ ] 16-07-PLAN.md — admin negotiation queue, deal-stage machine, commission economics, manual intake

**Wave 4** *(external integrations — credential-gated)*

- [ ] 16-08-PLAN.md — Stripe Connect Express payouts, buyer Checkout destination split, Stripe webhook (migration 065, human-gated push)
- [ ] 16-09-PLAN.md — SignWell embedded e-sign adapter, sync-license PDF, Contract Locker handoff, docs rewrite

**Wave 5** *(delivery + instrumentation)*

- [ ] 16-10-PLAN.md — export-pack delivery unlock, GTM beta metrics dashboard, requirements registration

**Planning note:** The external GTM plan's Tally/Typeform bridge is intentionally reframed here. Manual intake may exist only as a temporary founder/admin fallback that writes into the same product tables and workflows. The default product direction is an integrated buyer portal with specialized sync-buyer accounts, not a long-lived external form sidecar.

## Future Roadmap Candidates

### E-Sign Split-Sheet Economics & Green Room Ad Monetization

**Status: RESOLVED 2026-07-19 — deliberation session decided AM-1..AM-5 (free-with-guardrails access model, decoupled ads, immediate build as Phase 17 before Phase 16). See the deliberation doc's Decision record. The Green Room ad-monetization idea below remains a live future candidate on its own merits (AM-4).**

**Product note added 2026-07-18:** Split sheets — not sync licenses — are Funūn's real e-sign volume driver, and they cost money at signing, potentially years before any revenue. Options captured: free e-sign for all / gate to a (not-yet-existing) paid tier / metered-or-earned e-sign with wet-sign upload as the universal floor (current shipped behavior) / subsidize via Green Room targeted advertising (guitar brands, MIDI/plugin makers — the Phase 12 admin-curated placements infra already exists and was designed for sponsored content). Likely end-state is a combination. D-18a (SignWell) stands for beta sync licensing but its provider evaluation must be re-run against split-sheet volume before any artist-facing e-sign ships.

### Embedded License-ID Metadata & Licensed-File Provenance

**Status: IDEA — requires a dedicated discussion + research cycle before it becomes a phase. Do not plan or execute from this note alone.**

**Product note added 2026-07-18**, from competitor research into how Musicbed, Marmoset, and Artlist handle the buyer download/licensing experience (see `.planning/research/COMPETITOR-musicbed-buyer-experience.md` and `.planning/research/COMPETITOR-marmoset-artlist-buyer-experience.md`).

**The gap found:** none of the three major competitors appears to embed a verifiable, unique license identifier into the delivered audio file itself. All three rely on account-side records as the source of truth — Musicbed on an account Licenses tab, Marmoset on a support-traceable Order ID printed on the invoice, Artlist on an on-demand PDF certificate carrying a visible license number. Once a clean file leaves the platform, the file alone proves nothing about which license it belongs to. The industry's "___ID" branding (Musicbed **SyncID**, Marmoset **TrackID**, Artlist **Clearlist**) refers to real-time YouTube Content ID claim-clearing services, NOT to a static identifier stamped on a track or file.

**The idea:** at the moment of license issuance, generate the buyer's clean file fresh and bake a unique Funūn License ID into its metadata, so provenance travels with the audio:
- MP3: an ID3v2 `TXXX` (custom text) or `PRIV` frame carrying the license ID, alongside standard `TCOP`/`WCOP`/`TIT2`/`TPE1` copyright/title/artist fields.
- WAV: the BWF `<bext>` chunk (`Description`, `OriginatorReference`, or `CodingHistory`) — the archival-standard location for provenance data.
- The ID is a foreign key into Funūn's license records (licensee, project, end client, usage/territory/term, fee, timestamp).
- Implication: licensed downloads are **per-license generated artifacts**, not a static file served to everyone.

**Why it plausibly fits Funūn specifically:** `node-id3` (0.2.9) is already a project dependency and already used for ID3 read/write in the metadata pipeline, so the MP3 path is largely existing capability pointed at a new purpose. It also reinforces the Rights & Registration Rails thesis — every delivered file provably tied to a documented, consented license.

**Open questions that MUST be resolved in the discussion/research cycle before planning:**
1. **Preview mechanism is genuinely undecided.** Competitors split: Musicbed and Artlist ship audible **watermarked** previews; Marmoset ships **un-watermarked but low-bitrate scratch tracks** and relies on terms of use rather than a technical block. Marmoset's approach is legally weaker but frictionless for real editing — and Funūn's Phase 16 deal model is otherwise Marmoset-shaped. This choice is upstream of the license-ID work and is NOT settled by this note.
2. Does an embedded ID survive the buyer's actual workflow (transcode, DAW import/export, NLE round-trip)? An ID that dies on first re-encode buys less than it appears to. Needs empirical testing — good spike candidate.
3. Threat model: the ID is a provenance marker, not DRM. What is it actually meant to prove, to whom, and what happens on a mismatch or a stripped tag?
4. Privacy: embedding licensee/end-client identity into a distributed file has disclosure implications — decide what is safe to embed vs. what stays a server-side lookup behind an opaque ID.
5. Relationship to Content ID clearance (the separate, heavier problem): direct YouTube Content ID partnership is likely unattainable at current catalog scale; the realistic path is an aggregator partnership (AdRev/Symphonic, Pex, and similar). That is a BD/partnership track, not an engineering one, and should not be bundled into this idea's phase.

**Sequencing note:** this sits naturally after Phase 16's deal pipeline exists (there must be license records to reference), and pairs with whatever preview-file decision comes out of question 1 above.

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

### Phase 17: Split-Sheet E-Sign

**Goal:** Any artist can take a split sheet from draft → collaborator approval → embedded, mobile-first e-signatures → a fully executed PDF + Certificate in Contract Locker that moves the readiness gate — without anyone leaving Funūn, free within structural guardrails.
**Requirements**: TBD — registered during planning (planning source: 17-CONTEXT.md; locked inputs D-18b + AM-1..AM-5 from `.planning/deliberations/esign-split-sheet-economics.md`)
**Depends on:** Wave 2 split-sheet/collaborator substrate (migration 018 approval pipeline, CollaboratorPicker), lib/esign/provider.ts abstraction, Phase 14 pdf precedent (lib/vault/pdf/). EXECUTES BEFORE PHASE 16 (AM-5); its migrations claim the next live numbers (062+) — Phase 16's drafted plans get a migration-number touch-up before their execution.
**Sequencing consequence for 16-09:** this phase becomes Funūn's first live e-sign integration (DocuSeal hosted); 16-09's SignWell adapter reuses this phase's webhook/route patterns.
**Provider verification gate (human, before plan-phase execution):** DocuSeal trial — Certificate of Signature inspection, white-label scope/price, 3-signer async test, deliverability.

**Plans:** not yet planned (discuss-phase first — see the current-state map + 6-item agenda in the v1.3-pre section above)

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
| 13. Network Tab & Trust & Safety | v1.2 | 5/5 | Complete   | 2026-07-18 |
| 14. Playback Room Refinement | v1.2 (Sound Vault) | 6/6 | Complete   | 2026-07-07 |
| 15. Account Capability Model | v1.2 (cross-cutting) | 4/4 | Complete | 2026-07-12 |
| 16. GTM Beta Launch & Buyer Portal | v1.3 | 0/5 | Planned | Docs-only plan set drafted 2026-07-18 |
