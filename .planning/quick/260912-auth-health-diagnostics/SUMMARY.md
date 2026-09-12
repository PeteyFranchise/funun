# Privacy-Safe Authentication Diagnostics — Summary

## Completed

- Added an allowlisted authentication failure vocabulary and random support
  reference IDs.
- Added best-effort browser and callback reporting across sign-in, signup,
  invitation claim, recovery, password update, sign-out, and account switching.
- Added a bounded public ingestion route that rejects non-JSON, oversized,
  malformed, server-forged, and identity-bearing payloads.
- Added a gated IT Team Auth Health console and API with seven-day aggregates,
  recent support references, and a clear inactive state.
- Added human-gated migration candidate 218 for the RLS-protected diagnostic
  table with explicit browser-role revocation and 30-day application cleanup.
- Updated the authoritative migration ledger. Migration 218 was not applied.

## Privacy and security posture

The diagnostic event schema cannot accept or persist email addresses, user IDs,
IP addresses, user agents, URLs, credentials, tokens, or raw provider errors.
The ingestion route never controls authentication success, and both ingestion
and callback reporting fail open for the person authenticating. Diagnostic reads
are independently authorized through the existing `it-team` room gate.

## Verification

- Focused auth/diagnostic tests: 38 passed.
- Corrected lifecycle expectation tests: 29 passed.
- Full Jest suite: 584 suites, 7,108 tests passed.
- TypeScript: `tsc --noEmit` passed.
- Strict TypeScript: unused-local and unused-parameter checks passed.
- ESLint: passed with zero warnings.
- Next.js production build: passed; both new routes were emitted.
- Existing beta security migration verifier: passed.
- Production dependency audit: zero vulnerabilities.
- Full dependency audit: zero vulnerabilities.
- `git diff --check`: passed.

## Human-gated follow-up

- Review and explicitly approve migration 218 before applying it.
- After migration application, open Auth Health as an IT or Leadership Team
  Member and run controlled sign-in/recovery failures to confirm ingestion,
  display, and 30-day cleanup behavior.
