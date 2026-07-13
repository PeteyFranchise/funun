# Buffer Sync & Lifecycle (status sync-back + re-push)

What turns the one-way push into a true two-way integration: reading Buffer's post status back into Funūn completion tracking (spike 004), and re-pushing an edited calendar without creating duplicates (spike 005). Both are proven, idempotent algorithms.

## Requirements

- **Persist `{ buffer_post_id, contentSig, last_status }` per slot** at push time. This is the join key for both sync and re-push. `contentSig = JSON.stringify([caption, dueAt(UTC), imageUrl])`.
- **Status sync-back is a POLL, not a webhook** (no webhooks documented). Periodically run the `posts` query filtered by `channelIds` + `status:[scheduled,sent,error]`; reconcile by `buffer_post_id`; map `sent`→complete using `sentAt`. Reconcile MUST be idempotent.
- **Re-push is a DIFF, never a blind re-create:** compare current content signatures to stored ones → `createPost` (new) / `editPost` (changed) / `deletePost` (removed).
- **Never edit or delete a `sent` post** — it already went live and can't be un-sent; surface the conflict instead.

## How to Build It

### Status sync-back (spike 004)

Query (filter by the campaign's channels + relevant statuses; paginate via `pageInfo.endCursor`):

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

Reconcile (pure + idempotent — see `sources/004-.../reconcile-status.mjs`):

```js
function reconcile(slots, postsResponse) {
  const byId = new Map((postsResponse?.data?.posts?.edges ?? []).map(e => [e.node.id, e.node]))
  return slots.map(slot => {
    if (!slot.buffer_post_id) return slot            // never pushed
    const bp = byId.get(slot.buffer_post_id)
    if (!bp) return slot                             // deleted in Buffer — report, don't silently change
    if (bp.status === 'sent') {
      const completed_at = bp.sentAt ?? bp.dueAt
      if (slot.completed && slot.completed_at === completed_at) return slot  // idempotent
      return { ...slot, completed: true, completed_at }
    }
    if (bp.status === 'error') return { ...slot, buffer_error: true }
    return slot                                      // scheduled/sending/draft — leave pending
  })
}
```

Run it on Launchpad open and/or a cron. It's safe to run repeatedly.

### Re-push diff (spike 005)

Mutations (both union payloads — branch on the type):

```graphql
mutation { editPost(input: { id: "bp_2", text: "…", dueAt: "…Z", mode: customScheduled, schedulingType: automatic, assets: [{ image: { url: "…" } }] }) {
  ... on PostActionSuccess { post { id status } }  ... on MutationError { message } } }

mutation { deletePost(input: { id: "bp_4" }) {
  ... on DeletePostSuccess { id }  ... on NotFoundError { message } } }
```

Plan (see `sources/005-.../replan.mjs`): for each current slot — no stored id → `create`; stored id + `sent` → skip (report if changed); stored id + sig unchanged → no-op; stored id + sig changed → `edit`. For each previously-pushed slot no longer in the calendar and not `sent` → `delete`. Apply, then persist the new ids/sigs. A re-plan after apply yields zero actions.

## What to Avoid

- **Don't wait for webhooks** — none are documented; poll the `posts` query.
- **Don't blind re-push** the whole calendar on every save — you'll duplicate every post. Diff on the stored content signature.
- **Don't edit/delete `sent` posts** — can't un-send; a `NotFoundError` on delete means it's already gone (treat as success), but a live `sent` post should be left alone and the conflict surfaced.
- **Don't forget idempotency** — both algorithms run repeatedly (cron sync, repeated saves); non-idempotent versions double-complete or double-create.
- **Don't reconcile status silently when a post vanished from Buffer** — the user likely deleted it there; report it.

## Constraints

- **Poll cost** counts against the rate limit (100 req/15min per client) — one `posts` query per campaign per sync tick is cheap; paginate only when `hasNextPage`.
- `PostStatus` enum: `draft | scheduled | sent | sending | error`.
- `editPost`/`deletePost` operate by Buffer post id — requires the `buffer_post_id` persisted at push time (createPost's returned `post.id`).
- Pure-logic validated; the live `posts`/`editPost`/`deletePost` happy-path shares the same auth/endpoint proven live in spike 001 (run 001's harness with a real key to confirm end-to-end).

## Origin

Synthesized from spikes: 004 (buffer-status-sync-back, VALIDATED), 005 (buffer-update-delete-repush, VALIDATED).
Source files: `sources/004-buffer-status-sync-back/`, `sources/005-buffer-update-delete-repush/`
