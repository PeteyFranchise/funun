# The roster no longer discloses a blocked member, or offers to message them — summary

## What this closes

PR #96 gated every collaborator **write** path. PR #98 withheld the `@handle`.
What remained was the residual #96 structurally could not reach: `claimed_by` is
stamped by `public.claim_collaborators()` at the member's signup, when no block
can exist — blocks reference account ids and the account is being created — and
a block placed afterwards was never applied to the already-stamped row. There
was no write left to gate, only **reads**.

Three leaks, now closed:

1. **The `✓ Funūn member` badge** — `components/collaborators/CollaboratorCard.tsx`.
2. **The Message link** to `/messages?with={claimed_by}` in the ⋯ menu. The worst
   of the three: not merely disclosure, but an affordance pointing at someone who
   blocked you. The DM route has its own gate, so the send would have failed —
   offering the control was still wrong, and the failure is a poor experience for
   both people.
3. **`claimed_by` in payloads** — the roster page's props and
   `GET /api/collaborators`, both of which used `select('*')`.

Plus the `alreadyMember: true` disclosure on `POST /api/collaborators/[id]/invite`.

## Two signals, not one

`CollaboratorIdentityHint` now carries two fields, both of them **decisions**:

```ts
export type CollaboratorIdentityHint = {
  handle: string | null        // full visibility chain — unchanged from #98
  memberVisible: boolean       // false ONLY when a block exists in either direction
}
```

They have different predicates and must not be collapsed:

| Condition | `handle` | `memberVisible` |
|---|---|---|
| `is_public: false` | withheld | **true** |
| `connections_only`, no connection | withheld | **true** |
| no handle / malformed handle | withheld | **true** |
| profile lookup fails | withheld | **true** |
| block, either direction | withheld | **false** |
| block lookup fails | withheld | **false** (fail closed) |

The row that matters most is `is_public: false`: **a hidden member stays
`memberVisible: true`.** They *are* a member. Whether their membership may be
disclosed to the roster owner is Phase 41's **D-01a**
(`.planning/phases/41-collaborator-discovery-mobile-contact-matching/41-CONTEXT.md`),
an open owner decision. Reusing one flag for both predicates would have settled
D-01a by accident, in the suppressing direction, with nobody deciding to.

The test whose name says so:

> `resolveCollaboratorIdentityHints — memberVisible is the BLOCK predicate only`
> › `a HIDDEN member is still memberVisible — hiding is not blocking, and D-01a stays open`

It walks `is_public: false`, `is_public: null`, `connections_only` with no
connection, and `handle: null`, and asserts `{ handle: null, memberVisible: true }`
for every one. A sibling test pins the other side: a failed **profile** lookup
does not clear `memberVisible`, because a profiles outage says nothing about
blocks, and conflating them would strip the member state off every unblocked row
during a transient failure — D-01a's question again.

## Why no migration

**Blocking on this platform severs nothing.** `app/api/network/blocks/route.ts`
inserts a `blocks` row and stops. Existing connections and follows are left in
place and filtered at read time by `no_block()`. A block here is **a filter, not
a severance**.

So the roster behaves the same way: **filter at read; never unclaim the row.**
Unclaiming would destroy a real link, lose it permanently on unblock, and diverge
from every other relationship in the product. #96's summary proposed a migration;
matching the existing semantics is both smaller and more consistent, and it is
why nothing in this change touches `supabase/migrations/`.

This reasoning is load-bearing. If a future change decides the roster *should*
sever on block, that is a product decision about what a block means platform-wide,
not a fix to this one surface.

## Known residuals

**Direct PostgREST is unchanged, and that is platform-wide.** An owner querying
PostgREST directly with their own token can still read `claimed_by` off their own
`collaborators` rows. This is **a property of every relationship table in the
product**, not something specific to collaborators: `connections`, `follows` and
the rest have exactly the same shape — RLS scopes rows to the owner, and the
application layer does the visibility filtering. Fixing it here alone would be
inconsistent; fixing it everywhere is its own piece of work. Recorded, not
attempted.

**Other surfaces that read `claimed_by` from their own queries** are outside this
task's scope and still carry the column unfiltered:

- `app/(artist)/vault/works/[workId]/page.tsx` → `components/catalogue/WorkRoster.tsx`
- `app/(artist)/ideas/page.tsx`
- `app/(artist)/split-sheets/[id]/page.tsx`
- `app/(artist)/dashboard/page.tsx`

Each would need the same resolver + redaction pair. `redactHiddenMemberLinks` is
exported and generic over any `{ id, claimed_by? }` row, so the wiring is small
when someone decides to do it.

**Two weaker membership tells survive in the ⋯ menu, deliberately.** On a row
whose `claimed_by` has been redacted they do not fire at all (the row reads as
unclaimed), so they only matter on a surface that hands the card an unredacted
row:

- Archive-vs-Delete distinguishes claimed from unclaimed. Gating it would change
  a data-lifecycle rule (claimed rows must not be hard-deleted, D-10/T-04-02) for
  a disclosure reason, which is the wrong trade.
- "Start a split sheet" *is* gated on `memberVisible`, because unlike Archive it
  is purely an entry point and the owner can still start a sheet from
  `/split-sheets/new`.

## Files changed

| File | What |
|---|---|
| `lib/collaborators/display-identity.ts` | `memberVisible` on the hint type; `isMemberVisible()`; `memberAffordances()`; block gate moved **inside** `visibleHandle()`; `readIdentityHints()` preserves suppression-only entries |
| `lib/collaborators/identity-hints.server.ts` | Resolver emits a hint for **every claimed row**; `memberVisible` = block predicate only; failed block lookup seeds `false` for every row; new `redactHiddenMemberLinks()` |
| `lib/collaborators/index.ts` | `COLLABORATOR_ROSTER_COLUMNS` — explicit projection replacing `select('*')` |
| `components/collaborators/CollaboratorCard.tsx` | Badge gated on `memberVisible`; ⋯ panel extracted as `CollaboratorCardMenu` so its markup is assertable; Message link, profile link and "Start a split sheet" all derive from the shared helper |
| `app/(artist)/collaborators/page.tsx` | Explicit projection; `redactHiddenMemberLinks` before props |
| `app/api/collaborators/route.ts` | Explicit projection; `redactHiddenMemberLinks` on `data` |
| `app/api/collaborators/[id]/invite/route.ts` | Block gate before **both** branches; generic `BLOCKED_ACTION_ERROR` instead of `alreadyMember` |

### The design choices worth flagging

**The block gate for the handle lives inside `visibleHandle()`, not at each call
site.** The handle reaches a page through four of them — the identity label's
text, the profile href, the picker's search index, and the ambiguity predicate —
and a gate repeated four times is a gate that gets forgotten once. The first
version of this change gated only the href, and the card's own test caught the
label still rendering `@ericsmith` for a blocked pair.

**A redacted blocked row keeps its Invite button.** The server strips
`claimed_by`, so the card reads the row as unclaimed and renders the ordinary
non-member layout. Suppressing the CTA would have put the tell straight back: a
lone card with no call to action is as legible as a badge. The invite route
refuses the pair with the shared, block-state-agnostic error, so the resting
state discloses nothing and acting discloses nothing specific.

**The invite route's refusal is `BLOCKED_ACTION_ERROR` / 400**, and it gates the
**unclaimed** branch too. Gating only the claimed one would have left
claimed-and-blocked (a generic 400) distinguishable from unclaimed-and-blocked
(a 200 and a sent email) — the very inference this closes. The body is
byte-identical to what `POST /api/collaborators`, quick-invite, follows,
connections, endorsements and wall posts already return (13-03).

## Tests

**+37 test cases** (38 added, 1 renamed away), 93 in the five affected suites,
7747 across the repo.

| Suite | Total | Covers |
|---|---|---|
| `lib/collaborators/identity-hints.server.test.ts` | 23 | both block directions separately; hidden ≠ blocked; failed block lookup → `false` for every row; failed profile lookup → `true`; blocked and unblocked rows side by side; `redactHiddenMemberLinks` |
| `lib/collaborators/display-identity.test.ts` | 25 | `isMemberVisible`; `memberAffordances`; `visibleHandle` block gate across all four consumers; suppression-only hint survives parsing |
| `components/collaborators/CollaboratorCard.test.tsx` | 20 | markup: no badge, no `/messages?with=`, no profile link, no "Start a split sheet"; owner's own entry intact; redacted row reads as unclaimed; unblocked baseline unchanged |
| `app/api/collaborators/route.test.ts` | 7 | `claimed_by` absent from the payload for a blocked pair, present for a hidden one; explicit projection, never `select('*')` |
| `app/api/collaborators/[id]/invite/route.test.ts` | 18 | generic refusal in both directions and on both branches; fail-closed on lookup error; `alreadyMember` unchanged for an unblocked member |

Assertions are on `renderToStaticMarkup` output, as #98 does — Jest here is
node-only with no jsdom.

### Proving the tests bite

The ⋯ panel only exists behind `menuOpen` state, and with no jsdom there is no
way to click it. A `not.toContain('/messages?with=')` assertion against the
closed card would have **passed whether or not the gate existed** — a check that
verifies nothing while printing green. The panel is therefore extracted as
`CollaboratorCardMenu` and rendered directly.

Two deliberate breaks confirmed the assertions fail:

**Break 1 — remove the `memberVisible` check from the card's badge.** 2 failures:

```
● CollaboratorCard — a blocked pair › renders no member badge, no Message link and no profile link
  Expected substring: not "Funūn member"
  Received string: … <div class="mt-3 w-full"><p class="…text-brandindigo justify-center">
                       <span aria-hidden="true">✓</span> Funūn member</p></div> …
```

**Break 2 — remove the block gate from `memberAffordances` and `visibleHandle`.**
4 failures, including the Message link reappearing in the menu markup with the
blocked member's account id as its target:

```
● CollaboratorCard — a blocked pair › renders no member badge, no Message link and no profile link
  Expected substring: not "/messages?with="
  Received string: <div role="menu" …><a role="menuitem" …
                     href="/messages?with=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb">Message</a>…

● CollaboratorCard — a blocked pair › withholds the Message link even when the handle would otherwise be visible
  Received string: …<a … href="/u/ericsmith">View profile</a>
                    <a … href="/messages?with=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb">Message</a>…
```

Both breaks were reverted and the full suite re-run green.

## Verification gate

Every step CI's `validate` job runs (`.github/workflows/quality.yml`):

| Step | Result |
|---|---|
| `npm run security:migrations:verify` | PASS — migrations 214–218 unchanged |
| `npm run typecheck:strict` | PASS — clean, no output |
| `npm run lint` (`--max-warnings=0`) | PASS — no warnings |
| `npm test -- --runInBand` | PASS — 630 suites, 7747 tests |
| `npm audit --omit=dev --audit-level=moderate` | PASS — 0 vulnerabilities |
| `npm audit --audit-level=high` | PASS — 0 vulnerabilities |

`npm run build` was not run: it is not part of CI's validate job and it clobbers
`.next` under a live dev server.

## Outstanding owner verification

Nothing below can be checked from a terminal. All of it needs a browser.

1. **The blocked row still looks like a normal roster card.** With a real blocked
   pair, open `/collaborators` in both the card grid and the list view: the name,
   PRO line and IPI nudge should be intact and the card should not look broken or
   half-empty where the badge used to be.
2. **The row is indistinguishable from a genuine non-member row.** Put a blocked
   row and a never-invited row side by side. They should look the same, Invite
   button included.
3. **The ⋯ menu.** Open it on a blocked row: Edit and Delete only. No View
   profile, no Message, no Start a split sheet.
4. **Clicking Invite on a blocked row** should show the ordinary inline
   "This action could not be completed" error under the button, not a crash and
   not anything naming a block.
5. **An unblocked member is unchanged** — badge, @handle, profile link, Message
   link all still present and working.
6. **A hidden (`is_public: false`) member still shows the badge and the Message
   link**, with no @handle. This is the D-01a behaviour being deliberately held
   constant; if the owner wants it changed, that is D-01a, not a bug in this work.
