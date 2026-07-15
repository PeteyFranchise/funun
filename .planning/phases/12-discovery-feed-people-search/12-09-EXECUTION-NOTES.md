# Plan 12-09 Execution Notes: People Search & Discover Filters

**Prepared:** 2026-07-15
**Status:** Ready after current Phase 12 PR review

## Product Intent

People Search is the Green Room's discovery spine. It should help artists and industry members find people by professional context without exposing private profile data or bypassing block/profile visibility rules.

V1 should feel like:

- Search by name, handle, role, genre, location, and openness.
- Filter by professional intent: open to collabs, open to opportunities, open to services, open to feedback, or open to industry outreach.
- Show enough context to decide whether to follow, connect, view profile, or message, but not enough to leak hidden/private profile fields.

## Recommended V1 Filters

- `q`: keyword against public name, handle, headline/bio snippets, and existing search vector where available.
- `role`: artist, producer, songwriter, engineer, attorney, publishing administrator, DJ, live sound mixing, supervisor, A&R, executive, and other stored profile roles.
- `openTo`: collaboration, opportunities, services, feedback, mentorship, industry outreach.
- `genre`: normalized genre string from public profile metadata.
- `location`: public location string.
- `relationship`: following, connected, outside network.
- `capability`: artist-capable, industry-capable, or both, using capability grants where available.

## Privacy Rules

- Requires authenticated viewer.
- Excludes profiles blocked in either direction.
- Excludes non-public or hidden profiles.
- Uses explicit public-safe column selection only.
- Does not expose email, legal name, private contact fields, private onboarding answers, admin notes, or unpublished capability state.
- Results should never include private activity counts that are not already public profile stats.

## Ranking Rules

Suggested initial ordering:

1. Exact handle/name match.
2. Existing connection/following relationship.
3. Role or open-to match.
4. Genre/location relevance.
5. Recent public activity or profile completeness.
6. Newer members with enough public profile context.

Ranking should return a short label such as:

- `Connected with you`
- `You follow this member`
- `Open to collaboration`
- `Producer in your genre`
- `Music supervisor near you`

## API Shape

Recommended endpoint:

- `GET /api/green-room/discover`

Query params:

- `q`
- `role`
- `openTo`
- `genre`
- `location`
- `relationship`
- `capability`
- `cursor`
- `limit`

Response shape:

```ts
type GreenRoomPersonResult = {
  id: string
  handle: string | null
  displayName: string
  avatarUrl: string | null
  headline: string | null
  roles: string[]
  genre: string | null
  location: string | null
  openTo: string[]
  relationship: 'self' | 'following' | 'connected' | 'outside_network'
  reasonLabel: string
  profileHref: string
}
```

## UI Placement

- Add a `PeopleSearch` module inside `/green-room`.
- Desktop: right rail module plus expanded Discover-tab body.
- Mobile: in-feed search module below composer/tabs.
- Results should include follow/connect/message actions only when the viewer is allowed to take that action.

## Tests To Add

- Unauthenticated discover request rejects.
- Blocked profile excluded in both directions.
- Hidden/non-public profile excluded.
- Query filters do not use private columns.
- Role/open-to/genre/location filters are applied server-side.
- Results shape omits sensitive fields.
- UI contract test confirms mobile-safe search controls and empty states.

