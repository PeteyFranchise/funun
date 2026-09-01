# Green Room people-search repair — summary

## Root cause

The Green Room query was working as written, but two design defects made new
members effectively undiscoverable:

1. The user-facing privacy setting said `public`, while a legacy `is_public`
   flag still defaulted to false and silently excluded the profile first.
2. Search used English web-search matching, which did not provide reliable
   prefix behavior for partial names or `@handles`.

Email remained deliberately absent from public profile columns and the search
vector, so there was no email lookup path at all.

Production inspection confirmed `@justifiednoise` and `@shanemaux` both had
valid search vectors and `profile_visibility = public`, but `is_public =
false`.

## Changes completed

- Migration 149 changes the legacy `is_public` default to true and aligns
  existing profiles with the privacy setting users can actually control.
- Name, username, and `@handle` input is normalized into safe prefix queries,
  supporting full and partial searches without passing user punctuation into
  raw Postgres query syntax.
- Exact account-email lookup is now supported through an authenticated
  SECURITY DEFINER function.
- The email resolver:
  - returns only a profile UUID;
  - never returns, displays, or adds email to the public search index;
  - excludes the viewer's own profile;
  - requires public or accepted-connection visibility;
  - enforces bidirectional blocks internally, even on a direct RPC call.
- The Green Room search prompt now says: “Search by name, @handle, username,
  or exact email.”
- Existing public-safe result columns remain unchanged.

## User effect

After migration 149 is applied, `@justifiednoise` and `@shanemaux` become
discoverable according to their existing public privacy setting. Future
artist profiles are discoverable by default unless their current privacy
setting restricts them to connections.

Members can search with a display name, full or partial username/handle,
leading `@handle`, or exact email. Results never reveal which field matched or
display the searched email.

## Verification

- Green Room discovery/API/migration suites: 33 tests passing in the full
  focused run; 30 passing after the final query-hardening adjustment.
- ESLint on changed TypeScript/TSX files: passing.
- `npm run typecheck`: passing.
- `git diff --check`: passing.

## Deployment checkpoint

Application changes require the normal commit/deploy flow. Migration 149 is
human-gated and must be applied with `npm run db:push`; its backfill is the
step that makes currently affected public profiles discoverable.
