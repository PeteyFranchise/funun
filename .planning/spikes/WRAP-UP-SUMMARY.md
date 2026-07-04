# Spike Wrap-Up Summary

**Date:** 2026-07-03 (updated — 2 spikes appended)
**Spikes processed:** 5
**Feature areas:** Buffer integration (auth + mapping), Buffer connect & push UX, Buffer sync & lifecycle
**Skill output:** `./.claude/skills/spike-findings-funun/`

## Processed Spikes

| # | Name | Type | Verdict | Feature Area |
|---|------|------|---------|--------------|
| 001 | buffer-auth-publish | standard | PARTIAL — live endpoint/auth/query-shape confirmed; publish pending user key | Buffer integration |
| 002 | calendar-to-buffer-mapping | standard | VALIDATED | Buffer integration |
| 003 | connect-and-push-ux | standard | VALIDATED (strategic UX judgment is user's) | Buffer connect & push UX |
| 004 | buffer-status-sync-back | standard | VALIDATED | Buffer sync & lifecycle |
| 005 | buffer-update-delete-repush | standard | VALIDATED | Buffer sync & lifecycle |

## Key Findings

- **The decisive constraint is an access-model wall, not a technical one.** Buffer closed third-party OAuth to new developers in 2026. The only path for a new product like Funūn is **BYOK** — each user pastes a personal API key and must be on a paid Buffer plan. There is no seamless "connect your Buffer" button to build.
- **The plumbing is real and cheap.** Spike 001 hit `https://api.buffer.com` live and got a clean `UNAUTHENTICATED` GraphQL envelope with a dummy key, confirming endpoint + account-query shape + Bearer auth. Spike 002 proved `SocialPost → createPost` is a thin deterministic transform with only acceptable, documented data loss (`content_type`, `week`, `completed` stay Funūn-side).
- **The synergy the user asked about hinges on status sync-back.** Buffer publishes (Scheduled→Sent) and Funūn reflects that into per-slot completion tracking. Without the round-trip, this is just CSV export with extra steps.
- **Media is a freebie** — Funūn's already-public `cover_art_url` drops straight into Buffer's URL-only `assets:[{image:{url}}]` field (image only for static_image/lyric_graphic, matching D-16).
- **Two build requirements surfaced:** a per-user platform→channel map (Funūn `x` → Buffer `twitter`), and coverage gaps handled as a calm connect-nudge rather than an error.
- **Feasibility:** technically low-effort (~4 pieces: encrypted key store + connect screen, channel-map step, push loop, status-sync job). The real decision is product/UX — is paste-a-key onboarding + paid-Buffer-plan acceptable vs. the current one-click CSV export? Spike 003's mock makes that tradeoff concrete.

## Sync & lifecycle (appended — spikes 004, 005)

- **Status sync-back is feasible and is a poll, not a webhook.** Buffer's `posts` query exposes `status` (`draft|scheduled|sent|sending|error`) + `sentAt`; Funūn reconciles by stored `buffer_post_id`, mapping `sent`→slot completion. Reconcile proven idempotent (safe on a cron).
- **Full edit lifecycle exists.** `editPost` + `deletePost` mutations mean re-pushing an edited calendar is a create/edit/delete **diff**, not a blind re-create — no duplicate posts. Proven idempotent; never touches `sent` posts.
- Together these make the integration a true two-way sync: Funūn plans + edits → Buffer publishes → status flows back → re-pushes stay clean.

## Open item

Spike 001's publish half awaits a live-key run (`node .planning/spikes/001-buffer-auth-publish/server.mjs`) to flip PARTIAL → VALIDATED. The live `posts`/`editPost`/`deletePost` happy-path shares that same auth/endpoint. Everything else is validated.
