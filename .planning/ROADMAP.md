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

## Reconciled status — 2026-08-10 (Phases 16–29)

Verified against actual execution state (plans → summaries) + production, because several
per-phase entries below predate the Phase 27 cutover and read stale:

- ✅ **Shipped / live:** Phase 19 (profile & identity cleanup), Phase 20 (table rename →
  `user_profiles`, in production), Phase 21 (cross-account collaboration + sheet↔project sync),
  Phase 23 (buyer onboarding, Model A), Phase 25 (Funūn team accounts + AE), Phase 26
  (sync-library inclusion), **Phase 27 (invite-only artist onboarding — live via migration 105)**,
  Phase 28 (industry accounts + Green Room access).

- 🚧 **Partial:** Phase 16 (GTM beta buyer portal — **10/12 plans executed**), Phase 22 (buyer
  catalogue + light-theme UI — **4/5 plans**).

- ⏸ **On hold:** Phase 24 (buyer self-serve, Model B) — awaiting the **business-model decision**
  (paid preview/early-access tier + content-protection).

- 📝 **Backlog / post-beta:** Phase 29 (flat-price self-serve sync licensing) — per-deal license
  model to resolve with counsel.

**The frontier is mostly DECISION-gated, not build-gated.** The remaining plans are blocked on
deliberations, not effort:

- **16-09** (buyer-side e-sign signing architecture) — `status: deferred`, blocked on the
  **sync-license signing model** (blanket vs per-deal vs hybrid; music/IP counsel).

- **22-05** (buyer catalogue live data) — `blocked_by` the **buyer-catalogue-inclusion model** deliberation.
- **Phase 24** (buyer self-serve) — the **business-model decision** (paid preview tier + content protection).
- **Phase 29** (flat-price self-serve licensing) — the **per-deal license model** (counsel).

The one arguably build-ready thread is **16-08** (Stripe Connect payouts — MONEY-01..03; migration 084
exists, summary missing), but payouts are downstream of deals actually flowing (which needs the signing
model). **Net: the highest-leverage next steps are the business/legal decisions, which then unblock the
builds** — resolving the sync-license signing model alone unblocks both 16-09 and Phase 29.

_This block is the current source of truth; the detailed per-phase entries below may lag._

---

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

- [x] 18-02-PLAN.md — Contract Locker as workspace: attention-first landing reading in-flight `split_sheets` alongside `vault_documents` with the 3-state invited/opened/signed per-party label (zero new schema), per-party views with soft hide, documented block exception, reserved `ask` slot (wave 3, depends on 18-01 and 18-03, autonomous)
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

**Phases 14+ — reconciled against the filesystem 2026-08-26** (plan/summary counts read from `.planning/phases/`; the table above stopped at 17 and understated progress):

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 14. Playback Room Refinement | 6/6 | Complete | - |
| 15. Account Capability Model | 4/4 | Complete | - |
| 16. GTM Beta Launch & Buyer Portal | 10/12 | In Progress | - |
| 17. Split-Sheet E-Sign | 10/10 | Complete | - |
| 18. Split-Sheet Home | 5/5 | Complete | - |
| 19. Profile & Identity Model Cleanup | 7/7 | Complete | - |
| 20. Profile Table Rename (artist_profiles to user_profiles) | 2/4 | In Progress | - |
| 21. Cross-Account Collaboration & Split-Sheet ↔ Project Sync | 5/5 | Complete | - |
| 22. Buyer Catalogue & Light-Theme Buyer UI | 4/5 | In Progress | - |
| 23. Buyer Onboarding · Model A (sales-led B2B) | 8/8 | Complete (UAT pending) | 2026-08-07 |
| 24. Buyer Onboarding · Model B (self-serve) | 0/0 | On hold | - |
| 25. Funūn Team Member Accounts & AE Assignment + Role Permissions | 10/10 | Complete | 2026-08-05 |
| 26. Sync-Library Inclusion & Artist Submission | 10/10 | Complete (UAT pending) | 2026-08-08 |
| 27. Artist Invitation-Only Onboarding (growth gate) | 13/11 | Complete | 2026-08-10 |
| 28. Industry Accounts & Green Room Access Model | 5/5 | Complete | - |
| 29. Self-Serve Flat-Price Sync Licensing (Marmoset-style) | 0/0 | Not started | - |
| 30. The Crate + Sync Library — Catalogue Engine | 9/9 | Complete (UAT pending) | 2026-08-13 |
| 31. AE Client Workspace + Selects (My Client Partners / Client Partners) | 13/13 | Complete | 2026-08-12 |
| 31.1. AE Console — Client Partners room, Health & AE Assignment | 7/7 | Complete (UAT deferred to beta) | 2026-08-24 |
| 31.2. AE Console — Playbook Authoring/RBAC, Plays & Telemetry | 10/10 | Complete (UAT deferred to beta) | 2026-08-23 |
| 32. Production Observability, Capacity & Incident Readiness | 9/10 | In Progress | - |
| 33. The Playbook shell + IT Team monitoring dashboard (read-only v1) | 9/8 | Complete | - |
| 34. Lead Intake & BDT First Contact (leads queue, liaison) | 0/0 | Roadmapped | - |
| 35. The Playbook — Room Content (adopt docs, stock rooms) | 0/0 | Roadmapped | - |

*Counts are `SUMMARY.md` files over `PLAN.md` files on disk. A few phases show more summaries than plans (27, 33) where extra summaries were written for split or superseded plans — not an error. **Genuinely unfinished work is only: 16-08/09 (payments + counsel-gated sync-license signing), 20-03/04 (profile-rename cutover, human-gated pushes), 22-05 (catalogue enrichment), 32-09 (k6 load test, deferred to pre-launch).***

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

**Provisional requirements (registered at 23-08):** SYNC-01..SYNC-10 (status lifecycle + qualifying fields, public browse, register pipeline, two-doors, lead routing, AE onboarding surface, login/register modal, buyer password auth, /sync unification, cross-company visibility).

**Plans:** 8/8 plans complete

**Wave 1 — Foundations**

- [x] 23-01-PLAN.md — Migration 095 (renumbered from 092 — 092/093/094 taken by review-fix migrations): buyer_orgs status (pending_onboarding→active) + lead-qualifying fields + per-column grants; text-test; BuyerOrg type [W1]
- [x] 23-02-PLAN.md — /sync unification: rename /buyers/*→/sync/* (non-gating layout) + public /sync landing page [W1]

**Wave 2 — Core capabilities** *(blocked on Wave 1)*

- [x] 23-03-PLAN.md — Public catalogue browse: anon-safe loadCatalogPage (Pitfall 3 fix) + open /sync/catalog logged-out [W2]
- [x] 23-04-PLAN.md — Register pipeline: pure builder + POST /api/sync/register (service-role, rate-limited, real lead routing) [W2]
- [x] 23-05-PLAN.md — Buyer password auth: role-aware redirect to /sync/catalog + recovery-link invite (isolated/swappable) [W2]
- [x] 23-06-PLAN.md — AE routing + status transition: /admin/client-partners/[orgId] detail (Pitfall 4) + unassigned queue [W2]

**Wave 3 — Modal** *(blocked on Wave 2)*

- [x] 23-07-PLAN.md — Login/Register modal (.fnbl Marmoset mirror, two doors) + CatalogBrowserLight engagement gating + landing CTA [W3]

**Wave 4 — Human checkpoint** *(blocked on Wave 3)*

- [x] 23-08-PLAN.md — [BLOCKING] owner pushes migration 092 + live onboarding-loop smoke + register SYNC-01..10 [W4]

**Open product question for the owner (confirm before executing):** buyer auth = email/password (planned, per the locked Marmoset design — 23-05) vs magic-link-only. 23-05 is isolated so it can be swapped with one `type` change. Note: Resend is NOT configured in prod, so invite/reset emails no-op until configured — the in-app notification + admin queue are the reliable channels.

**Status:** SHIPPED 2026-08-07 — 8 plans / 4 waves executed; migrations 092–095 live; deployed to production via PR #58 (main). Public `/sync` onboarding lane live (register → pending_onboarding → AE onboard → Active → gated browse). Deployed-domain UAT + SYNC-10 spend-oversight UI deferred.

### Phase 24: Buyer Onboarding · Model B — Self-Serve Creator Access

**Goal:** The **self-serve** onboarding model for smaller content creators — **instant** buyer accounts
created from the browse with no AE in the loop (Musicbed / Marmoset-self-serve shape). Reuses Phase 23's
Login/Register modal + public browse; adds the parts Model A deliberately skips: self-serve account/org
bootstrap (rewire the `handle_new_user` buyer branch), likely subscription/checkout + plan tiers, and the
**transact-gate** that keeps artists protected when buyers aren't vetted.

**Requirements**: see `.planning/phases/24-buyer-onboarding-self-serve/24-CONTEXT.md`
**Depends on:** Phase 23 (shared modal + public browse + buyer account model), Phase 16 (buyer orgs), Stripe (billing)

**Status:** ON HOLD pending a **business-model GSD discussion** (planned 2026-08-09 — owner). Self-serve is NOT
to be planned/built until the business model is understood and a model + design + go-to-market game plan is agreed.
The discussion must research and resolve:

- **(a) Paid-tier membership / early access** — a subscription tier that lets buyers preview and "try out" tracks
  ahead of licensing (Musicbed / Marmoset / Artlist / Epidemic-style tiers). Research how those tiers are
  structured, priced, and what preview access they grant.

- **(b) Content protection / anti-piracy** — how those companies stop members from placing preview or
  unlicensed tracks on YouTube, Facebook, and other platforms (e.g. YouTube Content ID / audio fingerprinting,
  watermarked previews, licence-gated downloads, takedown tooling). Determine what Funūn needs here.

- **Deliverable:** a business model + design + game plan that (re)shapes this phase's scope.

Sequenced after Model A (Phase 23, shipped). Original self-serve context in 24-CONTEXT.md; run as `/gsd-explore`
(business-model ideation) before any `/gsd-discuss-phase 24`.

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

**Plans:** 10/10 plans complete
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
- [x] 25-09-PLAN.md — Leadership reassigns Client Partners between AEs (reassign UI + notify-both on the /ae route) [W4]
- [x] 25-10-PLAN.md — Team Member Directory (all-roles): card + list views, contact cards, email/call actions (adds funun_staff title/phone; by-team view = future) [W4]

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 25-07-PLAN.md — [BLOCKING] human migration push + live smoke + requirement registration (TEAM-01..08) [W5]

**Key decisions to settle at planning:** the **bootstrap** (who creates the first staff account); **reconciliation with the existing platform-admin** used by `/admin/*` (are current admins = leadership? does staff RBAC subsume it?); **permission granularity** (role-level vs field-level; assignment-scoped editing); and **audit** (staff actions on client data are logged). These are surfaced in 25-CONTEXT.

**Status:** SHIPPED 2026-08-05 — 10 plans / 5 waves executed; migrations 089–091 live; deployed to production. AE assignment + **reassignment**, Client Partner provisioning + editing, lead routing, a light/dark Team Console, and an all-roles **Team Member Directory** are live; verified via a six-point production security smoke.

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

**Plans:** 10/10 plans complete

Plans:

- [x] 26-01-PLAN.md — Migration 096 (sync_listings state machine + capability_grants/vault_documents extensions) + [BLOCKING] human-gated schema push
- [x] 26-02-PLAN.md — Pure domain core: status state machine + eligibility predicate + shared types (TDD)
- [x] 26-03-PLAN.md — Artist self-apply submit (per-song, batched) + withdraw routes
- [x] 26-04-PLAN.md — Blanket agreement: versioned template + PDF renderer + mint route + DocuSeal webhook dispatch
- [x] 26-05-PLAN.md — Staff routes: invite + admit/reject curation gate + leadership-only removal + notification builders
- [x] 26-06-PLAN.md — Catalogue gate: single admission-status helper replacing duplicated is_public checks
- [x] 26-07-PLAN.md — Vault song-row "+ Sync Library" action + status chips + blanket-agreement signing page
- [x] 26-08-PLAN.md — Dashboard invited spotlight card
- [x] 26-09-PLAN.md — Sync Library hub + nav reorder/gating + new-feature highlight (New dot + coach-mark)
- [x] 26-10-PLAN.md — Admin Sync Library section: invite panel + curation queue + leadership removal

> Requirement IDs: no registered IDs existed for Phase 26 (requirements live in 26-CONTEXT.md). Plans derive a provisional **SYNCLIB-01..15** set (distinct from Phase 23's SYNC-01..10); register them in REQUIREMENTS.md via /gsd-docs-update before phase close (Phase 28 precedent).

**Status:** EXECUTED 2026-08-08 — 10 plans / 3 waves built on `codex/phase-26-sync-library`; migration 096 live; 1723 tests + tsc + build green. Before close: `/gsd-verify-work` + owner UAT, register SYNCLIB-01..15 in REQUIREMENTS.md, deploy (PR → main).

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

**Requirements**: provisional INVITE-01..12 (from 27-RESEARCH.md; register via /gsd-docs-update before phase close — Phase 26 SYNCLIB precedent). See `.planning/phases/27-artist-invite-only-onboarding/27-CONTEXT.md` (19 locked decisions D-01..D-19).
**Depends on:** the artist auth flow + `handle_new_user` (`app/(auth)/signup`, migrations 086 current live body), the
collaborator model + claim RPC (`lib/collaborators`, `components/collaborators/*`), Phase 25 (Team-Member invite source)

**Plans:** 10/11 plans executed

Plans:
**Wave 1**

- [x] 27-01-PLAN.md — Invite & waitlist tables (migration 097) + invite schema module [wave 1]
- [x] 27-02-PLAN.md — Shared security + email utilities (rate-limit / turnstile / esc) [wave 1]
- [x] 27-03-PLAN.md — Collaborator-side invite prompt (D-08a) [wave 1]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 27-04-PLAN.md — Allowlist twin + server-authoritative gate (migration 098) [wave 2]
- [x] 27-05-PLAN.md — Three branded email templates (invite / spot-opened / reopened) [wave 2]

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 27-06-PLAN.md — Public signup routes (check-invite + deep-link resolve) [wave 3]
- [x] 27-07-PLAN.md — Waitlist + resubscribe routes (captcha + rate-limit) [wave 3]
- [x] 27-08-PLAN.md — Team Console invite routes (list/add · convert · broadcast) [wave 3]

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 27-09-PLAN.md — Signup gate state machine + unsubscribe page [wave 4]
- [x] 27-10-PLAN.md — Team Console Artist Invites UI + nav [wave 4]

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 27-11-PLAN.md — Bootstrap + [BLOCKING] schema push + launch gates [wave 5] — cutover shipped 2026-08-10 via corrective migrations **104→105** after two live-smoke failures (this Supabase applies app_metadata + email_confirmed_at post-INSERT; 105 keys the exemption on a `user_metadata` provision-intent). See 27-11/27-12/27-13-SUMMARY.md.

**Key open questions (27-CONTEXT):** the invite mechanism + enforcement point (an `artist_invites` allowlist
checked in `handle_new_user`); whether adding a collaborator by email auto-creates an invite (reuse the existing
claim substrate) vs an explicit invite action; the Team-Member "Invite artist" action; bootstrap timing/retroactivity;
abuse limits. **Distinct from** Phase 26's sync-library invite (that invites a song; this invites a person to create an account).

**Status:** ✅ **SHIPPED 2026-08-10.** Discussed → planned (11 plans) → executed → cutover. The artist invite
gate is live in production (migration **105**); non-artist lanes (buyer/staff/industry/curator) are exempt via a
service-role-only `user_metadata` provision-intent token; live acceptance smoke green across all lanes. **0
pending invites** by choice (invite-only; team issues invites going forward). Standing items: reopen broadcast
stays OFF until CAN-SPAM clearance; owner sign-off on the 3 branded emails (D-17).

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

**Plans:** 5/5 plans complete
085 push) remains open

Plans:
**Wave 1**

- [x] 28-01-PLAN.md — Antenna industry-gate fix (remove dead `industry_profiles` gate) + member_type/capability lockstep [Wave 1]
- [x] 28-02-PLAN.md — Green Room account-type gate (app-layer: Artist ✓ / Industry ✓ / else ✗ + inert Funūn-email block) [Wave 1]
- [x] 28-03-PLAN.md — Curator claim → Industry-account repoint (retire `role='curator'` mint) + shared `provisionIndustryAccount()` primitive [Wave 1]
- [x] 28-04-PLAN.md — Curator directory relocation under PitchPlug (navigation only) [Wave 1]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 28-05-PLAN.md — Migration 085 (industry capability write + backfill + Green Room RLS gate) drafted + text-tested
  (commits `fba75e1`, `0575a97`); BLOCKING checkpoint (Task 3: owner reviews, pushes via Codex, confirms live
  `role='curator'` count, runs post-push smoke) NOT yet resolved [Wave 2]

**Provisional requirements** (INDUSTRY-01…07) — cited in plan frontmatter but NOT yet registered in
REQUIREMENTS.md (no Phase 28 section exists); register via `/gsd-docs-update` before phase close.

**Status:** SHIPPED — all 5 plans / 2 waves executed; migration 085 (industry capability + Green Room RLS gate) live (`LOCAL=REMOTE` through 096, no migration gaps); deployed to production. Industry accounts + Green Room access model live; INDUSTRY-01..07 registered Complete.

### Phase 29: Self-Serve Flat-Price Sync Licensing (Marmoset-style)

**Goal:** Build a **self-serve licensing platform with flat, published pricing** for smaller sync deals that do
not require negotiation — a Buyer can license an eligible Sync Library song instantly at a set price for a
defined scope/medium, no AE in the loop. Larger / exclusive / negotiated deals continue through the AE-led flow.

**Why:** Phase 26 populates the Sync Library and gets blanket agreements signed (Funūn authorized to shop +
negotiate; price per-deal). Most small placements do not need human negotiation — flat-rate self-serve (à la
Marmoset, Musicbed, Artlist) removes friction, closes small deals 24/7, and scales revenue without AE time. Sits
on top of the represented catalogue as the low-touch transaction layer.

**Depends on:** Phase 26 (Sync Library supply + blanket agreements), Phase 22/23 (buyer catalogue + Client
Partner accounts), the per-deal licensing/signing model (`sync-license-signing-model.md` deliberation — the
per-deal license must be resolved), Stripe (payments).

**Status:** Backlog — owner-requested 2026-08-07 during Phase 26 planning. Not yet scoped; post-beta.

### Phase 30: The Crate + Sync Library — Catalogue Engine & Sync Readiness

**Goal:** Turn the catalogue into a managed engine: a staff **inclusion gate** (rights + quality + metadata), a
**Sync Readiness** pipeline — a sync-specific *subset* of the Sound Vault readiness that the Funūn team uses to
guide artists/artist-teams to sync-ready, worked from a **worklist queue** — layered **AI + artist + staff
tagging**, and **one role-aware Crate** (clean storefront for buyers; the same surface with staff-only layers —
rights, readiness, notes, in-progress — for the team, where AEs curate Selects). Inclusion is **both** (artists
submit AND staff curate) behind the gate; incomplete ≠ rejected — it enters the Sync Readiness pipeline.

**Why:** The catalogue is what every buyer + AE surface pulls from. Today inclusion is undecided and there is no
completion pipeline, so incomplete tracks stall instead of getting finished. A Sync Readiness workflow + layered
tagging + a single role-aware Crate makes supply reliable, findable, and curate-ready.

**Depends on:** Phase 22 (Crate UI), Phase 26 (Sync Library inclusion — extends it), the Wave 1 readiness engine.

**Scope source:** `.planning/notes/team-member-rooms-review.md` (Deep Dive #1).

**Status:** **Executed + Deployed 2026-08-13** — all 9 plans merged to `main` (fast-forward `7cb3902..64c5ca0`) and **live on funun.studio** (production build + 2141 tests + tsc green); migrations 107 + 108 + 109 applied + verified live on the remote. CRATE-01..10 registered in REQUIREMENTS.md; STATE.md pointer moved to Phase 30. **Pending:** human staff-session UAT only (role-aware Crate staff layers; backstage curation leadership-vs-AE; the live tag-propose/approve + admit-409 flows — all session-gated, unreachable from the executor sandbox) — DEFERRED, tracked in `30-UAT.md` (resume via `/gsd-verify-work 30`). Planned 2026-08-12 (9 plans, 3 waves); revised 2026-08-13 (real Jest verification; A&R tag-approval workflow).

**Plans:** 9/9 plans complete

Wave 1 (pure core + migration drafts):

- [x] 30-01-PLAN.md — Sync Readiness per-track derivation (subset of Wave 1 engine) + inclusion-gate predicate + rights badge (Jest-tested). [CRATE-01, CRATE-02]
- [x] 30-02-PLAN.md — Layered tagging foundation: INSTRUMENT vocab + descriptor v2 (ai_suggested/pending provenance) + AI tag-suggest + non-destructive merge + pending→approved transition (Jest-tested). [CRATE-06, CRATE-10]
- [x] 30-03-PLAN.md — OWNER-RUN migrations 107 (sync_listings quality-review + staff_notes) + 108 (funun_staff CHECK adds `anr` A&R role) + StaffRole code. [CRATE-09, CRATE-10]

Wave 2 (backend, depends on Wave 1):

- [x] 30-04-PLAN.md — Inclusion-gate wiring + access fix (admit/reject → leadership-only) + leadership-only quality/notes route. [CRATE-04, CRATE-05, CRATE-09]
- [x] 30-05-PLAN.md — Sync Readiness worklist backend: pure shaper (Jest) + staff-gated batched GET route. [CRATE-03]
- [x] 30-06-PLAN.md — Layered tagging routes: AI tag-suggest + tag-propose (AE→pending, leadership/A&R→auto-confirm) + tag-approve (leadership/A&R only). [CRATE-06, CRATE-10]
- [x] 30-07-PLAN.md — Minimal live-data slice (Phase 22 "22-05"): live catalogue rows render real authored tags + real tri-state rights. [CRATE-08]

Wave 3 (surfaces, depends on Wave 2):

- [x] 30-08-PLAN.md — Role-aware Crate on the SAME /sync/catalog surface: server-resolved staff layers, no fork, light-theme chrome. [CRATE-07, CRATE-08]
- [x] 30-09-PLAN.md — Sync Library backstage UI: Sync Readiness worklist + leadership-only curation UX. [CRATE-03, CRATE-05]

### Phase 31: AE Client Workspace + Selects (My Client Partners / Client Partners)

**Goal:** Build the AE sales engine as working rooms. **My Client Partners** = an AE's own-clients workspace: a
**Contacts CRM record** (basics + reach-out, history with us, relationship log, status), the **Selects** motion
(build from scratch / AI-drafted / straight off a brief → shareable player link with watermarked previews + notes
→ client reacts / approves / licenses → deal), plus activity + notes/status. **Client Partners** = the leadership
control tower (the same workspace on ANY client + assign/route AEs, health-at-a-glance, performance metrics,
company management). **Lead Engine** = the cross-client action inbox (open client / build & send Selects / set
status).

**Why:** This is the AE's day-to-day — how they run client relationships and move demand (briefs) to deals (via
Selects). Today these rooms are thin (a list + inline rename). This turns them into the surfaces the whole AE-led
(Lane 1) motion actually needs.

**Depends on:** Phase 30 (catalogue/Crate to curate from), Phase 16 (deals / license requests), Brief Builder v2 +
Lead Engine + `buyer_briefs` (shipped this session, branch `feat/lane1-catalogue-menu-help`), the Selects design
in `.planning/design/crate-lead-engine-BUILD-SPEC.md`.

**Access model (spec for both phases):** role×room — **AE** = their OWN assigned clients' view/work; **leadership**
= ALL clients + oversight/assignment; **BD** = ops rooms (Team Members, Verification, Reports); model is
**extensible for future roles** (e.g. a verification/ops role). Full matrix in the review note.

**Scope source:** `.planning/notes/team-member-rooms-review.md` (Deep Dives #2/#3 + access model). UI locked in `31-UI-SPEC.md` + `.planning/design/phase-31-*.html` (this session).

**Slice split (2026-08-15, via /gsd-plan-phase):** the planner sized this at ~19 full-fidelity plans, so it was split along the locked **D-04** boundary into two phases (nothing dropped). **Phase 31 now = Slice 1** — the outbound Selects motion a client can receive: **R1, R2, R5, R10, R11, R12** (+ D-01, D-02, D-03, D-05, D-08, D-09, D-11, D-12, D-13). Schema `111_selects.sql`, `112_client_partners_crm.sql`. **Slice 2 → Phase 31.1** (below).

**Plans:** 13/13 plans complete

Plans:

- [x] 31-01-PLAN.md — Watermarking spike + WatermarkProvider interface + Package Legitimacy checkpoint (D-01/D-03; A2) [wave 1]
- [x] 31-02-PLAN.md — Schema: mig 111 (selects/tracks→tracks.id/reactions/saved-searches) + mig 112 (CRM contacts/relationship-log/buyer_orgs.website) + text-tests + [BLOCKING] owner push [wave 1]
- [x] 31-03-PLAN.md — Wave-0 pure logic: Selects status state machine (R11) [wave 1]
- [x] 31-04-PLAN.md — Selects builder API core: CRUD + idempotent add/soft-remove/reorder + Send/mint-token (R11, own-book) [wave 2]
- [x] 31-05-PLAN.md — Selects AI-draft (D-11) + saved/team-shared searches (D-12) API [wave 2]
- [x] 31-06-PLAN.md — CRM-lite contacts (one-primary) + relationship-log API (R1/D-08/D-09) [wave 2]
- [x] 31-07-PLAN.md — Crate Requests ranked feed API (R10; absorbs Lead Engine; stability + guest-lead) [wave 2]
- [x] 31-08-PLAN.md — My Client Partners list+tabs+insight-columns + R5 nav gating (R1/R2/R5; A1) [wave 3]
- [x] 31-09-PLAN.md — Company/person workspace (4 jobs) + Contacts CRM UI + relationship log (R1) [wave 3]
- [x] 31-10-PLAN.md — Selects builder UI: curate/notes/badges/auto-save/AI-draft/Send (R11) [wave 3]
- [x] 31-11-PLAN.md — Crate Requests room UI + Lead Engine retire (R10) [wave 3]
- [x] 31-12-PLAN.md — Watermark stream-preview render pipeline + never-master signed-URL accessor (R12/D-01) [wave 4]
- [x] 31-13-PLAN.md — Public /selects/[token] SSR player: watermarked playback, react/respond, download gate, OG, safe invalid-token (R12/D-13) [wave 4]

**Execution shape:** Wave 1 → 31-01 ‖ 31-02 ‖ 31-03 (spike, schema+owner-push, pure logic — disjoint files). Wave 2 → 31-04 ‖ 31-05 ‖ 31-06 ‖ 31-07 (API, all on the pushed schema). Wave 3 → 31-08 ‖ 31-09 ‖ 31-10 ‖ 31-11 (UI; nav edits confined to 31-08). Wave 4 → 31-12 → 31-13 (watermark render, then the player). 31-01 + 31-02 carry blocking-human checkpoints (`autonomous: false`). Migration numbers 111/112 must be reconciled against the concurrently-executing Phase 32 before the owner push.

**Status:** Scoped via /gsd-explore 2026-08-12; **split + Slice 1 planned (13 plans) 2026-08-15.**

---

### Phase 31.1: AE Console — Client Partners room (My/All), Relationship Health & AE Assignment

**Goal (Slice 2a of Phase 31):** consolidate Client Partners into ONE room with tabbed **My** (own book — all staff, incl. leadership) / **All** (leadership-only tower) views; leadership routes the book (assign/reassign AEs via the **D-07** structural handoff, required handoff note); **relationship health** goes live — **last-license-driven color**, 5 states (Good / Warning / At-risk / **Cold** / 🦁 **Prospect**, the prospect mark a leadership-configurable image set inside Health Rules); and the AE gets the saved-per-account call **Game Plan** (seeded topic suggestions). Last-contact tracked + shown (column, relationship log, client card) but never sets the color.

**Requirements:** R3, R4, R6, R7, R8, R14. **Decisions:** D-06, D-07, D-10 (carried) + D-31.1-01..09 — see `31.1-CONTEXT.md`.

**Re-cut 2026-08-23 (discuss-phase):** roles-as-a-set (mig 119 + the Team Members redesign) and the Playbook shell (Phase 33) already shipped, and migs 113/114 are taken — so Playbook authoring/RBAC (R9), Selects telemetry (R13), and Plays/"today's play" moved to **Phase 31.2**.

**Schema:** new migrations at **128+** (`health_rules_config` incl. the prospect-marker image + keeps-warm toggles, `pipeline_stages` if not already present, `game_plans`, the D-07 onboarding task-queue). **Data dependency:** a per-client last-license/paid-placement date (confirm source in planning — closed deal / executed license / Sync Library).

**Depends on:** **Phase 31** (reuses `ClientPartnersList`, the relationship log, `buyer_orgs`/CRM, the Selects schema, and the just-shipped staff avatar-upload + config patterns).

**Design:** `31.1-CONTEXT.md` + `.planning/design/phase-31.1-leadership-tower-mockup.html`, `phase-31.1-health-rules-mockup.html`, `phase-31-my-client-partners-mockup.html` (owner-loved), `phase-31-game-plan.html`; locked `31-UI-SPEC.md`.

**Plans:** 7/7 plans complete

Plans:
**Wave 1**

- [x] 31.1-01-PLAN.md — Migration 128 (executed-license timestamp, health_rules_config, pipeline_stages, game_plans, onboarding_tasks) + text-lock test + [BLOCKING] owner push (R3/R4/R6/R7/R8/R14; D-06/07/09)
- [x] 31.1-02-PLAN.md — Pure 5-state health engine (compute-on-read) + columns.ts HealthValue extension (R3; D-06/D-31.1-02/09)
- [x] 31.1-03-PLAN.md — Pure days-in-stage + coverage/By-AE aggregation helpers (R6; D-10/D-31.1-04)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 31.1-04-PLAN.md — Consolidated Client Partners room (My/All, leadership hide-not-filter) + executed-license stamping seam + nav consolidation + access test (R3/R6; D-31.1-01/02/04/07/09)
- [x] 31.1-05-PLAN.md — Health Rules settings (thresholds + keeps-warm + live preview) + config/stage routes + swappable prospect image (R4; D-31.1-03/08, D-10)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 31.1-06-PLAN.md — Assign panel + D-07 structural handoff (required note, self-assign, onboarding task, best-effort email) + onboarding surface (R6/R7/R8; D-07/D-31.1-05)
- [x] 31.1-07-PLAN.md — Call Game Plan (saved per-account topics + "X of N covered" log) (R14; D-31.1-06)

**Status:** Executed 2026-08-24 — 7/7 plans complete (31.1-01..07-SUMMARY.md). Owner UAT + phase verification pending (Resend prod sender unverified for the D-07 intro email; no other known blockers).

### Phase 31.2: AE Console — Playbook Authoring/RBAC, Plays & Selects Telemetry

**Goal (Slice 2b of Phase 31):** close the coaching loop + add measurement. **Playbook authoring** (SOPs/Topics/Plays on the Phase-33 shell) + the **role×room RBAC** permission model; **Plays** incl. leadership's **"today's play" → AE banner**; **Selects engagement telemetry** (incl. the audible-time accumulator); and **dynamic Game-Plan topic sourcing** from the authored Playbook/Plays (31.1 ships seeded defaults).

**Requirements:** R9, R13. **Decisions:** see `.planning/deliberations/team-member-rbac-access-model.md` + the playbook-plays / permissions-model memories.

**Watch-out (research):** R13 needs a genuine audible-time accumulator (not a naive timer). RBAC builds on the shipped roles-as-a-set (mig 119) + the Playbook shell (Phase 33, which deferred authoring + RBAC).

**Depends on:** **Phase 31.1** + Phase 33 (Playbook shell).

**Status:** Split from 31.1 on 2026-08-23; planned 2026-08-24 (10 plans, 4 waves).

**Plans:** 10/10 plans complete

Plans:
**Wave 1** *(foundation — parallel, disjoint files)*

- [x] 31.2-01-PLAN.md — Migrations 130/131/132 (RBAC+authoring, plays, engagement+cap) + text-locks + owner push [BLOCKING] (R9/R13)
- [x] 31.2-02-PLAN.md — Telemetry pure core: audible-time accumulator + engagement contract + hook (R13)

**Wave 2** *(service + route layers — blocked on migrations)*

- [x] 31.2-03-PLAN.md — RBAC data layer: requireRoomAccess + access-grants + room×role matrix route (R9)
- [x] 31.2-04-PLAN.md — Playbook authoring API: SOP/Topic draft→publish gate (R9)
- [x] 31.2-05-PLAN.md — Telemetry write path: engagement POST route + SelectsPlayer wiring (R13)
- [x] 31.2-06-PLAN.md — Plays domain + API: one-active invariant, two assignment kinds, own-book eligibility (R9)

**Wave 3** *(surfaces — blocked on Wave 2)*

- [x] 31.2-07-PLAN.md — RBAC UI + enforcement re-point: access-editor matrix, DB-driven Rail2, 5 IT guards (R9)
- [x] 31.2-08-PLAN.md — Authoring UI + dynamic Game-Plan topic sourcing (augment seeded) (R9)
- [x] 31.2-09-PLAN.md — Plays surfaces: PlayComposer, Today's Play banner, completion rollup (R9)

**Wave 4** *(telemetry read surfaces — serialized after the tower touch)*

- [x] 31.2-10-PLAN.md — Telemetry read surfaces: AE per-Selects readout + leadership rollup (R13)

### Phase 33: The Playbook shell + IT Team monitoring dashboard (read-only v1)

**Goal:** Introduce **The Playbook** as a new internal Team-Member admin surface using a **double-sidebar nav** — a "The Playbook" item on the main admin sidebar (visible to all staff) opens a secondary sidebar of rooms/sub-rooms. Ship the **IT Team room read-only**: render the existing `docs/observability/` docs (Vendor Directory, Incident Runbook, Operating Rhythm, Thresholds & Severity) as pages, with a live **single-pane Monitoring Dashboard** as its opening page (health via `/api/health`, Better Stack uptime, the daily-observability-check digest, vendor grid + deep links, thresholds/severity reference — no new vendor-API integration).

**Scope boundary (owner-decided 2026-08-17):** READ-ONLY viewing only, role-gated to leadership (+ optionally a new `it` StaffRole — confirm in discuss-phase). **Explicitly DEFERRED to follow-on phases:** in-app authoring (block editor + create/edit/publish), the rooms→sub-groups→entries RBAC permission model, DB-stored entry content, the other rooms' content, and Observability Dashboard v2 (live metrics/charts).

**Implementation shape:** nested Next.js layout under `/admin/playbook/*` renders the secondary rail (URL-driven, no client state), reusing the existing `requireStaff` role-gating in `app/(admin)/layout.tsx`.

**Design references:** `docs/design/playbook-double-sidebar.html` (two-level nav), `docs/design/observability-dashboard.html` (dashboard), `docs/design/playbook-it-team-room.html` (IT room). **Related:** `.planning/deliberations/team-member-rbac-access-model.md` (RBAC forks for the authoring follow-on), `.planning/todos/pending/2026-08-17-observability-dashboard-v2-live-metrics.md` (v2).

**Requirements**: PLAYBOOK-01..10 (registered in REQUIREMENTS.md; derived from 33-CONTEXT.md D-01..D-10)
**Depends on:** Phase 32
**Plans:** 9/8 plans complete

Plans:
**Wave 1** *(foundation — parallel, disjoint files)*

- [x] 33-01-PLAN.md — `it` StaffRole union + `requireStaffPage()` page guard (PLAYBOOK-01/04)
- [x] 33-02-PLAN.md — Owner-run migration 114 (`it` staff_role CHECK widen) — author + apply checkpoint (PLAYBOOK-01)
- [x] 33-03-PLAN.md — Markdown renderer (react-markdown+remark-gfm) + Vercel file-tracing + build-trace verify (PLAYBOOK-05/06)
- [x] 33-04-PLAN.md — Playbook nav model + shared chrome (nav.ts, PlaybookNavLink, Rail2, ItRoomTopBar) (PLAYBOOK-02/03)
- [x] 33-07-PLAN.md — Dashboard live-signal core: digest.ts + StatusBanner + DigestPanel + ThresholdsPanel (PLAYBOOK-07/08/09)

**Wave 2** *(assembled surfaces — blocked on Wave 1)*

- [x] 33-05-PLAN.md — Playbook route shell: Rail 1 entry + nested Rail 2 layout + index redirect (PLAYBOOK-02/03)
- [x] 33-06-PLAN.md — 4 IT doc pages rendered from `docs/observability/*.md`, per-page inline guard (PLAYBOOK-04/05/06)
- [x] 33-08-PLAN.md — Monitoring Dashboard page assembly + VendorsGrid + QuickLinks + uptime link-out (PLAYBOOK-04/07/08/09/10)

### Phase 34: Lead Intake & BDT First Contact — Leads queue, liaison ownership, disqualify

**Goal:** Stop a real inbound beta lead from being missed. Today a buyer self-registers on the public site and the system notifies **one arbitrary Leadership member** (`resolveLeadershipFallback` uses `.limit(1)` with no ordering — a live bug), with no shared queue and no way to reject junk. This phase builds the **first-contact stage** of the agreed lead SOP: leads fan out to **all Leadership + all BDT**, land in a **Leads queue visible to both teams**, can be **picked up or assigned** to a liaison, can be **disqualified with a reason**, and — critically — introduce a **liaison owner separate from `ae_user_id`** so taking a lead is not the same as becoming its AE (AE assignment itself stays reassignable by Leadership).

**Requirements:** TBD at planning (derive from `docs/sales/LEAD-TO-AE-HANDOFF-SOP.md`).

**Canonical ref:** `docs/sales/LEAD-TO-AE-HANDOFF-SOP.md` — the owner-agreed SOP (flow, roles matrix, edge cases, build split). **Read before planning.**

**In scope (the "build now" slice, owner-agreed 2026-08-26):**

1. Lead-routed notification **fans out to every Leadership + BDT member** (replaces the arbitrary single-recipient fallback bug)
2. A **Leads queue** surface visible to Leadership + BDT — separate from the existing leadership-only Needs-AE queue
3. **Pick up** (self-claim, one click) or **assign a liaison** (Leader assigns to a BDT/Leadership member)
4. **Disqualify with a recorded reason** (spam · competitor · not a fit · duplicate · no response)
5. **A second ownership field** — the liaison — distinct from `ae_user_id`

**Explicitly OUT of scope (deferred until real BDT hires + deal volume):** the ~2-month transition access window; shared-commission mechanics; role separation beyond the queue; the 24-hour escalation automation (document the target, don't build the timer yet); the full first-contact checklist (still undefined by the owner).

**Watch-outs:** (a) Stage 2 already exists — the Needs-AE queue and the leadership-only D-07 AE handoff (which also covers reassigning an AE) shipped in 31.1; do not rebuild or disturb them. (b) The leadership tower's All tab is deliberately `hide-not-filter` leadership-only (D-31.1-01) — the Leads queue must NOT widen that; BD sees the lead queue, not the whole book. (c) Client momentum is never blocked by the queue — a registrant who acts immediately keeps full access and flags the lead hot. (d) `pipeline_stages` (`new_lead → contacted → …`) already exists from 31.1 and maps to this flow.

**Depends on:** Phase 31.1 (Needs-AE queue, D-07 handoff, pipeline stages)

**Status:** Roadmapped 2026-08-26 from the owner SOP discussion. Not yet discussed/planned.

**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 34 to break down)

### Phase 35: The Playbook — Room Content: adopt file docs into entries, unified rendering, stock the rooms

**Goal:** Close the gap Phase 33 deliberately left open ("the other rooms' content" — deferred, never given a follow-on phase). The shelves are built (Phase 33 shell) and the authoring machinery exists (Phase 31.2 entries + draft→approve + room×role access editor), but every room except IT Team is empty, and the two content mechanisms don't meet.

**Owner decision (2026-08-26): BOTH mechanisms, and BOTH editable from inside The Playbook, without breaking the look/feel/design of the room.**

**The constraint that shapes the design:** the app runs serverless on Vercel with a **read-only filesystem** — the running app physically cannot write back to `docs/`. Editing a file in place from the browser is impossible without committing through the GitHub API (which would turn every wiki edit into a deploy). Therefore:

**The adoption model.** A file-authored doc (`docs/<area>/*.md`) is **imported once** into `playbook_entries`. From that point the team edits it in-app through the existing editor and approval flow; **the DB row is the source of truth and the file is its origin, not its permanent home.** This deliberately avoids two-way sync, where a doc edited in git and in-app diverges with no principled winner.

**CENTRAL DECISION — how expressive is a Playbook page? (owner-flagged 2026-08-26)**

**Full brief: `.planning/deliberations/playbook-content-model.md` — READ THIS FIRST in discuss-phase.** It carries the audited current state, the four already-decided points, the vocabulary, the three candidate models with trade-offs, and six open sub-decisions.

Everything else in this phase follows from this. **Today an entry is a title plus a flat list of lines** — `sop` = `{ items: string[] }`, `topic` = `{ questions: string[] }` (see `components/playbook/EntryEditor.tsx`). There are **no paragraphs, headings, callouts, tables, or diagrams**. The sales SOP written 2026-08-26 (stages, numbered steps, colored callouts, a roles matrix) **cannot be expressed in the current editor** — it would flatten to a checklist.

Vocabulary agreed with the owner: the coloured boxes are **callouts** (a.k.a. admonitions / alerts / panels), typed by intent — note (blue) · tip (green) · caution (amber) · warning (red). The step-by-step spine is a **process flow / vertical timeline (stepper)**, distinct from a true **flowchart** (boxes, arrows, decision diamonds).

Three candidate authoring models:

- **(1) Markdown + syntax** — author types markdown; callouts via a GitHub-style `> [!WARNING]` convention. Cheapest; gets headings/tables/lists free; requires learning a little syntax.
- **(2) Block editor (Notion-style)** — click **+** → insert a Callout block, pick its type. Best authoring UX by far; much the largest build.
- **(3) Diagrams-as-text** — flowcharts described in a few lines of text and rendered (already how the repo SOP's flowchart works).

**Orchestrator's recommendation: (1) + (3)** — markdown covers headings/tables/callouts almost free, text-described diagrams cover flowcharts without building a drawing tool, and a block editor can be layered on later without changing the stored content. **Not yet decided — resolve in discuss-phase.**

Whatever is chosen sets the stored content shape, so it must be settled **before** the adopt-a-doc importer is designed: an imported markdown doc has to land in whatever format the editor natively edits, or adopted pages become second-class and un-editable — which would defeat the owner's "both editable from inside The Playbook" requirement.

**In scope:**

1. **Adopt-a-doc**: import a `docs/<area>/*.md` file into a room as a `playbook_entries` row (title, content, room, provenance = source path + adopted-at). Idempotent; never silently re-imports over in-app edits.
2. **Unified rendering**: file-origin and natively-authored entries must render through the **same room components** — an adopted doc must be visually indistinguishable from one written in the editor. Today the IT room renders markdown via `lib/playbook/read-doc.ts` while 31.2 entries render through the entry surfaces; these must converge.
3. **Generalize beyond `docs/observability/`**: `read-doc.ts` is hardcoded to that one folder, so `docs/sales/` (and any future area) cannot render today.
4. **Stock the rooms**: seed the first real content per room — starting with **Sales** (`docs/sales/LEAD-TO-AE-HANDOFF-SOP.md`, the lead → assigned-AE SOP written 2026-08-26).

**Watch-outs:** (a) Phase 31.2's role-tiered publish gate and the room×role access editor already exist — reuse, do not rebuild. (b) The IT room already works; adoption must not regress it. (c) Decide explicitly what happens if an adopted doc's source file later changes in git (proposal: surface a "source changed" notice, never auto-overwrite in-app edits). (d) UI mockup artifacts are NOT article material — they expire on ship (see the artifacts→Playbook memory); only durable process/policy docs get adopted.

**Depends on:** Phase 33 (shell), Phase 31.2 (authoring + RBAC)

**Status:** Roadmapped 2026-08-26. Not yet discussed/planned.

**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 35 to break down)

### Phase 36: Account Identity — mandatory @handle for user accounts, artist display name separate

**Goal:** Every user account has a unique, mandatory `@handle` as its identity, with
artist name demoted to an optional display field — so a profile is never titled
"Unnamed artist" again, and behind-the-scenes members are first-class instead of
nameless.

**SCOPE — USER ACCOUNTS ONLY. Not Team Members. Not Client Partners.**
This touches only the accounts artists and industry members sign up for — the ones that own
a `user_profiles` row. Handles are for people who engage socially: profiles, the Green Room,
DMs, collaboration. Team Member accounts are internal staff tooling, and Client Partner
accounts exist for direct B2B licensing, not social activity. Neither has any use for a
public @identity.

**Both exclusions are STRUCTURAL, not rules anyone has to remember.** The handle work
physically cannot reach either account type:

- **Team Members** — staff live in `funun_staff`, keyed to `auth.users`, and never touch the
  profile table. Production data: 11 auth users = 9 `user_profiles` + 2 `funun_staff`, with
  **zero overlap**. `pete@funun.studio` and `soko@funun.studio` have no `user_profiles` row
  at all.

- **Client Partners (buyers)** — `handle_new_user()` (migration 098) branches on
  `raw_app_meta_data->>'role'` and returns for `'buyer'` **before** any profile insert, with
  the comment "buyers are a fully separate account type". No buyer ever gets a
  `user_profiles` row.

Only the `'industry'` and default `'artist'` branches of that trigger create a profile — so
"user account" is precisely `member_type IN ('artist','industry')`, and that set is the
whole blast radius. Do NOT add handle fields, prompts, or validation to any staff or buyer
surface.

**Open question for discussion:** that same trigger has a THIRD early return, for
`role = 'curator'`, which also creates no profile. That predates the decision that curators
are Industry accounts. Confirm during discussion whether curators are meant to land in the
industry branch (and therefore get handles) or stay profile-less — the answer changes who
is in scope.

**Why:** `artist_name` is doing two incompatible jobs — "what do we call you in the UI"
AND "what is your stage name". A mixing engineer legitimately has the second and not the
first, so they get a profile titled "Unnamed artist" (the fallback at
`lib/profile/load.ts:126`). **8 of 9 accounts — 89% — render that way today**, because
signup collects only email and password and never asks who anyone is.

Handle-first identity is the *superset* of name-first: a display name can always be
rendered on top of a handle, but addressable identity cannot be retrofitted once hundreds
of rows have no unique string. At 9 accounts this is a signup-form change; at 500 it is a
migration plus a backfill plus asking every existing user to pick one. It also unblocks
experimenting with The Green Room's direction (more Slack/Twitter-like, less
LinkedIn-like) without a later identity migration.

**Owner decisions (locked):**

1. `@handle` is **mandatory** for all user accounts. It is the identity field — unique and
   addressable.

2. Artist name stays a **separate, optional display field**. With one set, the profile
   header shows the artist name as the title and `@handle` beneath it; with none, the
   `@handle` **is** the title. Never a fabricated name, never "Unnamed artist".

3. **Legal name is unchanged** — still collected for contracts only. It is not a display
   name and must never leak into public profile rendering.

4. Handle-less accounts are **prompted on next sign-in**, not auto-generated. A handle is a
   permanent public identifier and people should choose it. Only ~3 of the 8 are real
   humans; the rest are `demo@` / `epktest-` / `droptest-` / `codex-064-*` fixtures.

**Already built — verify and extend, do NOT rebuild:**

- `handle` column exists (migration 010) with a **case-insensitive unique index** on
  `lower(handle)`, NULLs allowed.

- Reserved-handle guard exists (migration 037) — a `SECURITY DEFINER` trigger rejecting
  `admin`/`funun` etc. at the DB layer, so the app cannot be bypassed.

- `app/u/[handle]/page.tsx` already serves public profiles by handle.
- The only genuine gap: signup never asks, and nothing requires it.

**WHERE THE HANDLE IS CHOSEN (decided 2026-08-27) — on the create-account form.**

Signup step 2 currently asks two things, email and password. The handle becomes the
third field there, NOT a separate step after email verification.

This works because of a mechanism already proven in the same trigger: the `industry`
branch of `handle_new_user()` reads `NEW.raw_user_meta_data->>'display_name'`, so
**`user_metadata` IS visible to the trigger at INSERT** (`app_metadata` and
`email_confirmed_at` are NOT — that asymmetry cost two cutover failures in Phase 27).
So the handle rides along with the signup call:

```
signUp({ email, password, options: { data: { handle } } })
   -> raw_user_meta_data.handle
   -> handle_new_user() inserts it with the profile row
```

The artist branch today inserts a bare `INSERT INTO public.user_profiles (id) VALUES
(NEW.id)`. It gains the handle column. Profile and handle are then created in the SAME
statement — **for a new signup there is genuinely no window where a User Account exists
without a handle.**

A post-verification step was rejected: it would leave every new account handle-less
between creation and first sign-in, requiring a blocking gate to close a gap that this
placement never opens.

**THE TWO GAPS THAT REMAIN — do not claim "no gap" without these.**

1. **Existing accounts are not covered by that atomicity.** The 8 handle-less rows exist
   right now and stay handle-less until each person next signs in and picks one (owner
   decision 4: prompt, never auto-generate). Only ~3 are real humans, so the window is
   small in practice — but it is real, and it means "every User Account has a handle"
   becomes true only after the last of them signs in.

2. **The uniqueness race deliberately opens a gap rather than losing an account.** If a
   handle is claimed between the availability check and the INSERT, the unique index
   rejects it, the trigger raises, and `signUp` ABORTS — the person sees a generic
   failure after already committing a password. The trigger must instead catch the
   unique violation and insert NULL, with the app forcing a pick on first sign-in. A
   rare, brief gap is the correct trade against costing someone their signup.

**Consequence for enforcement:** a `NOT NULL` constraint on `handle` is the only real
guarantee, and it CANNOT be added until every existing row is backfilled. Sequence it
last — after the prompt-on-sign-in path has drained the handle-less accounts — or it will
fail on deploy. Until then "mandatory" is enforced by the application, not the database.

**Unverified-account squatting:** someone can claim `@maya`, never click the verification
email, and hold the name indefinitely. Decide during discussion whether unverified claims
expire (Twitter and Instagram both release them).

**Format constraint that will bite:** the one live handle in production is `maya-reyes` —
it contains a **hyphen**. Any format rule must allow hyphens or it invalidates the only
existing handle and breaks `/u/maya-reyes`. Proposed: lowercase `a-z 0-9 - _`, 3–30 chars;
confirm against the reserved-handle trigger during discussion.

**Risks to get right:**

- **Uniqueness is the DB's job.** The unique index is the guarantee; a live "that's taken"
  check is a courtesy only. Handle the simultaneous-claim race at the DB error, never
  optimistically in the UI.

- **Signup is the highest-drop-off moment in the product.** A required third field there is
  a real conversion cost; the UX needs care.

- **Audit every display path** that falls back to `artist_name` — DMs, collaborator lists,
  split sheets, Green Room, notifications, wall posts — so this does not just relocate
  "Unnamed artist" somewhere else.

- **Handle changes over time**: can someone change theirs, and does the old `/u/` URL 404 or
  redirect? Settle this now, before links are shared.

**Requirements**: D-01–D-15 (locked in 36-CONTEXT.md; no numbered REQUIREMENTS.md for this phase)
**Depends on:** Phase 35
**Plans:** 7/7 plans executed

Plans:
**Wave 1**

- [x] 36-01-PLAN.md — Handle format validator + profile display-name fix (D-04/D-05/D-11/D-12)
- [x] 36-02-PLAN.md — Migration 133: INSERT-path reserved guard, handle_history, signup-handle trigger catch, handle resolver [human-gated push] (D-01/D-03/D-06/D-08/D-15)

**Wave 2** *(blocked on Wave 1 — migration 133 must be pushed first)*

- [x] 36-03-PLAN.md — PATCH /api/profile/handle + settings change-handle field (D-07/D-08/D-14)
- [x] 36-04-PLAN.md — Signup collects the handle + public availability endpoint (D-02/D-03/D-14)
- [x] 36-05-PLAN.md — /u/[handle] case-insensitive resolution + retired-handle redirect (D-04/D-07)

**Wave 3** *(blocked on Wave 2)*

- [x] 36-06-PLAN.md — The hard gate for handle-less User Accounts, staff/buyer-proof (D-09/D-10/D-10a/D-10b/D-10c)

**Wave 4** *(blocked on Wave 3)*

- [x] 36-07-PLAN.md — Migration 134: handle format CHECK, text-locked to lib/handles/validate.ts [human-gated push, applied 2026-08-27]; D-13 NOT NULL DEFERRED with an owner tripwire — the planned fixture sweep was removed after the fixtures were deleted outright (D-05/D-13)

---

### Phase 32: Production Observability, Capacity & Incident Readiness

**Goal:** Funūn moves from zero formal monitoring to a founder-maintainable observability system: owned, minute-latency alerts for outages / elevated error rates / slow routes / Vercel throttling / Supabase pressure / unexpected spend; a tested read-only `/api/health`; privacy-scrubbed Sentry server+browser monitoring; a minimal correlation-ID logging convention; a non-prod k6 harness that finds the real capacity ceiling; baseline-validated thresholds + a SEV-1..4 model; a tabletop-tested incident runbook; and a named-owner operating rhythm — all tunable from one owner-editable config layer (D-10).
**Requirements**: R1–R10 (SPEC-locked; see 32-SPEC.md)
**Depends on:** Phase 31
**Plans:** 9/10 plans executed

Plans:
**Wave 1**

- [x] 32-01-PLAN.md — Central config layer (D-10) + observability_recipients migration (R1/R8/R10)
- [x] 32-02-PLAN.md — PII scrub + correlation-ID / structured-logging primitives (R5/R6)
- [x] 32-03-PLAN.md — Read-only, secret-safe /api/health endpoint (R4)
- [x] 32-04-PLAN.md — Vercel cost controls + Supabase health review [vendor + docs] (R1/R2)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 32-05-PLAN.md — Extensible alert fan-out + daily observability cron (R1/R8/R10)
- [x] 32-06-PLAN.md — Sentry error monitoring: wiring + scrubbing + owner setup (R5)
- [x] 32-07-PLAN.md — Better Stack external uptime monitor + status page (R3)
- [x] 32-08-PLAN.md — Thresholds table + SEV-1..4 model doc (R8)
- [ ] 32-09-PLAN.md — k6 non-prod load harness + capacity report (R7)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 32-10-PLAN.md — Incident runbook + operating rhythm (R9/R10)
