# Quick Plan: PR 32 Review Fixes

Date: 2026-07-13

## Scope

- Fix the active-connection data model so a member pair cannot have simultaneous opposite-direction pending/accepted rows.
- Add a friendly API guard for duplicate active connection requests.
- Add regression coverage for the unordered active-pair uniqueness migration.

## Verification

- `npm test -- --runInBand __tests__/connections.test.ts`
- `npm run lint`
- `npm test -- --runInBand`
- `npx tsc --noEmit`
- `npm run build`
