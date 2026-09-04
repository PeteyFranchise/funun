# Sign-out polish and collaborator status reconciliation summary

## What changed

- Added a dedicated member-navigation appearance to `SignOutButton`: a logout icon, full-width rounded hover target, keyboard focus ring, and a compact icon-only state when the sidebar is collapsed.
- Preserved the existing simple text appearance for the admin console and choose-handle escape path.
- Added migration 179 to close the existing-account-first collaborator lifecycle gap. A collaborator inserted after someone already has a Funūn account now links automatically when the stored normalized email matches a confirmed Supabase Auth user with a canonical Member profile.
- Added an idempotent migration backfill for stale unclaimed rows. This is the path that repairs cards such as Eric's; existing claim lifecycle triggers then confirm the collaborator, accept pending invitations, and reconcile project/work membership.
- Kept the identity bridge server-owned: the browser still cannot set `claimed_by`, the trigger never overwrites an established claim, and Team/Client-Partner-only identities without a Member profile are not mislabeled as Member Accounts.
- Updated the Global Quick Capture source-contract test to match the already-shipped `isMemberAccount` account-context naming; the stale assertion was the only unrelated full-suite failure found during validation.

## Validation run

- Focused Jest: 2 suites, 8 tests passed.
- Full Jest: 437 suites, 4,133 tests passed.
- TypeScript: passed.
- ESLint: passed with zero warnings.
- Next.js production build: passed (122 static pages generated).
- `git diff --check`: passed.
- React best-practices review: no new hook, rendering, accessibility, or bundle concerns found; the SVG helper is hoisted outside the component and the collapsed action retains an accessible name.

## Remaining risks or follow-ups

- Migration 179 is human-gated and must be applied before Eric's production card can change. The agent did not push it.
- Automatic reconciliation intentionally requires an exact case-insensitive, whitespace-trimmed email match. If Eric signed up with a different email than the roster invitation, Funūn must not guess; the roster email or account identity will need an explicit correction.
