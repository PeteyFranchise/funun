# Writer's Room Waveform Notes (Track Notes)

**Status:** Product direction and future-build handoff  
**Last updated:** September 4, 2026  
**Working names:** Waveform Notes, Track Notes  
**Related surface:** Studio Notes in the Writer's Room hybrid canvas

## Product intent

Waveform Notes should feel like a contemporary, collaborative evolution of SoundCloud's timed comments, built specifically for people making records rather than an audience reacting to finished music.

A producer, writer, artist, engineer, or other room collaborator should be able to play a take, choose an exact moment on its waveform, and leave clear creative direction such as:

> @producer Bring the bass up here.

The note must stay attached to the exact take and timestamp. Collaborators should be able to find it immediately, return to the musical moment, reply, react, resolve it, and carry it into a later mix when appropriate.

The system must remain light enough that leaving one quick note does not interrupt playback or make the Writer's Room feel like project-management software.

## Familiar interaction model

The experience deliberately uses patterns people already understand:

- **SoundCloud:** comments placed at exact waveform timestamps.
- **Figma:** contextual threads, replies, mentions, resolution, and reopening.
- **Frame.io:** media review tied to a specific version and playback moment.
- **Slack:** `@mentions` and fast micro-reactions.
- **Google Docs:** discussions attached to a specific content section.

Funūn's distinctive layer is the connection between these familiar interactions and a songwriting room containing takes, lyric blocks, whole-song notes, collaborators, and a chronological Diary.

## Core Waveform Notes flow

1. A collaborator plays or scrubs a take.
2. They tap or click the waveform at the desired moment.
3. Funūn captures the timestamp automatically.
4. A compact composer opens at that context.
5. The collaborator writes a note and can tag current Writer's Room participants.
6. Saving creates a visible waveform marker and keeps the new thread open.
7. Selecting the marker seeks playback to the timestamp and opens the discussion.
8. Participants can reply, react, resolve, or reopen the thread.

Example uses:

- “@producer Bring the bass up here.”
- “@maya Can you try the harmony one more time?”
- “The second verse should enter here.”
- “Can we drop the drums for four bars?”
- “This vocal comp is the one.”

## Waveform interaction and playback

- Tapping or clicking a waveform moment moves the playhead; it must not create a comment accidentally.
- The explicit **Comment at 1:45** action creates a note at the current playhead.
- Selecting a marker opens its thread and seeks to its time.
- The active marker receives a clearly visible vertical line connecting it to the waveform moment.
- Playback should optionally begin a few seconds before the timestamp so the musical transition has context.
- A future control may loop a short range around the selected note.
- Pausing to write must not discard the current playhead or interrupt an unfinished local draft.
- Notes belong to a specific take. A note on v1 must never silently move to v2.

## Visibility and discovery requirements

The note count cannot be passive text. If the UI says there are notes, that message must be actionable.

### Required fixes

- Render **View 2 unresolved notes** as a real button.
- Opening the button selects and displays the first unresolved note.
- Provide Previous and Next navigation through all threads on the take.
- Keep timestamp-zero markers fully visible instead of clipping them at the waveform edge.
- Cluster notes at the same or nearly identical timestamp into one numbered marker.
- Make the selected marker unmistakable with a vertical line, stronger color, and selected state.
- Keep a newly submitted note open immediately after saving.
- Display an obvious empty state when no notes exist.
- Allow Open, Resolved, and For me filtering without hiding the total count.
- Never require a user to hunt for a tiny dot to rediscover work they just created.

### Marker behavior

- Single note: a compact marker with a clear hit target.
- Multiple notes at one moment: a numbered cluster badge.
- Selecting a cluster cycles through or opens a compact list of its threads.
- Open notes use the active Funūn accent.
- Resolved notes remain discoverable but visually quieter.
- Keyboard and assistive-technology labels state the timestamp, count, and open/resolved state.
- On phones, marker hit targets must be large enough for a thumb even when the visual marker remains compact.

## Studio Notes

Studio Notes is the organized overview of Writer's Room discussion. It is not a second copy of Waveform Notes.

The same underlying comment should appear:

- In context on the waveform.
- In Studio Notes under its audio timestamp.
- Through a notification link that returns to that exact take and moment.

Studio Notes combines three authoritative contexts in one feed:

1. **Whole song** — direction or questions about the work generally.
2. **Audio moment** — a Waveform Note attached to a take and timestamp.
3. **Lyric section** — discussion attached to a specific lyric block.

### Movable hybrid-canvas behavior

- Studio Notes is a movable Writer's Room module.
- It can sit above, below, or beside lyric blocks, Versions, and Diary.
- It supports half-width and full-width presentation on desktop.
- It stacks into one readable column on mobile.
- It can collapse when a writer wants a quieter surface.
- Pressing the main **Note** action expands and scrolls to Studio Notes even if the module was collapsed or moved.
- A writer's private layout preference must never change another collaborator's layout or canonical song data.

## Mentions, replies, and notifications

- A note may tag one or more current Writer's Room participants.
- Recipient chips should insert or accompany recognizable `@handle` mentions.
- `@everyone` explicitly addresses all other current room participants.
- A reply should default to notifying the root-note author.
- Direct links must reopen the correct work, take, timestamp, and thread.
- Removed or former members may remain identified on historical notes but cannot receive new room notifications.
- Mentioning someone never gives them room access, writing credit, ownership, or a split.
- Studio Notes are creative context—not assignments, approvals, legal notices, or rights records.

## Micro-reactions

The initial shared reaction vocabulary is:

| Reaction | Meaning |
| --- | --- |
| 👍 Like | General agreement or acknowledgment |
| ❤️ Love | Strong positive response |
| 🔥 Fire | Musically exciting or especially strong |
| 👂 Heard it | “I listened to this note/moment” |
| ✅ Done | “I handled or incorporated this” |
| 💡 Good idea | Worth trying or developing |
| 😂 Laugh | A natural human response without another reply |

Reactions should work on root notes and replies in waveform, lyric-section, and Studio Notes views. Counts and viewer state must stay consistent everywhere because each surface reads the same reaction record.

**Important:** ✅ Done is an acknowledgment only. It must not resolve a thread, approve a mix, change song data, or create evidence of legal acceptance. Resolve/Reopen remains a separate authorized action.

## Version-aware review

- Every note remains attached to the take where it was created.
- When a new mix arrives, Funūn may offer unresolved notes from the previous take for review.
- The user chooses which notes to carry forward; nothing moves automatically.
- A carried note records the source take and remains traceable to its original thread.
- Resolved notes remain searchable history but should not clutter the default view.
- A later version-comparison mode could display notes from both takes while A/B playback is active.

## 2027-level improvements

These are deliberate future enhancements, not requirements for the first stable release:

- Play from two to five seconds before a selected note.
- Loop a configurable range around the selected moment.
- Drag a note marker to correct its timestamp without rewriting the note.
- Add a short time range, not only a single timestamp, for comments such as “lower the guitars through this section.”
- Display collaborator avatars on active markers when space allows.
- Intelligent marker clustering based on screen density and zoom.
- Waveform zoom and pinch-to-zoom on mobile.
- Voice-reply capture for collaborators who want to speak feedback quickly.
- Optional transcription of voice replies, with the original audio preserved.
- Notification summaries that group multiple notes on the same take instead of sending noise.
- “For me” review mode that queues only notes addressed to the viewer.
- Personal listened/read state that does not imply agreement.
- Offline-friendly local drafting and retry after connectivity returns.
- Accessible keyboard navigation between markers and threads.
- Search across note text, collaborators, timestamps, take names, and lyric sections.
- Exportable creative-feedback report when a team intentionally needs one.
- Optional AI-assisted clustering or summarization only after usage, cost, privacy, provenance, and account-access controls are established.

## Mobile behavior

The phone experience is a primary use case, not a reduced desktop layout.

- One tap scrubs or selects playback position.
- A separate explicit action creates the note, preventing accidental comments.
- The composer should fit above the mobile keyboard and preserve waveform context.
- Recipient chips and reactions must remain thumb-friendly.
- Swiping or Previous/Next controls should move between threads without forcing precision taps.
- Opening a notification should seek and reveal the note automatically.
- Recording, playback, and a note draft must recover safely after a temporary connection loss or browser interruption.

## Data and safety principles

- Audio, lyric, and whole-song notes retain one authoritative home; Studio Notes is a read-time facade.
- Access is limited to the work owner and current Writer's Room members.
- Direct table writes remain revoked; validated server functions perform mutations.
- Recipients are validated against current room participants.
- Inputs, recipient counts, and request rates are bounded.
- A reaction target must exist in the same work and source context.
- Resolution authority belongs to the note author, work owner, or room administrator.
- Note history cannot alter authorship, credits, splits, rights, approvals, delivery state, or access.
- Diary remains the chronological record of meaningful song activity; it should not become a duplicate comment feed.

## Current implementation snapshot

As of this document's date, the codebase contains the foundation for:

- Timestamped comments on recording waveforms.
- Lyric-section comment threads.
- Whole-song Studio Notes.
- Replies, participant mentions, notifications, resolution, and reopening.
- A unified Studio Notes facade across all three contexts.
- A movable/collapsible half- or full-width Studio Notes module.
- The seven shared micro-reactions on notes and replies.
- Clickable waveform note counts, clustered timestamp markers, active vertical selection line, and Previous/Next navigation.
- Optional review and carry-forward of unresolved comments to a later take.

The Studio Notes and reaction schema is introduced by:

`supabase/migrations/180_writer_room_studio_notes.sql`

That migration is human-gated and must be applied before deploying code that relies on the new whole-song note and reaction tables.

## Suggested delivery phases

### Phase 1 — Reliable discovery

- Finalize clickable counts, marker clustering, selected line, and thread navigation.
- Test 0:00, track-end, identical-time, and dense-marker cases.
- Verify post-save persistence and direct notification links.
- Test mouse, keyboard, touch, and narrow-phone behavior.

### Phase 2 — Playback-centered review

- Add pre-roll playback and optional short looping.
- Keep thread context visible while listening.
- Polish open/resolved/for-me filtering and carried-note presentation.

### Phase 3 — Mobile and resilience

- Improve thumb targets, composer/keyboard layout, and swipe navigation.
- Harden local drafts and retry behavior for unstable connections.
- Validate browser microphone/playback interruptions do not lose notes.

### Phase 4 — Advanced 2027 tools

- Time ranges, waveform zoom, marker repositioning, voice replies, grouped notifications, search, and carefully governed AI assistance.

## Acceptance criteria for the mature experience

- A first-time user can create and rediscover a timed note without instruction.
- The user can reach every note without clicking a one-pixel marker.
- Multiple comments at the same second are individually accessible.
- A notification opens the exact take, timestamp, and thread.
- Playback provides enough pre-roll to understand the musical context.
- Notes and reactions render consistently in waveform, lyric, and Studio Notes views.
- Mobile users can complete the full flow with one hand.
- A failed request never makes a draft appear saved or silently discards it.
- No note, mention, reaction, or resolution changes rights, ownership, credits, splits, approvals, or membership.

## Open product decisions

- Final public name: **Waveform Notes** or **Track Notes**.
- Default pre-roll duration.
- Whether time-range comments belong in the first advanced release.
- Whether carried notes should create a new linked thread or a clearly labeled copy.
- Whether “👂 Heard it” should be user-selected only or complemented by private read/listen state.
- Whether resolved markers remain visible by default on the waveform.
- When voice replies, search, exports, and AI summaries become appropriate for account tiers.

