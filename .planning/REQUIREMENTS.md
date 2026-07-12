# Requirements: Funūn — Wave 4: The Green Room (v1.2)

**Defined:** 2026-07-03
**Core Value:** Funūn is where an independent artist's whole career lives — and where the industry comes to find them. The Green Room turns a profile into a professional identity and a network: artists connect with producers, supervisors, A&R, and execs, and real relationships — not just tools — are what keep them on the platform.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Profile (rich member identity)

- [ ] **PROFILE-01**: User can view a rich profile header — banner, avatar with online presence dot, name, pronouns, verified badge, and multi-role badges with the lead role highlighted
- [x] **PROFILE-02**: User can add a custom title alongside standard industry roles (Artist, Producer, Songwriter, Music Supervisor, A&R, Exec)
- [ ] **PROFILE-03**: User can set a location and sees their tenure ("On Funūn since [year]") on their profile
- [x] **PROFILE-04**: User can set "Open to" availability status (sync licensing, co-writes, features, brand deals) and it displays as chips on their profile
- [x] **PROFILE-05**: User can pin one release as a "Featured" spotlight on their profile
- [x] **PROFILE-06**: User sees a stats sidebar (followers, monthly listeners, placements, avg. readiness) on any profile
- [ ] **PROFILE-07**: User sees a releases grid with readiness rings on any profile
- [ ] **PROFILE-08**: Profile owner sees Edit profile / Share / View analytics actions; visitors see Follow / Message / more-options instead
- [ ] **PROFILE-09**: User can upload and edit their own banner and avatar images

### Discover (search & discovery)

- [ ] **DISCOVER-01**: User can search for members by name, role, or keyword via a global search bar
- [ ] **DISCOVER-02**: User can filter search/discovery results by role, "Open to" status, location, and genre
- [ ] **DISCOVER-03**: User can browse a Discover tab organized by role category and genre
- [ ] **DISCOVER-04**: User can browse a Network tab showing people they follow, are connected with, or have pending requests with

### Connect (relationship model)

- [ ] **CONNECT-01**: User can follow another member (one-way, no approval required)
- [ ] **CONNECT-02**: User can send a Connect request to another member; recipient can accept or decline, establishing a mutual connection
- [ ] **CONNECT-03**: User can send a message request to a non-connection; recipient can accept (opens a DM thread), decline, or block
- [ ] **CONNECT-04**: User is rate-limited on outbound cold message requests (e.g. 10/week) to prevent spam
- [ ] **CONNECT-05**: User can message directly, with no request step, once mutually connected

### Notifications

- [ ] **NOTIF-01**: User receives a notification for: new follower, connection request, connection accepted, message request, new DM, release comment, endorsement received, and wall post received
- [ ] **NOTIF-02**: User sees an unread count badge on the notifications bell, separate from an unread count badge on the messages icon
- [ ] **NOTIF-03**: User can view a notification list/panel and mark all as read

### Presence & DMs

- [ ] **PRESENCE-01**: User sees an online presence dot on another member's avatar when that member is actively on the platform
- [ ] **PRESENCE-02**: User sees "Active now" or "Active X ago" status in the DM widget header
- [ ] **PRESENCE-03**: The floating DM widget shows an unread message count badge

### Trust & Safety

- [ ] **SAFETY-01**: User can block another member; a blocked member cannot view the blocker's profile, message them, or see them in search/discovery results
- [ ] **SAFETY-02**: User can report a member profile or a specific message for admin review
- [ ] **SAFETY-03**: Admin can grant a verified badge to a member profile
- [ ] **SAFETY-04**: User can set profile visibility (public / connections-only) and can hide their "Open to" status from public view

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
| Deep external integrations (Songstats, Buffer API push, Meta/TikTok OAuth publishing, SoundCloud/Bandsintown/YouTube) | Belongs to the originally-planned "deep integrations" Wave 4 track, not the social-layer track this milestone follows |
| Pulling live Spotify/SoundCloud stats automatically into the stats sidebar | OAuth scope creep; self-reported stats with a "provided by artist" label are sufficient for v1 |
| Swipe-based discovery | Not appropriate for a professional-context network; grid/list browse with filters is the correct pattern here |
| Paid cold-messaging (InMail-style) | Pay-to-play gatekeeping damages network trust; free rate-limited message requests instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROFILE-01 | Phase 9 | Pending |
| PROFILE-02 | Phase 9 | Complete |
| PROFILE-03 | Phase 9 | Pending |
| PROFILE-04 | Phase 9 | Complete |
| PROFILE-05 | Phase 9 | Complete |
| PROFILE-06 | Phase 9 | Complete |
| PROFILE-07 | Phase 9 | Pending |
| PROFILE-08 | Phase 9 | Pending |
| PROFILE-09 | Phase 9 | Pending |
| DISCOVER-01 | Phase 12 | Pending |
| DISCOVER-02 | Phase 12 | Pending |
| DISCOVER-03 | Phase 12 | Pending |
| DISCOVER-04 | Phase 13 | Pending |
| CONNECT-01 | Phase 10 | Pending |
| CONNECT-02 | Phase 10 | Pending |
| CONNECT-03 | Phase 11 | Pending |
| CONNECT-04 | Phase 11 | Pending |
| CONNECT-05 | Phase 11 | Pending |
| NOTIF-01 | Phase 10 | Pending |
| NOTIF-02 | Phase 10 | Pending |
| NOTIF-03 | Phase 10 | Pending |
| PRESENCE-01 | Phase 11 | Pending |
| PRESENCE-02 | Phase 11 | Pending |
| PRESENCE-03 | Phase 11 | Pending |
| SAFETY-01 | Phase 13 | Pending |
| SAFETY-02 | Phase 13 | Pending |
| SAFETY-03 | Phase 13 | Pending |
| SAFETY-04 | Phase 13 | Pending |

**Coverage:**

- v1 requirements: 28 total
- Mapped to phases: 28 ✓
- Unmapped: 0 ✓

**Phase note:** Phase 8 (Identity & Schema Foundation) carries no user-facing requirement by design — it is the schema/migration root every Phase 9–13 requirement depends on (column-privilege lockdown, block enforcement, identity-race avoidance). Its success is verified structurally, not by a mapped requirement.

---
*Requirements defined: 2026-07-03*
*Last updated: 2026-07-04 — traceability filled during roadmap creation (all 28 v1 requirements mapped to Phases 9–13)*
