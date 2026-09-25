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

## Related

- `components/catalogue/GuidingLine.tsx` — the one-step rule and its type-level guard
- `lib/catalogue/guiding-line.ts` — `resolveGuidingLine()`, the existing generator
- `lib/ideas/insights.ts` — `nextMoveForIdea()`, the same pattern on the Ideas side
- `lib/vault/readiness.ts` — the other place the product already says "do this next"
- `.planning/ROADMAP.md` — Writer's Room design wave (Phases 42–45)
