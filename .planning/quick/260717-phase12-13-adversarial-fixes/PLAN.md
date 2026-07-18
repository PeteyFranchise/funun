# Phase 12/13 Adversarial Review Fixes

## Objective

Fix the concrete issues found during the review-only adversarial pass for Phase 12 and Phase 13 planning.

## Scope

- Ensure People Search role filtering covers public profile roles, not only `industry_roles`.
- Ensure active Green Room placements stop rendering if their destination becomes non-public or hidden after activation.
- Prevent admin hard-delete of active/paused placements; require archive/lifecycle instead.
- Expand Phase 13 reporting planning to include Green Room posts, comments, reposts, and placements.

## Files Expected To Change

- `lib/green-room/discover.ts`
- `lib/green-room/feed-query.ts`
- `app/api/admin/green-room/placements/[id]/route.ts`
- `__tests__/green-room-discover.test.ts`
- `__tests__/green-room-feed-api.test.ts`
- `__tests__/green-room-placements-admin-api.test.ts`
- `.planning/phases/13-network-trust-safety/13-04-PLAN.md`
- `.planning/phases/13-network-trust-safety/13-VALIDATION.md`

## Validation Plan

- Focused Green Room discover/feed/placement tests.
- `npm run lint`
- `npx tsc --noEmit`

## Risks / Coordination

- Keep changes narrow; do not rework Phase 12 architecture.
- Preserve existing RLS/session-client posture.
- Do not begin Phase 13 implementation beyond planning doc corrections.

