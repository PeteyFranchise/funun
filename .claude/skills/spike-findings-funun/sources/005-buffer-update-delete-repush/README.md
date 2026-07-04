---
spike: 005
name: buffer-update-delete-repush
type: standard
validates: "Given an already-pushed calendar, when the user edits/re-pushes, then a create/edit/delete diff avoids duplicate Buffer posts and never touches sent posts"
verdict: VALIDATED
related: [001, 002, 004]
tags: [buffer, idempotency, lifecycle]
---

# Spike 005: Update / delete / re-push

## What This Validates

Funūn slots change after a push — a user edits a caption, regenerates a hook, deletes a slot, adds one. Pushing again must **not** create duplicate Buffer posts. This proves the re-push **diff**: given the last push state + the current calendar, compute a `create` / `edit` / `delete` plan, protect already-sent posts, and stay idempotent.

## Research

| Question | Finding | Source |
|----------|---------|--------|
| Update a scheduled post? | **Yes** — `editPost(input: EditPostInput!): PostActionPayload!`; `EditPostInput { id, text, dueAt, assets, mode, schedulingType, … }` | reference.html |
| Delete a post? | **Yes** — `deletePost(input: DeletePostInput!): DeletePostPayload!`; `DeletePostInput { id }` → union `DeletePostSuccess \| NotFoundError` | reference.html |
| Response shapes | `editPost` → union `PostActionSuccess \| MutationError` (same as createPost); `deletePost` → union `DeletePostSuccess \| NotFoundError` | reference.html |
| Can a sent post be edited/deleted? | Treat as **no** — a `sent` post already published; editing/deleting can't un-send it. Never touch sent posts; surface the conflict. | derived from PostStatus lifecycle (spike 004) |

**Chosen approach:** persist per slot `{ buffer_post_id, contentSig, last_status }`. On re-push, diff the current calendar's content signatures against the stored ones → `createPost` (new), `editPost` (changed + not sent), `deletePost` (removed + not sent), no-op (unchanged).

## How to Run

```bash
node .planning/spikes/005-buffer-update-delete-repush/replan.mjs
```

Self-verifying: prints the create/edit/delete/noop/skip plan, 8 assertions, and a VERDICT (exit 0 = pass).

## Investigation Trail

1. **Confirmed the mutations exist** — `editPost` and `deletePost` (with union payloads), so the whole lifecycle is supported, not just create.
2. **Defined a content signature** `[caption, dueAt(UTC), imageUrl]` per slot so the planner only edits when something *actually* changed — avoids needless `editPost` calls.
3. **Built the diff** across five buckets: create (new slot, no stored id), edit (stored id + changed sig + not sent), delete (previously pushed + removed from calendar + not sent), no-op (unchanged), skip-sent (already live).
4. **Protected sent posts** — a slot whose Buffer post is `sent` is never edited or deleted even if its content changed; the change is reported as a conflict (can't un-send).
5. **Guarded against duplicates** — edits reuse the stored `buffer_post_id`; no slot appears in more than one action bucket. This is the whole point: re-push never blind-creates.
6. **Verified idempotency** — after applying the plan (signatures now match, new slot now tracked), a second `planRepush` yields **zero** creates/edits/deletes.

## Results

**Verdict: VALIDATED ✓** — all 8 assertions pass. `editPost`/`deletePost` cover the lifecycle; the diff planner avoids duplicates, protects live posts, and is idempotent.

**Signal for the build:**
- **Persist `{ buffer_post_id, contentSig, last_status }` per slot** (pairs with spike 004's sync, which fills `last_status`).
- **Re-push = diff, not re-create.** Compare current content signatures to stored → create/edit/delete. Never blindly re-push the whole calendar.
- **Never edit/delete a `sent` post** — surface the conflict ("this already went live in Buffer") instead.
- **Branch on the union payloads** — `editPost` → `PostActionSuccess | MutationError`; `deletePost` → `DeletePostSuccess | NotFoundError` (a `NotFoundError` on delete = already gone, treat as success).
- Combined with spike 004, this makes the integration a true two-way sync: Funūn plans + edits, Buffer publishes, status flows back, and re-pushes stay clean.
