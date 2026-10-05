# Follow-ups the direct work→track link makes possible

**Captured:** 2026-10-04 · **Status:** open, not blocking

`tracks.work_id` (migration 230) and `lib/catalogue/track-work-link.ts`'s
`resolveTrackAiProvenance()` make two further fixes possible that this plan
(261004-wtl) deliberately does not build. Both are named here so a future
session does not have to re-derive why they were left out.

## 1. Wiring `resolveTrackAiProvenance()` into an actual admit decision

The real call site is `app/api/sync-library/admin/[listingId]/route.ts`'s
admit path, alongside the existing `GateSignal`/`evaluateInclusionGate()`
check. Whether an `'unresolved'` verdict should **block** admit, surface a
non-blocking "check by hand" note to staff, or do something else entirely is
a **product decision the owner has not made**.

The owner's decision
(`.planning/deliberations/2026-10-04-owner-decisions-submissions-and-gate-0.md`
§7/§10) only established that "cannot determine" must never read as
"clean" -- it did not decide what the admit route does with that state once
it is reachable. This plan deliberately stops at building the resolver, not
wiring it, because that policy call is undecided.

## 2. `lib/song-passport/legacy.ts`'s `legacyFactsForWork()` and its caller

`app/api/works/[workId]/passport/discovery/route.ts:143-150` enumerates
**every** track in a work's `graduated_project_id` project, which can
include tracks unrelated to that work once a project holds more than one
work's output (the same ambiguity migration 230 exists to resolve).

The 2026-10-04 deliberation
(`.planning/deliberations/2026-10-04-work-to-track-eligibility-resolution.md`
§6) confirmed this is **read-only, owner-only, display-only** tooling --
nothing downstream treats its output as authoritative. Not a live bug.

`tracks.work_id` now makes an exact fix possible: filter
`releaseProject.tracks` to `work_id = workId` instead of returning every
track in the project. That fix was left out of this plan's scope
deliberately -- the decided scope for 261004-wtl was the schema link only,
not every reader that could now be tightened against it.

## Related

- `.planning/deliberations/2026-10-04-work-to-track-eligibility-resolution.md`
- `.planning/deliberations/2026-10-04-owner-decisions-submissions-and-gate-0.md`
  (§7, §10)
- `supabase/migrations/230_track_work_direct_link.sql`
- `lib/catalogue/track-work-link.ts`
