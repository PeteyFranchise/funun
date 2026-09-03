# Writer's Room Version Comparison

## Objective

Close the timed-feedback loop by letting room members A/B two playable takes at one shared timestamp, inspect each take's own timed notes, and resolve a note as addressed while hearing the newer version.

## Scope

- Add a focused comparison overlay launched from the Versions area when at least two signed takes are playable.
- Default to the newest two versions and allow either side to be changed without selecting the same take twice.
- Preserve one absolute playhead when switching A/B, clamped only when the selected recording is shorter.
- Load both versions' existing timed comments in parallel; show only the active take's markers and thread detail.
- Let an authorized user resolve/reopen a selected root note from comparison, phrased as `Mark addressed in vN` when comparing an older note against a newer take.
- Broadcast the existing bounded `track_comment_changed` refetch hint after resolution.
- Add no schema changes and no new external services.

## Files expected to change

- `components/catalogue/VersionComparisonPanel.tsx`
- `components/catalogue/VersionComparisonPanel.test.tsx`
- `components/catalogue/WorkPage.tsx`
- `components/catalogue/WorkPage.test.tsx`
- `.planning/quick/260903-version-comparison/SUMMARY.md`

## Validation plan

- Pure/static render coverage for the two selectors, shared seek timeline, A/B controls, exact comment markers, and addressed action.
- Existing WorkPage coverage proves comparison appears only with at least two playable versions.
- Run focused Jest, full Jest, TypeScript, ESLint, and `git diff --check`.
- Do not run `next build` while the owner's development server may be using the shared `.next` directory.

## Risks and coordination notes

- `Addressed in vN` reuses the existing reversible resolution fact; this MVP does not add a separate durable target-version relation.
- Switching preserves absolute elapsed time, not percentage, because mix feedback refers to a heard moment. A shorter take clamps safely to its end.
- Signed URLs remain server-generated and the comparison component receives no raw storage paths.
