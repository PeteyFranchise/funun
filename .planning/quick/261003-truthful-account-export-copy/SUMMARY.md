# Quick Task 261003: Truthful Account-Export Marketing Copy Summary

## What Changed

- Replaced the homepage FAQ's unsupported promise that every Member can export all account data
  with the accurate statement that individual songs, project files and metadata can be exported
  today and that a complete account export is planned.
- Advanced the frozen marketing-source hash, regenerated the tracked production artifact and
  manifest, and kept the 2,168-line source invariant unchanged.
- Added a regression test requiring the new copy exactly once and forbidding the old promise.
- Updated Phase 49 in `.planning/ROADMAP.md` to record the interim copy correction while preserving
  the complete secure full-account export as a planned capability.
- Did not implement or narrow Phase 49's functional requirements.

## Validation Run

- `npm run marketing:assets` — passed; 50 assets and 7 fonts written.
- `npm run marketing:build` — passed; artifact regenerated with one nonced script.
- `npm run marketing:verify` — passed.
- `npm run marketing:assets:check` — passed; 53 HAR-observed resources reconciled.
- `npm test -- --runInBand scripts/marketing-artifact.test.ts __tests__/marketing-root-route.test.ts`
  — 2 suites and 128 tests passed.
- `npm run typecheck:strict` — passed.
- `npm run lint` — passed with zero warnings.
- Source, local baseline and manifest all record SHA-256
  `4500a13cab736397ae698fd23c948960676a9d28bb389a47e38c402f4a1e6bed`.

## Remaining Risks and Follow-Ups

- Phase 49 remains unimplemented. Do not restore a whole-account-export availability claim until
  its asynchronous packaging, rights boundaries, expiring delivery, rate limits and audit controls
  are built and verified.
- The gitignored frozen source and local baseline were updated in this workspace; the tracked
  artifact, manifest and freeze constant carry the deployable change.
- Deployment was not requested in this task.
