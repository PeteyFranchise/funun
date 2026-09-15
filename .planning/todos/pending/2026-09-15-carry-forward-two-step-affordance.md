---
created: 2026-09-15T00:00:00Z
title: Carry-forward reads as done before it is — two-step affordance confuses
area: ux
files:
  - components/catalogue/TimedTrackPlayer.tsx
---

## Provenance

Found during Phase 39's plan 39-11 manual verification, 2026-09-15, by the owner on production.
Not a defect — the carry-forward works correctly end to end, verified in the database. This is a
usability finding.

## What happened

The owner reported twice that comments "did not carry over". Both times the system was behaving
correctly; the carry simply had not been committed yet. It took three exchanges and a direct
database query to establish that nothing was broken.

## The likely cause

Carry-forward is a **two-step interaction that looks like one**:

1. A checkbox per unresolved comment, which arrives **pre-ticked**
2. A separate **"Carry N selected"** button that actually performs the copy

A pre-ticked checkbox reads as committed state — "this is selected, so it is happening" — when it
is really just a default. The panel does say *"Nothing moves automatically"*, but that line sits
above the list and reads as reassurance about automation rather than as an instruction that a
further click is required.

The result is a user who believes the feature is broken when it is idle and waiting for them.

## Why it matters

The failure is silent and self-confirming: you look at the new take, see no comments, and conclude
carry-forward does not work. Nothing errors, so there is no prompt to look further. A beta user
would reasonably stop using the feature rather than report it.

## Fix directions (not yet decided)

- Make the button the obvious commit point — e.g. state it as "Copy 1 comment to this take",
  naming the action and its object rather than "Carry N selected".
- Reconsider the pre-ticked default. Starting unchecked makes the check an intentional act and the
  button an obvious consequence.
- Confirm the outcome after the copy lands — the take currently just gains a marker. A brief
  "1 comment copied from v2" would close the loop.

## Related

The same panel is the subject of Phase 40's export work, which will add controls to this surface.
Worth resolving the affordance before adding more actions to the same area.
