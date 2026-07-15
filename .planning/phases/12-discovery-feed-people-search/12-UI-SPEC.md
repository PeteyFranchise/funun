---
phase: 12
slug: discovery-feed-people-search
status: draft
shadcn_initialized: false
preset: none
created: 2026-07-15
---

# Phase 12 — UI Design Contract: Discovery, Feed & People Search

> Visual and interaction contract for The Green Room feed. This is a net-new screen; use existing Funūn tokens and design references, but do not pretend a feed mock already exists in the handoff.

---

## Design System

| Property | Value |
|----------|-------|
| Component library | none; custom components |
| Icon library | inline SVG, matching `components/nav/icons.tsx` |
| Font | existing `var(--font-sans)` |
| Primary route | `/green-room` |
| Primary nav label | The Green Room |

Use the authenticated app shell, not the public-profile full-page override.

---

## Layout

### Desktop

Three-column hybrid layout:

- **Left:** existing app sidebar.
- **Main center:** Green Room feed, composer, tabs, cards.
- **Right rail:** search/discovery modules, suggested people, opportunities, featured/sponsored placements.

Recommended content width:

- Center column: max 720px.
- Right rail: 300-360px.
- Page padding: match existing authenticated pages (`px-6`, larger at desktop if needed).

### Tablet

Two columns:

- Center feed remains primary.
- Right rail modules stack below feed or collapse into horizontal cards.

### Mobile

Single column:

- Tabs become horizontally scrollable.
- Composer stays near top.
- Right rail modules become in-feed modules.
- No hover-only controls; reaction picker must work by tap/long press.

---

## Navigation

### Left nav item

Add a universal item:

- Label: `The Green Room`
- Href: `/green-room`
- Capability gate: none; visible to artist and industry-capable accounts.
- Placement: near `Antenna` and `Messages`; preferred order is after `Collaborators` and before `Antenna`, unless UI planning later chooses a clearer grouping.
- Icon direction: room/network/lounge. Avoid chat bubble (already Messages) and radar (already Antenna).

### Header / secondary entry points

Secondary shortcuts are allowed later, but route to `/green-room`. Do not create competing feed routes.

---

## Page Header

Copy:

- Title: `The Green Room`
- Subtitle: `See what your network is building, find collaborators, and discover new opportunities.`

Header actions:

- Search input: `Search artists, producers, supervisors…`
- Optional compact button: `Share update` scrolls/focuses composer.

---

## Tabs

Launch tabs:

- `For You`
- `Following`
- `Discover`
- `Opportunities`

Tab behavior:

- Tabs are query modes over the same feed service.
- Active tab uses gradient text or gradient underline.
- Sponsored is not a tab in V1; sponsored cards appear as labeled placements.

---

## Composer

### Default state

Compact card near top of center column.

Placeholder:

`Share an update with The Green Room…`

Primary controls:

- Post type picker.
- Visibility picker.
- Attach Funūn object.
- Submit button.

### Post types

Labels:

- General update
- Looking for collaborators
- Release announcement
- Question
- Win / milestone
- Looking for feedback
- Opportunity / need

### Visibility picker

Options:

- Public
- Followers
- Connections
- Draft
- Custom Audience

Custom Audience opens a panel with:

- Relationship: followers, connections, either, outside network.
- Roles: Artist, Producer, Songwriter, Music Supervisor, A&R, Exec, custom role labels where applicable.
- Genre.
- Location.
- Specific people.

All custom audiences must render a plain-language summary:

`Visible to: Music Supervisors in Los Angeles`

### Linked object attachment

Allowed object types:

- Profile
- Release/project
- Public track
- Opportunity

No uploaded images in V1.

---

## Feed Cards

Common card anatomy:

- Actor avatar.
- Actor name.
- Role/capability label.
- Handle.
- Timestamp.
- Why-this-appears label where relevant.
- Body/title.
- Optional linked object card.
- Action row.

Action row:

- React
- Comment
- Repost
- Send/message/connect/follow where contextually relevant
- More menu

### Card types

- User post.
- Release/project share.
- Public activity/milestone.
- Endorsement.
- Suggested member.
- Opportunity.
- Sponsored/featured placement.
- Repost/quote-post.

### Why labels

Examples:

- From your network
- Because you follow {name}
- Popular in {genre}
- {role} near you
- Featured
- Sponsored

Sponsored and Featured labels must be visually explicit.

---

## Comments

V1 supports flat comments only.

Comment row:

- Avatar.
- Name.
- Body.
- Timestamp.
- Delete own comment.
- Report control if available in the current slice.

No nested replies unless reopened in later planning.

---

## Reactions

Reaction set:

- Like
- Love
- Fire
- Congrats
- Inspired
- Helpful
- Interested

UI:

- Main button shows current reaction or `React`.
- Picker appears on hover/focus desktop and tap/long press mobile.
- Aggregate display shows top reaction icons/counts, not a noisy full breakdown by default.

---

## Repost / Share

Allowed variants:

- Repost without comment.
- Quote/repost with comment.

Required safeguards in UI:

- Original author attribution is visible.
- Original card is nested or clearly framed.
- If original is unavailable, show `This post is no longer available`.
- Owners can disable resharing.
- Owners can remove reshares of their content.
- Users can mute reposts from a person.
- Report control is available.

---

## Right Rail Modules

Desktop modules:

- Suggested people.
- Opportunities for you.
- Featured/sponsored placement.
- Search/filter shortcuts.

Right rail should not dominate the feed. The center feed remains focal.

---

## Real-Time Behavior

Do not auto-jump.

Behavior:

- Subscribe for eligible new activity.
- Show pill: `{N} new posts`.
- Clicking pill inserts/scrolls to new cards.
- If user is at top, cards may animate into the top area.
- If user is reading lower in feed, preserve scroll position.

---

## Empty States

For You empty:

- Heading: `Your Green Room is warming up`
- Body: `Follow artists and industry pros to fill this feed with releases, collabs, wins, and opportunities.`
- CTA: `Discover people`

Following empty:

- Heading: `No activity from your network yet`
- Body: `Follow or connect with members to see their updates here.`

Discover empty:

- Heading: `No matching people yet`
- Body: `Try a broader role, genre, or location filter.`

Opportunities empty:

- Heading: `No opportunities yet`
- Body: `Check back soon, or post what you're looking for.`

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Nav item | The Green Room |
| Page title | The Green Room |
| Page subtitle | See what your network is building, find collaborators, and discover new opportunities. |
| Composer placeholder | Share an update with The Green Room… |
| Submit button | Post |
| Draft button/state | Save draft |
| Custom audience summary | Visible to: {summary} |
| New activity pill | {N} new post{s} |
| Sponsored label | Sponsored |
| Featured label | Featured |
| Missing original repost | This post is no longer available |

---

## Accessibility

- All icon-only controls need `aria-label`.
- Tabs need keyboard navigation and visible focus.
- Reaction picker must be reachable by keyboard.
- Custom Audience controls need labels and summaries.
- Sponsored labels must not rely on color alone.
- Real-time new-activity pill should announce politely via `aria-live="polite"`.

---

*Phase: 12-Discovery, Feed & People Search*
*UI spec drafted: 2026-07-15*
