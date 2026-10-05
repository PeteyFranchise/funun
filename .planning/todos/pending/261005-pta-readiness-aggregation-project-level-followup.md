---
created: 2026-10-05T00:00:00.000Z
title: Make the six-item sync entry gate track-aware (readiness aggregation is project-level)
area: rights-eligibility
files:
  - lib/vault/readiness.ts (readinessItemsForProject, lines ~190-192, ~338-345)
  - .planning/deliberations/2026-10-05-pass-5-rights-eligibility-review.md
---

## Problem

Named in the pass-5 rights review and confirmed during quick task `261005-pta`'s
investigation: the six-item catalogue **entry gate** (`isSyncEntryComplete`, which
`readinessItemsForProject` feeds) computes several of its items across **all fetched
project tracks**, not per track a buyer might actually request. Two concrete examples
found in `lib/vault/readiness.ts`:

- `audio_files` (line ~190-192): `status = tracks.length > 0 ? 'complete' : 'missing'`
  — complete as soon as **any one track** has audio, not when every requestable track
  does.
- `metadata` (line ~338-345): `withComposers === tracks.length` — this one DOES
  already require every track to have composers, but it demonstrates the project-level
  framing: it is evaluated once per project against the full track list, not scoped to
  which track a buyer is actually looking at.

Split/copyright/hire-right signals feeding the same gate have the same project-level
shape.

This is a **separate, pre-existing gap** in what makes a project eligible to **enter**
the sync library at all — distinct from C-01 (per-track exposure/request authorization),
which quick task `261005-pta` fixed. It compounds C-01's shape: a project could clear
the entry gate on the strength of one well-documented track while a sibling track with
no audio, no composer splits, or no rights documentation of its own still rides along
into the same admitted project.

**Explicitly not fixed in `261005-pta`** — fixing it means changing the admission
gate's own inputs (`readinessItemsForProject`'s six entry items), which that plan's
constraints forbade touching. The per-track checks `261005-pta` added (scoping
`catalog-query.ts`'s `card.tracks` and `request-target.ts`'s `project.tracks` to
admitted tracks) are the final gate regardless of this signal's accuracy, so deferring
this does not reopen C-01 — it is a distinct, lower-severity gap (staff still has to
affirmatively admit each track; this just means the entry gate that unlocks admission
in the first place is coarser than it should be).

## Recommendation

Scope a future deliberation/plan to make `readinessItemsForProject`'s six entry items
track-aware — i.e., each item should be evaluated per track that a buyer could
plausibly request, not aggregated across every track fetched for the project. This
likely means `isSyncEntryComplete` needs a per-track variant, or
`readinessItemsForProject` needs to accept a "track scope" parameter so admission
flows can ask "is track X itself entry-complete" rather than "is this project
entry-complete in aggregate."

Do not conflate this with C-01's admission-gate fix — this todo is about the inputs
to the entry gate that unlocks whether a track CAN be submitted/admitted at all, not
about the admission decision itself.
