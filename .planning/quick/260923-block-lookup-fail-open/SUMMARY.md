---
type: quick
slug: block-lookup-fail-open
created: 2026-09-23
completed: 2026-09-23
branch: fix-block-lookup-fail-open
migration: none
status: complete
---

# The shared block lookup fails open — fixed

`loadBlockedIds()` now throws when the `blocks` query fails. It previously destructured only
`{ data }`, and `(data ?? [])` turned a failed query into an empty set — "nobody is blocked" —
which every gate built on it read as permission.

Fail-closed cannot be expressed in the return type: there is no `Set` value meaning "everyone
might be blocked". So the helper throws, and **each caller decides its own refusal shape**. No
blanket try/catch was added; that would have recreated the defect with more steps.

## The one-line change, and the part that is not one line

`lib/green-room/discover.ts` — `loadBlockedIds` checks `error` and throws, matching
`resolveDiscoverEmailProfileId` eleven lines below it.

One deliberate difference from that neighbour: the thrown message is **generic and never built
from `error.message`**. `resolveDiscoverEmailProfileId` interpolates the Postgres text because its
failure carries no safety meaning; this one's does. `BLOCK_LOOKUP_FAILED` (`'This request could not
be completed'`) is exported, names no block, contains no database text, and is the only string a
caller that simply propagates can surface. The driver error is preserved on `.cause` for server
logs, so the failure stays debuggable without becoming visible.

## Per-caller decisions

| Caller | Decision | What a user sees on a failed lookup |
|---|---|---|
| `lib/trust-safety/block-check.ts` (write gates) | Catch → return `true` | The byte-identical generic `{"error":"This action could not be completed"}` / 400 a real block returns. The write never runs. |
| `lib/deals/request-target.ts:127` | Inherits the gate → `{ ok: false }` | "This isn't available" — the same refusal an invisible profile or an unresolvable owner already produces. |
| `lib/deals/catalog-query.ts:275` | Propagate | The catalogue fails to load instead of listing a blocked artist's works. |
| `lib/green-room/discover.ts:467` (People Search) | Propagate | The route's existing generic `Failed to search people` 500. No result page. |
| `app/profile/page.tsx:137` | Propagate | A generic error page. The owner's own wall/endorsements/comments do not render. |
| `app/u/[handle]/page.tsx:214` | Catch → `notFound()` | The same 404 a real block, a private profile and a nonexistent handle already render. |

### Why the write gates catch

`isBlockedRelativeTo` was **renamed to `mustBlockActionBetween`** and now fails closed internally.

The rename is the point, not decoration. A function named `isBlockedRelativeTo` that answers
`true` because the lookup failed asserts more than the data carries — and while `loadBlockedIds`
swallowed its error, it answered `false` ("nobody is blocked") instead, which is a fail-open gate
wearing a predicate's name. `mustBlockActionForEmail`, added in #96, was already named this way for
exactly this reason and now delegates to it.

The catch is the *one* boundary where a refusal must be byte-identical to a real block's refusal.
Propagating here would surface a 500 — a different shape from the generic 400 a block produces —
which is precisely the distinguishable state 13-03 forbids. Nine routes pass through this gate:
follows, connections, wall, endorsements, release-comments (id-shaped) and collaborators POST,
collaborators PATCH, quick-invite, works members (email-shaped).

### Why `/u/[handle]` 404s but `/profile` does not

`/u/[handle]` has exactly one refusal shape by design — a nonexistent handle, a private profile
and a block are already indistinguishable there. An unreadable block set is simply one more reason
this viewer may not be shown this profile, so it joins the same 404 rather than introducing a
second, differently-shaped failure. Fail-closed matters more than accuracy: rendering the page on
a lookup failure shows a blocked person's profile to the person they blocked.

`/profile` is the owner's own page, which provably exists — a 404 there would be a lie that sends
them hunting for a deleted account. The throw propagates instead, so the page renders nothing at
all. `blockedIds` is the only filter applied to the wall/endorsement/comment authors below it, so
continuing with an empty set renders content from exactly the people this owner blocked. A missing
page is recoverable; a rendered block-evading post is not.

## The stale warning comment

`lib/green-room/placements-admin.ts` told readers not to reuse `loadBlockedIds` *because it
discards its error and would flip this gate fail-open*. That reason is now false, so the paragraph
was rewritten to record that the hazard existed and was fixed — the note is the strongest evidence
this fix was wanted, and deleting it would erase why the file ever routed around the helper. Its
genuinely separate second paragraph (why `checkViewerBlock` takes **no** client parameter — a
caller cannot be handed the wrong instrument if it cannot be handed one) is untouched and still
true. `__tests__/green-room-placements-block-check.test.ts` carried the same stale contrast in a
test comment; updated, and that gate stays pinned on its own terms.

## Tests

`__tests__/block-lookup-fail-closed.test.ts` — 19 new tests:

- `loadBlockedIds` throws; the message names no block and carries no Postgres text; `.cause` keeps
  the driver error; the happy path and the *successful* empty result are unchanged (the
  distinction the old code destroyed).
- `mustBlockActionBetween` fails closed and does **not** propagate, through both the id and email
  entry points.
- Six gated write routes: response body byte-identical to `JSON.stringify({ error:
  BLOCKED_ACTION_ERROR })`, status 400, and the insert/upsert spy never called — the #96 rule that
  a route which writes then apologises has already done the thing.
- People Search: generic 500, and the body contains no `results` array.
- `/u/[handle]`: `notFound()`, and the queries below the gate never run; the happy path still
  proceeds past it.
- `/profile`: rejects with the generic message, and `loadWall` / `loadEndorsements` /
  `loadReleaseComments` are never called.
- Every surfaced string is asserted to contain no `block`, `invalid input syntax`, `uuid`,
  `row-level security` or `postgres`.

`lib/deals/catalog-query.test.ts` — 1 new test: a failed lookup rejects rather than returning an
unfiltered page. Its `jest.mock` factory now spreads `requireActual` so the assertion pins the
shipped `BLOCK_LOOKUP_FAILED` rather than a retyped copy.

**Proof they bite.** Restoring the `data ?? []` swallow failed 13 of the 73 tests across all three
suites — every helper assertion, every route, both pages. The follows-route failure is the clearest
picture of the defect: it did not fail on a status mismatch but on
`TypeError: Cannot destructure property 'error' of '(intermediate value)' as it is undefined` at
`app/api/follows/route.ts:35` — the route had walked past the gate and **called the upsert**. The
fix was restored and all 73 pass.

## Verification gate

Every step of CI's `validate` job:

| Step | Result |
|---|---|
| `npm run security:migrations:verify` | PASS (migrations 214–218) |
| `npm run typecheck:strict` | PASS |
| `npm run lint` (`--max-warnings=0`) | PASS |
| `npm test -- --runInBand` | PASS — 627 suites, 7659 tests |
| `npm audit --omit=dev --audit-level=moderate` | 0 vulnerabilities |
| `npm audit --audit-level=high` | 0 vulnerabilities |

No migration. Branch `fix-block-lookup-fail-open`, not pushed.

## Out of scope — still open

The signup-path gap from #96 remains unfixed and is **not** addressed here: `claim_collaborators()`
stamps `claimed_by` with no block predicate and no route in the path, so a blocked member's
membership can still be confirmed when the target signs up. That needs a migration and is a
separate task.

Also noted, not acted on: `mustBlockActionBetween` swallows the infrastructure error silently
(repo convention is no `console.log` in committed code). `.cause` carries it as far as the throw,
but nothing currently logs it. If block-gate failures need to be observable, that is a logging
decision, not a correctness one.
