# D-01 Hidden-Member Disclosure Decision Support Summary

## What Changed

- Created `.planning/reviews/CODEX-RESPONSE-260922-d01-hidden-member-disclosure.md`.
- Described branches (a), (b), and (c) without recommending one.
- Documented that Quick Invite plus migration 179 already provides an unrestricted hidden-member oracle, changing the baseline for the owner’s decision.
- Supplied summary-only production sizing queries for global visibility states and inviter-specific neutral buckets.
- Evaluated consent-deferred, member-setting, one-time approval, and out-of-band proof alternatives.
- Traced the documentation, route, trigger, RLS, UI, and test blast radius.
- Separated future-only blocking, relationship suppression, account-bridge severance, and hard deletion, including downstream reference behavior.

## Validation Run

- `npm test -- --runInBand --runTestsByPath __tests__/profile-privacy-api.test.ts __tests__/migration-149.test.ts app/api/collaborators/quick-invite/route.test.ts` — passed: 3 suites, 33 tests.
- Confirmed all nine requested top-level headings are present.
- `git diff --check` — passed with no whitespace errors.
- Confirmed no application code or migration changed or ran.

## Remaining Risks and Follow-ups

- Production visibility counts remain unknown until a human runs the included summary-only queries.
- The lookup cap is undecided, so exposure is expressed as `R` attempts per account per day rather than a fabricated number.
- The owner still must choose the D-01 disclosure branch and the D-05 block/removal semantics before Phase 41 planning can continue.

## Workflow Note

The manual GSD quick-plan fallback was used because Codex has no native `/gsd-quick` slash-command runtime in this session.
