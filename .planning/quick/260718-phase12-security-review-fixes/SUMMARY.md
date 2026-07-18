# Phase 12 Security Review Fixes Summary

## What Changed

- Updated `green_room_can_view_post()` so non-owner reads require the post author's `artist_profiles.is_public = true`; owner reads remain allowed for the author's own posts.
- Added migration 058 so shared databases that already applied migration 057 receive the corrected visibility helper.
- Added app-layer author-publicness defense in Green Room feed author loading and post placement destination checks.
- Required linked tracks in published Green Room posts to resolve through a public parent vault project.
- Hardened discover/feed cursors by requiring UUID ids and normalized ISO timestamps before building PostgREST cursor predicates.
- Added regression coverage for private-author feed suppression, post placement author-publicness, private-project linked tracks, cursor UUID validation, and migration helper public-author enforcement.

## Validation Run

- `npm test -- --runInBand __tests__/green-room-discover.test.ts __tests__/green-room-feed-api.test.ts __tests__/green-room-posts-api.test.ts __tests__/green-room-placements-admin.test.ts __tests__/migration-057.test.ts` — passed, 5 suites / 71 tests.
- `npm run lint` — passed.
- `npm run typecheck` — not available in this repo; npm reported `Missing script: "typecheck"`.

## Remaining Risks / Follow-ups

- Migration 058 must be pushed/applied to the target Supabase database before the database-level privacy fix is live.
- The app-layer feed guard is intentionally a fallback; once migration 057 is live, RLS should prevent private-author posts from reaching the feed query in the first place.
