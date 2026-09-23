---
type: quick
slug: block-aware-roster-reads
created: 2026-09-23
branch: block-aware-roster-reads
migration: none — see "Why no migration"
source: .planning/quick/260922-quick-invite-block-bypass/SUMMARY.md (the residual #96 could not reach)
---

# The roster still discloses a blocked member, and offers to message them

## The gap

`public.claim_collaborators()` runs at signup and stamps `claimed_by` across every roster whose
row matches the new account's email. No block can exist at that moment — blocks reference account
ids and the account is being created. **A block placed afterwards was never applied to the
already-stamped row.**

PR #96 gated every *write* path. This is the residual it structurally could not reach: there is
no write left to gate, only reads.

## What still leaks, after #98

PR #98's identity resolver already withholds the `@handle` for a blocked pair. Three things remain:

1. **`components/collaborators/CollaboratorCard.tsx:301`** — the `✓ Funūn member` badge.
2. **`components/collaborators/CollaboratorCard.tsx:202-204`** — a **Message link** to
   `/messages?with={claimed_by}`. **This is the worst of the three.** It is not merely disclosure;
   it is an affordance pointing at someone who blocked you. The DM route has its own gate so the
   send would fail, but offering the control is wrong and the failure is a poor experience for
   both people.
3. **`claimed_by` in payloads** — `app/(artist)/collaborators/page.tsx:24` selects `*`, and
   `GET /api/collaborators` returns rows; `[id]/invite` returns `alreadyMember`.

## Why no migration — this matches the platform, it does not invent a rule

**Blocking on this platform severs nothing.** `app/api/network/blocks/route.ts:38-42` inserts a
`blocks` row and stops. Existing connections and follows are left in place and filtered at read
time by `no_block()`. A block here is **a filter, not a severance**.

So the roster must behave the same way: **filter at read; do not unclaim the row.** Unclaiming
would destroy a real link, lose it permanently on unblock, and diverge from every other
relationship in the product. #96's summary proposed a migration; that was over-cautious, and
matching the existing semantics is both smaller and more consistent.

The residual after this fix — an owner querying PostgREST directly with their own token can still
read `claimed_by` — is a **platform-wide property of every relationship table**, not something
specific to collaborators. Connections and follows have exactly the same shape. Fixing it here
alone would be inconsistent; fixing it everywhere is its own piece of work. Record it, do not
attempt it here.

## The distinction this fix must not blur

- **Blocked** → suppress. Settled by D-03 and already required by `ROADMAP.md:2700-2704`.
- **Hidden but unblocked** → **leave exactly as it is.** That is Phase 41's D-01a, an open owner
  decision. This task must not quietly settle it in either direction.

Those need **two separate signals**, because they have different predicates: the handle requires
the full visibility chain (public / connections-only-with-connection), while the member badge
requires only that no block exists. Do not reuse one flag for both.

## Scope

Extend `lib/collaborators/identity-hints.server.ts`. It already computes the bidirectional block
set, so the second signal costs nothing extra:

```ts
export type CollaboratorIdentityHint = {
  handle: string | null        // full visibility chain — unchanged
  memberVisible: boolean       // NEW: false ONLY when a block exists in either direction
}
```

`memberVisible` must be `false` **only** for a block. A hidden, connections-only, or
`is_public: false` member stays `true` — they are a member, and whether that may be disclosed is
D-01a's question, not this one. When the block lookup fails, degrade to `false` (fail closed,
matching the resolver's existing posture after #97).

Then:

1. **`CollaboratorCard`** — when `memberVisible` is false, render neither the member badge nor the
   Message link, and do not link the name or avatar. The row still shows the owner's own entry:
   their name for that person, their notes, their PRO field. **It is the owner's roster and the
   row does not vanish** — only the member-derived affordances do.
2. **The roster page and `GET /api/collaborators`** — do not emit `claimed_by` for a
   non-`memberVisible` row. Use an explicit projection rather than `select('*')`; #98 established
   that pattern.
3. **`[id]/invite`** — do not return `alreadyMember` for a blocked pair. Choose and test one
   behaviour for what it returns instead, and make it indistinguishable from the ordinary case.

## Tests

- A block in **each** direction, tested separately, yields `memberVisible: false`.
- Hidden / connections-only / `is_public: false` **still yield `memberVisible: true`** — this is
  the assertion that stops D-01a being settled by accident. Say so in the test name.
- A blocked pair's card markup contains **no** member badge, **no** `/messages?with=` link, and
  **no** profile link. Assert on rendered markup via `renderToStaticMarkup`, as #98 does.
- `claimed_by` is absent from the roster payload and the API response for a blocked pair.
- A block-lookup failure yields `memberVisible: false` for every row.
- Existing unblocked behaviour is unchanged — badge, message link and handle all still render.

**Prove they bite:** remove the `memberVisible` check from the card, confirm the markup assertions
fail, restore it, and report the actual output.

## Verification gate

Every step CI `validate` runs, per `.claude/CLAUDE.md`, including `lint --max-warnings=0`.

## Out of scope

Phase 41's D-01a. The direct-PostgREST residual described above. Unclaiming or archiving rows.
