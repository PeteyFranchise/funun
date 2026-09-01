# Collaborator member dedupe and recognition summary

## Outcome

Funūn now treats an active collaborator row as the reusable identity for that owner and email. If that row is already linked through `claimed_by`, the person is recognized as an existing Funūn member: no duplicate card is inserted and no new signup email or token is created.

The Shane and Stephan duplicate rows had already been archived by migration 148. Active roster reads now filter those archived repair rows, so the duplicate cards will disappear when this code is deployed.

## Changes

- Filtered `archived_at` rows from the Collaborators page and `/api/collaborators` roster response.
- Removed archived collaborators from client roster state immediately after archive.
- Added normalized-email reuse to the full collaborator creation endpoint.
- Changed both invitation endpoints to fail closed if the existing-roster lookup fails.
- Made `claimed_by` short-circuit signup invitation creation and email delivery.
- Added member-aware confirmation copy to the quick-invite modal and removed the irrelevant signup-link controls in that state.
- Added route tests for active filtering, reuse, lookup failure, and claimed-member invitation suppression.

## User impact

- Inviting Shane or Stephan again selects their existing verified roster identity.
- The Collaborators room shows one active card for each person.
- Existing members do not receive another “create your Funūn account” email.
- The inviter sees a simple confirmation that the person is already on Funūn.
- A database/query problem stops the action with an error instead of silently creating a duplicate.

## Verification

- Focused collaborator route tests: passed.
- Full Jest suite: 345 suites, 3,740 tests passed.
- TypeScript: passed.
- ESLint: passed with zero warnings.
- `git diff --check`: passed.

## Deployment note

No new database migration is required for this follow-up. Migration 148 already repaired and archived the known production duplicates; this code change makes the active UI honor that state and prevents the same application-level failure from recurring.
