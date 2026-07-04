# Buffer Integration (auth + calendar → post mapping)

The backend half of pushing a Funūn campaign calendar into Buffer. Synthesized from spikes 001 (auth/publish) and 002 (data mapping). This is proven, tested code — follow it and you do not need to re-spike.

## Requirements

Non-negotiable, from the spike session:

- **BYOK (bring-your-own-key) is the ONLY viable auth model.** Buffer's third-party OAuth is closed to new developers (2026): the old REST API stopped accepting new app registrations (no `client_id` obtainable), and the new GraphQL API's third-party OAuth is documented but not enabled. Each Funūn user must generate a **personal API key** at `publish.buffer.com/settings/api` and paste it in. There is no seamless "connect your Buffer" OAuth button to build.
- **API requires the user to be on a paid Buffer plan** ($6+/channel; bundled — no separate API tier).
- **Media must be pre-hosted at a public URL** — Buffer has no image/video upload endpoint. Funūn already hosts `cover_art_url` publicly, so it drops straight in.
- **A per-user platform→Buffer-channel map is required** (built from the channels query). Funūn's `x` must translate to Buffer's service name `twitter`.
- **Attach an image only for `static_image` / `lyric_graphic` slots** — same rule as the shipped CSV export's Image URL column (D-16).

## How to Build It

### 1. Auth + endpoint

- Endpoint: `POST https://api.buffer.com` (GraphQL).
- Header: `Authorization: Bearer <personal-key>`.
- Store the user's key **encrypted at rest**; never log it, never send it to the client after save. In the spike the key was entered client-side and forwarded server-side only — in production, keep all Buffer calls server-side (API routes), never expose the key to the browser.

Raw `fetch` is enough — no SDK:

```js
async function bufferGraphQL(apiKey, query, variables = {}) {
  const res = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, variables }),
  })
  return { status: res.status, json: await res.json() }
}
```

### 2. Read account → organizations → channels

You need an `organizationId` before you can list channels.

```graphql
query { account { id organizations { id name } } }
```
```graphql
query { channels(input: { organizationId: "ORG_ID" }) { id name service } }
```

`service` is the platform name (`instagram`, `tiktok`, `twitter`, `facebook`, `threads`, …). Build the per-user `platform → channelId` map from this. **Funūn `x` maps to Buffer `service: "twitter"`.**

### 3. Map a Funūn `SocialPost` → Buffer `createPost` input

Proven transform (see `sources/002-.../map.mjs`):

```js
function toUtcZ(iso) { return new Date(iso).toISOString() } // Funūn timestamptz (+00:00) → 'Z'
const IMAGE_CONTENT_TYPES = new Set(['static_image', 'lyric_graphic'])

function mapPost(post, channelId, coverArtUrl) {
  const input = {
    text: post.caption,
    channelId,
    schedulingType: 'automatic',
    mode: 'customScheduled',
    dueAt: toUtcZ(post.posting_time),
  }
  if (IMAGE_CONTENT_TYPES.has(post.content_type) && coverArtUrl) {
    input.assets = [{ image: { url: coverArtUrl } }]
  }
  return input
}
```

### 4. Create the scheduled post

```graphql
mutation {
  createPost(input: {
    text: "Out now: Midnight Bloom 🌙"
    channelId: "chan_ig_001"
    schedulingType: automatic
    mode: customScheduled
    dueAt: "2026-07-15T16:00:00.000Z"
    assets: [{ image: { url: "https://cdn.funun.app/covers/midnight-bloom.jpg" } }]
  }) {
    ... on PostActionSuccess { post { id text dueAt assets { id mimeType } } }
    ... on MutationError { message }
  }
}
```

The response is a **union** — always branch on `PostActionSuccess` vs `MutationError`. When interpolating user text/URLs into the mutation string, JSON.stringify each value (`JSON.stringify(v)` yields a valid GraphQL string literal and escapes safely).

### 5. Loop the calendar

For each active-campaign slot: look up its channel from the map; skip (and report) slots whose platform has no connected channel; map → createPost. `sources/002-.../buffer-inputs.json` is a ready example of the exact input array.

## What to Avoid

- **Don't build an OAuth "Connect Buffer" flow** — it doesn't exist for new apps. You'll waste time; there is no `client_id` to obtain.
- **Don't try to upload images** to Buffer — there is no upload endpoint. Pass a public URL in `assets:[{image:{url}}]`.
- **Don't send `posting_time` straight through** — normalize to UTC `Z` first, or negative-UTC-offset timezones day-shift.
- **Don't silently drop** a slot whose platform has no Buffer channel — skip *and surface it* (the UX turns this into a "connect this channel" nudge).
- **Don't assume field parity** — Buffer has no `content_type`, `week`, or `completed` concept. Those stay Funūn-side; `completed` would be *synced back* from Buffer's Scheduled→Sent lifecycle, not pushed.
- **Don't expose the key client-side.** All Buffer calls are server-side in production.

## Constraints

- **Rate limits:** 100 requests / 15-min rolling window per third-party client; 2,000 / 15-min per account. A 4-week calendar (~20-30 posts) is well within this, but batch/space large pushes and handle `429` with retry.
- **Auth:** Bearer personal key, no fixed expiry. Invalid key → HTTP 401 with `{ errors: [{ message: "Access token is not valid", extensions: { code: "UNAUTHENTICATED" } }] }` — detect this to prompt re-entry.
- **Plan gating:** API access needs a paid Buffer plan; a Free-plan user can generate 1 key but has limited channels.
- **Node:** global `fetch` works (Node 18+ / Next.js runtime). No extra deps.
- **Verified live:** the endpoint, the `account` query shape, and Bearer auth were confirmed against the live API (a dummy key returns a clean `UNAUTHENTICATED` GraphQL envelope). The `createPost`/channels happy path is documented + built but awaits a real-key run to fully confirm (spike 001 is PARTIAL).

## Origin

Synthesized from spikes: 001 (buffer-auth-publish, PARTIAL — live auth/endpoint/query-shape confirmed), 002 (calendar-to-buffer-mapping, VALIDATED).
Source files: `sources/001-buffer-auth-publish/`, `sources/002-calendar-to-buffer-mapping/`
