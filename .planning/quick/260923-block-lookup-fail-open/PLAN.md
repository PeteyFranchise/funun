---
type: quick
slug: block-lookup-fail-open
created: 2026-09-23
branch: fix-block-lookup-fail-open
migration: none
---

# The shared block lookup fails open

## The defect

`loadBlockedIds()` destructures only `{ data }`, discarding the error, and `(data ?? [])` turns a
failed query into an empty set — **"nobody is blocked"**
(`lib/green-room/discover.ts:424-435`).

Every block gate built on it silently permits the action when the `blocks` query fails.

**This is already known.** `lib/green-room/placements-admin.ts:410-421` carries a warning:

> "The check is FAIL-CLOSED on error, deliberately, matching the RPC form. Do NOT reuse
> `loadBlockedIds` from lib/green-room/discover.ts: it discards its `error` and would flip this
> gate fail-open."

Someone found it, routed around it locally, and left a note — but the shared function was never
fixed, so eight other call sites still inherit it. That comment is the strongest evidence this
fix is wanted; it is also why the fix must update that comment, since its stated reason
disappears.

**Eleven lines below the defect, `resolveDiscoverEmailProfileId` checks `error` and throws
(`lib/green-room/discover.ts:441-444`).** The correct pattern is already in the same file.

## The fix

**`loadBlockedIds` throws on query error.** Match `resolveDiscoverEmailProfileId`'s shape.

Fail-closed cannot be expressed as a `Set` — there is no value meaning "everyone might be
blocked" — so throwing is the only honest signal. Returning an empty set on failure is precisely
the bug.

## Audit every caller and decide deliberately

Do not blanket-wrap in try/catch; that would recreate the defect with more steps. For each, state
what the user sees and why it is correct:

| Caller | Consequence of a failed lookup today |
|---|---|
| `lib/trust-safety/block-check.ts:41` (`isBlockedRelativeTo`) | Nine gated write routes permit the write |
| `lib/deals/catalog-query.ts:275` | A blocked artist's catalogue shows to the buyer |
| `lib/green-room/discover.ts:467` | Blocked people appear in People Search |
| `app/profile/page.tsx:137` | — determine |
| `app/u/[handle]/page.tsx:214` | A blocked viewer sees the profile that should 404 |

For the write gates, a throw must surface as the existing generic `BLOCKED_ACTION_ERROR` /
`BLOCKED_ACTION_STATUS` — **never as a raw Postgres message**. Plan 13-03's rule is no
distinguishable "you are blocked" state anywhere, and a database error string is distinguishable.

For the two server components, decide between an error boundary and an explicit fail-closed
render, and say which you chose. **Showing a blocked person's profile is worse than showing an
error** — that is the whole point of failing closed — but the failure must not announce a block.

## Also update the warning comment

`lib/green-room/placements-admin.ts:410-421` tells future readers not to reuse `loadBlockedIds`
*because it fails open*. Once that is false, the comment misleads. Rewrite it to record that the
hazard existed and was fixed, and keep its genuinely separate reason for not taking a client
parameter — that paragraph is about a different mistake and is still true.

## Tests

- `loadBlockedIds` **throws** when the query returns an error. Assert the throw, not a shape.
- `isBlockedRelativeTo` propagates, and each gated route returns the generic failure — **not** a
  raw database message. Assert the response body is byte-identical to the generic one.
- The write is **not performed** when the lookup fails. Assert the insert/update spy was never
  called, exactly as the #96 tests do.
- Each server component behaves as chosen, and **no response anywhere names a block or contains
  a Postgres error string**.
- Existing behaviour on the happy path is unchanged.

**Prove they bite:** restore the `data ?? []` swallow, confirm the suite fails, put it back, and
report the actual output.

## Out of scope

The signup-path gap from #96 — `claim_collaborators()` stamps `claimed_by` with no block
predicate and no route in the path. That needs a migration and is a separate task.

## Verification gate

Every step CI `validate` runs, per `.claude/CLAUDE.md`, including `lint --max-warnings=0`.
