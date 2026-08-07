# Roadmap: Funūn

## Milestones

- ✅ **v1.0 — Wave 2: Rights & Registration Rails** — Phases 1–4 (shipped 2026-06-29)
- ✅ **v1.1 — Wave 3: Launchpad** — Phases 5–7 (shipped 2026-07-04)
- 🚧 **v1.2 — Wave 4: The Green Room** — Phases 8–13 (in progress)
- 🚧 **v1.2 — Sound Vault: Playback Room Refinement** — Phase 14 (in progress; cross-domain addition, tracked alongside v1.2 for scheduling purposes only — this is Wave 1 Sound Vault work, not a Green Room networking feature)
- ✅ **v1.2 — Account Capability Model** — Phase 15 (shipped 2026-07-12; cross-cutting identity change, tracked alongside v1.2 for scheduling only — not part of the Green Room feature set)
- 📝 **v1.3-pre — Split-Sheet E-Sign** — Phase 17 (decided 2026-07-19; EXECUTES BEFORE Phase 16 — free embedded mobile-first e-signed split sheets for all artists, DocuSeal hosted; access model per `.planning/deliberations/esign-split-sheet-economics.md` AM-1..AM-5)
- 📝 **v1.3-pre — Split-Sheet Home** — Phase 18 (planned 2026-07-20; the living draft, Contract Locker as workspace, and song-level attachment — follows Phase 17, still ahead of Phase 16)
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

- [x] **Phase 17: Split-Sheet E-Sign** - DocuSeal adapter behind lib/esign/provider.ts, split-sheet template generation from vault metadata (composers/splits/IPI already captured), multi-party embedded signing flow, signed-PDF + certificate landing in Contract Locker, per-artist cap + readiness gate, usage/cost telemetry feeding the AM-3 trigger. (completed 2026-07-20)

### 📝 v1.3-pre — Split-Sheet Home (Planned — after Phase 17, before Phase 16)

**Milestone Goal:** Split sheets get a home. Phase 17 makes them signable; Phase 18 makes them *livable* — a working draft that survives the studio, a Contract Locker that behaves like a workspace rather than a filing cabinet, and song-level attachment so a sheet created before a release can bind to the right track later.

**Design source of truth:** `.planning/phases/17-split-sheet-esign/17-DUAL-ENTRY-DESIGN.md` — data model, state transitions, Locker IA, per-party access, block exception + structured-actions communication, third-party uploads, edge cases, implementation order. All decisions in it are settled; do not re-litigate.

**Why it exists (findings from the Phase 17 work):** `/split-sheets` is orphaned — nothing in the app links to it. A saved draft becomes unreachable (no list, no edit page); the PATCH route has no UI caller. The Locker reads only `vault_documents`, so in-flight sheets are invisible. And the readiness gate over-credits song-specific sheets — a 5-track EP with one signed sheet scores 15/15.

- [x] **Phase 18: Split-Sheet Home** - Living-draft surface (list, edit page, collaborator picker, add-and-redistribute), attention-first Contract Locker reading both documents and in-flight sheets, song-level attachment (track_id + split_sheet_attachments join table) from both directions, and coverage-based readiness scoring shipped separately. (completed 2026-07-22)

**Goal:** A split sheet written at 2am survives the studio — it can be found, edited, grown by one more writer, shown to a collaborator without being a formal ask, bound to the right song months later, and scored honestly against every track it does and does not cover.

**Requirements:** HOME-01, HOME-02, HOME-03, HOME-04, HOME-05, HOME-06, HOME-07, HOME-08, HOME-09, HOME-10, HOME-11, HOME-12

**Plans:** 5 plans (identity/collaborator replan 2026-07-22 — 18-05 added, 18-01/18-02 rewritten; 18-03/18-04 unchanged)

Plans:

- [x] 18-05-PLAN.md — Identity foundation: migration 066 (`collaborators.legal_name`/`status`, `artist_profiles.legal_name_locked_at`), the pure live-identity resolver, and the Settings legal-name confirm-and-lock (wave 1, migration checkpoint)
- [x] 18-01-PLAN.md — Living-draft surface: sheet list, `/split-sheets/[id]` detail/edit, builder edit mode with the auto-included live-linked party-1 self row, the new email/phone-first PartyPicker, add-and-redistribute, read-only share, §7 recipient self-correction, freeze-boundary copy and consensus-reset change summaries (wave 2, depends on 18-05, autonomous)
- [x] 18-02-PLAN.md — Contract Locker as workspace: attention-first landing reading in-flight `split_sheets` alongside `vault_documents` with the 3-state invited/opened/signed per-party label, per-party views with soft hide, documented block exception, reserved `ask` slot (wave 3, depends on 18-01 and 18-03, autonomous)
- [x] 18-03-PLAN.md — Song-level attachment: migration 064 (`track_id`, `source`, `split_sheet_attachments` + backfill), attach v2 with the executed-only gate relaxed, detach, attach UI from both directions with fuzzy matching and conflict flags (wave 2, migration checkpoint)
- [x] 18-04-PLAN.md — Coverage-based readiness: `covered / needing` with MINIMUM tier across tracks in both the TS twin and migration 065's trigger against one shared fixture, legacy wet-sign path preserved (wave 3, depends on 18-03, two blocking checkpoints)

**Execution shape:** wave 1 → 18-05 (identity foundation, migration 066 human push); wave 2 → 18-01 (depends 18-05) and 18-03 (unchanged, independent) in parallel (zero shared files); wave 3 → 18-02 (depends 18-01+18-03) and 18-04 (unchanged, depends 18-03) in parallel. 18-05/18-03/18-04 each end with a human-gated `supabase db push` (migrations 066/064/065); 18-04 additionally gates on sign-off for a user-visible score drop — projects reading `complete` today may read `warning` after coverage lands. The 18-05 number is higher than its wave-1 position on purpose — it avoids renumbering the untouched 18-03/18-04; wave frontmatter is authoritative for execution order.

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
**Plans:** 9/12 plans executed

**Wave 1** *(schema + contracts — parallel, disjoint files)*

- [x] 16-01-PLAN.md — buyer org/member schema, `handle_new_user` buyer early-return branch, permission tiers (migration 062, human-gated push)
- [x] 16-02-PLAN.md — `license_requests`/`license_request_tracks`/`project_license_terms` schema, sync-license document type, matching + commission logic (migration 063, human-gated push)

**Wave 2** *(account/org machinery + artist surfaces)*

- [x] 16-03-PLAN.md — admin-created buyer orgs, org-admin employee invites, buyer portal gate + access landing
- [x] 16-04-PLAN.md — artist pre-cleared terms (Marmoset five) settings and the artist Deals room

**Wave 3** *(portal surfaces + deal pipeline)*

- [x] 16-05-PLAN.md — filtered rights-ready catalog browse + org-shared shortlists (migration 064, human-gated push)
- [x] 16-06-PLAN.md — request composer with server-side pre-cleared matching + org request dashboard
- [x] 16-07-PLAN.md — admin negotiation queue, deal-stage machine, commission economics, manual intake

**Wave 4** *(external integrations — credential-gated)*

- [~] 16-08-PLAN.md — Stripe Connect Express payouts, buyer Checkout destination split, Stripe webhook (migration 084, human-gated push) — code + migration authored; awaiting owner Stripe setup + 084 push + test-mode payment
- [ ] 16-09-PLAN.md — **DEFERRED (2026-08-03):** sync-license e-signing (DocuSeal reuse per D-18c). Blocked on the sync-license signing MODEL (blanket pre-auth vs per-deal vs hybrid), pending owner decision + music/IP counsel — see `.planning/deliberations/sync-license-signing-model.md`. Re-scope before building.

**Wave 5** *(delivery + instrumentation)*

- [~] 16-10-PLAN.md — **PARTIAL (2026-08-03):** GTM beta metrics module + admin dashboard built (Task 2) and all 34 Phase 16 requirement IDs registered in REQUIREMENTS.md with decision traceability (Task 3). Task 1 (export-pack delivery unlock + buyer export route + DeliveryPanel) deliberately deferred — `isDeliveryUnlocked` needs a signed-AND-paid deal, and 16-09 (signing) is deferred while 16-08 (payment) awaits the owner's Stripe setup + migration 084 push. See `16-10-SUMMARY.md`.

**Planning note:** The external GTM plan's Tally/Typeform bridge is intentionally reframed here. Manual intake may exist only as a temporary founder/admin fallback that writes into the same product tables and workflows. The default product direction is an integrated buyer portal with specialized sync-buyer accounts, not a long-lived external form sidecar.

## Future Roadmap Candidates

### E-Sign Split-Sheet Economics & Green Room Ad Monetization

**Status: RESOLVED 2026-07-19 — deliberation session decided AM-1..AM-5 (free-with-guardrails access model, decoupled ads, immediate build as Phase 17 before Phase 16). See the deliberation doc's Decision record. The Green Room ad-monetization idea below remains a live future candidate on its own merits (AM-4).**

**Product note added 2026-07-18:** Split sheets — not sync licenses — are Funūn's real e-sign volume driver, and they cost money at signing, potentially years before any revenue. Options captured: free e-sign for all / gate to a (not-yet-existing) paid tier / metered-or-earned e-sign with wet-sign upload as the universal floor (current shipped behavior) / subsidize via Green Room targeted advertising (guitar brands, MIDI/plugin makers — the Phase 12 admin-curated placements infra already exists and was designed for sponsored content). Likely end-state is a combination. D-18a (SignWell) stands for beta sync licensing but its provider evaluation must be re-run against split-sheet volume before any artist-facing e-sign ships.

### Contract Template Library (split sheets are instance #1)

**Status: DIRECTION NOTED 2026-07-20 — not yet planned. Phase 17 ships the first template; this records what must generalize when the second arrives.**

Funūn will offer a library of contract templates artists can send to collaborators — split sheets first, then work-for-hire, producer agreements, sample clearances, and others. `vault_documents.type` already anticipates this (`split_sheet`, `copyright_registration`, `hire_right`, `sample_clearance`, `distribution_agreement`), and the repo-local `.agents/skills/funun-contract-template-intake/` skill is already written for the general case (source contract → audit → approved spec → renderer). `17-SPLIT-SHEET-TEMPLATE-SPEC.md` is instance #1 of a repeatable artifact type.

**Already generic (no work needed):** `lib/esign/provider.ts` and the DocuSeal adapter; `vault_documents` as destination; Contract Locker; the cross-account fan-out concept; the PDF-renderer + DocuSeal text-tag pattern.

**Deliberately split-sheet-coupled today (accepted, with a documented exit):** `esign_envelopes.split_sheet_id` is a NOT NULL FK to `split_sheets`, and its RLS policies join through `split_sheet_parties`. This buys real referential integrity and simple RLS now. Going polymorphic (`subject_id` + `subject_type`) before a second template exists would trade that away for speculative flexibility. **Recommended exit when template #2 lands:** add a parallel nullable FK per contract type with a CHECK that exactly one is set — preserves FK integrity and per-type RLS — rather than a polymorphic id. Re-evaluate only if the type count passes ~4.

**Must stay type-agnostic as Phase 17 builds them (cheap now, expensive later):** the completion webhook (dispatch on envelope, never assume split-sheet shape), the Funūn Certificate of Completion renderer (17-10 — takes document title/parties/timestamps, not split-specific fields), the AM-2 monthly cap and AM-3 telemetry (count envelopes across ALL template types, not per-type quotas), and the Resend invite email (parameterized template, not hardcoded split-sheet copy).

**Per-template work when adding one:** run the intake skill against the source contract → approved spec → a renderer + its field/role mapping → a `vault_documents.type` value → readiness-gate mapping if the type affects release readiness.

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
**Requirements**: ESIGN-01..ESIGN-19 (registered in REQUIREMENTS.md, mapped to Phase 17; planning source: 17-CONTEXT.md — locked inputs D-18b + AM-1..AM-5 from `.planning/deliberations/esign-split-sheet-economics.md`. ESIGN-15..19 added 2026-07-20 from the provider-verification review: P17-08 font bug, P17-09 legal-grade document, P17-09a counsel gate, P17-10 de-DocuSealing)
**Depends on:** Wave 2 split-sheet/collaborator substrate (migration 018 approval pipeline, CollaboratorPicker), lib/esign/provider.ts abstraction, Phase 14 pdf precedent (lib/vault/pdf/). EXECUTES BEFORE PHASE 16 (AM-5); its migrations claim the next live numbers (062+) — Phase 16's drafted plans get a migration-number touch-up before their execution.
**Sequencing consequence for 16-09:** this phase becomes Funūn's first live e-sign integration (DocuSeal hosted); 16-09's SignWell adapter reuses this phase's webhook/route patterns.
**Provider verification gate (human, before plan-phase execution):** PASSED 2026-07-20 — DocuSeal trial completed against a live sandbox (submission 9477115). Certificate quality exceeds the bar; voids do not bill; webhook timestamps are UNIX seconds (17-01 bug fixed in `de9ce7f`); Pro = $20/user/mo + $0.20/completion. Full results in `17-PROVIDER-VERIFICATION.md`.
**Pro-plan prerequisite (human purchase, before any real artist use):** the free tier renders a sandbox banner on the signing surface, so Pro is required for production regardless of white-label. Recorded in 17-06's `user_setup`; no plan task may attempt the purchase.

**Plans:** 10/10 plans complete

**Provider gate PASSED 2026-07-20** (see `17-PROVIDER-VERIFICATION.md`): all five items resolved against a live sandbox. Two bugs found and three new plans added — 17-08 (Unicode PDF bug fix, SHIPPED code), 17-09 (legal-grade document + counsel gate), 17-10 (de-DocuSealed invites + Funūn certificate). 17-06 and 17-07 were amended and re-waved as a consequence.

**Wave 1** *(autonomous, credential-free — parallel, disjoint files)*

- [x] 17-01-PLAN.md — E-sign contract extension + pure helpers (webhook HMAC, tier map, envelope/cap/fast-lane/void, reconciliation diff) + notification builders
- [x] 17-03-PLAN.md — Split-sheet PDF renderer (per-party PRO/IPI + DocuSeal signature text-tags)
- [x] 17-08-PLAN.md — Unicode-safe PDF rendering: bundled Noto Sans (OFL), one shared registration module, all three renderers migrated, exact-string regression proof, dangling-label fix

**Wave 2** *(depends 17-01; human db-push checkpoint)*

- [x] 17-02-PLAN.md — Migration 062 (esign_envelopes + esign_envelope_signers, status enum widening, first_viewed_at) + 5/10/15 readiness tiering (SQL trigger + TS twin, shared fixture)

**Wave 3** *(depends 17-02/17-08; parallel, disjoint files)*

- [x] 17-04-PLAN.md — Approve→sign gating fix (link reuse) + sign-phase mobile shell + page-visit nudge + status allowlist
- [x] 17-05-PLAN.md — Contract Locker standalone-doc fix + cross-account fan-out + attach-later + offered reconciliation write-back
- [x] 17-09-PLAN.md — Legal-grade split-sheet agreement: additive migration 063, scope/publisher/share model, operative language, per-signature dates, capture UI + blocking counsel-review checkpoint

**Wave 4** *(depends 17-08/17-09; autonomous, credential-free)*

- [x] 17-10-PLAN.md — De-DocuSealing: Funūn-branded Resend signature invites + Funūn Certificate of Completion with structurally-attributed provider provenance

**Wave 5** *(depends 17-01/02/03/04/09/10; user_setup + blocking provider checkpoint + Pro-plan purchase)*

- [x] 17-06-PLAN.md — DocuSeal adapter + cap-enforced, counsel-gated mint (send_email disabled + Funūn invites) + void + embedded mobile-first signing

**Wave 6** *(depends 17-05/06/10; final UAT checkpoint)*

- [x] 17-07-PLAN.md — Verified idempotent completion webhook + Funūn certificate filing + cross-account distribution + readiness move + write-back offer + AM-3 usage telemetry

### Phase 18: Split-Sheet Home

**Goal:** A split sheet written at 2am survives the studio — it can be found, edited, grown by one more writer, shown to a collaborator without being a formal ask, bound to the right song months later, and scored honestly against every track it does and does not cover.
**Depends on:** Phase 17 (split-sheet substrate: `split_sheets`/`split_sheet_parties`, `CollaboratorPicker`, e-sign lifecycle in `lib/split-sheets/lifecycle.ts`)
**Requirements**: HOME-01, HOME-02, HOME-03, HOME-04, HOME-05, HOME-06, HOME-07, HOME-08, HOME-09, HOME-10, HOME-11, HOME-12
**Success Criteria** (what must be TRUE):

  1. A user can find every split sheet they initiated or are a party to from navigation, open `/split-sheets/[id]`, and edit a draft in place via `SplitSheetBuilder` — the first UI caller `PATCH /api/split-sheets/[id]` has ever had
  2. Adding a collaborator to an existing draft is a fast, redesigned add flow (live-linked identity, legal-name locking, email/phone-first) with add-and-redistribute, so a fourth writer never destroys three already-negotiated percentages; the initiator is party 1 automatically, never a manual "add yourself" step
  3. A collaborator can see proposed splits via a read-only share before any formal signing request, and the freeze boundary plus any consensus-reset change are explained in plain language, not left as a bare re-approval prompt
  4. Contract Locker's landing view is attention-first and reads BOTH `vault_documents` and in-flight `split_sheets` — awaiting-signature per-party progress (including pending/confirmed/opened/signed status), drafts in progress, unattached executed sheets, and songs with no sheet — via structured queries, no model call
  5. Every Funūn-user party on a sheet gets their own Locker view scoped to their own share; drafts stay initiator-only until sent; removal is a per-viewer soft hide that never deletes a shared legal record; the block exception for shared executed agreements is documented in-source, and no cross-party surface accepts user-supplied free text
  6. A split sheet can attach to a specific track (`split_sheets.track_id` + `split_sheet_attachments` join table, backfilled from existing `vault_project_id` values) from both the Locker and Vault sides with fuzzy-match suggestions, detach, and a conflict flag when two sheets target one song — attachment works at any lifecycle stage, not just after execution
  7. Split-sheet readiness is coverage-based — `covered / needing` across a project's tracks, minimum tier across the needing set — implemented identically in `readinessItemsForProject()` and `calculate_vault_readiness()` against one shared fixture, replacing the current all-or-nothing gate that lets one signed sheet fully credit a multi-track release

**Plans**: 5/5 plans complete

Plans:

- [x] 16-00-PLAN.md
- [x] 16-11-PLAN.md

**Wave 1**

- [x] 18-05-PLAN.md — Identity foundation: migration 066 (`collaborators.legal_name`/`status`, `artist_profiles.legal_name_locked_at`), the pure live-identity resolver (`resolvePartyIdentity`), and the Settings legal-name confirm-and-lock (wave 1, migration checkpoint)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 18-01-PLAN.md — Living-draft surface: sheet list, `/split-sheets/[id]` detail/edit, builder edit mode with the auto-included live-linked party-1 self row (§9), the new email/phone-first `PartyPicker` (§4/§6, `CollaboratorPicker` left untouched), add-and-redistribute, read-only share, §7 recipient self-correction, freeze-boundary copy and consensus-reset change summaries (wave 2, depends on 18-05, autonomous)
- [x] 18-03-PLAN.md — Song-level attachment: migration 064 (`track_id`, `source`, `split_sheet_attachments` + backfill), attach v2 with the executed-only gate relaxed, detach, attach UI from both directions with fuzzy matching and conflict flags (wave 2, migration checkpoint)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 18-02-PLAN.md — Contract Locker as workspace: attention-first landing reading in-flight `split_sheets` alongside `vault_documents` with the 3-state invited/opened/signed per-party label (zero new schema), per-party views with soft hide, documented block exception, reserved `ask` slot (wave 3, depends on 18-01 and 18-03, autonomous)
- [x] 18-04-PLAN.md — Coverage-based readiness: `covered / needing` with MINIMUM tier across tracks in both the TS twin and migration 065's trigger against one shared fixture, legacy wet-sign path preserved (wave 3, depends on 18-03, two blocking checkpoints)

**Execution shape**: wave 1 → 18-05; wave 2 → 18-01 (depends 18-05) and 18-03 (unchanged) in parallel; wave 3 → 18-02 (depends 18-01+18-03) and 18-04 (unchanged, depends 18-03) in parallel. 18-05/18-03/18-04 each end with a human-gated `supabase db push` (migrations 066/064/065). The 18-05 number is intentionally higher than its wave-1 position to avoid renumbering the untouched 18-03/18-04 — wave frontmatter is authoritative for execution order.

**Design references**: `.planning/phases/17-split-sheet-esign/17-DUAL-ENTRY-DESIGN.md` (living-draft/Locker/attachment model, authoritative), `.planning/deliberations/split-sheet-identity-and-collaborator-model.md` (identity/collaborator redesign, §1/§2/§4/§6/§7/§9 in scope). Full detail in `18-CONTEXT.md`.

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
| 16. GTM Beta Launch & Buyer Portal | v1.3 | 9/12 | In Progress|  |
| 17. Split-Sheet E-Sign | v1.3-pre | 10/10 | Complete   | 2026-07-20 |

### Phase 19: Profile & Identity Model Cleanup

**Goal:** Collapse Funūn's three overlapping "you" tables into one canonical account profile and formalize the collaborator-becomes-user reconciliation — fixing the Phase 18 duplicate-rights bug (a saved PRO reads "None" on split sheets because two Settings sections write two different tables), while keeping signed documents immutable. The relation's honest rename (`artist_profiles`→`user_profiles`) is split out as Phase 20.
**Requirements**: 5 (see 19-SPEC.md — R1 delete duplicate + re-point readers, R2 confirmable pre-fill, R3 preserve live-link, R4 flag-for-fix, R5 licensee note)
**Depends on:** Phase 18 (split-sheet identity/live-link), Phase 08 (identity schema), Phase 04 (collaborator identity reconciliation)
**Plans:** 7/7 plans complete

Plans:
**Wave 1**

- [x] 19-01-PLAN.md — Parity-twin logic (semantic-blank, claim-prefill) + R3 freeze-boundary regression tests
- [x] 19-02-PLAN.md — R5 "note to licensees" on newly-generated PDFs + read-only share view
- [x] 19-03-PLAN.md — R4 correction-flag backend: migration 074 flags table + RLS, POST route, dual notification

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 19-04-PLAN.md — R1/R2 migrations 071 (rescue) / 072 (re-point both readers + claim_prefill + reverse pre-fill) / 073 (drop)
- [x] 19-05-PLAN.md — R1/R2 Settings consolidation: remove duplicate rights input + per-field confirm UI + companion test
- [x] 19-06-PLAN.md — R4 correction-flag frontend: Locker "this is wrong" affordance + owner guided apply (void-first / executed pointer)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 19-07-PLAN.md — Human-gated migration push checkpoint (071→072→073→074, LOCAL=REMOTE)

### Phase 20: Profile Table Rename (artist_profiles to user_profiles)

**Goal:** Rename the canonical profile relation `artist_profiles` → `user_profiles` (its honest name — every non-curator member has one, not just artists) across all runtime code and effective DB objects, with no downtime and no data change. Split out of Phase 19 (2026-07-23, owner decision) because the blast radius is a different risk class from the bug fix.
**Requirements**: TBD (20-SPEC.md to be created) — carries Phase 19's former R6
**Depends on:** Phase 19 (which deletes the duplicate `user_profiles`, freeing the target name)

**Locked inputs (verified via Codex sweep 2026-07-23 — do not re-litigate scope):**

- Blast radius: ~79 runtime files reference `artist_profiles` (incl. public-profile `app/u/` + `app/r/`, approve/invite pages, presence, Green Room, trust/safety, capability grants, split-sheet mint, and the manual `ArtistProfile` type in `types/index.ts`) plus ~23 historical migrations.
- Effective DB objects to update in a NEW migration: `handle_new_user()` (curator/industry branches), search-vector + `clear_featured` triggers, `capability_grants` + `verification_audit_log` FKs, Green Room SQL functions, RLS policies, grants, indexes, and the re-pointed `claim_collaborators()`/`backfill_claimed_collaborators()`.
- Historical migrations are IMMUTABLE — the rename lands as a new migration; acceptance is "no runtime/effective-schema references," historical files exempt.
- Deployment race is real: needs a coordinated strategy (transitional compatibility view OR dual-name window OR controlled deploy window) + `NOTIFY pgrst` schema-cache reload + signup / public-profile / split-sheet smoke tests.
- The `/api/profile` route URL does NOT change (only its target table); renaming the route is a separate decision.

**Plans:** 2/4 plans executed

Plans:
**Wave 1**

- [x] 20-01-PLAN.md — Author migrations 076 (rename + security_invoker compat view + 6 function repoints + column-scoped grants) and 077 (drop view) [autonomous]
- [x] 20-02-PLAN.md — Mechanical code rename: ~87 `artist_profiles` query strings → `user_profiles` + `ArtistProfile` type → `UserProfile` + grep regression guard [autonomous]

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 20-03-PLAN.md — Cutover stage 1: human push #1 (076) + live-DB verification → deploy renamed code → D-04 smoke gate [human-gated]

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 20-04-PLAN.md — Cutover stage 2: D-05 soak → human push #2 (077, drop view) + verify [human-gated]

---

### Phase 21: Cross-Account Collaboration & Split-Sheet ↔ Project Sync

**Goal:** Make a song a single source of truth shared by the people on it. A split sheet and its Sound Vault project stay linked (writers/roles/splits) while the sheet is a draft, and every collaborator with a Funūn account sees the shared project + the tasks waiting on them, from their own account, with no data re-entry. First concrete slice of the post-beta access model (owner-confirmed: build now).
**Requirements**: see `.planning/phases/21-cross-account-collaboration-sheet-sync/21-SPEC.md` (decision record from `/gsd-explore` 2026-08-01)
**Depends on:** Phase 18 (split-sheet home / dual-entry attach, migration 067), Phase 20 (profile rename — RLS surface stable)

**Locked decisions (from 21-SPEC.md — do not re-litigate):**

- **Access model:** shared visibility, owner-controlled editing; splits negotiated only via the sheet's approve/counter flow.
- **Foundation:** new `project_members` guest-list table + RLS rewrite on `vault_projects` ("own it OR on its guest list"). Four roles day one: owner / co-owner / editor / viewer. Writers on a linked sheet auto-added as viewer.
- **Vault:** separate "Shared with me" lane + badged shared cards; shared projects excluded from personal scoreboard math.
- **Dashboard:** remove "Avg readiness" (vanity metric); add "Closest to ready"; add "Your next moves" action feed — inclusion = "is this waiting on you?", money & signatures pinned on top; configurability deferred to fast-follow.
- **Identity:** roster dedupe (per-owner, typed email) distinct from claim (cross-owner, verified email at signup). Cross-account access keys off VERIFIED identity only.

**Sequencing:** Wave 1 = `project_members` + RLS foundation (soaks first, security-critical). Wave 2 = auto-membership + shared lane + sheet↔project sync. Wave 3 = dashboard action feed + identity wiring.

**Plans:** 5/5 plans complete · **Status:** Complete (merged to main via PR #52; migrations 077/078/079 live). Verification: owner-accepted 2026-08-02 with the behavioral RLS access-matrix smoke **DEFERRED** (21-VERIFICATION.md `owner_acceptance`; 21-RLS-SMOKE-CHECKLIST.md 0/31 — a conscious risk acceptance, still an open follow-up).

Plans:

- [x] 21-01-PLAN.md — Wave 1: `project_members` table + RLS rewrite on `vault_projects` + 4 child tables (migration 078, human-gated; soaks first) [①②]
- [x] 21-02-PLAN.md — Wave 2: auto-membership trigger keyed off verified `collaborators.claimed_by` (migration 079, human-gated) [② identity-dedupe-claim]
- [x] 21-03-PLAN.md — Wave 2: "Shared with me" vault lane + shared-card badge [③]
- [x] 21-04-PLAN.md — Wave 2: sheet↔project bidirectional sync while draft, link snaps on send-for-signature [sheet-project-sync ①]
- [x] 21-05-PLAN.md — Wave 3: dashboard rework — remove Avg readiness, add "Closest to ready" + "Your next moves" feed [④③]

---

### Phase 22: Buyer Catalogue & Light-Theme Buyer UI

**Goal:** Recreate the buyer **Browse Catalogue** pixel-faithfully from Claude Design's hi-fi handoff, and establish the **light-theme buyer UI** as a platform convention (buyer side = light/white, artist side = dark). Redesigns Phase 16's basic catalogue (16-05) into the real, designed buyer browse surface — working filters/search/sort, an audio player, and the License request flow — with a dark-theme toggle option for logged-in buyers.
**Requirements**: see `.planning/phases/22-buyer-catalogue-light-ui/22-CONTEXT.md` (owner direction + Claude Design handoff; slices 1/2a/2b already built on `feat/buyer-catalogue-light`)
**Depends on:** Phase 16 (buyer portal, catalogue data/query, request pipeline)

**Locked decisions (from 22-CONTEXT.md — do not re-litigate):**

- **Theme:** buyer side = LIGHT/white, artist side = DARK (owner 2026-08-03). Light is the default (public + logged-in); logged-in buyers get an optional **dark toggle**. Both of Claude Design's buyer themes are used.
- **Design source:** Claude Design hi-fi handoff (`~/Desktop/Fununbuyerbrowse/mockups/buyer-catalogue.html` + `app.css` + logo/states files); in-repo canonical is `components/buyer/CatalogBrowserLight.tsx` (CSS ported scoped under `.fnbl`).
- **Rights:** tri-state badge — Rights ready / Partial / Contact required; the real Partial/Contact definitions are undecided.
- **Inclusion model DEFERRED:** which Sound Vault songs reach the catalogue, by what workflow, is an open decision (`.planning/deliberations/buyer-catalogue-inclusion-model.md`) — gates live-data wiring (slice 1.5).

**Built so far (slices 1/2a/2b, on `feat/buyer-catalogue-light`):** faithful light catalogue (real album art + Inter); working browse (filters/search/sort/chips/count/empty); audio player + License request modal (simulated audio, demo toast). Renders a representative fixture (`lib/deals/catalog-sample.ts`) pending live-data wiring.

**Remaining scope:** 2c — wire License Send → `POST /api/buyer/requests` (16-06) so a request creates a real deal; 1.5 — enrich the catalog query (artist/energy/length/mood/vocal/instruments + tri-state rights) + server-side filtering/pagination (gated on inclusion decision); the dark-theme toggle; re-theme the other buyer surfaces (request composer/dashboard, shortlists, org dashboard) to light + reconcile the 16-03 portal shell with the catalogue top-nav; real preview audio; logo adoption.

**Plans:** 4/5 plans executed

- [x] 22-01-PLAN.md — Record the built slices 1/2a/2b (faithful light catalogue + filters/search/sort + player/modal over the fixture); no new code, honest baseline. [catalogue-browse, audio-player]
- [x] 22-02-PLAN.md — Slice 2c: wire the License modal Send → real `POST /api/buyer/requests` via a unit-tested payload mapper + track selector (carries the phase threat model). [license-request-wiring]
- [x] 22-03-PLAN.md — Buyer portal shell: promote the catalogue light top-nav to a shared BuyerTopNav, retire the dark sidebar (nav reconciliation), light `.fnbl` shell + per-buyer dark-theme toggle (cookie). [nav-reconciliation, theme-light-buyer, dark-toggle]
- [x] 22-04-PLAN.md — Re-theme the remaining buyer surfaces (shortlist, org requests list/detail/dashboard, request composer) to the light token system, dark-toggle-reactive. [retheme-surfaces, theme-light-buyer]
- [ ] 22-05-PLAN.md — Slice 1.5 (GATED on the inclusion deliberation): enrich the catalog query (artist/mood/energy/vocal/length/versions/tri-state rights) + server-side filtering/pagination + flip page to live rows; derive-over-migrate. [live-data-enrichment]

Waves: W1 = 22-01, 22-02 · W2 = 22-03 · W3 = 22-04, 22-05 (22-05 blocked_by `.planning/deliberations/buyer-catalogue-inclusion-model.md`).
Deferred (not planned): real preview audio (no preview URLs yet), logo adoption, Similarity/Playlists tabs.

## Buyer & Sales Infrastructure Cluster (owner decisions 2026-08-05)

A cluster of phases stood up together from the buyer-onboarding discussion. They introduce
**two new account types** — **Client Partners** (the buyer/client-company account) and **Funūn Team
Members** (internal employee accounts, typed by role) — an **AE-driven sales motion**, and the
**sync-library inclusion model** (how songs get into the buyer catalogue). Numbered 23–26,
but **numeric order ≠ build order** — see the sequencing note at the end of the cluster.

**Naming (owner 2026-08-05):** the buyer account is a **Client Partner** ("Buyer · Client Partner";
UI/console say "Client Partners"). Funūn staff accounts are **Team Members**, typed by role — now
**Leadership/Executive** (today's `is_admin` → **Leadership Admin**), **Account Executive (AE)**, **BD**;
future role types (**A&R, IT, Operations, HR / Team Member Services, Legal**) added one at a time as they become real. Internal table/code
names (`buyer_orgs`, `funun_staff`, `staff_role`) are unchanged — only the labels.

**Why this cluster exists (rationale):** Funūn's buyer side is a **relationship-driven, B2B-first
marketplace**, not just a self-serve store. Larger deals (agencies, film/ad, brand marketing teams)
are won by people — so buyer *companies* get a dedicated **Account Executive (AE)**, and Funūn needs
**internal employee accounts** for those AEs/BD/leadership to run the business inside the product.
Supply is **curated, not open**: only invited artists submit songs to the sync-library (distinct from
the open Sound Vault), gated by a **blanket agreement** authorizing Funūn to shop them.

### Buyer Onboarding — Two-Model Strategy

Funūn's buyer side runs **two onboarding models**, built in sequence. Both reuse a shared front end
(public Browse Catalogue + Funūn-styled Login/Register modal); they differ in what "Register" *does*.

- **Model A — Sales-Led B2B (Phase 23, active).** Larger, Funūn-brokered deals with businesses —
  **ad agencies, film/ad production companies, brands with dedicated marketing teams.** Registration is
  **light-touch**: capture a little info (even just work email + phone) → **create a buyer company
  account** → Funūn **assigns an Account Executive (AE)** who helps the buyer complete onboarding.

- **Model B — Self-Serve Creator (Phase 24, future).** Smaller **content creators** self-serving
  **instant** accounts from the browse, no AE in the loop (Musicbed / Marmoset-self-serve shape —
  Marmoset runs a separately-surfaced self-serve arm off the same catalogue). Deferred to post-Model-A.

This **resolves** the earlier open "instant vs request-and-approve" decision as **both, phased**: Model A
(account-created-on-register, **AE-assisted onboarding**) first, Model B (instant self-serve) later.

### Phase 23: Buyer Onboarding · Model A — Sales-Led B2B Access + Buyer Company Account Model

**Goal:** Open the Browse Catalogue to **public (logged-out) browsing**; add the Funūn-styled
**Login/Register modal** (shared foundation both models reuse); let existing buyers log in; and turn
new-buyer interest into a **buyer company account** — captured light-touch at register, **assigned an AE**,
and **AE-shepherded to full onboarding**. Establishes the **buyer company account model**: company-scoped
accounts with **cross-company purchase visibility** and a **spend-approver** role, fully **Funūn-manageable**,
and **distinct from artist (user) accounts**.

**Requirements**: see `.planning/phases/23-buyer-onboarding-login-register/23-CONTEXT.md`
**Depends on:** Phase 16 (buyer orgs/`buyer_members`), Phase 22 (light buyer UI + the browse the modal lives on), **Phase 25 (AE assignment needs Funūn employee accounts — may stub initially)**

**Locked decisions (from 23-CONTEXT.md):**

- **Onboarding model:** light-touch **Register creates a buyer company account** (both "Register" and "Talk to a sales rep" doors do this — minimum viable info is email + phone). Not a bare lead, and not full self-serve: the account is created, then an **AE completes onboarding**. Funūn can fully **manage/edit** these accounts.
- **AE assignment:** every buyer company is assigned **one Account Executive** (a Funūn employee) by leadership → relationship-driven sales. (Needs Phase 25.)
- **Buyer company account model:** company-scoped; **members** can see **what's happening across their company** (who's purchasing) — critical for the person **green-lighting spend**. Implies a **spend-approver / company-admin role** + a company-purchases view. **Very different from artist accounts** (own account type/shape, own admin tooling).
- **Public browse:** the catalogue becomes browsable logged-out; a logged-out visitor can **browse + play previews**, but any **engagement** (shortlist / License) pops the modal → "create an account" (email + phone is enough to create one). The modal's **Login** button lives here.
- **Lead/notification routing:** a new-buyer signup lands in an **admin queue** AND (once Phase 25 exists) in the assigned **AE's / BD's in-app account**, plus a **Resend email** — so it becomes part of their daily human systems.
- **Design:** Funūn light `.fnbl` modal mirroring the Marmoset layout, Funūn-branded, adds "Talk to a sales rep". Opens over the browse (scrim, like the existing License modal).
- **Logo:** adopt one of the 5 wordmark explorations (`~/Desktop/Fununbuyerbrowse/FUNUN Logo Exploration.html`).

**Status:** Discussion in progress (23-CONTEXT.md) — being nailed down before `/gsd-plan-phase 23`.

### Phase 24: Buyer Onboarding · Model B — Self-Serve Creator Access

**Goal:** The **self-serve** onboarding model for smaller content creators — **instant** buyer accounts
created from the browse with no AE in the loop (Musicbed / Marmoset-self-serve shape). Reuses Phase 23's
Login/Register modal + public browse; adds the parts Model A deliberately skips: self-serve account/org
bootstrap (rewire the `handle_new_user` buyer branch), likely subscription/checkout + plan tiers, and the
**transact-gate** that keeps artists protected when buyers aren't vetted.

**Requirements**: see `.planning/phases/24-buyer-onboarding-self-serve/24-CONTEXT.md`
**Depends on:** Phase 23 (shared modal + public browse + buyer account model), Phase 16 (buyer orgs), Stripe (billing)

**Status:** Future / post-beta — discussion captured (24-CONTEXT.md), **not yet planned**. Sequenced after Model A ships.

### Phase 25: Funūn Team Member Accounts & AE Assignment + Role Permissions

**Goal:** A **new account type — Funūn Team Members** — **typed by role** (**Leadership/Executive**,
**Account Executive**, **BD** now; **A&R, IT, Operations, HR / Team Member Services, Legal** added later, one at a time) so the people who
run the business operate **inside the product**, governed by a **role permission model**. Delivers:

1. **A way to create Funūn Team Member accounts** — a provisioning flow (bootstrapped from an owner/superadmin
   seed; Leadership creates the rest). Team Member accounts are not self-serve.

2. **Role types + permissions (RBAC).** Team Member accounts carry a **role type** (Leadership/AE/BD now);
   only members **with the permission** can perform privileged actions. Specifically:

   - **Create Client Partner accounts** — permissioned members (e.g. AE/BD) can provision a Client Partner
     (buyer company) account from the Funūn side (generalizes today's platform-admin-only `/admin/buyer-orgs`).

   - **Edit portions of Client Partner accounts** — permissioned members can edit **specific parts** of a
     Client Partner account, **scoped by their access** (their assigned Client Partners + a subset of fields),
     not blanket access to every one.

3. **AE↔Client Partner assignment** (one AE per Client Partner) + **lead/work routing** so new-buyer signups
   and activity land in the right member's **in-app queue** AND email — Funūn's sales motion inside
   the team's daily systems.

**Why:** Model A is relationship-driven — an AE per company drives larger B2B deals, and AEs/BD operate
client accounts **on the client's behalf** (create, help onboard, edit details). That requires (a) Funūn
staff as first-class accounts and (b) **least-privilege permissions** so only authorized staff touch client
data — you don't want every team member able to edit every buyer. Today neither exists.

**Requirements**: see `.planning/phases/25-funun-team-accounts-ae/25-CONTEXT.md` (provisional IDs TEAM-01..TEAM-09 proposed at plan time — TEAM-08 = Team Console theme, TEAM-09 = Team Member Directory; registered in REQUIREMENTS.md by 25-07)
**Depends on:** Phase 15 (account/capability model — adds a 3rd principal type alongside artist + buyer), Phase 16 (buyer orgs staff create/assign/edit)

**Plans:** 7/10 plans executed
**Wave 1**

- [x] 25-01-PLAN.md — Team-member role gate (getStaffRole/requireStaff, verifyAdmin alias) + assignment-scope predicate [W1]
- [x] 25-02-PLAN.md — Audit write-through (logStaffAction) + lead-routing notification builders [W1]
- [x] 25-03-PLAN.md — Migrations 089 (funun_staff + staff_audit_log, zero-RLS) + 090 (buyer_orgs.ae_user_id private) [W1] — renumbered from 085/086 after Phase 28 took 085–088

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 25-04-PLAN.md — Team Member provisioning (createStaffAccount + leadership-only /api/admin/staff routes) [W2]
- [x] 25-05-PLAN.md — Assignment-scoped Client Partner editing + AE assignment + widened create gate [W2]

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 25-06-PLAN.md — Admin gate widening + role-aware sidebar + Team Members UI + My Client Partners queue [W3]

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 25-08-PLAN.md — Team Console light/dark theme + per-member toggle (ports buyer 22-03; dark default) [W4]
- [ ] 25-09-PLAN.md — Leadership reassigns Client Partners between AEs (reassign UI + notify-both on the /ae route) [W4]
- [ ] 25-10-PLAN.md — Team Member Directory (all-roles): card + list views, contact cards, email/call actions (adds funun_staff title/phone; by-team view = future) [W4]

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 25-07-PLAN.md — [BLOCKING] human migration push + live smoke + requirement registration (TEAM-01..08) [W5]

**Key decisions to settle at planning:** the **bootstrap** (who creates the first staff account); **reconciliation with the existing platform-admin** used by `/admin/*` (are current admins = leadership? does staff RBAC subsume it?); **permission granularity** (role-level vs field-level; assignment-scoped editing); and **audit** (staff actions on client data are logged). These are surfaced in 25-CONTEXT.

**Status:** Planned (10 plans, 5 waves) 2026-08-05. Enables Model A's AE assignment + **reassignment**, Client Partner provisioning + editing, lead routing, a light/dark Team Console, and an all-roles **Team Member Directory** (Phase 23 can stub AE/team until this lands).

### Phase 26: Sync-Library Inclusion & Artist Submission

**Goal:** Define and build **how songs get into the buyer catalogue** — the **sync-library**. Curated, not
open: only **chosen / invited artists** may submit. A song reaches the catalogue via **artist submits →
signs a blanket agreement (authorizing Funūn to shop it) → Funūn turns on public view + admits it to
"Browse the Catalogue."** Includes the **artist-facing opportunity** (Funūn invites an artist — potentially
one of the *first* opportunities they see on their Funūn page — to add songs to the sync-library so they
get paid on sync deals) and the **admin curation/admission** side.

**Why:** The Sound Vault is open to anyone; the **sync-library is a curated, represented catalogue**. Songs
originate in the Vault but must be **explicitly submitted + rights-authorized** before buyers see them —
protecting artists and keeping catalogue quality/trust high. **This resolves the core of the
buyer-catalogue inclusion deliberation** (opt-in + invited + curated + blanket agreement) and is the real
supply pipeline behind live catalogue data (Phase 22 · 22-05).

**Requirements**: see `.planning/phases/26-sync-library-inclusion/26-CONTEXT.md`
**Depends on:** Sound Vault + readiness (upstream song source), e-sign (`lib/esign/provider.ts`) for the blanket agreement, Phase 22 (the catalogue surface + `is_public`/`isRightsReady` gate to replace)
**Resolves:** `.planning/deliberations/buyer-catalogue-inclusion-model.md` (core workflow). **Relates to:** `.planning/deliberations/sync-license-signing-model.md` (the blanket agreement is the artist→Funūn authorization).

**Status:** Discussion captured (26-CONTEXT.md), **not yet planned**.

### Cluster sequencing (build order ≠ phase number)

The real dependency graph within the Model A track:

1. **Phase 26 (sync-library inclusion)** — supply. Without it the catalogue has nothing real to show; it's upstream of live data (22-05).
2. **Phase 25 (Funūn team accounts + AE)** — the AE/lead-routing infra Model A leans on.
3. **Phase 23 (Model A onboarding + buyer account model)** — the demand-side entry; uses 25 (AE, routing) and benefits from 26 (real supply). Can be built with AE/routing **stubbed** if 25 isn't ready.
4. **Phase 24 (Model B self-serve)** — last, post-beta.

**Open sequencing decision (for a later pass):** do we build 26 + 25 first (real supply + AE infra, then a complete Model A), or build Phase 23's onboarding UI first with AE/supply stubbed to validate the buyer funnel early? To reason through.

### Phase 27: Artist Invitation-Only Onboarding (growth gate)

**Goal:** Change **artist signup** from **open self-serve** to **invitation-only self-serve** — a deliberate,
temporary **growth control** (owner, 2026-08-05: "keep them self-serve but by invitation only for now as we
grow"). Artists still create and own their account; a signup is **gated on a valid invitation**. Invites come
from **any collaborator** (an existing artist who names someone by email) **or any Team Member** account
(Phase 25 staff). **Bootstrap:** the owner creates the **first artist account** with a **personal email** to
seed the invite chain (artist signup is open today, so this seed can be created now; the gate governs *later* signups).

**Requirements**: see `.planning/phases/27-artist-invite-only-onboarding/27-CONTEXT.md`
**Depends on:** the artist auth flow + `handle_new_user` (`app/(auth)/signup`, migrations 001/039/075), the
collaborator model + claim RPC (`lib/collaborators`, `components/collaborators/*`), Phase 25 (Team-Member invite source)

**Key open questions (27-CONTEXT):** the invite mechanism + enforcement point (an `artist_invites` allowlist
checked in `handle_new_user`); whether adding a collaborator by email auto-creates an invite (reuse the existing
claim substrate) vs an explicit invite action; the Team-Member "Invite artist" action; bootstrap timing/retroactivity;
abuse limits. **Distinct from** Phase 26's sync-library invite (that invites a song; this invites a person to create an account).

**Status:** Context captured (27-CONTEXT.md), **not yet planned**. Near-term growth control; the owner's seed-artist
account can be created independently at any time.

### Account Taxonomy & Green Room Access (owner-confirmed 2026-08-05)

Funūn's accounts settle into **four lanes** (see `28-CONTEXT.md`):

| Account | Who | Access |
|---------|-----|--------|
| **Funūn Team Member** (internal) | Staff, role-typed (Leadership/AE/BD/…) | Team Console (Phase 25). **No Green Room posting under a Funūn email** — staff may make a personal Artist/Industry account to participate. |
| **Artist** (external creator) | **Anyone with song credits** — artists, writers, producers, all creative roles | Sound Vault (Contract Locker, Split Sheets, Antenna/PitchPlug) + **Green Room + posts**. Invite-only (Phase 27). |
| **Industry** (external) | Curators, A&R, execs, publishers, music supervisors, playlist owners, radio, managers | **Green Room + social profile** + tools to **post opportunities into Antenna**; per-subtype toolsets (future); **invite-only**. |
| **Client Partner** (external buyer) | Sync buyers, B2B | Buyer portal (Phase 23), AE-managed. **NO Green Room at all — not in their menu, no access** (owner 2026-08-05). Focus: license fast · browse catalogue · track purchases; **+ future: view playback playlists shared/sent to them**. Phase 28's gate already enforces no-access (buyers are "else ✗"). |

**Curators — RESOLVED (owner 2026-08-05):** there is **no separate curator account** — the only curator *account* is an
**Industry account** (`playlist_curator`); the legacy `role='curator'` is **retired** (its claim flow repoints at
Industry-account creation). The **`curators` table = CRM data** (pitch-target contacts not yet onboarded), which **lives
under PitchPlug for now** (the tool that pitches them). Growth loop: the **community + Team Members recruit directory
contacts one by one** to join as Industry accounts; the directory is seeded manually + via future **discovery/scraping tools**.

**Browse Catalogue access (reaffirmed 2026-08-05):** the Browse Catalogue stays **publicly accessible without an
account** — anyone can browse + play previews. **Purchasing / licensing is gated**: any engagement (shortlist,
License, purchase) prompts account creation, and to actually license a visitor becomes a **Client Partner** account
(Model A light-touch register → AE onboards, Phase 23; Model B instant self-serve later). Song **rights state**
(Rights ready / Partial / Contact required) is a *separate* gate on top of the account gate. **Note the current code
still walls the catalogue (Phase 22 gated it to `/buyers/access`); Phase 23 is what opens public browse** — intended/planned, not yet live.

**Onboarding — who can create accounts + the invite account-type chooser (owner 2026-08-05):**

- **Create a Client Partner account** (from their own view): **Leadership, AE, BD, IT**. *(Phase 25 · 25-05 ships
  Leadership/AE/BD; IT gains it when that role type lands.)*

- **Create a Funūn Team Member account:** **Leadership, IT, Team Member Services (HR/TMS)**. *(Phase 25 · 25-04
  ships Leadership-only; IT/TMS gain it when those role types land.)*

- **Seniority TIER (future):** within a department (IT/TMS), account-creation is restricted to a senior
  **"Leadership Tier"** — entry-level roles in the department cannot create accounts. Adds a **tier** dimension on
  top of role type. Not built now; noted so the RBAC model anticipates it.

- **Invite → account-type chooser:** when someone is invited to join from the Artist/Industry side (Phases 27/28),
  a **small onboarding box** directs them to the right account type — **Artist** (creative, song credits → Sound
  Vault tools) · **Industry** (curator/A&R/publisher/supervisor/manager → opportunity + Green Room tools) · **Both**
  (combined tools + menu). Each yields different tools + menu options.

  - **✅ RESOLVED (owner 2026-08-05) — capabilities / "switches" model (Option A):** an account holds independent
    **capabilities** (an "Artist" switch → Sound Vault tools; an "Industry" switch → opportunity/Green Room tools)
    rather than a single `member_type` label. **"Both" = both switches on** — no special third type. Rides the
    Phase 28 reconciliation (`capability_grants` already becoming the source of truth); the onboarding chooser
    simply grants the selected capability(ies).

  - **Industry switch — future refinement (owner vision):** what the Industry switch turns on is **per-subtype** and
    refined over time. Concretely, **managers / A&Rs** should get, from their industry page: a **roster of the artists
    they represent**; **access to those artists' project cards** with **edit privileges granted per the artist↔manager
    agreement** (agreement-scoped, granular); the ability to **help with administrative tasks** (double-check split
    sheets / metadata / readiness); and **comment/communicate** with their artists + colleagues. This **extends the
    Phase 21 cross-account access model** (`project_members` roles: viewer/editor/co-owner) from artist↔artist to
    **artist↔industry-representative**. Future / per-subtype (rides Phase 28's deferred per-subtype toolsets).

**Login & post-login routing (owner 2026-08-05):**

- **Artist + Industry + Team Member** share the main-app **`/signin`** (Supabase email/password). **Post-login is
  ROLE-AWARE (Option A):** `staff_role`/`is_admin` → **`/admin`** (Team Console); Artist/Industry → **`/dashboard`**.
  **Folded into Phase 25** (the app currently lands *everyone* on `/dashboard`, so staff wrongly land in the artist
  app — this adds account-type-aware landing; lands as a 25-06 extension / small **25-11**). No dedicated staff login page.

- **Client Partner (buyer)** logs in via the **light buyer login modal** (Phase 23), NOT `/signin` — reachable from a
  buyer **landing page** + the Browse Catalogue; post-login → `/buyers/*`. Entry architecture below.

- **Buyer entry — DECIDED (owner 2026-08-05): unify under `/sync`, path now → subdomain later.** The ENTIRE buyer
  world lives under one namespace — **`funun.studio/sync/*`**: a partner **landing page** at `/sync` ("Funūn Sync":
  license fast · value prop · featured catalogue · Browse + Log in / Request-access CTAs), the **Browse Catalogue**,
  and the **portal** — by **renaming the existing `/buyers/*` page routes → `/sync/*`** (cheap now: Phase 22 catalog
  is the only existing code, no production URLs / real buyers yet). **Keep internal names** (`buyer_orgs`,
  `components/buyer`, `/api/buyer/*`, `buyer_members`) — labels/routes only, same discipline as staff. One namespace
  **promotes to the subdomain `sync.funun.studio` cleanly** (a single Next.js rewrite `sync.funun.studio/* → /sync/*`)
  when marketing warrants — no rebuild. The Phase 23 login/register modal is the sign-on (reachable from the landing
  page + the catalogue). NOTE: `sync.funun.studio` (subdomain of funun.studio), NOT `funun.sync.studio`. Folds into Phase 23.

### Phase 28: Industry Accounts & Green Room Access Model

**Goal:** Confirm the four-lane account taxonomy and the **Green Room access model**, and define the **Industry
account** lane — external music-industry participants (curators, A&R, execs, publishers, supervisors, playlist
owners, radio, managers) who **post opportunities into Antenna** and **participate in the Green Room** (social
profile + posts), **invite-only**, role-typed by subtype. **Reconcile the standalone curators directory** into the
industry-account model. **Mostly confirm/extend/reconcile — much already exists.**

**Ground truth (already built):** `member_type ('artist','industry')` (migration 034); invite-based industry
accounts (`createIndustryMember` + `industryInvite` email); the exact subtypes as slugs (`playlist_curator`,
`ar_executive`, `publisher`, `music_supervisor`, `manager`, … in `lib/industry-roles.ts`); industry-gated Antenna
opportunity posting (`hasCapability(user,'industry')`); the Green Room (`app/(artist)/green-room`).

**Requirements**: see `.planning/phases/28-industry-accounts-green-room-access/28-CONTEXT.md`
**Depends on:** Phase 15 (capability model), the member_type/industry substrate, Green Room social (Phases 11–14), Antenna, Phase 25 (Team Members)

**Open (GSD discussion):** curator directory ↔ industry-account reconciliation; Green Room access enforcement
(`member_type IN ('artist','industry')`?); the Funūn-email posting rule (enforce vs norm); per-subtype toolsets (iterative).
**Deferred:** Client Partners posting in the Green Room (future discussion — note only).

**Plans:** 4/5 plans complete; 28-05's two autonomous tasks are done — 1 BLOCKING human-verify checkpoint (migration
085 push) remains open

Plans:
**Wave 1**

- [x] 28-01-PLAN.md — Antenna industry-gate fix (remove dead `industry_profiles` gate) + member_type/capability lockstep [Wave 1]
- [x] 28-02-PLAN.md — Green Room account-type gate (app-layer: Artist ✓ / Industry ✓ / else ✗ + inert Funūn-email block) [Wave 1]
- [x] 28-03-PLAN.md — Curator claim → Industry-account repoint (retire `role='curator'` mint) + shared `provisionIndustryAccount()` primitive [Wave 1]
- [x] 28-04-PLAN.md — Curator directory relocation under PitchPlug (navigation only) [Wave 1]

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 28-05-PLAN.md — Migration 085 (industry capability write + backfill + Green Room RLS gate) drafted + text-tested
  (commits `fba75e1`, `0575a97`); BLOCKING checkpoint (Task 3: owner reviews, pushes via Codex, confirms live
  `role='curator'` count, runs post-push smoke) NOT yet resolved [Wave 2]

**Provisional requirements** (INDUSTRY-01…07) — cited in plan frontmatter but NOT yet registered in
REQUIREMENTS.md (no Phase 28 section exists); register via `/gsd-docs-update` before phase close.

**Status:** Executing (5 plans / 2 waves). 4/5 plans complete; 28-05's migration is drafted, text-tested, and NOT
pushed — blocked on the human-gated `supabase db push` + live smoke checkpoint (Plan 28-05 Task 3).
