# Phase 13: Network Tab & Trust & Safety - Context

**Gathered:** 2026-07-15
**Status:** Docs-only planning pass

## Phase Boundary

Phase 13 closes the Green Room safety loop before wider outreach goes live. Phase 12 creates feed/discovery surfaces; Phase 13 gives members control over relationships, blocks, reports, verification, and profile visibility.

This phase covers:

- `DISCOVER-04`
- `SAFETY-01` through `SAFETY-04`

This phase should not expand into self-serve ads, paid promotion review, automated legal/identity verification, or broad policy automation. Those are later monetization and operations phases.

## Locked Requirements

- A member can browse a Network tab showing following, followers, connections, and pending connection requests.
- A member can block another member.
- A blocked member cannot view the blocker's profile, message them, or see them in search/discovery results.
- A member can report a profile or a specific message for admin review.
- An admin can grant or revoke a verified badge on a member profile.
- A member can set profile visibility to public or connections-only.
- A member can hide their `Open to` status from public view.

## Existing Substrate

- `blocks` table and bidirectional `no_block()` helper exist in `supabase/migrations/035_connections_blocks.sql`.
- Existing social tables were wired to block enforcement in `supabase/migrations/038_block_enforcement_existing_tables.sql`.
- `connections` was later wired to `no_block()` in `supabase/migrations/044_connections_note.sql`.
- DM send/request flow already checks blocks and declined/request state in Phase 11 routes.
- `artist_profiles.is_public`, `artist_profiles.verified`, and `artist_profiles.open_to` already exist.
- Public profiles currently use `is_public` as the public visibility gate.
- Phase 12 Green Room feed/search must exclude blocked and non-public profiles.

## Primary Risks

- Block state can leak if users can query "who blocked me."
- Profile visibility must be enforced server-side, not just hidden in UI.
- Reports contain sensitive allegations and must not be visible to reported users.
- Verified badge grants are authority actions and must be admin-only.
- Search/discovery/feed must use the same privacy doctrine; otherwise users will find bypasses between surfaces.

## Canonical References

- `.planning/ROADMAP.md` §"Phase 13: Network Tab & Trust & Safety"
- `.planning/REQUIREMENTS.md` §"Trust & Safety"
- `.planning/phases/12-discovery-feed-people-search/12-MODERATION-REPORTING-GUARDRAILS.md`
- `supabase/migrations/035_connections_blocks.sql`
- `supabase/migrations/038_block_enforcement_existing_tables.sql`
- `supabase/migrations/044_connections_note.sql`
- `app/api/dm/send/route.ts`
- `app/api/dm/request/block/[threadId]/route.ts`
- `app/api/profile/route.ts`
- `app/u/[handle]/page.tsx`
- `components/profile/ProfileView.tsx`
- `components/profile/ProfileForm.tsx`

## Deferred Ideas

- Automated identity verification.
- Appeals workflow.
- Trust score or reputation scoring.
- Self-serve advertiser review.
- External moderation vendor integration.
- Public transparency report.

