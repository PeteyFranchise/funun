---
spike: 002
name: calendar-to-buffer-mapping
type: standard
validates: "Given a Funūn SocialPost[], when mapped to Buffer createPost inputs, then platform/time/media line up with no silent data loss"
verdict: VALIDATED
related: [001]
tags: [buffer, data-mapping, calendar]
---

# Spike 002: Calendar → Buffer mapping

## What This Validates

Given a Funūn `SocialPost[]` (the shape shipped in `lib/launchpad/campaigns.ts`), when mapped to Buffer's `createPost` GraphQL inputs (the schema confirmed in spike 001), then every field either maps cleanly or is **explicitly reported** as dropped — no silent loss. Confirms the data handoff Funūn's planner → Buffer's scheduler is real and identifies exactly what Buffer can't carry.

## How to Run

```bash
node .planning/spikes/002-calendar-to-buffer-mapping/map.mjs
```

Self-verifying: prints per-post mapping, 7 assertions, a data-loss report, a platform-coverage report, and a VERDICT (exit 0 = pass). Also writes `buffer-inputs.json` — the exact `createPost` inputs, which can be fed straight into spike 001's harness to actually schedule them.

## Investigation Trail

1. **Grounded in the real type**, not an invented one: `SocialPost = { id, platform, week: 1|2|3|4, content_type, caption, posting_time (ISO), completed, completed_at }`. Platforms: instagram, tiktok, x, youtube_shorts, facebook, threads.
2. **Mapping built** to Buffer's `createPost` input from spike 001: `{ text, channelId, schedulingType: automatic, mode: customScheduled, dueAt, assets?: [{image:{url}}] }`.
3. **Mirrored the shipped D-16 rule:** an image attaches only for `static_image` / `lyric_graphic` content types — same rule the CSV export uses for its Image URL column. The image URL is the campaign's `cover_art_url`, which Funūn already hosts publicly (Buffer requires a public URL — no upload endpoint).
4. **Timezone edge case:** Funūn stores `posting_time` as timestamptz that can carry an offset (`+00:00`). Buffer wants ISO 8601 UTC. Ran `new Date(iso).toISOString()` and asserted `2026-07-15T16:00:00+00:00` → `2026-07-15T16:00:00.000Z`. Passes — no day-shift.
5. **Coverage-gap probe:** deliberately left `youtube_shorts` unmapped in the channel map. The mapper **skips and reports** it (`no Buffer channel connected`) instead of emitting a broken input. Confirms the real product must handle "platform has no connected Buffer channel."
6. **Naming mismatch found:** Funūn's `x` must map to Buffer's service name `twitter`. Captured as a build requirement.

## Results

**Verdict: VALIDATED ✓** — 4/5 sample posts mapped, 1 skipped (coverage gap, reported). All 7 assertions pass:

- ✓ caption → text, every post
- ✓ every mapped post has a channelId
- ✓ every dueAt is valid ISO 8601 UTC (`Z`)
- ✓ offset timestamps normalize to UTC (no day-shift)
- ✓ image attaches ONLY for static_image / lyric_graphic (D-16)
- ✓ image url = campaign public cover_art_url
- ✓ unmapped platform skipped + reported, not silently dropped

**Documented data loss (all acceptable):**
- `content_type` — Buffer has no format attribute; format is implied by channel + media. short_form_video/stories route by channel type.
- `week` — a planning concept already baked into `posting_time` → `dueAt`.
- `completed` / `completed_at` — Funūn-internal go-live tracking; would be *synced back* from Buffer's Scheduled→Sent lifecycle, not pushed. (Status round-trip = future work.)

**Signal for the build:**
- The mapping is a thin, deterministic transform — cheap to build.
- Two hard requirements surfaced: (1) a **platform → Buffer channel map** per user (from the channels query), and (2) Funūn `x` → Buffer `twitter` service-name translation.
- Media synergy is real: Funūn's public `cover_art_url` drops straight into Buffer's URL-only `assets` field.
- The only real product decision is the **coverage gap** — what to show when a user's Funūn platform has no matching Buffer channel (skip + nudge to connect it). Spike 003 handles that UX.
