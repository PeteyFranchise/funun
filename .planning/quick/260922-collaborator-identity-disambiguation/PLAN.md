# Collaborator Identity Disambiguation — Claude Execution Plan

## Objective

Make same-name collaborators distinguishable on roster cards and everywhere the owner selects a collaborator, without exposing private profile or rights data. The first implementation should use data Funūn already has: the owner-entered structured name and, where the member is visible to this viewer, the member's unique public `@handle`. It must not require a migration.

## Product Decision

Use one consistent identity stack:

1. **Primary label:** the owner's roster name, assembled from `first_name`, `middle_name`, `last_name`, and `name_suffix`, with legacy `name` as the fallback. `assembleDisplayName()` already implements this rule (`lib/collaborators/index.ts:70-77`), and the edit form already captures first and last name (`components/collaborators/CollaboratorForm.tsx:38-42`, `:170-211`). Do not replace this with the member's legal name or canonical account name.
2. **Secondary label for a claimed, visible member:** `@handle`, rendered beneath the name and usable in search. The handle is unique account identity and is already a public-profile field (`lib/green-room/discover.ts:37-42`). It should remain live data rather than being copied onto the collaborator row, because a member can change it.
3. **Secondary state:** retain `Funūn member`, `Invited …`, or `Invite`, but do not rely on state alone as identity. In the screenshot it happens to distinguish one Eric from another; it will not distinguish two claimed Erics or two pending Erics.
4. **Legacy/unclaimed collision fallback:** when two active rows have the same normalized visible primary label and neither has a visible handle, show a small `Add last name` action that opens that row's existing edit form. If the row already has a last name yet still collides, use `Edit details` rather than inventing an identifier.
5. **Avatar initials:** derive initials from the same assembled primary name. The existing helper already yields first/last initials when a full name is present and only produces `ER` for the legacy single-name `Eric` rows (`components/collaborators/CollaboratorCard.tsx:32-37`).

The visual target for a claimed member is:

```text
ES
Eric Smith
@ericsmith
ASCAP
✓ Funūn member
```

For a legacy row without enough identity data:

```text
ER
Eric
Add last name
No PRO on file
Invited 1w ago
```

## Privacy Boundary — Required Before Rendering Handles

The current roster page already fetches claimed members' handles, but only uses each handle as a profile-link target (`app/(artist)/collaborators/page.tsx:31-47`; `components/collaborators/CollaboratorCard.tsx:122`, `:223-243`). Its comment says the query is RLS-scoped, yet People Search explicitly documents that profile-table SELECT is broad and that application code must enforce `is_public`, visibility, and bidirectional blocks (`lib/green-room/discover.ts:23-34`). Do not turn the existing raw map into visible `@handle` text as-is.

Create one server-only resolver, for example `lib/collaborators/identity-hints.server.ts`, that accepts the session client, service client, viewer id, and roster rows and returns a map keyed by collaborator row id:

```ts
export type CollaboratorIdentityHint = {
  handle: string | null
}
```

The resolver may return a handle only when all of these are true:

- the row has `claimed_by`;
- the profile has a non-empty handle and `is_public === true`;
- no block exists in either direction;
- `profile_visibility === 'public'`, or it is `connections_only` and the pair has an accepted connection.

Reuse the existing visibility contracts and block loader rather than creating a looser rule: `isDiscoverRowVisible()` delegates to the shared visibility contract (`lib/green-room/discover.ts:300-321`), and `loadBlockedIds()` deliberately uses the service client to enforce both block directions without disclosing who blocked whom (`lib/green-room/discover.ts:419-435`). Connections are loaded from accepted `connections` rows (`lib/green-room/discover.ts:401-416`). A missing, hidden, blocked, malformed, or failed profile lookup must degrade to `handle: null`, not reveal why.

Do not return or render a claimed member's account email, legal name, phone, address, PRO, IPI, publisher, MLC id, or SoundExchange id as an identity hint. The owner may still see values they entered on their own private roster in their existing rights UI; those values must not become the card's person-disambiguation channel. This also keeps the work compatible with Phase 41's explicit no-rights-data scope (`.planning/phases/41-collaborator-discovery-mobile-contact-matching/41-CONTEXT.md:25-28`, `:220-225`).

## Scope

### Task 1 — Extract a Shared Display Contract

Add a small pure module such as `lib/collaborators/display-identity.ts` with:

- normalization for duplicate comparison: trim, collapse internal whitespace, Unicode-safe lowercase;
- `collaboratorDisplayName(collaborator)`, delegating to `assembleDisplayName()`;
- `collaboratorInitials(collaborator)`;
- `formatMemberHandle(handle)` that adds exactly one leading `@` for display;
- `collaboratorSearchText(collaborator, hint)` so name parts and visible handle are searchable;
- duplicate/collision detection over active roster rows.

Use a distinct `CollaboratorIdentityHint` type rather than adding a fake persisted `member_handle` property to `CollaboratorProfile`. `CollaboratorProfile` models the database row and currently has no handle field (`lib/collaborators/index.ts:38-68`).

Extract a small presentational component, for example `CollaboratorIdentityLabel`, which renders primary name plus optional handle. Use it on cards and in both picker row types so the display contract cannot drift.

### Task 2 — Repair and Reuse Handle Resolution

Replace the raw claimed-id-to-handle query in `app/(artist)/collaborators/page.tsx:31-47` with the privacy-aware server resolver. Pass identity hints keyed by collaborator row id into `CollaboratorRoster`; row-id keys avoid ambiguity when more than one roster row points to the same member during pre-dedupe legacy states.

Extend `GET /api/collaborators` without breaking existing callers:

```json
{
  "data": ["existing collaborator rows"],
  "identityHints": {
    "collaborator-row-id": { "handle": "ericsmith" }
  }
}
```

Compute `identityHints` on the server with the same resolver. Existing consumers already read `json.data` (`components/collaborators/CollaboratorPicker.tsx:36-46`; `components/split-sheets/PartyPicker.tsx:55-65`), so an additive top-level field is backward-compatible. Keep the handle out of the collaborator mutation payloads and database table.

If profile/connection/block resolution fails, either omit all handle hints and return the roster or return the route's existing generic failure; choose one behavior and test it. Do not partially reveal block or hidden-profile state through a distinguishable error.

### Task 3 — Update the Roster Cards

In `CollaboratorCard`:

- render `@handle` immediately beneath the name when the safe hint is present;
- keep name/avatar linking only when the same safe handle is present;
- use the shared initials helper;
- accept a duplicate/collision flag and an edit-label callback;
- for a collision without a handle, render `Add last name` when `last_name` is blank, otherwise `Edit details`;
- give the overflow trigger an identity-specific accessible label such as `More actions for Eric Smith` instead of the current generic `More actions` (`components/collaborators/CollaboratorCard.tsx:140-150`);
- preserve the existing Invite/member state and rights nudges (`components/collaborators/CollaboratorCard.tsx:245-295`).

In `CollaboratorRoster`, calculate collision state once from the active list and pass it to each card. Continue keying cards by collaborator id (`components/collaborators/CollaboratorRoster.tsx:301-325`); never key by name or handle.

### Task 4 — Fix Every Selection Surface

The ambiguity matters most at selection time, so the card-only change is incomplete. Update both current picker implementations:

- `CollaboratorPicker`, used by Metadata Studio and Work Roster (`components/collaborators/CollaboratorPicker.tsx:9-20`; `components/vault/MetadataStudio.tsx:900`; `components/catalogue/WorkRoster.tsx:620`);
- `PartyPicker`, used by the split-sheet builder (`components/split-sheets/PartyPicker.tsx:13-34`, `:138-145`).

Both picker rows must render the shared primary/secondary identity label. Both searches currently match only `assembleDisplayName()` (`components/collaborators/CollaboratorPicker.tsx:66-70`; `components/split-sheets/PartyPicker.tsx:80-83`); change them to match the visible full name and visible handle. Preserve existing status and PRO detail as tertiary metadata rather than replacing it.

Do not show the duplicate-remediation action inside a picker. A picker must make the correct row identifiable; roster editing remains on the roster screen.

Phase 41 says selection-only pickers stay untouched by that phase's shared **creation** flow (`.planning/phases/41-collaborator-discovery-mobile-contact-matching/41-CONTEXT.md:87-100`). Treat this as a separate, bounded identity-presentation fix that the later shared add flow must consume, not as a reason to redesign picker creation behavior.

### Task 5 — Preserve the Contract in Phase 41

When Phase 41's add/search UI is planned, require it to consume the same `CollaboratorIdentityLabel` and server-produced hints. Do not let People Search, email reconciliation, roster cards, and pickers invent four different definitions of who may see a handle.

This plan does not resolve Phase 41 D-01's hidden-member disclosure decision. Until the owner resolves that conflict, the conservative rule above displays handles only within the already-established People Search visibility boundary (`.planning/phases/41-collaborator-discovery-mobile-contact-matching/41-CONTEXT.md:37-61`). If the owner later chooses a broader disclosure policy, change the central server resolver deliberately and update its privacy tests; do not loosen individual components.

## Files Expected to Change

Likely application files:

- `lib/collaborators/display-identity.ts` (new, pure display/search/collision contract)
- `lib/collaborators/identity-hints.server.ts` (new, server-only privacy-aware resolver)
- `components/collaborators/CollaboratorIdentityLabel.tsx` (new, shared presentation)
- `app/(artist)/collaborators/page.tsx`
- `app/api/collaborators/route.ts`
- `components/collaborators/CollaboratorCard.tsx`
- `components/collaborators/CollaboratorRoster.tsx`
- `components/collaborators/CollaboratorPicker.tsx`
- `components/split-sheets/PartyPicker.tsx`

Likely tests:

- `lib/collaborators/display-identity.test.ts`
- `lib/collaborators/identity-hints.server.test.ts`
- `components/collaborators/CollaboratorCard.test.tsx`
- `app/api/collaborators/route.test.ts`
- targeted existing roster/picker tests as needed

No migration is expected. If implementation discovers that bidirectional block/visibility checks cannot be performed through existing server helpers, stop and propose a human-gated migration rather than weakening the privacy predicate.

## Acceptance Criteria

- Two collaborators with the same first name are distinguishable whenever either has a structured last name or a safely visible unique handle.
- A claimed and visible member card shows `@handle`; the handle links to `/u/{handle}`.
- Hidden, connections-only-to-a-nonconnection, `is_public = false`, and either-direction-blocked members never contribute a handle or profile link.
- Legacy duplicate rows without a handle expose an `Add last name` or `Edit details` affordance.
- Card initials use first/last initials when a last name exists.
- Metadata Studio, Work Roster, and Split Sheet picker rows show the same identity stack as the roster card.
- Picker search matches both the assembled name and a safely visible handle, including queries typed with or without `@`.
- No public/member identity hint includes email, phone, legal name, address, PRO, IPI, publisher, MLC id, SoundExchange id, or an internal UUID.
- No database migration is added or applied.
- Existing invite, archive, favorite, profile-link, PRO, IPI-warning, and picker-selection behavior remains intact.

## Validation Plan

The repo uses Jest with `testEnvironment: 'node'` and has no jsdom/testing-library setup (`jest.config.js:49`). Keep decision logic pure and use `renderToStaticMarkup` for presentational components, matching the current collaborator roster test (`components/collaborators/CollaboratorRoster.test.tsx:1-13`).

Required cases:

1. structured `Eric Smith` renders `ES`; legacy `Eric` renders `ER`;
2. handle formatting never produces `@@name`;
3. search finds `Eric Smith` by `smith`, `ericsmith`, and `@ericsmith`;
4. normalized collision detection catches case and whitespace variants;
5. public profile yields a handle hint;
6. connections-only profile yields a hint only for an accepted connection;
7. `is_public = false`, outgoing block, incoming block, missing handle, and lookup failure yield no visible handle;
8. card static markup contains the safe handle and identity-specific accessible label;
9. card static markup does not contain forbidden private fields supplied in the collaborator fixture;
10. API response preserves `data` and adds only privacy-filtered `identityHints`.

Run tests by exact path so bracketed route paths cannot match zero tests silently:

```bash
npm test -- --runInBand --runTestsByPath \
  lib/collaborators/display-identity.test.ts \
  lib/collaborators/identity-hints.server.test.ts \
  components/collaborators/CollaboratorCard.test.tsx \
  components/collaborators/CollaboratorRoster.test.tsx \
  app/api/collaborators/route.test.ts
npm run typecheck
npm run lint
git diff --check
```

Also manually verify at desktop and narrow-mobile widths:

- two claimed people named Eric with different handles;
- a claimed Eric and an unclaimed legacy Eric;
- two unclaimed legacy Erics;
- a long last name and a 30-character handle do not overflow the card or picker;
- keyboard focus and screen-reader labels identify the intended row.

## Risks and Coordination Notes

- The current page's raw handle lookup is not a safe authorization boundary. Rendering it visibly without explicit filters could expose a hidden or blocked member.
- Legacy first-name-only rows cannot be perfectly disambiguated without additional owner input. Do not manufacture certainty from invite dates, PRO/IPI data, or internal ids.
- A future optional owner-only roster nickname (for example, `Eric — drummer from Detroit`) could be useful, but it would require product copy, a column/migration, sanitization, and transfer semantics. Defer it until real usage shows full name plus handle is insufficient.
- Do not merge duplicate rows as part of this visual fix. Phase 41 has separate identity-dedupe and reference-preservation work.
- Migrations are human-gated, production is at 227, and `main` is protected. This plan proposes no production or git operation.

