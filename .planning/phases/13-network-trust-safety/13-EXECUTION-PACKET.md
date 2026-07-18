# Phase 13 Execution Packet: Network Tab & Trust & Safety

**Prepared:** 2026-07-18
**Purpose:** Give Claude/Codex/Thomas a concise execution handoff for Phase 13 after Phase 12 stabilizes.
**Status:** Ready for execution planning; do not execute while Phase 12 code is actively changing unless the executor first reconciles branch state.

## Start Condition

Begin Phase 13 only after one of these is true:

- Phase 12 is merged or otherwise stable on the working branch.
- Claude has completed Phase 12 execution and the branch is clean enough for a fresh status/review pass.
- The executor explicitly scopes Phase 13 to planning-only work.

Before any Phase 13 edits, run:

```bash
git status --short --branch
git log --oneline -8
```

If Phase 12 files are dirty or mid-edit, stop and coordinate before changing shared feed/search/profile/DM files.

## Read First

- `.planning/ROADMAP.md` - Phase 13 goal and dependency notes.
- `.planning/REQUIREMENTS.md` - `DISCOVER-04`, `SAFETY-01` through `SAFETY-04`.
- `.planning/phases/13-network-trust-safety/13-CONTEXT.md` - phase boundary, existing substrate, risks.
- `.planning/phases/13-network-trust-safety/13-IMPLEMENTATION-BREAKDOWN.md` - wave ordering.
- `.planning/phases/13-network-trust-safety/13-VALIDATION.md` - validation doctrine and UAT.
- `.planning/phases/12-discovery-feed-people-search/12-MODERATION-REPORTING-GUARDRAILS.md` - Green Room reporting/moderation overlap.
- `.planning/phases/12-discovery-feed-people-search/12-ADVERSARIAL-REVIEW.md` - residual safety risks from feed/search.
- `.planning/phases/15-account-capability-model/15-CONTEXT.md` - capability/admin precedent.

## Code Areas To Inspect Before Editing

- `supabase/migrations/035_connections_blocks.sql`
- `supabase/migrations/038_block_enforcement_existing_tables.sql`
- `supabase/migrations/044_connections_note.sql`
- `app/u/[handle]/page.tsx`
- `app/api/dm/send/route.ts`
- `app/api/dm/request/block/[threadId]/route.ts`
- `app/api/follows/route.ts`
- `app/api/connections/route.ts`
- `app/api/green-room/feed/route.ts`
- `app/api/green-room/discover/route.ts`
- `lib/green-room/`
- `components/green-room/`
- `components/profile/ProfileView.tsx`
- `components/profile/ProfileForm.tsx`

## Recommended Execution Order

1. **13-01 Contracts/schema first.** Add typed trust/safety contracts, report target unions, visibility values, and schema migration. Reports must be private by default; verification changes must be auditable.
2. **13-02 Network tab.** Build viewer-owned network lists after contracts exist. Never expose "who blocked me."
3. **13-03 Hard block enforcement.** Audit every direct and indirect path: profile, search/discover, feed, DMs, follows, connections, comments, reactions, reposts, and placements.
4. **13-04 Reporting/admin review.** Add report creation for profile/message/Green Room targets and admin queue actions.
5. **13-05 Verification/profile visibility.** Add admin-only verified grant/revoke plus public/connections-only/open-to visibility controls.

## Non-Negotiable Safety Rules

- Block enforcement must be server-side and RLS-backed where possible, not UI-only.
- Reports must not be visible to reported users.
- A blocked party must not be able to infer who blocked them from list/query behavior.
- Public profile, People Search, Green Room feed, and buyer-facing future surfaces must share the same privacy doctrine.
- `artist_profiles.verified` must remain admin-only; member-owned profile update routes must never accept it.
- New private columns require column-level REVOKE/GRANT in the same migration.
- Realtime should never render raw untrusted/private rows directly; reload through filtered API routes.

## Phase 12 Collision Watchlist

Phase 13 will likely touch files that Phase 12 also touched:

- Green Room feed/discover APIs.
- Green Room card components.
- Public profile route and profile cards.
- Block-aware query helpers.
- Admin placement/report moderation paths.

If Claude modifies any of these during Phase 12, re-read the final Phase 12 diff before executing Phase 13.

## Validation Gate

At minimum:

```bash
npm test -- --runInBand __tests__/block-enforcement.test.ts __tests__/reports-api.test.ts __tests__/profile-privacy-api.test.ts __tests__/verification-admin-api.test.ts
npm run lint
npx tsc --noEmit
```

Also run the manual UAT from `13-VALIDATION.md` with three accounts: Artist A, Artist B, and Industry C.

## Handoff Summary

Phase 13 is the safety gate before broad Green Room/buyer expansion. Treat it as privacy infrastructure first and UI polish second. The most important outcome is not a visible Network tab; it is that every social surface agrees on blocks, reports, verification authority, and profile visibility.
