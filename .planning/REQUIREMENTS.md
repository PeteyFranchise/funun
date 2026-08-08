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

**Identity/collaborator replan (2026-07-22):** a new wave-1 plan **18-05 (Identity Foundation)** was added and 18-01/18-02 rewritten to incorporate the identity/collaborator redesign (`split-sheet-identity-and-collaborator-model.md` §1/§2/§4/§6/§7/§9). 18-05 is infrastructure — migration 066 (`collaborators.legal_name`/`status`, `artist_profiles.legal_name_locked_at`), the `resolvePartyIdentity()` live-link resolver, and the Settings legal-name confirm-and-lock — that ENABLES the HOME-02 (locked legal name for the read-only party-1 row) and HOME-03 (live-linked identity, fast collaborator add, pending/confirmed roster status) surfaces built in 18-01. No HOME requirement moved out of 18-01/18-02; 18-05 is the enabling layer. HOME-09..12 remain owned by the untouched 18-03/18-04.

**Living-draft surface (18-01):**

- [x] **HOME-01**: A split-sheet list — every sheet the user initiated, plus every sheet they are a party to — reachable from navigation, closing the orphaned-`/split-sheets` finding
- [x] **HOME-02**: `/split-sheets/[id]` detail page with `SplitSheetBuilder` in edit mode, loading persisted parties and PATCHing them — the first UI caller `PATCH /api/split-sheets/[id]` has ever had
- [x] **HOME-03**: `CollaboratorPicker` available on an existing draft plus add-and-redistribute (proportional or even), so adding a fourth writer never destroys three negotiated percentages (P18-07)
- [x] **HOME-04**: Read-only draft share — a collaborator sees proposed splits without the sheet becoming a formal signing request; the sheet stays in draft and the shared view offers no approve or counter action (P18-08)
- [x] **HOME-05**: The freeze boundary surfaced in its own words, and consensus resets summarized as named from/to changes rather than a bare re-approval request (P18-06, P18-09)

**Contract Locker as workspace (18-02):**

- [x] **HOME-06**: Attention-first Locker landing reading BOTH `vault_documents` and in-flight `split_sheets` — awaiting signature with per-party progress, drafts in progress, unattached executed sheets, songs with no sheet — derived by structured query with no model call, plus create actions, the settled archive, and a reserved-but-unbuilt `ask` slot (P18-10)
- [x] **HOME-07**: Per-party Locker views — one document, N lockers, each in the viewer's own context; drafts initiator-only until sent; removal is a per-viewer soft hide that never deletes a shared legal record (P18-11)
- [x] **HOME-08**: The block exception made deliberate — an in-source note at the Locker and attachment queries recording that block filtering intentionally does NOT apply to shared executed agreements, with its narrow scope and a citation, so a later audit does not "fix" correct behavior; and no cross-party action anywhere in the phase accepts user-supplied free text (P18-12, P18-13)

**Song-level attachment (18-03):**

- [x] **HOME-09**: `split_sheets.track_id` (nullable, `ON DELETE SET NULL`), the `split_sheet_attachments` join table with a backfill from existing `vault_project_id` values, and the `source` provenance field — field only, no extraction (P18-02, P18-03, P18-05)
- [x] **HOME-10**: Attach route v2 accepting an optional track, extending 17-05's route under its unchanged party-AND-owner double check, with the executed-only gate relaxed because attachment is orthogonal to the signing lifecycle; plus detach (P18-04)
- [x] **HOME-11**: Attach from both directions — Locker-side and Vault-side with fuzzy title matching that suggests without preselecting — plus the conflict flag for two sheets on one song and explicit handling of rename-after-signing, deleted track, deleted project, and multi-project attachment, with no PDF regeneration path anywhere

**Coverage-based readiness (18-04):**

- [x] **HOME-12**: Coverage-based split-sheet scoring replacing the all-or-nothing gate — `covered / needing` across the project's tracks, MINIMUM tier across the needing set, implemented in BOTH `readinessItemsForProject()` and `calculate_vault_readiness()` against one shared scenario fixture, preserving the legacy wet-sign path (P18-14)

**Traceability (Phase 18):**

| Requirement | Phase | Plan | Status |
|-------------|-------|------|--------|
| HOME-01 | Phase 18 | 18-01 | Pending |
| HOME-02 | Phase 18 | 18-05, 18-01 | Pending |
| HOME-03 | Phase 18 | 18-05, 18-01 | Pending |
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

## v1.3-pre — Phase 19: Profile & Identity Model Cleanup Requirements

**Defined:** 2026-07-23 (registered during plan-phase, retroactively logged at 19-01 execution). **Source:** `.planning/phases/19-profile-identity-model-cleanup/19-SPEC.md` — 5 locked requirements, Ambiguity 0.13. Each requirement spans multiple plans across Phase 19's 3 waves; a requirement is only complete once ALL of its owning plans have landed (R1/R2/R3 specifically require the human-gated migration checkpoint in 19-07, not just the pure-logic foundation built in 19-01).

- [x] **R1**: Delete the duplicate `user_profiles`, re-point `claim_collaborators()` + `backfill_claimed_collaborators()` to `artist_profiles`, with a semantic-blank data-rescue migration before the drop (the "saved PRO reads None" bug fix) — **verified; migrations 071–073 live**
- [x] **R2**: Confirmable reverse profile pre-fill on claim — per-field provenance + unconfirmed flag, idempotent, most-recent-wins on conflict — **implementation verified; live claim round-trip UAT pending (19-UAT.md #1)**
- [x] **R3**: Preserve the existing claimed-collaborator live-link + `esign_pending`/`executed` freeze boundary through the table consolidation — **verified: `live-identity.ts` byte-unchanged since Phase 18**
- [x] **R4**: Flag-for-fix path for a claimed user's own identity on frozen sheets; no cross-user edits; guided apply (void-first for `esign_pending`, guided pointer for `executed`) — **implementation verified; live flag/notify/void UAT pending (19-UAT.md #2)**
- [x] **R5**: "Note to licensees" callout on newly-generated split-sheet PDFs and read-only share/export views — **verified in the rendered PDF byte stream + share view; visual-breakpoint UAT pending (19-UAT.md #3)**

**19-01 (foundation, wave 1, complete 2026-07-24):** built the pure-TypeScript SQL-parity twins `lib/profile/semantic-blank.ts` (R1) and `lib/profile/claim-prefill.ts` (R2), and confirmed R3's freeze-boundary regression coverage (pre-existing from Phase 18-05) is unchanged. This is the machine-checked contract 19-04/19-05's migrations and UI build against — it does not itself touch the database, so R1/R2/R3 stay unchecked here until 19-04/19-05/19-07 land.

**19-04 (wave 2, complete 2026-07-24):** authored migrations 071 (semantic-blank rescue, R1), 072 (both DB readers re-pointed + `claim_prefill` column + R2 reverse pre-fill), and 073 (drop `user_profiles`, strictly last) — all three structurally verified and twin-tested green, but NOT pushed to the remote database. R1/R2/R3 stay unchecked here until 19-05 (runtime removal + confirm UI) and 19-07 (the human-gated live push) also land.

**19-05 (wave 2, complete 2026-07-24):** deleted the duplicate "Rights Identity" Settings section + `/api/user-profiles` route (R1 runtime removal, done ahead of the human-gated migration 073 drop per the ordering safety design) and added the D-12 help line; built the per-field claim pre-fill confirm UI in `ProfileForm.tsx` + the `confirm_prefill_fields` server signal in `/api/profile` (R2), plus a companion migration-content test anchoring 072/073's current state. R1/R2 still stay unchecked here — both require the 19-07 human-gated live push (migrations 071-074) before the runtime code they now assume (single rights input; `claim_prefill` populated) is actually exercisable end-to-end.

**19-06 (wave 2, complete 2026-07-24):** built R4's frontend surfaces on top of 19-03's backend — the Contract Locker's "this info is wrong" flag entry (claimed user's own row, `esign_pending`/`executed` only, structured field + suggested-value, no free text/term control) and the owner's `?stagedFlag=` staged-correction panel (void-first for `esign_pending`, guided-pointer-only Link to a new sheet for `executed`, no amendment mechanism). R4 stays unchecked here — it requires the 19-07 human-gated live push of migration 074 (`split_sheet_identity_flags`) before the live flag → notify → staged-panel round trip is actually exercisable end-to-end.

**19-07 (wave 3, human-gated checkpoint, complete 2026-07-24):** Pete pushed migrations 071→075 via Codex; `supabase migration list` confirms LOCAL=REMOTE for 001–075. Migration 075 was added during the preflight (Codex found two privilege gaps in 072/074 — SECURITY DEFINER EXECUTE not revoked; weak flags INSERT policy — fixed as a new migration, 071–074 untouched). The schema cutover is live: `user_profiles` dropped; `artist_profiles.claim_prefill` live; both claim functions read `artist_profiles`; `split_sheet_identity_flags` live with hardened privileges. Phase verification (19-VERIFICATION.md) scored 9/9 must-haves at the code/test level; status is `human_needed` for 3 live-app UAT items (19-UAT.md).

**Traceability (Phase 19):**

| Requirement | Phase | Plan | Status |
|-------------|-------|------|--------|
| R1 | Phase 19 | 19-01, 19-04, 19-05, 19-07 | Complete (migrations live; verified) |
| R2 | Phase 19 | 19-01, 19-04, 19-05, 19-07 | Impl complete; live claim UAT pending (19-UAT.md #1) |
| R3 | Phase 19 | 19-01, 19-04 | Complete (preserve verified; byte-unchanged) |
| R4 | Phase 19 | 19-03, 19-06, 19-07 | Impl complete; live flag/notify/void UAT pending (19-UAT.md #2) |
| R5 | Phase 19 | 19-02 | Impl complete; visual-breakpoint UAT pending (19-UAT.md #3) |

## v1.3 — Phase 16: GTM Beta Launch & Buyer Portal Requirements

**Defined:** 2026-08-03 (registered by plan 16-10, per the plan's own task instruction). **Source:** `.planning/phases/16-gtm-beta-buyer-portal/16-CONTEXT.md` locked decisions D-01 through D-20. 34 IDs across nine families — BUYER, DEAL, PORTAL, ARTIST, ADMIN, MONEY, PAPER, DELIVERY, METRICS. Registered here as an additive section; the v1.2 Green Room sections above (and their coverage counts) are untouched by this edit.

**Naming note:** these use the `METRICS-` prefix, not `GTM-`. `GTM-01` through `GTM-07` are already taken — they are the GTM validation metric IDs defined in `16-VALIDATION.md`'s GTM Validation table, not requirement IDs. Where a description below cites `GTM-0N`, that is a citation of the validation doc's metric definition, not a requirement ID.

**Registration is traceability, not completion.** IDs whose implementing plan is deferred or partial (`DELIVERY-01`, `PAPER-01..04`, `MONEY-01..03`) are registered with a `Pending`/`Deferred` status below and are intentionally left unmarked in the top-of-file requirement checkboxes convention this milestone doesn't use (Phase 16 requirements live only in this section's traceability table, mirroring Phase 17/18/19's format).

### Buyer identity (D-04, D-11..D-14, D-13a)

- **BUYER-01**: Separate buyer account type with no `user_profiles` row (D-04/D-11)
- **BUYER-02**: Buyer org and member schema with two permission tiers (D-11/D-13)
- **BUYER-03**: Admin-created org plus first org-admin invite (D-12)
- **BUYER-04**: Org-admin employee invites with scoped tiers (D-13)
- **BUYER-05**: Org-level verification inherited by members (D-14)
- **BUYER-06**: Dedicated buyer access landing and portal gate (D-11)
- **BUYER-07**: Dual-level individual and company attribution (D-13a)

### Deal substrate (D-07, D-15, D-15a, D-16a, D-20)

- **DEAL-01**: First-class license-request schema (D-07)
- **DEAL-02**: Multi-track requests via join table
- **DEAL-03**: Deal-stage pipeline (D-16a)
- **DEAL-04**: Per-project pre-cleared terms, the Marmoset five (D-15)
- **DEAL-05**: Pre-cleared matching with admin-negotiation routing (D-15a)
- **DEAL-06**: Commission economics on every deal (D-20)
- **DEAL-07**: Server-owned writes and column-privilege doctrine on all deal tables

### Buyer portal (D-02, D-07, D-14c, D-16, D-16a)

- **PORTAL-01**: Filtered rights-ready catalog browse with no free-text search (D-16)
- **PORTAL-02**: The single tunable rights-ready helper
- **PORTAL-03**: Org-shared shortlists (D-14c)
- **PORTAL-04**: Structured request composer (D-02/D-07)
- **PORTAL-05**: Org request dashboard with stages (D-16a)

### Artist-facing (D-15, D-15b)

- **ARTIST-01**: Artist Deals room across all projects (D-15b)
- **ARTIST-02**: Per-project pre-cleared terms settings (D-15)

### Admin workflow (D-03, D-06, D-15a)

- **ADMIN-01**: Admin negotiation queue (D-15a/D-06)
- **ADMIN-02**: Server-owned stage, owner, and commission transitions
- **ADMIN-03**: Manual intake writing to the same tables (D-03)

### Money (D-17, D-17a, D-20)

- **MONEY-01**: Stripe Connect Express onboarding, transfers-only (D-17a)
- **MONEY-02**: Buyer Checkout payment with destination split (D-17/D-20)
- **MONEY-03**: Signature-verified Stripe webhook

### Paper — e-sign (D-08, D-18, D-18c)

- **PAPER-01**: Sync-license signing on Phase 17's reused DocuSeal adapter behind the e-sign interface — no new adapter, no new credentials (D-18c, supersedes the SignWell framing of D-18a/D-18b)
- **PAPER-02**: Admin-drafted sync license sent for embedded signature (D-18)
- **PAPER-03**: Signed contract filed into Contract Locker (D-08)
- **PAPER-04**: E-sign integration doc updated to the single-provider DocuSeal decision (D-18c)

### Delivery (D-19)

- **DELIVERY-01**: Portal export-pack delivery unlock after signature and payment (D-19)

### Metrics (D-06, D-10)

- **METRICS-01**: GTM beta metrics dashboard over real deal data (D-10)
- **METRICS-02**: Founder-led sales instrumentation including support burden (D-10/D-06)

**Traceability (Phase 16):**

| Requirement | Phase | Plan | Status |
|-------------|-------|------|--------|
| BUYER-01 | Phase 16 | 16-01 | Complete |
| BUYER-02 | Phase 16 | 16-01 | Complete |
| BUYER-03 | Phase 16 | 16-03 | Complete |
| BUYER-04 | Phase 16 | 16-03 | Complete |
| BUYER-05 | Phase 16 | 16-01 | Complete |
| BUYER-06 | Phase 16 | 16-03 | Complete |
| BUYER-07 | Phase 16 | 16-01, 16-02 | Complete |
| DEAL-01 | Phase 16 | 16-02 | Complete |
| DEAL-02 | Phase 16 | 16-02 | Complete |
| DEAL-03 | Phase 16 | 16-02, 16-07 | Complete |
| DEAL-04 | Phase 16 | 16-02, 16-04 | Complete |
| DEAL-05 | Phase 16 | 16-02, 16-06 | Complete |
| DEAL-06 | Phase 16 | 16-02, 16-07 | Complete |
| DEAL-07 | Phase 16 | 16-02 | Complete |
| PORTAL-01 | Phase 16 | 16-05 | Complete |
| PORTAL-02 | Phase 16 | 16-05 | Complete |
| PORTAL-03 | Phase 16 | 16-05 | Complete |
| PORTAL-04 | Phase 16 | 16-06 | Complete |
| PORTAL-05 | Phase 16 | 16-06 | Complete |
| ARTIST-01 | Phase 16 | 16-04 | Complete |
| ARTIST-02 | Phase 16 | 16-04 | Complete |
| ADMIN-01 | Phase 16 | 16-07 | Complete |
| ADMIN-02 | Phase 16 | 16-07 | Complete |
| ADMIN-03 | Phase 16 | 16-07 | Complete |
| MONEY-01 | Phase 16 | 16-08 | Pending (code + migration 084 authored; awaiting owner Stripe setup + live push) |
| MONEY-02 | Phase 16 | 16-08 | Pending (code + migration 084 authored; awaiting owner Stripe setup + live push) |
| MONEY-03 | Phase 16 | 16-08 | Pending (code authored; awaiting owner Stripe setup + live push) |
| PAPER-01 | Phase 16 | 16-09 | Deferred — sync-license signing model undecided, see `.planning/deliberations/sync-license-signing-model.md` |
| PAPER-02 | Phase 16 | 16-09 | Deferred (same blocker as PAPER-01) |
| PAPER-03 | Phase 16 | 16-09 | Deferred (same blocker as PAPER-01) |
| PAPER-04 | Phase 16 | 16-09 | Deferred (same blocker as PAPER-01) |
| DELIVERY-01 | Phase 16 | 16-10 | Deferred — depends on 16-09 (signed contract) and 16-08 (paid deal), both pending/deferred; explicitly not built in 16-10's partial execution |
| METRICS-01 | Phase 16 | 16-10 | Complete |
| METRICS-02 | Phase 16 | 16-10 | Complete |

**Coverage (Phase 16):**

- Phase 16 requirement IDs: 34 total
- Complete: 27
- Pending (awaiting owner Stripe setup + live push): 3 (MONEY-01..03)
- Deferred (blocked on signing-model decision): 5 (PAPER-01..04, DELIVERY-01)

## v1.4 — Phase 28: Industry Accounts & Green Room Access Requirements

Industry becomes a first-class account capability: external professionals (curators, A&R, publishers, supervisors) can be invited, post opportunities to the Antenna, and participate in the Green Room — while Funūn staff and Client-Partner (buyer) accounts are held out of the Green Room. Backed by corrective migrations 085 (industry capability grant + Green Room RLS gate), 086 (restore buyer branch), 087 (SECURITY DEFINER Green Room eligibility helper), and 088 (author-own-row SELECT policy fixing INSERT..RETURNING) — all live (`LOCAL=REMOTE` through 088) and end-to-end smoke-verified against production.

### Industry capability & Antenna

- **INDUSTRY-01**: Industry members can post opportunities to the Antenna, gated solely by the `industry` capability (`hasCapability`); the dead `industry_profiles` double-gate is removed
- **INDUSTRY-04**: A shared `provisionIndustryAccount()` primitive mints an industry account (no email) for both the admin-invite and curator-claim call sites, reconciling `member_type='industry'` + an approved `industry` capability grant independent of trigger timing
- **INDUSTRY-06**: `capability_grants` is the single source of truth for the `industry` capability, kept in lockstep with `member_type`

### Green Room access

- **INDUSTRY-02**: Only Artist and Industry accounts may post in the Green Room — enforced at the app layer (`greenRoomPosterGate`) and backstopped by DB RLS on `green_room_posts`
- **INDUSTRY-07**: Funūn staff cannot post in the Green Room under a `@funun.studio` email — they must use a personal Artist or Industry account

### Onboarding & directory

- **INDUSTRY-03**: Industry accounts are created by invitation (admin / team-member invite); the curator-claim path is repointed onto the shared industry provisioning
- **INDUSTRY-05**: The curators directory is relocated under PitchPlug (out of the admin area)

**Traceability (Phase 28):**

| Requirement | Phase | Plan | Status |
|-------------|-------|------|--------|
| INDUSTRY-01 | Phase 28 | 28-01, 28-05 | Complete |
| INDUSTRY-02 | Phase 28 | 28-02, 28-05 | Complete |
| INDUSTRY-03 | Phase 28 | 28-03 | Complete |
| INDUSTRY-04 | Phase 28 | 28-03 | Complete |
| INDUSTRY-05 | Phase 28 | 28-04 | Complete |
| INDUSTRY-06 | Phase 28 | 28-01, 28-05 | Complete |
| INDUSTRY-07 | Phase 28 | 28-02 | Complete |

**Coverage (Phase 28):**

- Phase 28 requirement IDs: 7 total
- Complete: 7 (all live-verified via production smoke — industry posts an Antenna opportunity; artist + industry post in the Green Room; buyer RLS-rejected; @funun app-blocked)

## v1.4 — Phase 25: Funūn Team Accounts & AE (Staff RBAC) Requirements

Internal Funūn Team Member accounts become first-class, role-typed (Leadership / AE / BD), with a service-role-only staff schema, assignment-scoped Client Partner management, an audited admin surface, a themeable Team Console, and an all-roles Team Member Directory. Backed by migrations 089 (funun_staff + staff_audit_log, RLS-enabled zero-policy), 090 (buyer_orgs.ae_user_id private), and 091 (REVOKE ALL hardening closing 089's TRUNCATE gap) — all live (`LOCAL=REMOTE` through 091) and verified by a six-point production security smoke.

### Gate & schema

- **TEAM-01**: Staff role gate — `getStaffRole`/`requireStaff` (leadership/ae/bd) generalized from `is_admin`, with the `verifyAdmin` alias preserved so existing admin routes are untouched; `is_admin=true` falls back to Leadership
- **TEAM-02**: Staff schema — `funun_staff` + `staff_audit_log` are service-role-only (RLS-enabled, zero-policy, REVOKE ALL from anon/authenticated), and `buyer_orgs.ae_user_id` is a private column (not in the authenticated SELECT allowlist)

### Provisioning & Client Partner management

- **TEAM-03**: Staff provisioning — `createStaffAccount` (atomic `app_metadata.staff_role`, phantom-row reconciliation, `funun_staff` insert, invite) behind leadership-only `/api/admin/staff` routes
- **TEAM-04**: Assignment-scoped Client Partner editing + AE assignment — field-allowlisted edits gated by `isAssignedToOrg` (404-not-403 on scope denial), leadership-only AE assignment and reassignment (notifies both gaining and losing AE)
- **TEAM-05**: Staff audit trail — `logStaffAction` writes exactly one `staff_audit_log` row per staff action
- **TEAM-06**: Lead/work routing — AE-assigned notification builders + the AE/BD-scoped "My Client Partners" queue (the buyer-signup lead-routing call site lands in Phase 23)

### Admin surface, theme & directory

- **TEAM-07**: Staff admin surface — `/admin` widened from binary `is_admin` to any staff role, with a role-aware sidebar (leadership-only links gated; AE/BD see their scoped surfaces)
- **TEAM-08**: Team Console light/dark theme — cookie-backed, no-flash toggle across the `(admin)` surface
- **TEAM-09**: Team Member Directory — all-roles contact directory with card and list views

**Traceability (Phase 25):**

| Requirement | Phase | Plan | Status |
|-------------|-------|------|--------|
| TEAM-01 | Phase 25 | 25-01 | Complete |
| TEAM-02 | Phase 25 | 25-03, 25-07 (+091) | Complete |
| TEAM-03 | Phase 25 | 25-04 | Complete |
| TEAM-04 | Phase 25 | 25-05, 25-09 | Complete |
| TEAM-05 | Phase 25 | 25-02 | Complete |
| TEAM-06 | Phase 25 | 25-02, 25-06 | Complete |
| TEAM-07 | Phase 25 | 25-06 | Complete |
| TEAM-08 | Phase 25 | 25-08 | Complete |
| TEAM-09 | Phase 25 | 25-10 | Complete |

**Coverage (Phase 25):**

- Phase 25 requirement IDs: 9 total
- Complete: 9 (all live-verified via the 25-07 production security smoke — staff tables service-role-only incl. no TRUNCATE after 091; `ae_user_id` private; assignment-scope 404; one audit row per action; AE-scoped queue; leadership-only page redirect; owner seeded Leadership + directory row)

## v1.4 — Phase 23: Buyer Onboarding (Model A) & /sync Unification Requirements

Model A (sales-led B2B) buyer onboarding plus the shared front-end foundation both onboarding models reuse: the Browse Catalogue opens to public browsing, a Funūn-styled Login/Register modal turns interest into a light-touch buyer **company** account, and Funūn leadership assigns an AE who shepherds the company from `pending_onboarding` to `active`. Built on the now-live Phase 25 AE/lead-routing infra + migration 095. All live-verified against production Supabase via the 23-08 onboarding-loop smoke; the deployed `/sync` surface goes live when this branch deploys.

### Public browse & modal

- **SYNC-02**: The Browse Catalogue is public — a logged-out visitor can browse `/sync/catalog` and play previews, with engagement (shortlist / License) gated behind the login/register modal
- **SYNC-07**: A Funūn light `.fnbl` Login/Register modal (Marmoset mirror) opens over the browse (scrim); both "Register" and "Talk to a sales rep" doors are surfaced
- **SYNC-09**: The buyer namespace is unified under `/sync/*` with a public `/sync` landing page (the shared foundation both onboarding models reuse)

### Account model & register pipeline

- **SYNC-01**: The buyer **company** account model — `buyer_orgs.status` lifecycle (`pending_onboarding` → `active`) + lead-qualifying fields (contact name/email/phone/role, use-case, source), with a column-privacy split (status + use_case buyer-readable; contact_* / source staff-only) [migration 095]
- **SYNC-03**: Light-touch Register creates a real buyer company account (work email + phone minimum) — not a bare lead — via the public, rate-limited, enumeration-safe `POST /api/sync/register`
- **SYNC-04**: Both "Register" and "Talk to a sales rep" doors feed one account-creation pipeline
- **SYNC-05**: A new-buyer signup lands in the admin queue AND routes to the assigned AE/BD in-app + a Resend email (the shipped Phase 25 lead-routing hook)
- **SYNC-08**: Existing buyers log in with email/password (buyer password auth), landing role-aware on `/sync/catalog`

### AE-assisted onboarding & oversight

- **SYNC-06**: AE-assisted onboarding — leadership assigns one AE (unassigned-lead queue), and the AE advances the company `pending_onboarding` → `active` from the `/admin/client-partners/[orgId]` detail page the lead notification links to
- **SYNC-10**: Cross-company purchase visibility — company members see their own company's activity via migration 081 RLS (the approver-only spend-oversight UI is deferred)

**Traceability (Phase 23):**

| Requirement | Phase | Plan | Status |
|-------------|-------|------|--------|
| SYNC-01 | Phase 23 | 23-01 (+095) | Complete |
| SYNC-02 | Phase 23 | 23-03 | Complete |
| SYNC-03 | Phase 23 | 23-04 | Complete |
| SYNC-04 | Phase 23 | 23-04 | Complete |
| SYNC-05 | Phase 23 | 23-04 | Complete |
| SYNC-06 | Phase 23 | 23-06 | Complete |
| SYNC-07 | Phase 23 | 23-07 | Complete |
| SYNC-08 | Phase 23 | 23-05 | Complete |
| SYNC-09 | Phase 23 | 23-02 | Complete |
| SYNC-10 | Phase 23 | 23-06 (existing 081 RLS) | Complete (oversight UI deferred) |

**Coverage (Phase 23):**

- Phase 23 requirement IDs: 10 total
- Complete: 10 (all verified via the 23-08 production onboarding-loop smoke against live Supabase after migrations 092–095 landed — register → pending_onboarding → admin queue → AE assign → detail page (no 404) → Active → password login → gated browse; deployed-domain `/sync` UAT pending the code deploy; SYNC-10 spend-oversight UI deferred)

## v1.2 — Phase 26: Sync-Library Inclusion & Artist Submission Requirements

The curated sync-library supply pipeline — how songs get into the buyer catalogue. Artists submit (invited spotlight OR self-apply from the Vault) → sign a sign-once blanket agreement authorizing Funūn to shop → staff admit each song → it becomes browsable/licensable. Song-level (a buyer licenses one song at a time). Backed by migration 096 (`sync_listings` per-song state machine; `capability_grants` `sync_library` capability + `admin_invited`/`self_applied` sources; `vault_documents.type='blanket_agreement'`) — live (`LOCAL=REMOTE` through 096). Deployed to production via PR #59 (main `be4e24e`); live-env UAT pending.

### Schema & domain core
- **SYNCLIB-01**: `sync_listings` per-song admission state machine (`applied`/`invited` → `agreement_pending` → `pending_admit` → `admitted`/`rejected`/`withdrawn`/`removed`) with one-active-listing-per-track uniqueness, RLS + column lockdown; a shared TS state machine + eligibility predicate mirror the CHECK enum
- **SYNCLIB-02**: "Sync-library participant" grant via `capability_grants` (`sync_library` capability) with two sources — `admin_invited` (staff invite) and `self_applied` (accepted application)

### Submission (self-apply + invited)
- **SYNCLIB-03**: Ungated per-song self-apply — a "Submit to Sync Library" action on any Vault song (all artists), song-level, batched submit / per-song admission
- **SYNCLIB-04**: Artist withdrawal of a listing → `withdrawn`, removed from the catalogue
- **SYNCLIB-05**: Staff invite an artist → mints an `admin_invited` grant → the non-dismissible dashboard spotlight card surfaces for that artist (persists until acted on; disappears post-submission)

### Blanket agreement
- **SYNCLIB-06**: Sign-once-per-artist blanket agreement via the lightweight `vault_documents.document_data.esign` JSONB path (not `esign_envelopes`), versioned/swappable template, Unicode-safe PDF; later songs skip signing ("covered by your agreement")
- **SYNCLIB-07**: DocuSeal webhook dispatch-by-lookup — blanket-agreement completions dispatched separately from split-sheet completions, preserving raw-body→verify→parse ordering + idempotency

### Admission, removal & catalogue gate
- **SYNCLIB-08**: Single staff admit/reject curation gate — every song (invited OR self-applied) passes one human gate; unconditional `logStaffAction` audit
- **SYNCLIB-09**: Optional short rejection reason (and removal reason), shown to the artist via notification
- **SYNCLIB-10**: Catalogue admission gate — one `isAdmittedToSyncLibrary` helper replaces the duplicated `is_public` eligibility checks (`isRightsReady`, `authorizeRequestTarget`, `loadShortlistEntries`); catalogue shows only admitted songs
- **SYNCLIB-15**: Admin Sync-Library section — invite panel + curation queue + LEADERSHIP-ONLY "Remove from Sync Library" takedown (`requireStaff(['leadership'])`)

### Artist surfaces
- **SYNCLIB-11**: Vault song-row submission action + on-song status chips (dot+pill idiom) + "covered by agreement" indicator
- **SYNCLIB-12**: Post-admission Sync Library hub, anchored on "In progress" (workspace framing), then "Admitted songs", then "Your agreement"
- **SYNCLIB-13**: Server-gated "Sync Library" nav item under "Deals", visible ONLY after ≥1 admitted song (progressive disclosure); "Split Sheets" moved under "Contract Locker"
- **SYNCLIB-14**: New-feature highlight when the hub unlocks — admission notification + "New" nav dot until first open + a reusable coach-mark primitive

**Traceability (Phase 26):**

| Requirement | Phase | Plan | Status |
|-------------|-------|------|--------|
| SYNCLIB-01 | Phase 26 | 26-01, 26-02 | Complete |
| SYNCLIB-02 | Phase 26 | 26-01, 26-05 | Complete |
| SYNCLIB-03 | Phase 26 | 26-03, 26-07 | Complete |
| SYNCLIB-04 | Phase 26 | 26-03 | Complete |
| SYNCLIB-05 | Phase 26 | 26-05, 26-08 | Complete |
| SYNCLIB-06 | Phase 26 | 26-04, 26-07 | Complete |
| SYNCLIB-07 | Phase 26 | 26-04 | Complete |
| SYNCLIB-08 | Phase 26 | 26-05, 26-10 | Complete |
| SYNCLIB-09 | Phase 26 | 26-05, 26-10 | Complete |
| SYNCLIB-10 | Phase 26 | 26-06 | Complete |
| SYNCLIB-11 | Phase 26 | 26-07 | Complete |
| SYNCLIB-12 | Phase 26 | 26-09 | Complete |
| SYNCLIB-13 | Phase 26 | 26-09 | Complete |
| SYNCLIB-14 | Phase 26 | 26-05, 26-09 | Complete |
| SYNCLIB-15 | Phase 26 | 26-10 | Complete |

**Coverage (Phase 26):**

- Phase 26 requirement IDs: 15 total
- Complete (code + automated): 15 — all built; 1723 tests + tsc + build green; deployed via PR #59. Live-env UAT (11 flow tests in 26-UAT.md) BLOCKED pending real auth/data; live DocuSeal sign round-trip deferred; counsel-approved agreement swap-in pending.

---
*Requirements defined: 2026-07-03*
*Last updated: 2026-08-08 — Phase 26 registered all 15 SYNCLIB requirement IDs (curated sync-library supply pipeline: submit/invite, sign-once blanket agreement, staff admit/reject + leadership removal, catalogue admission gate, artist + admin UI), all code-Complete and deployed via PR #59; live-env UAT pending*
