# Dependency Gate Edits Summary

## What changed

- Removed the separate production-dependency moderate audit command from the CI validate job and
  documented the owner-approved change to one high-or-higher audit authority with dated deferrals.
- Replaced the expired, stale `braces` deferral with the owner-approved Zod advisory deferral through
  2026-12-21, including the verified 142-file migration footprint and bounded-but-nonzero exposure.
- Updated the verification-gate documentation and drift tests that intentionally locked the former
  two-command policy. The new test rejects any second raw `npm audit` CI command.
- Carried the existing Zod migration deadline tracker from commit `5e416157` so the deferral and its
  scheduled remediation land on `main` together.

## Validation run

- `npm ci --include=dev`: passed; installed 1,081 packages. An initial incomplete local install was
  preserved at `/private/tmp/funun-deps-node_modules-incomplete-20261122` before the clean retry.
- `npm run security:migrations:verify`: passed.
- `npm run typecheck:strict`: passed.
- `npm run lint`: passed with zero warnings; ESLint printed its existing configuration deprecation
  notice.
- `npm run marketing:verify`: passed outside the filesystem sandbox so `tsx` could create its local
  IPC socket.
- `npm test -- --runInBand`: 680 suites and 8,718 tests passed.
- `npm run audit:gate`: passed outside the filesystem sandbox; one active deferral, expiring
  2026-12-21.

## Remaining risks and follow-ups

- The Zod migration remains scheduled work and must be completed or re-evaluated before the deferral
  expires on 2026-12-21.
- The raw production-dependency moderate audit will still fail if run manually; that is expected
  under the owner-approved policy change and is no longer a CI validate step.
