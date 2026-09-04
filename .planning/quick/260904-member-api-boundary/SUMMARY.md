# Member API boundary repair summary

## What changed

- Added a shared, fail-closed Member API gate that rejects unauthenticated users, all Funūn Team identities, and non-staff identities without a canonical `user_profiles` Member row.
- Added an actionable response telling Team Members to sign in with their personal Member account.
- Enforced the gate on collaborator roster reads, creation, editing, deletion, direct invitation, and quick invitation.
- Enforced the same gate before Writer's Room member admission or work-access resolution.
- Added direct gate tests plus route/source-contract regression coverage for the stale-Team-tab scenario.
- Confirmed the accidental production collaborator had no Writer's Room membership, then deleted that exact unclaimed row. Its one pending invitation was cascade-deleted; both remaining counts were verified as zero.

## Validation run

- Focused Jest: 5 suites, 31 tests passed.
- Full Jest: 442 suites, 4,156 tests passed.
- TypeScript: passed.
- ESLint: passed with zero warnings.
- Next.js production build: passed (122 static pages generated).
- `git diff --check`: passed.

## Remaining risks or follow-ups

- The code fix is local until committed and deployed; the production data cleanup is already complete.
- This closes the discovered collaborator/Writer's Room membership mutation family. A future security review can extend the same shared gate across every other Member-only API family for defense in depth.
