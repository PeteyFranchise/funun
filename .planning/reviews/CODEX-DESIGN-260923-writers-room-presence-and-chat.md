# Writer's Room Redesign Discussion: Members, Presence, and Live Chat

**Started:** 2026-09-23
**Status:** Owner-approved product direction as of 2026-09-23; implementation is separately phased
**Source:** Owner review of the current Writer's Room page across six screenshots

## Purpose

Make the Writer's Room feel like an inhabited, collaborative creative space rather than a long project
form. This record preserves what the owner has decided, the current design recommendation, and the
questions that must be resolved before Claude receives an implementation plan.

## Owner direction already established

1. Replace the current **In the Writer's Room** treatment with **Room members**.
2. Use the supporting copy: **These people have access to this Writer's Room.**
3. Show every room member's profile picture, with initials as a fallback when no picture is available.
4. Indicate members who are online with a small green presence light positioned on or above the avatar,
   following a familiar Instagram/Facebook visual pattern.
5. Explore live chat inside the Writer's Room so collaborators can coordinate without leaving the song.
6. A possible chat visual direction is familiar back-and-forth social messaging adapted to Funūn's own
   purple, pink, lavender, and dark-surface design language.

The owner subsequently approved the room-chat direction, the managed-video direction, synchronized
stored-take playback, and the Funūn Bridge desktop-companion direction. Detailed implementation boundaries
and gates now live in `CODEX-PLAN-260923-writers-room-live-sessions-daw-bridge.md` and phases 44–45.2.

## Recommended presence meaning

The green light should mean **Here now: this Member currently has this Writer's Room open**, rather than
the broader claim that they are online somewhere in Funūn. Room-specific presence is more useful to a
collaborator deciding whether to speak or edit now, and it discloses less unrelated platform activity.

Recommended states:

- **Green light + “Here now”** — an active presence session is connected to this room.
- **No light** — the person has room access but is not currently present. Do not label them “offline.”
- **Pending invitation** — invited but access is not yet accepted; visually separate from room members.
- **Connection stale** — remove the light after a short heartbeat timeout rather than showing false
  presence indefinitely.

Presence color cannot be the only signal. Hover, keyboard focus, tap, accessible names, and screen-reader
text must expose “Here now.” Do not add last-seen history unless the owner separately approves it.

## Recommended Room members surface

Suggested copy and information hierarchy:

> **Room members**
> These people have access to this Writer's Room.

Below the copy, show a compact avatar group instead of the current large member pill. Possible layout:

```text
Room members                                      2 here now
These people have access to this Writer's Room.

[avatar ●] [avatar ●] [avatar] [avatar] [+4]     [Open room chat]
```

Interaction rules:

- Show the current Member first, then people here now, then remaining members in a stable order.
- Show up to approximately six avatars before a `+N` overflow affordance; confirm the exact count during
  responsive design.
- Selecting an avatar opens a small profile/access popover with display name, `@handle`, room role/access,
  and presence text. This also helps distinguish people with the same first name.
- Selecting the overflow opens the complete member list.
- Keep **Invite** visually distinct from existing members and pending invitations.
- Remove the current separate, ambiguous `Live` legend once each avatar communicates presence directly.

Example popover:

```text
Eric Johnson · @ericj
Here now · Contributor
```

## Presence privacy copy

The existing sentence—“Creative context only — no keystrokes or productivity tracking”—is unclear and
becomes internally inconsistent once the product intentionally exposes live presence. Do not promise
that Funūn tracks no activity at all while it shows presence, autosaves lyrics, and timestamps edits.

If explanatory copy is needed, use something precise:

> Green means this room is open in their current session. Funūn does not score or measure productivity.

This likely belongs in a tooltip or help disclosure, not permanently under the section heading.

## Why room chat is valuable

Live room chat supports the short coordination exchanges that occur during co-writing:

- “Listen to the new chorus.”
- “Can you try the second verse?”
- “I'm uploading another take.”
- “Are we keeping that bridge?”
- “Give me five minutes.”

Without room chat, Members must leave the creative context, find a separate conversation, and then return
to the song. A chat surface can make the room feel live while keeping the discussion attached to the work.

## Communication boundaries

Four communication surfaces can coexist only if each has a clear job:

| Surface | Purpose | Persistence/context |
|---|---|---|
| **Room chat** | Live conversation and lightweight coordination | Belongs to the Writer's Room |
| **Section comments** | Feedback about a specific lyric section or creative item | Anchored to that item/version |
| **Studio Notes** | Durable decisions, questions, direction, and follow-up | Formal room record/work queue |
| **Direct messages** | Private or cross-project conversation | Belongs to the people, not the song |

Room chat must not become a second Studio Notes list or a replacement for anchored comments. A useful
bridge would be **Convert to Studio Note** or **Attach to section/take**, allowing an important chat
message to become durable and contextual without copying everything automatically.

## Recommended chat placement

Do not add chat as another full-width section in the page's vertical document. The Writer's Room is long;
an inline chat would disappear while someone edits lyrics lower down.

- **Desktop:** collapsible right-side rail that remains available while the room scrolls.
- **Closed desktop state:** persistent Room chat button with unread count.
- **Mobile/narrow layout:** bottom sheet or focused full-screen drawer.
- **Composer:** sticky at the bottom of the chat surface.

Suggested visual direction:

- Incoming messages use dark/lavender Funūn surfaces.
- The current Member's bubbles may use the restrained purple-to-pink brand gradient.
- Consecutive messages from one person are grouped; show avatar/name at the beginning of the group.
- Support timestamps, replies, lightweight reactions, and `@mentions`.
- Allow structured links to a lyric section, take, version, or Studio Note.
- Start without generic file attachments; audio and documents should remain in their structured room
  locations instead of creating a second asset store inside chat.
- Avoid noisy per-person read receipts in the default view. A compact “Seen by 3” disclosure is enough if
  read state is approved.

## Rights and access boundaries

- Chat participation does not add a person to the song, prove authorship, assign a credit, change a split,
  grant ownership, or authorize delivery.
- Room access, song participation, credits, ownership, and chat membership remain separate concepts.
- A message may form part of the room's historical record, but Funūn must not market chat as dispositive
  proof of authorship or ownership.
- Removing room access must stop new presence and chat access immediately. What happens to historical
  messages requires an explicit retention/deletion decision.
- Private side conversations should stay in direct messages; room chat is shared with the room.

## Recommended product sequence

### Slice 1 — Room members and presence

- Compact member-avatar group and complete member list.
- Profile pictures, initials fallback, full name, `@handle`, role/access, and pending-invite treatment.
- Room-specific `Here now` presence with heartbeat/stale-session behavior.
- Accessible status, narrow-layout behavior, empty/single/member-overflow states.
- Replace the current `Live` label and surveillance-sounding explanatory copy.

### Slice 2 — Room-chat foundation

- Shared room conversation with the same authorization boundary as room access.
- Desktop rail, mobile drawer, sticky composer, unread count, and notification policy.
- Realtime messages, replies, mentions, reactions, timestamps, and accessible focus behavior.
- Access-removal, block, archive/delete, moderation, retention, export, and audit rules.

### Slice 3 — Creative-context connections

- Link a chat message to a section, take, or version.
- Convert a message into a Studio Note.
- Carefully selected system messages, such as “Maya uploaded Chorus Take 3.”
- Keep detailed/repetitive change history in the Diary rather than flooding room chat.

Formal phase numbers must not be assigned until the existing roadmap, realtime infrastructure, message
model, room authorization, and migration ledger are inspected.

## Initial observations about the wider page

These are discussion prompts, not approved redesign decisions:

- The work title appears in the page header and again in a large summary card, creating repetition before
  the primary creative tools.
- The member/presence area currently consumes substantial width without providing a clear member overview.
- **Add a collaborator** expands into a large form near the top, pushing the actual writing surface below
  the fold. It may work better as a modal/drawer or progressive flow.
- The four **Add to this song** tiles are visually dominant compared with the primary task of writing.
- The Writing surface carries several controls in every section header, producing repeated visual noise.
- Diary entries such as repeated “Someone reordered 5 sections” dominate the lower page without helping
  a creator decide what to do next.
- Studio Notes is useful but arrives very far down the page; its relationship to comments and proposed
  room chat must be made explicit.
- The page needs a clearer hierarchy between room-level context, creation tools, the song arrangement,
  collaboration, and historical/audit information.

## Decisions delegated to phase checkpoints

These are required design/security checkpoints rather than permission to reverse the approved direction:

1. Exact stale-heartbeat interval for `Here now` and whether foreground visibility remains required.
2. Whether room presence may be hidden; default direction is visible to current room members.
3. Chat retention, edit/delete window, post-removal visibility, moderation, and metadata audit.
4. Notification defaults and whether reactions/read state/typing indicators enter the first release.
5. Exact conversion semantics for **Convert to Studio Note** and authorization to invoke it.
6. Managed video-provider selection after a dedicated owner discussion. The phase may compare Daily,
   LiveKit, Twilio, Zoom Video SDK, and any then-credible alternative, but it may not choose or install one
   in advance. Zoom means its customizable Video SDK, not an embedded Zoom Meeting.
7. Desktop Bridge OS order, selected at the Phase 45 human checkpoint from beta-user DAW/OS evidence.

## Research required before Claude implementation planning

- Current Writer's Room membership, block, removal, and role authorization.
- Existing Supabase Realtime presence/channel use and reconnect behavior.
- Existing direct-message schema, notification primitives, moderation, and retention behavior that can be
  reused without coupling room chat to unrelated social DMs.
- Current Studio Notes and section-comment persistence/version semantics.
- Current mobile layout and whether a right rail can coexist with the app shell.
- Migration-number availability and production baseline immediately before any SQL is authored.
- Testability of realtime presence, authorization, unread counts, replay/reconnect, and access revocation.

## Locked product sequence

1. Room members and room-specific presence.
2. Persistent room chat with explicit comments/notes/DM boundaries.
3. On-demand managed live sessions with camera, microphone, and DAW-window sharing; no recording.
4. Synchronized playback of protected stored takes during sessions.
5. Funūn Bridge for watched-folder, resumable DAW-to-room upload and protected pull-to-folder.
6. AU/VST3/AAX and high-fidelity live-audio research only after Bridge usage proves demand.
7. Session recording only after a separate legal/privacy/storage decision.

Do not let chat delay the simpler member/presence improvement, and do not implement chat, video, or a DAW
connector as small UI add-ons without their data, access, retention, security, and operational models.
