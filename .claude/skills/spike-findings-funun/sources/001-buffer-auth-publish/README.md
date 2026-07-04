---
spike: 001
name: buffer-auth-publish
type: standard
validates: "Given a Buffer personal API key (BYOK), when Funūn calls the new GraphQL API, then it can read the account's channels and create a scheduled post"
verdict: PARTIAL
related: []
tags: [buffer, auth, graphql, byok]
---

# Spike 001: Buffer auth + publish (BYOK)

## What This Validates

Given a Buffer **personal API key**, when Funūn calls the new GraphQL API (`https://api.buffer.com`), then it can (a) read the account + organizations + channels and (b) create a scheduled post. This is the make-or-break feasibility question: Buffer's third-party OAuth is **closed to new developers in 2026**, so a personal API key (BYOK) is the *only* path a new product like Funūn has. If BYOK doesn't work end-to-end, the whole integration vision changes.

## Research

Docs checked (Buffer developer site + 2026 access-model analysis):

| Question | Finding | Source |
|----------|---------|--------|
| Third-party OAuth for new apps? | **Closed.** Old REST app registration shut (no client_id); new GraphQL third-party OAuth documented but not enabled | zernio.com/blog/buffer-api |
| Only open auth path? | **Personal API keys** (BYOK) from publish.buffer.com/settings/api — Bearer token, no expiry, up to 5 keys on paid / 1 on Free | Buffer docs |
| Endpoint | `https://api.buffer.com` (GraphQL POST) | your-first-post guide |
| Auth header | `Authorization: Bearer <key>` | data-model guide |
| Account/orgs query | `query { account { id organizations { id name } } }` | data-model guide |
| Channels query | `query { channels(input: { organizationId: "…" }) { id name service } }` | data-model guide |
| Create scheduled post | `createPost(input: { text, channelId, schedulingType: automatic, mode: customScheduled, dueAt: <ISO8601 UTC> })` → union `PostActionSuccess | MutationError` | posts-and-scheduling guide |
| Image attach | `assets: [{ image: { url: "<public url>" } }]` — **no upload; URL must be publicly accessible** | create-image-post example |
| Rate limits | 100 req / 15 min per client, 2000 / 15 min per account | zernio |
| Pricing | Bundled into per-channel plan ($6+/channel); no separate API tier | zernio |

**Chosen approach:** BYOK personal API key + GraphQL `createPost` with `mode: customScheduled` and a `dueAt` timestamp. Images via `assets:[{image:{url}}]` — a natural fit for Funūn's already-public `cover_art_url`.

## How to Run

```bash
node .planning/spikes/001-buffer-auth-publish/server.mjs
# open http://localhost:5170
```

1. Paste your Buffer personal API key (get one at https://publish.buffer.com/settings/api — requires a paid Buffer plan with at least one connected channel).
2. Click **Get account + organizations** → confirms auth + reads orgs.
3. Click an org → channels load. Click a channel to target it.
4. Click **Schedule test post** → creates a post ~1h out (delete it in Buffer afterward). Optionally paste a public image URL.
5. Use **Export JSON** to save the forensic log.

The key is entered in the browser, forwarded server-side to Buffer, and held in memory only — never written to disk or committed.

## Observability

Forensic in-memory log: every Buffer call records `{ts, category, label, status, ms, hasGraphqlErrors, errorSummary}`. Viewable in-page (Refresh log), exportable as JSON (Export JSON), resettable. Categories: `request`, `response`, `error`.

## Investigation Trail

1. **Built the harness** as a zero-dependency Node HTTP server (Node 18+ global `fetch`), proxying GraphQL server-side to dodge CORS and keep the key off the client network tab.
2. **Smoke test with a dummy key (no real credentials yet):** `POST /api/account` with `apiKey: "dummy-invalid-key"` →
   ```json
   { "status": 401, "json": { "errors": [ { "message": "Access token is not valid", "extensions": { "code": "UNAUTHENTICATED" } } ] } }
   ```
   This is a **live** response from `https://api.buffer.com`. Significance: (a) the endpoint is real and reachable; (b) the `account` query **parsed successfully server-side** — a malformed query would return a GraphQL *validation* error, not `UNAUTHENTICATED`; (c) Bearer auth is confirmed as the gate and correctly rejects bad keys. So endpoint + auth mechanism + account-query shape are validated against the live API without any credentials.
3. **Remaining:** run with a real personal key to confirm channels list and `createPost` succeed end-to-end (the human-verification checkpoint below).

## Results

**Verdict: PARTIAL** (pending live-key run).

Validated against the live API with no credentials:
- ✓ `https://api.buffer.com` is a live GraphQL endpoint accepting POST.
- ✓ The documented `account { organizations }` query parses server-side (got to auth, not a validation error).
- ✓ Bearer personal-API-key auth is the mechanism and rejects invalid keys with a clean `UNAUTHENTICATED` GraphQL error envelope — easy to detect and message in-product.

Pending the user's real key:
- ◷ Channels list returns the account's connected channels with `service` (platform) + `name`.
- ◷ `createPost` with `mode: customScheduled` + `dueAt` schedules a post and returns a `PostActionSuccess { post { id dueAt } }`.
- ◷ Image via `assets:[{image:{url}}]` attaches from a public URL.

**Signal so far:** the only open auth path (BYOK) is technically real and the error surface is clean. The strategic cost is UX, not plumbing — users must self-serve a personal key and be on a paid Buffer plan. That tradeoff is what Spike 003 (connect-and-push-ux) exists to feel out.
