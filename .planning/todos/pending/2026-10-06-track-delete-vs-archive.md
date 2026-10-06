# Track deletion when rights facts exist — revisit archive-instead after user feedback

**Captured:** 2026-10-06 · **Status:** owner decision made, deliberately provisional
**Owner, 2026-10-06:** *"1 for now, and put it on the roadmap that we can decide later if 2 is
the better option after user feedback."*

## What was decided

Migration 235's `tracks` lockdown (Pass 6 C-2) removes DELETE from project **editors** and keeps
it with the **owner and co-owner** — including for tracks that already carry an ISRC or credited
writers.

## What was deferred

The alternative: once a track carries an ISRC or credited writers it cannot be hard-deleted by
any client caller; it is archived instead, and the row survives as rights history.

That option was not rejected on merit. It was deferred because it is materially larger than a
database guard — it needs an archive flag, UI for archived state, and a change to every query
that lists tracks — and because nothing in the product yet tells us whether owners actually
delete rights-bearing tracks. Consistent with [[gates_are_provisional]]: build it to be changed,
decide with usage in hand.

## What would trigger revisiting it

- A beta user hard-deletes a track that had an ISRC or credited writers, and wants it back.
- Registration or distribution work starts depending on a track row continuing to exist after
  the artist removes it from the project.
- Counsel's reading of what "admitted" means contractually (the Phase 50 blocker) turns out to
  require a durable per-track record.

## What is already true, so this is not urgent

- The split sheet is the money-bearing record, not `tracks`, and it is a separate row with its
  own lifecycle — deleting a track does not delete the sheet.
- Migration 235 makes credits, identifiers and split-bearing metadata unwritable by editors, so
  the common accident (a collaborator clearing a field) is closed regardless.
- `work_diary_events` retains the history of what happened to the work.

## Related

- `.planning/deliberations/2026-10-05-pass-6-identity-access-review.md` — C-2
- `supabase/migrations/235_*` — the lockdown this defers a piece of
