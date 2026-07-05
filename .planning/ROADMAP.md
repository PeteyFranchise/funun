# Roadmap: Funūn

## Milestones

- ✅ **v1.0 — Wave 2: Rights & Registration Rails** — Phases 1–4 (shipped 2026-06-29)
- ✅ **v1.1 — Wave 3: Launchpad** — Phases 5–7 (shipped 2026-07-04)
- 🚧 **v1.2 — Wave 4: The Green Room** — Phases 8–13 (in progress)

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

- [ ] **Phase 8: Identity & Schema Foundation** - Extend the member-identity table and stand up the connection/block/notification/presence schema with column-privilege and block-enforcement guarantees baked in
- [ ] **Phase 9: Rich Member Profile** - Ship the hi-fi hero profile (banner, avatar, role badges, "Open to" chips, stats, releases grid, Featured spotlight) with owner-vs-public view switching and image upload
- [ ] **Phase 10: Connections & Notifications** - Follow + Connect request/accept relationships and a notifications bell with unread badge and mark-all-read panel
- [ ] **Phase 11: Presence & Messaging** - Realtime presence dots + "Active now", floating DM widget with unread badge, cold message-request flow with rate limiting, and direct messaging once connected
- [ ] **Phase 12: Discovery & People Search** - Global people search with filters and a Discover tab organized by role and genre, enforced server-side with block/visibility exclusion
- [ ] **Phase 13: Network Tab & Trust & Safety** - Network tab (follows/connections/pending), hard bidirectional block, member/message reporting, admin verified-badge grant, and profile visibility controls

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

**Plans**: 1/6 plans executed

- [x] 08-01-PLAN.md
- [ ] 08-02-PLAN.md
- [ ] 08-03-PLAN.md
- [ ] 08-04-PLAN.md
- [ ] 08-05-PLAN.md
- [ ] 08-06-PLAN.md

### Phase 9: Rich Member Profile

**Goal**: A member's `/u/[handle]` profile renders the locked hi-fi hero screen and behaves differently for the owner versus a visitor — proving the unified-identity model end-to-end in the browser.
**Depends on**: Phase 8
**Requirements**: PROFILE-01, PROFILE-02, PROFILE-03, PROFILE-04, PROFILE-05, PROFILE-06, PROFILE-07, PROFILE-08, PROFILE-09
**Success Criteria** (what must be TRUE):

  1. User sees a rich profile header — banner, avatar with presence dot, name, pronouns, verified badge, and multi-role badges with the lead role highlighted, plus a standard-or-custom title
  2. User sees location, tenure ("On Funūn since [year]"), "Open to" status chips, a stats sidebar (followers, monthly listeners, placements, avg. readiness), and a releases grid with readiness rings on any profile
  3. User can pin one release as a "Featured" spotlight on their profile
  4. Profile owner sees Edit profile / Share / View analytics actions and can upload/edit their banner and avatar; a visitor sees Follow / Message / more-options instead

**Plans**: TBD
**UI hint**: yes

### Phase 10: Connections & Notifications

**Goal**: Members can build an explicit graph — follow one-way or send a mutual Connect request — and get told when something happens to them, via a bell with an accurate unread count.
**Depends on**: Phase 9
**Requirements**: CONNECT-01, CONNECT-02, NOTIF-01, NOTIF-02, NOTIF-03
**Success Criteria** (what must be TRUE):

  1. User can follow another member with no approval, and can send a Connect request that the recipient can accept or decline to establish a mutual connection
  2. User receives a notification for each of: new follower, connection request, connection accepted, message request, new DM, release comment, endorsement received, and wall post received
  3. User sees an unread-count badge on the notifications bell that is separate from the messages-icon badge
  4. User can open a notification panel, see the list, and mark all as read

**Plans**: TBD
**UI hint**: yes

### Phase 11: Presence & Messaging

**Goal**: The network feels alive — members see who is online, message strangers safely through a rate-limited request flow, and message connections directly, all from a floating DM widget that shows unread counts and live "Active now" status.
**Depends on**: Phase 10
**Requirements**: PRESENCE-01, PRESENCE-02, PRESENCE-03, CONNECT-03, CONNECT-04, CONNECT-05
**Success Criteria** (what must be TRUE):

  1. User sees an online presence dot on another member's avatar when they are actively on the platform, and "Active now" / "Active X ago" in the DM widget header
  2. The floating DM widget shows an unread message-count badge
  3. User can send a message request to a non-connection; the recipient can accept (opens a DM thread), decline, or block
  4. User is rate-limited on outbound cold message requests (e.g. 10/week), and can message a mutual connection directly with no request step

**Plans**: TBD
**UI hint**: yes

### Phase 12: Discovery & People Search

**Goal**: Members can find each other — a global search bar and a Discover tab surface artists and industry pros by name, role, genre, and availability, enforced server-side so private and blocked profiles never leak.
**Depends on**: Phase 11
**Requirements**: DISCOVER-01, DISCOVER-02, DISCOVER-03
**Success Criteria** (what must be TRUE):

  1. User can search for members by name, role, or keyword via a global search bar
  2. User can filter search/discovery results by role, "Open to" status, location, and genre
  3. User can browse a Discover tab organized by role category and genre
  4. Search and discovery run server-side only and exclude blocked members and non-public profiles from results

**Plans**: TBD
**UI hint**: yes

### Phase 13: Network Tab & Trust & Safety

**Goal**: The network closes the loop and is safe to open — members manage their relationships in a Network tab and are protected by hard blocks, reporting, admin verification, and visibility controls before wider outreach goes live.
**Depends on**: Phase 12
**Requirements**: DISCOVER-04, SAFETY-01, SAFETY-02, SAFETY-03, SAFETY-04
**Success Criteria** (what must be TRUE):

  1. User can browse a Network tab showing people they follow, are connected with, or have pending requests with
  2. User can block another member, and a blocked member cannot view the blocker's profile, message them, or see them in search/discovery results (enforced in RLS, not just the UI)
  3. User can report a member profile or a specific message for admin review, and an admin can grant a verified badge to a member profile
  4. User can set profile visibility (public / connections-only) and can hide their "Open to" status from public view

**Plans**: TBD
**UI hint**: yes

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
| 8. Identity & Schema Foundation | v1.2 | 1/6 | In Progress|  |
| 9. Rich Member Profile | v1.2 | 0/TBD | Not started | - |
| 10. Connections & Notifications | v1.2 | 0/TBD | Not started | - |
| 11. Presence & Messaging | v1.2 | 0/TBD | Not started | - |
| 12. Discovery & People Search | v1.2 | 0/TBD | Not started | - |
| 13. Network Tab & Trust & Safety | v1.2 | 0/TBD | Not started | - |
