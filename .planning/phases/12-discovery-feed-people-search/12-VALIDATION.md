---
phase: 12
slug: discovery-feed-people-search
status: draft
wave_0_complete: false
created: 2026-07-15
---

# Phase 12 — Validation Plan

Phase 12 has a large safety surface. Automated validation must prioritize authorization, visibility, block enforcement, repost invalidation, and linked-object privacy before UI polish.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Jest + TypeScript |
| Static checks | `npm run lint`, `npx tsc --noEmit`, `npm run build` |
| Full suite | `npm test -- --runInBand` |
| Migration checks | targeted Jest migration contract tests + `npx supabase migration list` after push |
| Manual UAT | two-account browser sessions for feed, realtime, blocks, visibility, reposts |

---

## Required Automated Coverage

### Pure helpers

Test areas:

- Post type validation.
- Visibility validation.
- Custom Audience validation and caps.
- Plain-language audience summary builder.
- Ranking score and ranking labels.
- Feed card normalization.
- Reaction enum validation.
- Repost eligibility.
- Linked object type validation.

Suggested tests:

- `__tests__/green-room-visibility.test.ts`
- `__tests__/green-room-ranking.test.ts`
- `__tests__/green-room-cards.test.ts`
- `__tests__/green-room-repost.test.ts`

### Migration contracts

Every feed migration should have file-based Jest tests that assert:

- Feed tables exist.
- RLS is enabled.
- No table has broad public/authenticated SELECT that bypasses visibility.
- `no_block()` appears in relevant SELECT/INSERT/UPDATE policies or equivalent SECURITY DEFINER helpers.
- Custom audience storage exists and is indexed enough for reads.
- Draft status cannot be visible to non-owner.
- Reposts reference originals and support invalidation/removal.
- Comments and reactions have ownership constraints.
- Admin placements are admin/service-writable only.

### API route tests

Read endpoint:

- Unauthenticated requests reject.
- `For You` returns only visible cards.
- `Following` excludes non-followed/non-connected activity.
- `Discover` excludes blocked and private profiles.
- `Opportunities` includes active formal opportunities and eligible feed-native opportunity posts.
- Cursor pagination is stable.
- Sponsored cards are labeled and inserted without replacing authorization checks.

Write endpoint:

- Composer rejects unknown post types.
- Composer rejects invalid visibility.
- Composer rejects custom audience over complexity cap.
- Composer rejects private linked releases/projects/tracks.
- Draft posts are readable only by owner.
- Followers-only posts are not visible to non-followers.
- Connections-only posts are not visible to non-connections.
- Custom Audience posts are visible only to matching audience.

Interactions:

- Comments respect post visibility and blocks.
- Reactions respect post visibility and blocks.
- Reposts respect post visibility and owner resharing setting.
- Removed/muted reposts do not appear.
- Reposts disappear or become unavailable when original is deleted/private.

---

## Adversarial Matrix

| Threat | Expected Mitigation | Automated? |
|--------|---------------------|------------|
| Direct API fetch sees Followers-only post as non-follower | Server-side visibility predicate rejects/excludes | yes |
| Direct API fetch sees Connections-only post as non-connection | Server-side connection predicate rejects/excludes | yes |
| Custom Audience leaks to unmatched member | Audience predicate rejects/excludes | yes |
| Draft post leaks in feed | Owner-only read | yes |
| Blocked user sees blocker post | Bidirectional block exclusion | yes |
| Blocked user comments/reacts/reposts | Write rejected | yes |
| Private project attached to public post | Composer rejects linked object | yes |
| Release made private after repost | Repost hidden/unavailable | yes |
| Original owner disables resharing | New repost rejected; existing behavior follows product decision | yes |
| Repost lacks attribution | Card normalizer requires original actor fields | yes |
| Sponsored placement looks organic | Card type requires `Sponsored`/`Featured` label | yes |
| Realtime receives unauthorized row | Client refresh validates via feed API; no blind row insertion | partial |
| Audience summary reveals private membership count | Summary is rule-based, not count/enumeration-based | yes |

---

## Manual UAT

Use at least three accounts:

- Artist A.
- Artist B.
- Industry member C.

Recommended scenarios:

1. A creates Public, Followers, Connections, Draft, and Custom Audience posts.
2. B follows A; C does not. Confirm each feed tab displays correct visibility.
3. A and C connect. Confirm Connections-only posts become visible to C.
4. A targets Custom Audience to role/location/genre and one specific person. Confirm only intended viewers see it.
5. B blocks A. Confirm neither sees the other's feed activity, comments, reactions, or repost affordances.
6. A attaches a public release; card opens `/r/[projectId]`.
7. A attempts to attach a private release; composer rejects.
8. B reacts and comments. A deletes/removes/comment reports as applicable.
9. B reposts A. A disables/removes reshare; verify the repost disappears or becomes unavailable.
10. Admin creates a Featured/Sponsored placement. Confirm label, placement, and expiry.
11. New post arrives while B is mid-feed. Confirm new-activity pill appears and page does not jump.
12. Mobile: tabs scroll, composer works, reaction picker works by tap, right rail modules become in-feed modules.

---

## Validation Gates By Plan Wave

### Wave 1

- Pure helper tests pass.
- Migration contract tests pass.
- No broad RLS SELECT shortcuts.

### Wave 2

- Feed read/write API route tests pass.
- Visibility and custom audience tests pass.
- Cursor pagination tests pass.

### Wave 3

- Comments/reactions/reposts tests pass.
- Repost invalidation and owner controls pass.

### Wave 4

- UI compiles.
- Green Room nav route works.
- Realtime new-activity behavior manually verified.
- Mobile layout manually verified.

### Wave 5

- Search/discover filters pass.
- Admin placement tests pass.
- Sponsored labeling manually verified.

---

## Sign-Off Checklist

- [ ] All `FEED-01` through `FEED-18` have automated or manual validation.
- [ ] All `DISCOVER-01` through `DISCOVER-03` have automated or manual validation.
- [ ] RLS policies are verified by migration tests.
- [ ] Block enforcement is verified for read and write paths.
- [ ] Custom Audience is server-enforced.
- [ ] Repost invalidation is verified.
- [ ] Linked object privacy is verified.
- [ ] Sponsored/Featured labels are visually obvious.
- [ ] Realtime does not move reading position unexpectedly.
- [ ] Full Jest passes.
- [ ] Lint, TypeScript, and build pass.
- [ ] Human UAT complete.

---

*Phase: 12-Discovery, Feed & People Search*
*Validation plan drafted: 2026-07-15*
