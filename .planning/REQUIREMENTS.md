# Requirements: Funūn — Wave 4: The Green Room (v1.2)

**Defined:** 2026-07-03
**Core Value:** Funūn is where an independent artist's whole career lives — and where the industry comes to find them. The Green Room turns a profile into a professional identity and a network: artists connect with producers, supervisors, A&R, and execs, and real relationships — not just tools — are what keep them on the platform.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Profile (rich member identity)

- [x] **PROFILE-01**: User can view a rich profile header — banner, avatar with online presence dot, name, pronouns, verified badge, and multi-role badges with the lead role highlighted
- [x] **PROFILE-02**: User can add a custom title alongside standard industry roles (Artist, Producer, Songwriter, Music Supervisor, A&R, Exec)
- [x] **PROFILE-03**: User can set a location and sees their tenure ("On Funūn since [year]") on their profile
- [x] **PROFILE-04**: User can set "Open to" availability status (sync licensing, co-writes, features, brand deals) and it displays as chips on their profile
- [x] **PROFILE-05**: User can pin one release as a "Featured" spotlight on their profile
- [x] **PROFILE-06**: User sees a stats sidebar (followers, monthly listeners, placements, avg. readiness) on any profile
- [x] **PROFILE-07**: User sees a releases grid with readiness rings on any profile
- [x] **PROFILE-08**: Profile owner sees Edit profile / Share / View analytics actions; visitors see Follow / Message / more-options instead
- [x] **PROFILE-09**: User can upload and edit their own banner and avatar images

### Discover (search & discovery)

- [ ] **DISCOVER-01**: User can search for members by name, role, or keyword via a global search bar
- [ ] **DISCOVER-02**: User can filter search/discovery results by role, "Open to" status, location, and genre
- [ ] **DISCOVER-03**: User can browse a Discover tab organized by role category and genre
- [x] **DISCOVER-04**: User can browse a Network tab showing people they follow, are connected with, or have pending requests with

### Feed (network activity & exploration)

- [ ] **FEED-01**: User can click "The Green Room" from the left-side app navigation and land on a Green Room feed that shows recent public activity from members they follow, are connected with, and discoverable public members
- [ ] **FEED-02**: Feed items include enough actor context to drive exploration: avatar, name, role, handle, activity type, timestamp, and a link to the relevant profile/release/thread
- [ ] **FEED-03**: User can take lightweight actions from feed cards where appropriate: follow/connect/message/view profile/open release, without needing to start from search
- [ ] **FEED-04**: Feed reads run server-side and exclude blocked members, non-public profiles, and activity the viewer is not allowed to see
- [ ] **FEED-05**: Feed layout reserves clearly labeled promotional/sponsored placement slots for future monetization, without shipping paid ad buying or targeting in v1
- [ ] **FEED-06**: The Green Room destination can also be surfaced from secondary entry points, such as the authenticated header or dashboard cards, without creating duplicate feed logic or competing routes
- [ ] **FEED-07**: User can create posts from a guided composer that feels like a simple "Share an update" box but stores a structured post type such as general update, collaborator request, release announcement, question, win/milestone, feedback request, or opportunity/need
- [ ] **FEED-08**: User can set post visibility to Public, Followers, Connections, Draft, or Custom Audience, with server-enforced audience checks
- [ ] **FEED-09**: Custom Audience supports relationship, role, genre, location, and specific-person targeting with safety limits, capped complexity, and clear "Visible to..." labels
- [ ] **FEED-10**: Feed ranking is smart but transparent, using relationship strength, freshness, and relevance while labeling why items appear
- [ ] **FEED-11**: Admins can curate featured/sponsored placements for members, public releases/projects, opportunities/open calls, partner cards, curated programs, or future paid placements
- [ ] **FEED-12**: Users can leave lightweight comments on feed posts and react with Like, Love, Fire, Congrats, Inspired, Helpful, or Interested
- [ ] **FEED-13**: Feed posts can attach linked Funūn objects in v1 — profiles, releases/projects, public tracks, or opportunities — while uploaded images are deferred until moderation/reporting is stronger
- [ ] **FEED-14**: Users can repost/share eligible feed content with strong safeguards: clear original attribution, owner-controlled resharing, rate limits, report/remove controls, mute controls, and automatic disappearance when original visibility changes
- [ ] **FEED-15**: Feed updates in real time with gentle controls: new-activity pill, animated insertion, and user-controlled jump-to-new behavior
- [ ] **FEED-16**: Green Room launches with For You, Following, Discover, and Opportunities tabs, with a plan to expand toward specialized tabs later
- [ ] **FEED-17**: Opportunities use a hybrid model: formal opportunities stay in Antenna, while lighter collab/opportunity posts can live in the feed and later graduate into Antenna
- [ ] **FEED-18**: Artists and industry members use the same Green Room structure, but feed ranking/emphasis adapts by role/capability

### Connect (relationship model)

- [x] **CONNECT-01**: User can follow another member (one-way, no approval required)
- [x] **CONNECT-02**: User can send a Connect request to another member; recipient can accept or decline, establishing a mutual connection
- [x] **CONNECT-03**: User can send a message request to a non-connection; recipient can accept (opens a DM thread), decline, or block
- [x] **CONNECT-04**: User is rate-limited on outbound cold message requests (e.g. 10/week) to prevent spam
- [x] **CONNECT-05**: User can message directly, with no request step, once mutually connected

### Notifications

- [x] **NOTIF-01**: User receives a notification for: new follower, connection request, connection accepted, message request, new DM, release comment, endorsement received, and wall post received
- [x] **NOTIF-02**: User sees an unread count badge on the notifications bell, separate from an unread count badge on the messages icon
- [x] **NOTIF-03**: User can view a notification list/panel and mark all as read

### Presence & DMs

- [x] **PRESENCE-01**: User sees an online presence dot on another member's avatar when that member is actively on the platform
- [x] **PRESENCE-02**: User sees "Active now" or "Active X ago" status in the DM widget header
- [x] **PRESENCE-03**: The floating DM widget shows an unread message count badge

### Trust & Safety

- [x] **SAFETY-01**: User can block another member; a blocked member cannot view the blocker's profile, message them, or see them in search/discovery results
- [x] **SAFETY-02**: User can report a member profile or a specific message for admin review
- [x] **SAFETY-03**: Admin can grant a verified badge to a member profile
- [x] **SAFETY-04**: User can set profile visibility (public / connections-only) and can hide their "Open to" status from public view

## v2 Requirements

Deferred to a future release (v1.x). Tracked but not in this milestone's roadmap.

### Presence & DMs

- **PRESENCE-04**: Typing indicator in the DM widget (via a Realtime Broadcast channel, separate from Presence)

### Notifications

- **NOTIF-04**: Digest email (daily/weekly batch) for low-priority notifications
- **NOTIF-05**: "Industry member viewed your profile" notification, shown only for verified/industry-role viewers

## Out of Scope

Explicitly excluded from this milestone. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Readiness / sync-cleared filters in Discovery | Funūn's real differentiator for supervisors, but member readiness data isn't dense enough yet across the network for the filter to be reliably useful — revisit in v2+ once more releases carry readiness scores |
| AI-assisted discovery recommendations | Requires ML infrastructure and enough network density to avoid a cold-start problem; Wave 5+ |
| Profile analytics view (viewer counts, follower growth over time) | High implementation cost for v1; "View analytics" button is stubbed in the design but not wired up this milestone |
| Automated verified-badge self-application workflow | Admin-manual grant is sufficient at this network size; automate only if volume demands it |
| Group messaging / team channels | Different complexity profile from 1:1 DMs; the "team" use case is already served by the collaborators table and shared vault access |
| Live push notifications (FCM/APNs) | Requires service workers and platform approvals; in-app bell badge covers v1 |
| Industry Round Table (live panels/replays/Q&A) | Distinct feature from the network layer itself; candidate for a follow-on social milestone (see `SEED-001`) |
| Self-serve paid ad buying / targeting | Feed should reserve sponsored placement slots now, but paid campaign creation, targeting, billing, and ad review need their own monetization/safety phase |
| Deep external integrations (Songstats, Buffer API push, Meta/TikTok OAuth publishing, SoundCloud/Bandsintown/YouTube) | Belongs to the originally-planned "deep integrations" Wave 4 track, not the social-layer track this milestone follows |
| Pulling live Spotify/SoundCloud stats automatically into the stats sidebar | OAuth scope creep; self-reported stats with a "provided by artist" label are sufficient for v1 |
| Swipe-based discovery | Not appropriate for a professional-context network; grid/list browse with filters is the correct pattern here |
| Paid cold-messaging (InMail-style) | Pay-to-play gatekeeping damages network trust; free rate-limited message requests instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROFILE-01 | Phase 9 | Complete |
| PROFILE-02 | Phase 9 | Complete |
| PROFILE-03 | Phase 9 | Complete |
| PROFILE-04 | Phase 9 | Complete |
| PROFILE-05 | Phase 9 | Complete |
| PROFILE-06 | Phase 9 | Complete |
| PROFILE-07 | Phase 9 | Complete |
| PROFILE-08 | Phase 9 | Complete |
| PROFILE-09 | Phase 9 | Complete |
| DISCOVER-01 | Phase 12 | Pending |
| DISCOVER-02 | Phase 12 | Pending |
| DISCOVER-03 | Phase 12 | Pending |
| DISCOVER-04 | Phase 13 | Complete |
| FEED-01 | Phase 12 | Pending |
| FEED-02 | Phase 12 | Pending |
| FEED-03 | Phase 12 | Pending |
| FEED-04 | Phase 12 | Pending |
| FEED-05 | Phase 12 | Pending |
| FEED-06 | Phase 12 | Pending |
| FEED-07 | Phase 12 | Pending |
| FEED-08 | Phase 12 | Pending |
| FEED-09 | Phase 12 | Pending |
| FEED-10 | Phase 12 | Pending |
| FEED-11 | Phase 12 | Pending |
| FEED-12 | Phase 12 | Pending |
| FEED-13 | Phase 12 | Pending |
| FEED-14 | Phase 12 | Pending |
| FEED-15 | Phase 12 | Pending |
| FEED-16 | Phase 12 | Pending |
| FEED-17 | Phase 12 | Pending |
| FEED-18 | Phase 12 | Pending |
| CONNECT-01 | Phase 10 | Complete |
| CONNECT-02 | Phase 10 | Complete |
| CONNECT-03 | Phase 11 | Complete |
| CONNECT-04 | Phase 11 | Complete |
| CONNECT-05 | Phase 11 | Complete |
| NOTIF-01 | Phase 10 | Complete |
| NOTIF-02 | Phase 10 | Complete |
| NOTIF-03 | Phase 10 | Complete |
| PRESENCE-01 | Phase 11 | Complete |
| PRESENCE-02 | Phase 11 | Complete |
| PRESENCE-03 | Phase 11 | Complete |
| SAFETY-01 | Phase 13 | Complete |
| SAFETY-02 | Phase 13 | Complete |
| SAFETY-03 | Phase 13 | Complete |
| SAFETY-04 | Phase 13 | Complete |

**Coverage:**

- v1 requirements: 46 total
- Mapped to phases: 46 ✓
- Unmapped: 0 ✓

**Phase note:** Phase 8 (Identity & Schema Foundation) carries no user-facing requirement by design — it is the schema/migration root every Phase 9–13 requirement depends on (column-privilege lockdown, block enforcement, identity-race avoidance). Its success is verified structurally, not by a mapped requirement.

## v1.3-pre — Phase 17: Split-Sheet E-Sign Requirements

**Defined:** 2026-07-19 (registered during plan-phase). **Source:** 17-CONTEXT.md locked inputs D-18b + AM-1..AM-5 (`.planning/deliberations/esign-split-sheet-economics.md`). Phase 17 executes before Phase 16 (AM-5). All Pending. These are tracked separately from the v1.2 coverage math above.

- [ ] **ESIGN-01**: DocuSeal implemented behind the existing `lib/esign/provider.ts` seam (hosted API + MIT `@docuseal/react` embed), dual-provider architecture (D-18b)
- [x] **ESIGN-02**: Split-sheet PDF renderer generating the Funūn template from captured composers/splits/PRO/IPI, with per-party DocuSeal signature fields (AM-2 template-only)
- [ ] **ESIGN-03**: Two-table envelope schema (`esign_envelopes` + `esign_envelope_signers`) preserving void→re-mint audit history (P17-02)
- [x] **ESIGN-04**: Two-step approve→sign default reusing the party's `/approve/[token]` link, plus an initiator fast lane that backfills approval from signature (P17-01)
- [ ] **ESIGN-05**: Any-party objection voids a minted envelope and returns the sheet to negotiation; re-consensus mints a new one (P17-02)
- [x] **ESIGN-06**: Embedded, mobile-first signing surface verified at a 375px viewport — the signer is never redirected (D-18b)
- [x] **ESIGN-07**: Signature-verified, idempotent completion webhook re-hosting the executed PDF + Certificate of Signature (Funūn's first live e-sign webhook)
- [ ] **ESIGN-08**: 5/10/15 readiness tiering for the 15-point split-sheets item in BOTH the DB trigger and the TS twin, kept in provable parity (P17-03/P17-03-impl)
- [x] **ESIGN-09**: Initiator notifications — party approved/signed, counter received (highest urgency), fully executed, and a viewed-but-no-action nudge (P17-04)
- [x] **ESIGN-10**: Executed-document cross-account distribution to every account-holder party's Contract Locker, including the standalone (projectless) query path (P17-06)
- [x] **ESIGN-11**: Standalone sheets get full e-sign and are attachable to a matching vault project later, moving that project's readiness (P17-05/P17-05a)
- [x] **ESIGN-12**: Offered (never silent) write-back of executed splits into `tracks.metadata.composers[]` via a confirmable diff (P17-07)
- [ ] **ESIGN-13**: Server-side ~10/mo per-initiator cap enforced at envelope mint, with an admin bump path and a single void-counting config flag (AM-2)
- [x] **ESIGN-14**: Usage/cost telemetry — completed-envelope count + estimated spend, admin-visible, feeding the AM-3 $500/mo re-decision trigger

**Added 2026-07-20 (provider-verification review — see 17-PROVIDER-VERIFICATION.md):**

- [x] **ESIGN-15**: Unicode-safe PDF rendering — a bundled, embedded font (Noto Sans, SIL OFL) registered once and used by all three renderers, so a collaborator's legal name is never corrupted on a generated document (P17-08, SHIPPED bug)
- [ ] **ESIGN-16**: Legal-grade split-sheet agreement — explicit composition-vs-master scope, agreement + per-signature dates, legal names distinct from professional names, publisher name/PRO/IPI per writer, separately stated writer and publisher shares, sample/interpolation disclosure, ISWC/ISRC linkage, and operative agreement language (P17-09)
- [ ] **ESIGN-17**: Attorney review gate on the operative agreement language, enforced by a production-only mint guard — the product organizes documents, it does not substitute for counsel (P17-09a, ROADMAP guardrail)
- [ ] **ESIGN-18**: Funūn-owned signature invitations — the provider's invite email disabled at mint, per-submitter reply-to, and a Funūn-branded Resend invite linking only to Funūn's own approve page (P17-10)
- [ ] **ESIGN-19**: Funūn Certificate of Completion — Funūn's own artist-facing completion artifact citing DocuSeal as signing provider and referencing its audit log as underlying evidence, with provider-reported facts structurally confined to an attributed provenance section (P17-10)

**Traceability (Phase 17):**

| Requirement | Phase | Status |
|-------------|-------|--------|
| ESIGN-01 | Phase 17 | Pending |
| ESIGN-02 | Phase 17 | Complete |
| ESIGN-03 | Phase 17 | Pending |
| ESIGN-04 | Phase 17 | Complete |
| ESIGN-05 | Phase 17 | Pending |
| ESIGN-06 | Phase 17 | Complete |
| ESIGN-07 | Phase 17 | Complete |
| ESIGN-08 | Phase 17 | Pending |
| ESIGN-09 | Phase 17 | Complete |
| ESIGN-10 | Phase 17 | Complete |
| ESIGN-11 | Phase 17 | Complete |
| ESIGN-12 | Phase 17 | Complete |
| ESIGN-13 | Phase 17 | Pending |
| ESIGN-14 | Phase 17 | Complete |
| ESIGN-15 | Phase 17 | Complete |
| ESIGN-16 | Phase 17 | Pending |
| ESIGN-17 | Phase 17 | Pending |
| ESIGN-18 | Phase 17 | Pending |
| ESIGN-19 | Phase 17 | Pending |

**Data-integrity note (2026-07-20):** the ESIGN-09..12 checklist entries and traceability rows were duplicated with conflicting states, almost certainly by concurrent wave-3 executors (17-04 and 17-05) editing this file in parallel. Deduplicated here against the authoritative source — the `requirements-completed` frontmatter of 17-04-SUMMARY.md (ESIGN-04, ESIGN-06, ESIGN-09) and 17-05-SUMMARY.md (ESIGN-10, ESIGN-11, ESIGN-12). ROADMAP.md's Phase 17 plan list carried the same duplication and was repaired in the same pass.

## v1.3-pre — Phase 18: Split-Sheet Home Requirements

**Defined:** 2026-07-20 (registered during plan-phase). **Source:** 18-CONTEXT.md locked decisions P18-01..P18-14, whose authoritative design is `.planning/phases/17-split-sheet-esign/17-DUAL-ENTRY-DESIGN.md`. Phase 18 executes after Phase 17, before Phase 16. All Pending.

**Living-draft surface (18-01):**

- [ ] **HOME-01**: A split-sheet list — every sheet the user initiated, plus every sheet they are a party to — reachable from navigation, closing the orphaned-`/split-sheets` finding
- [ ] **HOME-02**: `/split-sheets/[id]` detail page with `SplitSheetBuilder` in edit mode, loading persisted parties and PATCHing them — the first UI caller `PATCH /api/split-sheets/[id]` has ever had
- [ ] **HOME-03**: `CollaboratorPicker` available on an existing draft plus add-and-redistribute (proportional or even), so adding a fourth writer never destroys three negotiated percentages (P18-07)
- [ ] **HOME-04**: Read-only draft share — a collaborator sees proposed splits without the sheet becoming a formal signing request; the sheet stays in draft and the shared view offers no approve or counter action (P18-08)
- [ ] **HOME-05**: The freeze boundary surfaced in its own words, and consensus resets summarized as named from/to changes rather than a bare re-approval request (P18-06, P18-09)

**Contract Locker as workspace (18-02):**

- [ ] **HOME-06**: Attention-first Locker landing reading BOTH `vault_documents` and in-flight `split_sheets` — awaiting signature with per-party progress, drafts in progress, unattached executed sheets, songs with no sheet — derived by structured query with no model call, plus create actions, the settled archive, and a reserved-but-unbuilt `ask` slot (P18-10)
- [ ] **HOME-07**: Per-party Locker views — one document, N lockers, each in the viewer's own context; drafts initiator-only until sent; removal is a per-viewer soft hide that never deletes a shared legal record (P18-11)
- [ ] **HOME-08**: The block exception made deliberate — an in-source note at the Locker and attachment queries recording that block filtering intentionally does NOT apply to shared executed agreements, with its narrow scope and a citation, so a later audit does not "fix" correct behavior; and no cross-party action anywhere in the phase accepts user-supplied free text (P18-12, P18-13)

**Song-level attachment (18-03):**

- [ ] **HOME-09**: `split_sheets.track_id` (nullable, `ON DELETE SET NULL`), the `split_sheet_attachments` join table with a backfill from existing `vault_project_id` values, and the `source` provenance field — field only, no extraction (P18-02, P18-03, P18-05)
- [ ] **HOME-10**: Attach route v2 accepting an optional track, extending 17-05's route under its unchanged party-AND-owner double check, with the executed-only gate relaxed because attachment is orthogonal to the signing lifecycle; plus detach (P18-04)
- [ ] **HOME-11**: Attach from both directions — Locker-side and Vault-side with fuzzy title matching that suggests without preselecting — plus the conflict flag for two sheets on one song and explicit handling of rename-after-signing, deleted track, deleted project, and multi-project attachment, with no PDF regeneration path anywhere

**Coverage-based readiness (18-04):**

- [ ] **HOME-12**: Coverage-based split-sheet scoring replacing the all-or-nothing gate — `covered / needing` across the project's tracks, MINIMUM tier across the needing set, implemented in BOTH `readinessItemsForProject()` and `calculate_vault_readiness()` against one shared scenario fixture, preserving the legacy wet-sign path (P18-14)

**Traceability (Phase 18):**

| Requirement | Phase | Plan | Status |
|-------------|-------|------|--------|
| HOME-01 | Phase 18 | 18-01 | Pending |
| HOME-02 | Phase 18 | 18-01 | Pending |
| HOME-03 | Phase 18 | 18-01 | Pending |
| HOME-04 | Phase 18 | 18-01 | Pending |
| HOME-05 | Phase 18 | 18-01 | Pending |
| HOME-06 | Phase 18 | 18-02 | Pending |
| HOME-07 | Phase 18 | 18-02 | Pending |
| HOME-08 | Phase 18 | 18-02 | Pending |
| HOME-09 | Phase 18 | 18-03 | Pending |
| HOME-10 | Phase 18 | 18-03 | Pending |
| HOME-11 | Phase 18 | 18-03 | Pending |
| HOME-12 | Phase 18 | 18-04 | Pending |

**Concurrency note:** Phase 17's wave-3 executors duplicated entries in this file by editing it in parallel. Phase 18's plans are assigned non-overlapping files per wave, but this file is shared by every executor — a plan updating its own requirement statuses should re-read this section immediately before writing.

---
*Requirements defined: 2026-07-03*
*Last updated: 2026-07-20 — Phase 18 requirements HOME-01..12 registered during plan-phase and mapped across the four Phase 18 plans; Phase 17 requirements ESIGN-15..19 registered from the provider-verification review; ESIGN-09..12 duplication repaired*
