# Member API boundary repair

## Objective

Prevent a Funūn Team Member identity from mutating Member-only collaborator and Writer's Room membership data, even when a stale browser page or direct API request bypasses the page-level redirect.

## Scope

- Add one reusable server-side Member-workspace gate.
- Require an authenticated account with a `user_profiles` Member row.
- Reject every identity carrying a Funūn staff role, even if legacy data also contains a Member row.
- Apply the gate to collaborator roster reads/writes, direct collaborator invites, quick invites, and Writer's Room member admission.
- Return an actionable “sign in with your personal Member account” error.
- Remove the exact accidental, unclaimed collaborator record created by `pete@funun.studio`, after confirming it has no Writer's Room membership.

## Files expected to change

- `lib/accounts/member-api-gate.ts`
- `lib/accounts/member-api-gate.test.ts`
- `app/api/collaborators/route.ts`
- `app/api/collaborators/[id]/route.ts`
- `app/api/collaborators/[id]/invite/route.ts`
- `app/api/collaborators/quick-invite/route.ts`
- `app/api/works/[workId]/members/route.ts`
- Focused route/source-contract tests

## Validation plan

- Prove unauthenticated, Team Member, profile-less, profile-query-error, and valid Member outcomes in the shared gate.
- Prove a Team Member request is rejected before any collaborator lookup, insert, invite, or work-access check.
- Run focused Jest tests, TypeScript, ESLint, full Jest, production build, and `git diff --check`.
- Verify the accidental production collaborator and its cascade-owned invitation are absent after cleanup.

## Risks and coordination notes

- The gate must fail closed and use server-established auth metadata plus the canonical Member profile row.
- Staff exclusivity matches `resolveAccountContext()` and the existing `(artist)` layout redirect.
- Cleanup is restricted to the exact unclaimed row identified during diagnosis; no active Member-owned data is in scope.
