# Collaborator Identity Disambiguation — Summary

Planned 2026-09-22. Executed 2026-09-23 on branch `collaborator-identity-disambiguation`
(off `origin/main`). Not pushed, no PR, no merge, **no migration**.

---

## What Shipped

One display contract for "who is this person," rendered identically everywhere a Member
picks or scans a collaborator, plus one server-side authorization boundary deciding when a
claimed member's `@handle` may be shown at all.

### New files

- **`lib/collaborators/display-identity.ts`** — pure contract: `normalizeIdentityText`,
  `collaboratorDisplayName`, `collaboratorInitials`, `formatMemberHandle`, `visibleHandle`,
  `memberProfileHref`, `collaboratorSearchText`, `matchesCollaboratorSearch`,
  `ambiguousCollaboratorIds`, `collaboratorEditActionLabel`, `readIdentityHints`, and the
  `CollaboratorIdentityHint` / `CollaboratorIdentityHints` types. No handle field was added
  to `CollaboratorProfile` — that models the database row, which has no handle column.
- **`lib/collaborators/identity-hints.server.ts`** — the single privacy-aware resolver.
- **`components/collaborators/CollaboratorIdentityLabel.tsx`** — the one rendering of
  primary name + optional `@handle`, consumed by the card, the list row and both pickers.

### Changed files

- `app/(artist)/collaborators/page.tsx` — the raw `user_profiles(id, handle)` read is gone,
  replaced by the resolver; passes `identityHints` keyed by collaborator **row id**.
- `app/api/collaborators/route.ts` — `GET` now returns `{ data, identityHints }`; `data` is
  byte-identical to before, so every existing `json.data` consumer is unaffected.
- `components/collaborators/CollaboratorCard.tsx` — renders the shared identity label,
  links name/avatar/handle only where the safe handle exists, names the person in the
  overflow trigger (`More actions for Eric Smith`), accepts an ambiguity flag, and gained a
  `variant` prop for the new list row.
- `components/collaborators/CollaboratorRoster.tsx` — computes collision state once, passes
  hints per row, and owns the new cards/list toggle.
- `components/collaborators/CollaboratorPicker.tsx`, `components/split-sheets/PartyPicker.tsx`
  — both render the shared identity label and both search the visible handle.
- `lib/green-room/discover.ts` — `isDiscoverRowVisible` widened from `DiscoverProfileRow` to
  `Pick<DiscoverProfileRow, 'profile_visibility'>` (every existing caller still satisfies it)
  so the resolver calls the *same* function People Search calls instead of re-deriving the
  rule from the contracts and drifting.

### Tests

`lib/collaborators/display-identity.test.ts` (16), `lib/collaborators/identity-hints.server.test.ts`
(14), `components/collaborators/CollaboratorCard.test.tsx` (10),
`components/collaborators/CollaboratorRoster.test.tsx` (12, was 3),
`app/api/collaborators/route.test.ts` (6, was 4) — **58 tests across the five files**.

---

## The plan was one day stale on `loadBlockedIds`

PLAN.md cites `loadBlockedIds` at `lib/green-room/discover.ts:419-435` as a function that
returns an empty set. PR #97 merged 2026-09-22 and changed it: it now **throws**
`BLOCK_LOOKUP_FAILED` on query error, because no `Set` value can express "everyone might be
blocked." `isBlockedRelativeTo` was renamed `mustBlockActionBetween` in the same work.

What was done:

- Both files were re-read as they now stand before any use.
- The resolver calls `loadBlockedIds` directly (not `mustBlockActionBetween`, which is a
  per-pair boolean; the roster needs one bidirectional set for a batch of members) and
  **catches the throw at the resolver boundary**, returning no hints at all. Degrading to
  `handle: null` is the fail-closed direction: no handle is shown, no 500 escapes to the
  roster or the picker, and the refusal is indistinguishable from every other refusal.
- The old swallow was **not** reintroduced. There is no `catch` inside `loadBlockedIds` and
  no empty-set fallback; the comment in `identity-hints.server.ts` says why, so a future
  edit cannot quietly restore the fail-open shape.
- The test for this path does **not** mock `loadBlockedIds` — it runs the real function
  against a failing fake `blocks` query, so the throw is genuinely exercised.

No other stale reference was found: line numbers for the card, roster, pickers, page and
`assembleDisplayName` all still matched.

---

## The privacy predicates, as implemented

A handle is returned only when **all** hold, evaluated in `resolveCollaboratorIdentityHints`:

1. the roster row has `claimed_by`;
2. the block set (service client, **both** directions) does not contain that member;
3. a profile row came back for that member;
4. `is_public === true` (strict — `null` is not public);
5. `isDiscoverRowVisible(profile, isConnected)` passes — i.e. `profile_visibility === 'public'`,
   or `connections_only` **with** an accepted `connections` row between the pair;
6. the handle matches migration 134's own grammar
   (`^[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*$`, length 3–30).

Every other outcome yields no hint, with no distinguishable reason. Additional refusals:
signed-out viewer, unclaimed row (no lookup happens at all), profile query error, block
lookup failure, non-string/malformed handle. A failed `connections` read only ever *removes*
handles, so it degrades safely without failing the batch.

The projection is `id, handle, is_public, profile_visibility` and is asserted as an exact
column list in the tests. `CollaboratorIdentityHint` has exactly one field, so there is
nowhere to put an email, legal name, phone, address, PRO, IPI, publisher, MLC id,
SoundExchange id or internal UUID (Phase 41 D-10/D-11/D-22).

**Chosen failure behaviour for the API** (PLAN.md asked for one and only one): `GET
/api/collaborators` omits all handle hints and still returns the roster. Tested.

---

## Owner addition beyond the plan — list view + card view

PLAN.md covered the card grid only. The owner asked for a dense list view as well, with a
toggle. There is no existing view-toggle precedent in this codebase, so:

- **One component, two layouts.** `CollaboratorCard` gained `variant: 'card' | 'row'` rather
  than spawning a `CollaboratorListRow`. A second component would own a second copy of the
  invite state machine, the ⋯ menu and — fatally — the identity markup. Both layouts render
  the same `<CollaboratorIdentityLabel>`; that is asserted directly in
  `CollaboratorRoster.test.tsx` (`it.each(['cards','list'])`).
- **List row hierarchy:** star, avatar, then name + `@handle` as the dominant element, with
  status and PRO as tertiary metadata to the right (PRO/IPI hidden below the `sm` breakpoint).
- **Control style:** a quiet segmented `rounded-lg border border-hairstrong` group with
  `aria-pressed`, sitting beside the existing "Add collaborator" secondary button and using
  the same border/text vocabulary. No new visual language introduced.
- **Persistence:** `localStorage['funun:collaborators:view']`, both read and write wrapped in
  `try/catch` for private windows and cleared site data.
- **Hydration:** the second option the brief allowed — **first paint always uses the prop
  default (`cards`); the stored preference is applied in a post-mount `useEffect`.** Reading
  storage during render would make the client's first paint disagree with the server HTML.
  The state is seeded from an `initialView` prop so tests can render both layouts without
  jsdom.

---

## Gate results (full CI `validate`, run 2026-09-23)

| Step | Result |
| --- | --- |
| `npm run security:migrations:verify` | **PASS** — "migrations 214–218 are transactional, collision-sensitive, least-privilege, checksum-pinned, and covered by read-only probes." |
| `npm run typecheck:strict` | **PASS** — no output |
| `npm run lint` (`--max-warnings=0`) | **PASS** — no findings (only the eslintrc-deprecation notice) |
| `npm test -- --runInBand` | **PASS** — 630 suites, 7710 tests, 0 failures |
| `npm audit --omit=dev --audit-level=moderate` | **PASS** — 0 vulnerabilities |
| `npm audit --audit-level=high` | **PASS** — 0 vulnerabilities |
| `git diff --check` | clean |

### Proof the privacy tests bite

The block predicate (`if (blockedIds.has(memberId)) continue`) was removed from the resolver
and the privacy suites re-run:

```
● resolveCollaboratorIdentityHints — every refusal looks the same › refuses when the viewer blocked the member (outgoing)
    - Expected  - 1
    + Received  + 5
    - Object {}
    + Object { "row-1": Object { "handle": "ericsmith", ...

● resolveCollaboratorIdentityHints — every refusal looks the same › refuses when the member blocked the viewer (incoming)
    ... same shape ...

Tests: 2 failed, 18 passed, 20 total
```

The predicate was restored and both suites return to 20/20 passing. Worth recording honestly:
the two *API-route* cases did **not** fail under that mutation — their coverage is the
response shape and the lookup-failure path, not the block predicate. The block predicate is
covered where it lives, in the resolver suite.

Two other assertions were caught being wrong while writing them, and were fixed rather than
loosened: a `not.toContain('pro')` substring check failed against the safe projection
because `pro` is a substring of `profile_visibility` (now compared as whole column names),
and a non-string `handle` in a hostile payload threw inside `visibleHandle` (now guarded
with `typeof`, which is the "malformed → null" rule the plan asked for).

---

## Outstanding — owner verification only

Automated tests cannot cover these; the agent did not perform them and does not claim them.
All require a browser at desktop and narrow-mobile widths:

- two claimed people named Eric with different handles;
- a claimed Eric beside an unclaimed legacy Eric;
- two unclaimed legacy Erics (the `Add last name` affordance);
- a long last name and a 30-character handle not overflowing the card **or the new list row**
  **or** either picker dropdown;
- keyboard focus order and screen-reader output identifying the intended row;
- **the new list view specifically** — its density, the `sm`-breakpoint hiding of PRO/IPI,
  and the toggle's appearance beside the existing header buttons;
- the toggle's persistence across a reload, and its behaviour in a private window where
  `localStorage` throws.

## Follow-ups

- **Phase 41 must consume this contract.** Its add/search UI, People Search and email
  reconciliation must use `CollaboratorIdentityLabel` and the server-produced hints, not a
  fourth definition of who may see a handle.
- Phase 41 **D-01 remains unresolved.** This work deliberately stays inside the existing
  People Search visibility boundary. A broader disclosure policy must change the central
  resolver and its privacy tests — never an individual component.
- Legacy duplicate rows are still duplicates. This was a presentation fix; Phase 41 owns
  identity dedupe and reference preservation.
- An owner-only roster nickname ("Eric — drummer from Detroit") stays deferred: it needs a
  column, a migration, sanitization and transfer semantics.

---

## Planning phase record (2026-09-22)

The original planning pass produced PLAN.md: it chose owner-entered full name plus a
privacy-safe public `@handle` as the shared pattern, added the legacy-duplicate fallback,
traced scope through the card, both pickers and the API, flagged the existing raw-handle
lookup as not an authorization boundary, and kept the work migration-free and separate from
Phase 41's D-01 decision. No application code was changed in that pass. The manual GSD
quick-plan fallback was used because Codex had no native `/gsd-quick` runtime in that session.
