# Quick Summary: Adversarial Review Fixes

Date: 2026-07-13

## Completed

- Blocked generic document creation and patch routes from setting `signed` or `verified`.
- Updated the document manager UI to display earned document status and allow only reset-to-pending.
- Updated the copyright filing marker to create a pending document row instead of a verified document shortcut.
- Made pitch accept/decline, split approval/counter, and curator claim mutations include the expected unused state in the update predicate.
- Added focused adversarial regression tests for document-state bypasses and token-route predicates.

## Verification

- `npm test -- --runInBand __tests__/adversarial-review-fixes.test.ts`
- `npm test -- --runInBand`
- `npx tsc --noEmit`

