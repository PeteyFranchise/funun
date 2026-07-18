---
quick: 260714-phase-11-adversarial-fixes
status: complete
created: 2026-07-14
---

# Phase 11 Adversarial Review Fixes

## Objective

Close the remaining adversarial review findings for Phase 11 Presence & Messaging before PR #37 is merged.

## Scope

- Harden direct Supabase access so generic authenticated clients cannot bypass the message-request/rate-limit API by writing `dm_threads` or `dm_messages` directly.
- Keep API routes functional by moving trusted DM writes/transitions behind explicit service-role paths after session authentication and application-level checks.
- Tighten read-marker behavior so read rows imply thread participation.
- Remove declined threads from normal inbox data so a declined/blocked conversation cannot remain active with a misleading composer.
- Add migration/content tests for the privilege boundary.

## Files Expected To Change

- `supabase/migrations/056_harden_dm_write_privileges.sql`
- `__tests__/migration-056.test.ts`
- `app/api/dm/send/route.ts`
- `app/api/dm/request/accept/[threadId]/route.ts`
- `app/api/dm/request/decline/[threadId]/route.ts`
- `app/api/dm/request/block/[threadId]/route.ts`
- `app/api/dm/read/[threadId]/route.ts`
- `lib/social/dm.ts`
- `components/messages/MessagesPageClient.tsx`
- `.planning/phases/11-presence-messaging/11-VALIDATION.md`

## Validation Plan

- `npm test -- --runInBand __tests__/migration-056.test.ts __tests__/dm-send-gate.test.ts __tests__/dm-request-routes-review-fixes.test.ts __tests__/dm-request.test.ts __tests__/dm-unread.test.ts __tests__/presence.test.ts`
- `npm run lint`
- `npx tsc --noEmit`
- `npm test -- --runInBand`
- `npm run build`
- `npx supabase migration list`
- PR #37 Vercel checks after push

## Risks / Coordination Notes

- The new migration intentionally changes the trust boundary: client-side Supabase table writes to DM thread/message tables should fail unless routed through server APIs.
- Remote migration `056` was pushed and verified LOCAL=REMOTE on 2026-07-14.
