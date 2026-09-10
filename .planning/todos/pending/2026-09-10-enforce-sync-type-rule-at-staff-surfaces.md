---
created: 2026-09-10T03:10:00.000Z
title: Enforce the sync project-type rule at the staff surfaces, not just the buyer gate
area: sync-library
blocked_on: the sampleBlock fix landing (agent in flight 2026-09-10)
files:
  - app/api/sync-library/admin/[listingId]/route.ts (the admit route — no type check)
  - lib/sync-library/worklist.ts (missingSyncItems — no type filter)
  - lib/sync-library/readiness.ts (SYNC_ELIGIBLE_PROJECT_TYPES / isSyncEligibleProjectType — already exists, reuse it)
  - lib/deals/catalog.ts (isRightsReady — where the rule IS enforced today)
---

## The problem — one bug, two places

Commit `ca919cf2` made the sync project-type rule explicit: the catalogue is for
`single`, `ep`, `album`. `snippet` and `unreleased` are out (owner, 2026-09-09).

**It is enforced at the buyer gate only.** Two staff surfaces don't know about it:

**1. Nothing stops an ineligible project being ADMITTED.**
`app/api/sync-library/admin/[listingId]/route.ts` uses `evaluateInclusionGate()`,
which knows nothing about project type, and `hasSyncLibraryCapability()` gates the
ARTIST, not the work. So staff can admit an `unreleased` project — it just
silently never renders to a buyer.

**2. The staff worklist label can contradict the catalogue.**
`lib/sync-library/worklist.ts` computes `missingSyncItems(syncReadinessForTrack(...))`
with no type filter. For an `unreleased` project today's registry emits only
`audio_files` + `split_sheets`; if both are complete, `missingSyncItems()` returns
`[]` and staff see **`pending_admit`** — "will be visible to buyers the moment it
is admitted" — for a project the catalogue will never show.

(In `catalog-query.ts` this is unreachable, because the staff block sits after the
`isRightsReady` `continue`. `worklist.ts` calls it directly and has no such guard.)

The previous quick task's explicit argument was that **staff should see exactly the
bar the catalogue enforces.** That coupling is now broken for two project types.

## The fix

Reuse `isSyncEligibleProjectType()` — it already exists, do not write a second
definition. Apply it at both surfaces:

- **Refuse at admission.** An ineligible project type should not be admittable.
  This is a behaviour change with a UI surface (staff need to see WHY), which is
  why it was deliberately left out of `ca919cf2`.
- **Filter the worklist**, so `pending_admit` cannot appear for a type the
  catalogue refuses.

**Refusing at admission is the cheap direction.** One condition, versus explaining
an invisible admitted listing to an artist later.

## Why it was queued rather than done

Owner decision 2026-09-10. Not urgent — The Crate has **0 admitted listings**
(verified by an owner-run query), so nothing is currently wrong for a real user.
It gets expensive the moment real submissions arrive, because "staff admitted it
and it vanished" becomes a support conversation with an artist in it.

## Tests

- An ineligible type cannot be admitted; the refusal names the reason.
- `worklist.ts` never reports `pending_admit` for `snippet` or `unreleased`.
- Reuse the `ca919cf2` pattern: build the case with **all six entry items
  complete** so the test proves the TYPE rule is doing the work, not an
  incidentally missing item.
- Mutation-test both.

## Related

- `.planning/deliberations/sync-catalogue-entry-and-samples.md` — the decisions
- `.planning/quick/260910-sync-entry-gate-six-items/` — the six-item gate
- Commit `ca919cf2` — where the rule is enforced today, and its reasoning
