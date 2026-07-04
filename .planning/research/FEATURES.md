# Feature Research

**Domain:** Professional social network for the music industry (Wave 4 — The Green Room)
**Researched:** 2026-07-03
**Confidence:** MEDIUM (multi-source web research cross-checked with locked hi-fi design spec; Supabase presence from official docs)

---

## Scope Note

This document covers Wave 4 features only. Wave 1–3 features (audio/artwork upload, rights registration, playlist pitching, social campaign planner, wall posts, endorsements, follows, 1:1 DMs) are already built. Everything below is **additive** to that thin social layer. Features are classified from the perspective of a professional network that hosts **real industry members** (supervisors, A&R, execs) alongside artists.

---

## Feature Landscape

### 1. Rich Member Profile

#### Table Stakes

Features any professional-network profile must have. Users arriving from LinkedIn, SoundBetter, or Vampr will check for these first.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Banner image (owner-editable) | Standard LinkedIn/Twitter/Behance pattern; establishes visual brand | LOW | Supabase Storage upload; `artist_profiles` extension; shown in design at 280px height |
| Large avatar with online presence dot | Identity anchor of every profile; online dot is table-stakes on any social platform | LOW | Avatar already stored; add `presence_status` field driven by Supabase Realtime Presence |
| Full name + pronouns | Expected on any modern professional network; pronouns specifically valued in creative community | LOW | Add `pronouns` text field to `artist_profiles` |
| Verified check badge | Industry members (supervisors, A&R, execs) impersonate; badge = trust signal | MEDIUM | Manual admin grant for Wave 4; can automate later; `is_verified` bool on profiles |
| Multi-role identity with lead role highlighted | Creatives hold multiple roles simultaneously (Artist + Songwriter + Topliner); rigid single-role is frustrating (Vampr lesson) | LOW | `industry_roles` TEXT[] already on profile; surface as chips; first entry = lead role rendered with indigo gradient ring |
| Custom title support | Some roles don't fit the taxonomy (e.g. "Sync licensing attorney", "Music tech founder") | LOW | Free-text `custom_title` field alongside `industry_roles[]` |
| Location field | Geo matters for co-writes, session work, and in-person meetings | LOW | Add `location` text to `artist_profiles`; display in metaline |
| Member-since / tenure display | Signals longevity; builds trust in professional context | LOW | Derived from `created_at` on auth user record; no new field needed |
| Bio / About section | Lets members explain who they are and what they want | LOW | `bio` text field; already partially exists in some profile schemas |
| Skill and genre tags | Searchable signals; analogous to LinkedIn skills; enables discovery filtering | LOW | Genre already on profiles; add `skill_tags TEXT[]` or reuse existing genre+role fields |
| Stats sidebar (followers, monthly listeners, placements, avg readiness) | Social proof for industry visitors; replaces the need for one-sheets | MEDIUM | Followers: count from follows table. Monthly listeners: third-party stat or self-reported. Placements: count from `placement_events` (or self-reported). Avg readiness: computed across vault projects. |
| Public wall (leave a message) | Guestbook pattern; already built in thin social layer | LOW | Already shipped; surface on profile page |
| Endorsements section | Credibility signals from known collaborators; already built | LOW | Already shipped; surface on profile page |
| Releases grid with readiness rings | The Funūn differentiator: industry visitors see release-readiness in-context | LOW | Pull from `vault_projects`; show readiness ring per card; already has the ring UI from Sound Vault |
| Activity feed | Transparency into what the member has been doing (releases, placements, readiness milestones) | LOW | Already exists via `activity-emit.ts`; surface on profile |
| "Worked with" collaborators list | Social proof of real collaboration history | LOW | Already built from `collaborators` table with `claimed_by`; surface on sidebar |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "Open to" availability status chips (Sync licensing, Co-writes, Features, Brand deals) | Supervisors and producers can instantly see what an artist is actively seeking; eliminates cold outreach guessing | LOW | `open_to TEXT[]` field on profile; rendered as emerald chips in header and sidebar; max 4-5 options from a fixed enum |
| Release readiness visible to industry visitors | A music supervisor can see "96 · Cleared for sync" directly on the profile without asking for a one-sheet | LOW | Already computed per project; surface on release cards on profile; this is the core moat no other platform has |
| Featured spotlight section | Artist pins one release as their "launching today" or "current priority" feature — supervisor lands on the profile and immediately sees the best work | LOW | `featured_project_id` FK on `artist_profiles`; renders the indigo-gradient spotlight card from the design |
| Owner vs public view switching | Owner sees Edit/Share/Analytics; visitor sees Follow/Message/ellipsis — same URL, two render modes | MEDIUM | Conditional rendering: check if `auth.user.id === profile.user_id`; no separate route needed |
| "View analytics" owner action | Owner can see profile view counts, follower growth, and release engagement in one screen | HIGH | Requires analytics event tracking; P2 for Wave 4 — stub the button, deliver basic stats only |
| Readiness milestone activity events ("Hit readiness 92 — now deal-ready") | Turns the internal readiness score into public social proof; drives feed engagement from industry | LOW | Already emitted by `activity-emit.ts`; just surface them on the profile's Activity section |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Pulling in live Spotify/SoundCloud stats automatically | Artists want their monthly listeners to look impressive | OAuth to Spotify/SoundCloud is significant scope; data can be misleading for small artists; creates dependency on third-party API stability | Self-reported stats with a "provided by artist" label; Songstats integration deferred to later wave |
| Connection count as a vanity metric in the header | LinkedIn does this; signals clout | Penalizes new members; encourages meaningless connections over real ones | Show only follower count + stats with real meaning (placements, readiness, monthly listeners) |
| Skill endorsement voting (LinkedIn-style skill endorsements) | Familiar pattern | Easily gamed; hollow endorsement inflation; differs from the existing written endorsement model | Keep the existing written endorsements — qualitative > quantitative for music industry |
| Full post/feed composition on profile page | Feels like Twitter/LinkedIn | Profile is a showcase, not a feed; mixing creation and presentation clutters the layout | Wall is for public messages from visitors; Activity feed is auto-generated from platform actions; full post creation lives in the main feed/Discover surface |

---

### 2. Discovery and People Search

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Global search bar (type-ahead, name + role keyword) | Cannot find anyone without it; expected on every professional network | MEDIUM | Postgres full-text search on `artist_profiles` (name, bio, roles, genre, location); type-ahead with debounce; rendered in sticky top bar |
| Filter by role/member type | Role is the primary filter on SoundBetter, Vampr, LinkedIn; "show me only music supervisors" is a primary intent | LOW | Filter on `industry_roles[]` using overlap operator; multi-select chip UI |
| Filter by "Open to" | Supervisors want to see only artists open to sync; artists want to find producers open to co-writes | LOW | Filter on `open_to[]`; derives from same field used in profiles |
| Filter by location | Session work, in-person co-writes, genre scenes are location-dependent | LOW | Text search + optional lat/lng bounding box for future geo radius |
| Filter by genre | Primary search dimension for curators, supervisors, and collaborators | LOW | Filter on `genre` field already on profiles |
| Discover tab / people surface | Browsable "people you might want to connect with" — prevents the search-only network dead-end | MEDIUM | Role-based buckets (Browse Supervisors, Browse Producers, etc.) + "people in your genre" rows |
| Search result cards with primary action | See avatar, name, lead role, location chip, open-to status, Follow button — all in the result row | LOW | Consistent card component reused from profile header; Follow action fires existing follow API |
| Verified members surfaced first | Industry pros (supervisors, A&R) are the high-value supply side; surfacing them drives demand-side (artist) sign-ups | LOW | Sort: `is_verified DESC` as tiebreaker in discovery ranking |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "People in your network" vs "Discover" split | Network tab shows members who follow you / you follow; Discover shows new people — mirrors LinkedIn's separation | LOW | Network: filter social graph. Discover: exclude known connections. Two tabs on one page. |
| Filter by avg readiness (for supervisors) | A supervisor browsing for sync candidates can filter "avg readiness ≥ 85" — unique to Funūn | LOW | `avg_readiness` computable from `vault_projects`; expose as slider filter on Discover |
| Filter by "Sync cleared" releases | Supervisor can find artists with at least one sync-cleared release directly from search | MEDIUM | Requires querying across profiles→vault_projects→readiness; build as a pre-computed flag or materialized column |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| AI-powered "people you may know" recommendations | LinkedIn does this | Requires significant ML infrastructure; cold-start problem for a growing network | Manual discovery by role/genre/location first; "second-degree connections" surface (followers of your followers) is sufficient for Wave 4 |
| Swipe-based discovery (Vampr pattern) | Gamified; feels fun | Not appropriate for professional-context network; infantilizes industry relationships | Grid/list browse with role + genre filters |
| Showing connection count in search results | Signals clout | Penalizes new members; not a meaningful quality signal | Show verified badge + open-to status instead |

---

### 3. Relationship Model (Follow / Connect / Message)

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Follow (directed, no approval required) | Twitter/Instagram/SoundCloud norm; standard one-way interest signal; already partially built | LOW | Already exists in `app/api/follows/`; expose Follow button on profile cards everywhere |
| Unfollow | Must be toggleable | LOW | Toggle in follows API |
| Message (DMs to connections) | 1:1 DMs already built; surface as primary CTA on profiles | LOW | Already exists; add unread badge to nav |
| Message request to non-connections | Cold outreach is the primary use case for this network (artist → supervisor, supervisor → artist); must not require mutual follow first | MEDIUM | `message_requests` table: sender, recipient, preview text, status (pending/accepted/declined/blocked); recipient sees request queue; sender gets no read-receipt until accepted |
| Block (hard, bidirectional invisibility) | Anyone who can receive cold outreach needs blocking | MEDIUM | `blocks` table: blocker_id, blocked_id; middleware excludes blocked users from search, profile, messages, notifications |
| Remove follower | Owner can remove someone from their followers without blocking | LOW | DELETE from follows where follower_id = X and followed_id = owner |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Connect (mutual, bidirectional) | Upgrades a follow relationship to a mutual professional connection; unlocks direct messaging without request friction | MEDIUM | `connections` table: user_a, user_b, status (pending/accepted); distinct from follows; accepting a connection auto-follows both ways |
| Message request preview (no read receipt until accepted) | Protects supervisors/execs from knowing when a cold message was ignored; reduces social pressure | LOW | `message_requests.read_at` only set on explicit accept/decline; sender UI shows "pending" until resolved |
| Focused / Requests inbox split | Focused: accepted connections. Requests: non-connections. Mirrors LinkedIn's UX; keeps inbox clean | LOW | Filter DMs by whether a `connections` record exists between the two parties |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Remove the connect step — just make follow = connect | Simpler | Follow and connect serve different intents; conflating them means industry pros either get flooded with DMs or have no way to signal mutual professional intent | Keep follow (one-way, frictionless) and connect (mutual, opted-in) as separate primitives |
| InMail-style paid cold messaging | Monetization lever | Pay-to-play communication gatekeeping damages network trust and harms artists on tight budgets | Rate-limit cold message requests by time window (e.g. 10 requests/week for free tier); quality over volume |
| Auto-accept connections on mutual follow | Reduces friction | Supervisors would get inundated; "mutual follow = connection" mismatches professional norms where connection implies direct access | Require explicit connection accept; following is enough for feed visibility |

---

### 4. Notifications

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Bell icon with unread badge count | Universal; every social network has it | LOW | Badge count = unread notification rows; fuchsia dot on bell SVG (already shown in design) |
| Messages icon with unread badge count | Separate from notifications; messages are higher-priority | LOW | Badge count = unread DMs + pending message requests; shown on messages icon in top bar |
| Notification event: new follower | Standard social graph event | LOW | Emit on follow insert; `notifications` table: recipient_id, actor_id, type, entity_id |
| Notification event: connection request received | Requires response; higher urgency than follow | LOW | Emit on connection request insert |
| Notification event: connection accepted | Confirms relationship established | LOW | Emit on connection accept |
| Notification event: new DM received | Highest priority; appears as message badge, not notification bell | LOW | Already partially handled; add unread count surfacing |
| Notification event: message request from non-connection | Needs separate inbox; user must decide accept/decline | LOW | Route to Requests tab; badge on messages icon |
| Notification event: new comment on your release | Already emitted by activity system | LOW | Existing activity-emit.ts; surface in notifications panel |
| Notification event: new wall post on your profile | Already partially built | LOW | Existing wall system; add notification row on insert |
| Notification event: endorsement received | Already built; surface as notification | LOW | |
| Mark all as read | Standard inbox management | LOW | Bulk UPDATE notifications SET read_at = now() WHERE recipient_id = X |
| Notification list / drawer | Slide-in panel or page showing all recent notifications | LOW | Standard component; group by day |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "Industry member viewed your profile" notification | An A&R or supervisor visited — high signal event worth a real-time ping | LOW | Emit only when viewer has a business/industry role (is_verified or role in supervisor/ar_executive/publisher); avoid notifying every profile view (spam) |
| Notification event: your release hit a readiness milestone | Turns internal platform events into social moments; drives engagement | LOW | Already emitted by readiness calculation; add to notifications table |
| Notification event: your release was commented on by an industry member | Higher-signal version of comment notification | LOW | Filter by commenter role at emit time |
| Digest email (daily/weekly for low-priority events) | Respects attention; keeps users informed without overwhelming | MEDIUM | Resend is already integrated; batch: profile views, likes, lower-priority follows into a daily digest; real-time only for messages and direct actions |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Notify on every like | Feels engaging | Notification fatigue; users mute or ignore the badge; kills real-time signal value | Batch likes into digest OR show count on post without push notification |
| Notify when someone views your profile (always) | Artists want to know who's looking | Profile view notifications for every view = spam; also raises privacy concerns for viewers who haven't followed | Notify only for verified/industry-role viewers; hide viewer identity if they are not a connection |
| In-app notification sounds | "Professional" feel | Jarring in a music app where speakers are in use for listening | Never. Visual badge only. |

---

### 5. Presence and Real-Time Messaging UX

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Online presence dot on avatar | Universal on any real-time messaging platform (Slack, LinkedIn, Discord) | LOW | Supabase Realtime Presence: `channel.track({ user_id, online_at })`; green dot on avatar when `sync/join` fires for that user; dismiss on `leave` |
| "Active now" label in DM widget header | Shows recipient is online before sending; encourages real-time reply | LOW | Presence state from same Supabase Presence channel; shown in floating DM widget header (already in design: `<div class="st"><span class="d"></span>Active now</div>`) |
| "Active X hours ago" last-seen label | Shows recipient availability when offline | LOW | Store `last_seen_at` on `leave` event; render relative time when no active presence |
| Floating DM widget (bottom-right, collapsible) | The design spec locks this UX; it's also the standard pattern (Messenger, LinkedIn chat) | LOW | Already partially built as 1:1 DMs; add fixed-position floating widget shell per design |
| DM unread count badge on widget and nav | Users must know when they have unread messages | LOW | Count unread message rows; badge on both the floating widget and the messages nav icon |
| Message input with send button | Core message compose UI | LOW | Already exists in DM implementation |
| Typing indicator | Shows when the other person is composing; reduces "are they there?" anxiety | MEDIUM | Supabase Realtime Broadcast (not Presence — too high-frequency for Presence); broadcast `{type: 'typing', user_id}` event; show indicator for 3s then clear |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "Open a conversation" from any profile | One click from profile → DM window opens for that person (or message request if non-connection) | LOW | Profile action button routes to existing DM or creates new thread |
| Presence-aware "Message" button state | Button reads "Message" when online, "Send message" when offline — subtle cue that drives real-time engagement | LOW | Read from Presence channel state; conditional label only |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Read receipts visible to sender | "Did they read my message?" | Creates anxiety and passive-aggressive pressure in professional cold outreach; especially harmful for message requests | Show delivery status (sent) but never expose read time to sender; recipient reads without the sender knowing |
| Track() called on every mouse move for "typing" | Real-time granularity | Supabase Presence docs explicitly warn this floods the channel | Use Broadcast channel for typing indicator; Presence only for page-level online/offline |
| Group chats / channels | Artists might want a group for their team | Very different complexity profile from 1:1 DMs; Wave 4 scope is person-to-person | Defer group messaging to a future wave; the "team" use case is served by the collaborators table and shared vault access |

---

### 6. Trust and Safety

#### Table Stakes — These are non-negotiable. Cold outreach between strangers requires this safety floor.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Block user | Hard block: prevents DMs, profile views, search results, notifications in both directions | MEDIUM | `blocks` table: blocker_id, blocked_id, created_at; middleware excludes blocked pairs from every query that returns users; check at message send time |
| Report user (per-profile) | Platform-level content moderation; legally and reputationally expected | LOW | Report modal on profile `···` menu; categories: spam, harassment, impersonation, inappropriate content; stores to `reports` table for admin review |
| Report message (per-message) | Harassment often happens in DMs | LOW | Long-press / hover context menu on message bubble; same `reports` table with `entity_type = 'message'` |
| Rate-limit cold message requests | Without a limit, supervisors/execs get spammed by every artist on the platform | MEDIUM | `message_requests` rate limit: e.g. 10 outbound non-connection requests per 7-day window; enforced in API route with a count query before insert; return 429 with clear copy ("You've reached your weekly message limit — connect with more members to message freely") |
| Message request queue with accept/decline/block | Recipient controls who can contact them cold; accept opens a DM thread; decline is silent; block is permanent | MEDIUM | `message_requests` table: status field; accept creates a DM thread; decline soft-deletes; block creates a `blocks` record |
| Privacy controls on "Open to" and profile | Some members want a lower-profile presence | LOW | `profile_visibility` enum: public / connections-only; `show_open_to` bool; owner can hide open-to chips from public view |
| Verified badge (admin-granted, industry members) | Prevents impersonation of real industry executives; critical for trust | LOW | `is_verified` bool + `verified_at` + `verified_by` admin ID; admin grants via admin panel already scaffolded |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Role-based message request filtering | Supervisor can set "only accept message requests from members with Open to: Sync licensing" | MEDIUM | `message_request_preferences` JSON on profile; enforced at request creation time; optional setting |
| Admin moderation queue for reports | Reports surface to Funūn admin for review and action | LOW | Extend existing admin panel (already built); `reports` table feeds a queue page; actions: warn, suspend, ban |
| Restricted messaging pending report review | Reported users lose ability to send new message requests while report is under review | MEDIUM | `is_messaging_restricted` bool; set on report submission; cleared by admin on resolution |

#### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Public blocking (visible to others that you're blocked) | "Shame the spammer" | Escalates conflict; signals to blocked user to create a new account | Silent block: blocked user sees no indication they're blocked (profile appears to error or not exist) |
| AI content moderation on all messages | Scalability | Expensive; introduces false positives that damage legitimate music conversations (lyrics with explicit content flagged incorrectly) | Human-reviewed report queue for Wave 4; AI-assisted triage is a Wave 5+ feature |
| Required phone verification for all members | Anti-spam | Friction at signup kills artist onboarding; many artists are privacy-conscious about phone numbers | Rate limiting + email verification is sufficient for Wave 4; phone verification only if spam becomes a material problem |

---

## Feature Dependencies

```
Presence dot on avatar
    └──requires──> Supabase Realtime Presence channel (new)
                       └──requires──> Next.js App Router useEffect + cleanup

Message request (cold outreach)
    └──requires──> message_requests table (new)
    └──requires──> Block system (blocks table, query exclusion)
    └──requires──> Rate limiting in API route

Notifications panel
    └──requires──> notifications table (new) with read_at
    └──requires──> Unread badge counts on bell + messages icons

"Open to" availability status
    └──requires──> open_to TEXT[] field on artist_profiles (schema extension)
    └──enhances──> Discovery filter (filter by open_to)
    └──enhances──> Message request preferences

Owner vs public profile view
    └──requires──> Auth check: session.user.id === profile.user_id
    └──requires──> Banner + avatar editable (Supabase Storage upload — already used)

Featured spotlight on profile
    └──requires──> featured_project_id FK on artist_profiles (schema extension)
    └──requires──> vault_projects already existing (already built)

Multi-role badges
    └──requires──> industry_roles TEXT[] already on artist_profiles
    └──requires──> lib/industry-roles.ts taxonomy (already built)
    └──requires──> Custom title field (minor schema extension)

Discovery / People search
    └──requires──> Full-text or ilike search on artist_profiles
    └──requires──> role/genre/location/open_to filters (all derivable from artist_profiles)
    └──requires──> Follow action (already built)

Stats sidebar
    └──requires──> Followers count (from follows table — already built)
    └──requires──> Avg readiness (from vault_projects — already built)
    └──requires──> Placements count (self-reported field or activity events)
    └──requires──> Monthly listeners (self-reported OR future Songstats integration)

Digest email
    └──requires──> notifications table
    └──requires──> Resend (already integrated)
    └──requires──> Cron/scheduled job (new — or manually triggered for Wave 4)

Typing indicator
    └──requires──> Supabase Realtime Broadcast channel (separate from Presence)
    └──requires──> DM widget already built

Connect (mutual relationship)
    └──requires──> connections table (new)
    └──enhances──> Focused inbox (connections get DM without request friction)
    └──enhances──> Discovery ("People in your Network" tab)
```

### Dependency Notes

- **Message request requires Block**: Building cold outreach without block is unsafe. Block must ship in the same phase.
- **Presence requires Supabase Realtime Presence channel in a client component**: Presence tracking must be set up in a `useEffect` that cleans up on unmount; the DM widget is the natural host component.
- **Connect is optional in Wave 4 MVP**: Follow + Message Request is sufficient to enable the core use case. Connect (mutual relationship) can be added in a second pass if message requests prove too friction-heavy for common relationships.
- **Featured spotlight is low-complexity but high impact**: It's a single FK on the profiles table + one card component. Do it early to anchor the profile design.
- **Digest email requires a notification table**: Do not build digest email before the notifications table and event emission are in place.

---

## MVP Definition (Wave 4 Launch)

### Launch With (v1 — The Green Room)

These are the minimum set that makes the profile feel like a real professional network, not just an upgraded artist page.

- [ ] Rich profile header: banner, avatar with presence dot, name, pronouns, verified check, multi-role badges (lead + additional), location, tenure, "Open to" chips, Follow/Message/ellipsis actions (public) + Edit/Share/View analytics (owner)
- [ ] Owner vs public view switching on `/u/[handle]`
- [ ] "Open to" availability field (schema + profile edit + display)
- [ ] Featured spotlight section (featured_project_id + spotlight card component)
- [ ] Stats sidebar (followers, avg readiness, placements, monthly listeners — self-reported for Wave 4)
- [ ] Releases grid with readiness rings on profile
- [ ] Multi-role badges rendered from existing `industry_roles[]` + custom title field
- [ ] Global people search with role / genre / open-to filters
- [ ] Discover tab (browse by role category + "in your genre" rows)
- [ ] Network tab (people you follow / follow you back)
- [ ] Supabase Realtime Presence — online dot on avatar + "Active now" in DM widget
- [ ] DM floating widget (already built; add presence header + unread badge)
- [ ] Message request flow (cold outreach to non-connections with accept/decline/block)
- [ ] Block user (hard, bidirectional)
- [ ] Report user + report message
- [ ] Rate limiting on cold message requests (10/week free tier)
- [ ] Notifications table + bell badge: new follower, connection request, DM received, message request, comment on release, endorsement received, wall post on your profile
- [ ] Unread badges on messages icon and bell icon in top nav
- [ ] Notification panel (drawer or page) with mark-all-read

### Add After Validation (v1.x)

- [ ] Connect (mutual relationship): `connections` table + accept flow + Focused/Requests inbox split — add when message requests drive enough engagement to warrant upgrading common pairs to connections
- [ ] Typing indicator in DM widget — add when DM usage data suggests users are leaving conversations waiting; low complexity once Broadcast channel is in place
- [ ] "Industry member viewed your profile" notification — add once verified/industry accounts are populated enough to make this notification meaningful
- [ ] Digest email (daily batch of low-priority notifications) — add when notification volume grows beyond a few per day

### Future Consideration (v2+)

- [ ] "Filter by avg readiness ≥ 85" and "Filter by sync cleared" in discovery — powerful differentiator; deferred until readiness data is rich enough to be useful as a filter
- [ ] Message request preferences (role-based filtering) — needed when supervisors/execs report being overwhelmed
- [ ] AI-assisted discovery recommendations ("People who worked in your genre recently released sync-cleared tracks") — Wave 5+
- [ ] Profile analytics view (deep stats: who viewed, follower growth over time) — Wave 5+
- [ ] Verified badge workflow (self-application + admin review) — currently admin-manual; automate when volume demands it
- [ ] Group messaging / team channels — separate wave; does not belong in Wave 4

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Rich profile header (banner, roles, open-to, presence dot) | HIGH | LOW | P1 |
| Owner vs public view switching | HIGH | LOW | P1 |
| Featured spotlight | HIGH | LOW | P1 |
| Releases grid with readiness rings on profile | HIGH | LOW | P1 |
| "Open to" availability chips | HIGH | LOW | P1 |
| Stats sidebar | HIGH | LOW-MEDIUM | P1 |
| Global people search + role/genre filters | HIGH | MEDIUM | P1 |
| Discover tab (browse by role) | HIGH | MEDIUM | P1 |
| Supabase Realtime Presence (online dot + Active now) | MEDIUM | LOW | P1 |
| DM floating widget with unread badge | HIGH | LOW (already built) | P1 |
| Notifications table + bell badge | HIGH | LOW | P1 |
| Message request (cold outreach) | HIGH | MEDIUM | P1 |
| Block user | HIGH | MEDIUM | P1 |
| Report user/message | MEDIUM | LOW | P1 |
| Rate limiting on cold messages | MEDIUM | LOW | P1 |
| Connect (mutual relationship) | MEDIUM | MEDIUM | P2 |
| Typing indicator | LOW | LOW | P2 |
| Industry member viewed your profile notification | MEDIUM | LOW | P2 |
| Digest email | MEDIUM | MEDIUM | P2 |
| Filter by readiness / sync-cleared in discovery | HIGH | MEDIUM | P2 |
| Profile analytics view | MEDIUM | HIGH | P3 |
| Message request preferences (role filtering) | MEDIUM | MEDIUM | P3 |
| AI-powered discovery recommendations | HIGH | HIGH | P3 |

---

## Competitor Feature Analysis

| Feature | LinkedIn | Vampr | SoundBetter | Funūn Approach |
|---------|----------|-------|-------------|----------------|
| Member profiles | Full identity, multi-role, featured section, banner, verified | Role tags, location, audio samples, basic bio | Portfolio + credits, reviews, response rate | Same depth as LinkedIn + release-readiness data; music-first schema |
| Relationship model | Follow + Connect (mutual) + InMail (paid cold) | Instant message on match (no mutual required) | Service inquiry (no social graph) | Follow + Connect (free) + Message Request (rate-limited, free) |
| Discovery | People search with filters, second-degree suggestions | Swipe / location-based | Browse by service category | Search with role/genre/open-to filters; Discover tab by category; no swipe |
| Cold outreach | InMail (paid) or connect note | Unlimited direct message | Service inquiry form | Message request (rate-limited, free); quality over volume |
| Release-readiness data | None | None | Portfolio samples only | Readiness ring, sync-cleared status, avg readiness — unique to Funūn |
| Notifications | Bell + badge, digest email, push | Badge, email | Email only | Bell + badge + message badge; digest for low-priority; no push v1 |
| Presence | "Active now" in messaging | None | None | Online dot + "Active now" in DM widget via Supabase Realtime Presence |
| Trust/safety | Block, report, InMail filtering, verified | Block, report | Escrow-based trust | Block, report, rate-limited message requests, verified badge, admin moderation queue |
| Industry-exec accounts | Everyone on LinkedIn | Musician-focused only | Service-provider focused | First-class industry member types with verified badge; the supply-side moat |

---

## Sources

- Locked hi-fi design: `docs/design/wave-4-social-layer/user-profile.html` — HIGH confidence (primary design spec)
- `lib/industry-roles.ts` — HIGH confidence (existing codebase)
- [LinkedIn: Connect, Follow or Message](https://www.linkedin.com/blog/member/product/connect-follow-or-message-how-to-build-the-best-professional-relationships) — MEDIUM confidence (cross-checked with multiple LinkedIn help sources)
- [LinkedIn Follow vs Connect 2026 | SalesRobot](https://www.salesrobot.co/blogs/linkedin-follow-vs-connect) — LOW confidence (web)
- [Supabase Realtime Presence Docs](https://supabase.com/docs/guides/realtime/presence) — MEDIUM confidence (official docs via context7)
- [Vampr — Music Networking Platform](https://vampr.me/faq/music-social-network-platforms-transforming-how-artists-connect/) — LOW confidence (web)
- [MusicGateway: Vampr Review](https://www.musicgateway.com/blog/music-industry/vampr) — LOW confidence (web)
- [Sendbird: User Presence Indicators](https://sendbird.com/learn/what-are-user-presence-indicators) — LOW confidence (web)
- [LinkedIn Real-Time Presence Platform](https://www.linkedin.com/blog/engineering/product-design/now-you-see-me-now-you-dont-linkedins-real-time-presence-platf) — MEDIUM confidence (LinkedIn engineering blog, cross-checked)
- [MagicBell: Notification System Design](https://www.magicbell.com/blog/notification-system-design) — LOW confidence (web)
- [NNG: Indicators, Validations, and Notifications](https://www.nngroup.com/articles/indicators-validations-notifications/) — MEDIUM confidence (authoritative UX research source, cross-checked)
- [GetStream: Trust and Safety 101](https://getstream.io/blog/trust-safety/) — LOW confidence (web)

---

*Feature research for: Professional social network for music industry (Wave 4 — The Green Room)*
*Researched: 2026-07-03*
