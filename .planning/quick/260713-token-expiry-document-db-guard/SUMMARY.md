# Quick Summary: Token Expiry + Document DB Guard

Date: 2026-07-13

## Completed

- Added `pitch_history.response_token_expires_at` with a 30-day default.
- Stamped new pitch response tokens with a 30-day expiry when pitches are sent.
- Enforced expiry on pitch accept, decline, and unsubscribe routes.
- Added a `vault_documents` check constraint requiring evidence for future `signed` and `verified` document states.
- Added adversarial regression coverage for pitch token expiry writes and unexpired-token route predicates.

## Verification

- `npm test -- --runInBand __tests__/adversarial-review-fixes.test.ts`
- `npm test -- --runInBand`
- `npx tsc --noEmit`

