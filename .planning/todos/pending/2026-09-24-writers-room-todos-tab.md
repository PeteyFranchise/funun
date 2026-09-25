---
created: 2026-09-24T00:00:00Z
title: Writer's Room — a ToDos tab (member-added and system-generated next actions)
area: writers-room
severity: low
status: pending
kind: idea
---

## The idea

A **ToDos** tab in the Writer's Room: a list of the important actions to take next on this song.
Two sources feed it —

- **A member of the room adds one** ("re-track the bridge", "clear the sample").
- **The system adds one** ("assign splits", "no lead vocal declared", "the chorus has no take").

Owner-raised 2026-09-24, end of the bench-01 session. Parked deliberately — noted, not designed.

## Why it may be the right shape

Funūn already generates next-actions in two places and has nowhere to put more than one of them.

**The guiding line is deliberately singular.** `components/catalogue/GuidingLine.tsx` takes a
`GuidingLineStep | null` — never an array — and its header explains why: *"the line rotates through
the song's single most important next step, never stacks, and is absent when nothing is needed."*
There is a type-level test asserting a stack cannot even be constructed.

That rule is good and should stay. But it means everything *except* the single most important step
is currently invisible. **A ToDos tab is where the stack lives** — which resolves that tension
rather than violating it. The line stays the one thing shouting; the tab is the list you consult.

**`nextMoveForIdea()` already does this for ideas.** `lib/ideas/insights.ts` returns one of
`record | name | note | lyrics | collaborate | promote | revisit` with a human label. The same
generator shape would work for a room, and some of the conditions already exist elsewhere —
readiness gates, the splits nudge, the vocal-state check.

## What to think about before designing it

- **Do not build a third nudge channel.** Between the guiding line, the readiness score and this,
  a writer could be told the same thing three times in three voices. Decide the relationship
  first: most likely the tab is the **source** and the line is a *view* of its top item.
- **The splits nudge has a locked cadence.** The NUDGE-CADENCE RULE (sketch 006-A, owner) fires the
  splits nudge **once per new contributor per song**, in the guiding line only, never per edit or
  keystroke, dismissible, with a pad setting that quiets it entirely. A ToDos tab must not become a
  loophole that re-nags what that rule deliberately silenced.
- **System items name people, never numbers.** SPLITS-DEFAULT RULE: the product never proposes
  contribution-based percentages. "Put Marcus on the split sheet" is allowed; "Marcus should get
  30%" is not.
- **Who can complete a system item?** Some ("assign splits") imply authority. Completion should
  follow the same permission that governs the underlying action, not the tab.
- **Does a ToDo survive graduation** into a release, or is it room-scoped and discarded?
- **Is it per-room or per-person?** "Re-track the bridge" is the room's; "listen to v12" is mine.
  Mixing them without a distinction makes the list everyone's and no one's.

## Also raised: notifications inside the room

Owner-raised in the same breath, 2026-09-24. Likely the same surface, so noting it here.

**Verified what already exists (2026-09-24):**

- A **global** notification system — `lib/notifications/index.ts`, `app/api/notifications/route.ts`,
  and a bell in the nav (`components/nav/NotificationBell.tsx`, `NotificationPanel.tsx`).
- The room **already broadcasts** its own events. `lib/catalogue/room-collaboration.ts` defines
  `CollaborationHint` as `lock_changed | lyric_saved | comment_changed | suggestion_changed`
  (per block) and `track_comment_changed` (per version), delivered over Supabase Realtime.

**The gap between them:** those broadcasts are *ephemeral* — `WriterRoomPresence` hands them to
`onLiveHint` so the UI can refresh, and then they are gone. They are a sync mechanism, not a
record. So the room knows what happened and the app has a bell, but there is nowhere in the room
that says *"while you were away: Marcus signed the split sheet, Nia added Take 5, Priya replied to
your note on bar 17."*

**Questions to settle:**

- **In-room feed vs the global bell — which owns it?** Duplicating every room event into the global
  bell would drown it. Most likely the room surface is scoped and unread-aware, and only a few
  event types escalate to the bell (someone signed, someone was added, you were @mentioned).
- **Is this the Diary?** The Diary already records what happened in the room. The difference is
  *unread state* and *addressed-to-you* — a diary is history, a notification is an obligation. They
  may be one surface with a filter rather than two.
- **Relationship to ToDos.** A notification says something happened; a ToDo says something needs
  doing. They overlap ("splits unsigned" is both). Decide whether they are one inbox with two
  kinds, or two surfaces — before building either.
- **Presence privacy line holds here too.** `WriterRoomPresence` promises *"creative context only —
  no keystrokes or productivity tracking."* A notification feed that reports how often someone
  edited would break that promise in a way the presence pill deliberately avoids.

## Related

- `components/catalogue/GuidingLine.tsx` — the one-step rule and its type-level guard
- `lib/catalogue/guiding-line.ts` — `resolveGuidingLine()`, the existing generator
- `lib/ideas/insights.ts` — `nextMoveForIdea()`, the same pattern on the Ideas side
- `lib/vault/readiness.ts` — the other place the product already says "do this next"
- `.planning/ROADMAP.md` — Writer's Room design wave (Phases 42–45)
