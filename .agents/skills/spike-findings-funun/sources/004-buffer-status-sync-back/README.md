---
spike: 004
name: buffer-status-sync-back
type: standard
validates: "Given posts scheduled via createPost, when Funūn polls the Buffer posts query, then it reconciles Scheduled→Sent back into slot completion, idempotently"
verdict: VALIDATED
related: [001, 003]
tags: [buffer, status, sync, graphql]
---

# Spike 004: Buffer status sync-back

## What This Validates

The synergy linchpin. Spike 001 proved Funūn can *create* a Buffer post; this proves Funūn can *read status back* and reconcile Buffer's lifecycle into per-slot completion tracking — the thing that makes the integration more than "CSV export with extra steps." Two parts: (a) **does the API even expose status?** (answered from docs) and (b) **is the reconciliation logic correct + safe to run repeatedly?** (proven here).

## Research

| Question | Finding | Source |
|----------|---------|--------|
| Read a post's status back? | **Yes** — `posts(input: PostsInput!, first, after): PostsResults!` with `filter: { channelIds, status: [PostStatus] }` | reference.html |
| Status values | `PostStatus` enum: `draft \| scheduled \| sent \| sending \| error` | reference.html |
| Post fields | `Post { id, status, dueAt, sentAt, channelId, text, assets }` — `sentAt` gives the go-live timestamp | reference.html |
| Single post by id? | No dedicated `post(id)`; use the `posts` query and match on the stored `buffer_post_id` (supports pagination via `pageInfo.endCursor`) | reference.html |
| Webhooks for status changes? | **Not documented** — treat sync as a **poll**, not push | data-model / search |

**Chosen approach:** persist the `buffer_post_id` on each slot when `createPost` returns; periodically run the `posts` query filtered to `status: [scheduled, sent, error]` for the campaign's channels; reconcile by id.

Live query (run via spike 001's harness with a real key to confirm end-to-end):
```graphql
query {
  posts(first: 50, input: {
    organizationId: "ORG"
    filter: { channelIds: ["chan_…"], status: [scheduled, sent, error] }
  }) {
    edges { node { id status dueAt sentAt } }
    pageInfo { hasNextPage endCursor }
  }
}
```

## How to Run

```bash
node .planning/spikes/004-buffer-status-sync-back/reconcile-status.mjs
```

Self-verifying: prints the reconciled slots, change/error/missing reports, 7 assertions, and a VERDICT (exit 0 = pass).

## Investigation Trail

1. **Confirmed the API can report status** — the earlier spikes only exercised `createPost`. The `posts` query + `PostStatus` enum + `Post.sentAt` close the read-back gap from the docs.
2. **Isolated the real risk as reconciliation**, and built it as a pure function mapping a Buffer `posts` response onto Funūn slots by stored `buffer_post_id`.
3. **Tested the lifecycle branches:** `sent` → complete (using `sentAt` as `completed_at`); `scheduled`/`sending` → leave pending; `error` → flag (`buffer_error`), never complete; never-pushed slot (no id) → untouched.
4. **Tested the "deleted in Buffer" case** — a stored id with no matching post in the response. Decision: don't silently un/complete; **report it** for review (user may have deleted it directly in Buffer).
5. **Verified idempotency** — ran the reconciler a second time over the already-updated slots; it applied **zero** new changes. This is essential because sync will run on a schedule (cron / on Launchpad open).

## Results

**Verdict: VALIDATED ✓** — all 7 assertions pass. API surface confirmed from docs; reconciliation logic proven, including idempotency and the two tricky edges (error, deleted-in-Buffer).

**Signal for the build:**
- **Poll, don't wait for webhooks** — no webhook is documented. A lightweight `posts` poll (on Launchpad open, and/or a cron) filtered by `status:[scheduled,sent,error]` + `channelIds` is enough.
- **Persist `buffer_post_id` per slot** at push time — it's the join key for sync (and for spike 005's edit/delete).
- **`sentAt` → Funūn `completed_at`** gives real go-live timestamps, not guesses.
- **Reconcile must stay idempotent** — proven here; safe to run repeatedly.
- **Surface "deleted in Buffer"** rather than reacting silently.
