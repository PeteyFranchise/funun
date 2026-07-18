---
phase: 11-presence-messaging
fixed: 2026-07-13T00:00:00Z
source_review: .planning/phases/11-presence-messaging/11-REVIEW.md
status: fixed
---

# Phase 11: Code Review Fix Report

## Summary

Addressed the Phase 11 review findings from `11-REVIEW.md`:

- CR-01: accept route now enforces recipient-only transitions atomically with `requester_id != auth.uid()` in the same UPDATE filter.
- CR-02: send route now blocks delivery when either direction has a `blocks` row and rejects sends into declined non-connection threads before rate-limit or insert work.
- CR-03: DM send and messages routes now reject non-UUID recipient ids before they can reach PostgREST `.or()` filters.
- WR-01: decline route now enforces recipient-only transitions atomically with `requester_id != auth.uid()` in the same UPDATE filter.
- WR-02: Composer's silent `403` path is now reachable because the backend returns `403` for blocked/declined delivery.
- IN-01: `buildThreadViews()` sort-fallback comment now matches the epoch fallback implementation.
- IN-02: Composer now treats a `200 OK` response without a usable `data.id` as a soft failure, removes the optimistic bubble, and surfaces the existing retry message.

## Files Changed

- `app/api/dm/send/route.ts`
- `app/api/dm/messages/route.ts`
- `app/api/dm/request/accept/[threadId]/route.ts`
- `app/api/dm/request/decline/[threadId]/route.ts`
- `components/messages/Composer.tsx`
- `lib/social/dm.ts`
- `__tests__/dm-send-gate.test.ts`
- `__tests__/dm-request-routes-review-fixes.test.ts`

## Validation

```text
npm test -- --runInBand __tests__/dm-send-gate.test.ts __tests__/dm-request-routes-review-fixes.test.ts __tests__/dm-request.test.ts __tests__/dm-unread.test.ts __tests__/presence.test.ts
PASS: 5 test suites, 48 tests

npm run lint
PASS

npx tsc --noEmit
PASS

npm test -- --runInBand
PASS: 23 test suites, 159 tests
```

## Remaining Notes

- Database-level migration push/UAT is still required before Phase 11 is production-ready.
- This fix used the GSD phase-review artifact path directly, not a native Codex `/gsd-*` slash command.
