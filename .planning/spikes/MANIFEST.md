# Spike Manifest

## Idea

Explore a **Buffer API integration** for Funūn's social campaign planner (Wave 3, Phase 7) — and the **UI experience** around it. Today Funūn hands a generated 4-week content calendar off to Buffer via a Buffer-compatible CSV export (SOCIAL-07). The question is whether a *direct* API integration is worth building: can Funūn push a calendar straight into a user's Buffer queue, sync posting status back, and avoid the manual CSV round-trip — for a synergistic effect between Funūn's planning layer and Buffer's scheduling/publishing layer? Tracked as SOCIAL-08 (research spike) in REQUIREMENTS.md.

## Requirements

Design decisions that emerged during spiking. Non-negotiable for the real build. Updated as spikes progress.

- **BYOK (bring-your-own-key) is the only viable auth model.** Buffer's third-party OAuth is closed to new developers in 2026 (old REST app registration shut; new GraphQL third-party OAuth documented but not enabled). Users must generate a *personal API key* at `publish.buffer.com/settings/api` and paste it into Funūn. No seamless "connect your Buffer" OAuth onboarding is possible today.
- **Media must be pre-hosted at a public URL.** Buffer's API has no image/video upload. Funūn already hosts `cover_art_url` publicly, so the calendar's Image URL maps directly.
- **API requires the user to be on a paid Buffer plan** ($6+/channel, bundled — no separate API tier).
- **A per-user platform→Buffer-channel map is required** (built from the channels query). Funūn's `x` must translate to Buffer's service name `twitter`. (Spike 002)
- **Media pushes as `assets:[{image:{url}}]`** from Funūn's existing public `cover_art_url`, only for `static_image`/`lyric_graphic` slots — same rule as the CSV export's Image URL column (D-16). (Spike 002)
- **Platform coverage gaps must be a calm nudge, not an error.** When a user has no Buffer channel for a Funūn platform, skip those slots and offer to connect the channel. (Spike 003)
- **Status sync-back (Buffer Scheduled→Sent → Funūn completion) is the feature that makes this synergistic** — without it the integration is "CSV export with extra steps." (Spike 003)
- **BYOK onboarding must be framed honestly** ("Buffer has no one-click connect for new apps — paste a personal key"); hiding it makes the paste-key step feel broken. (Spike 003)
- **The connect screen must include a plain-language "What is Buffer?" explainer** — Funūn artists may not know what Buffer is. State what it is (a social scheduling tool), what connecting does (pushes the calendar into Buffer's queue so posts publish automatically), and link out to buffer.com. (Spike 003)
- **Persist `{ buffer_post_id, contentSig, last_status }` per slot** at push time — the join key for both status sync (004) and re-push diffing (005). (Spikes 004, 005)
- **Status sync-back is a POLL, not a webhook** (no webhooks documented): periodically run the `posts` query filtered by `channelIds` + `status:[scheduled,sent,error]`, reconcile by `buffer_post_id`, map `sent`→complete (using `sentAt`). The reconcile MUST be idempotent. (Spike 004)
- **Re-push is a DIFF, never a blind re-create:** compare current content signatures to stored ones → `createPost` (new) / `editPost` (changed) / `deletePost` (removed). (Spike 005)
- **Never edit or delete a `sent` post** — it already went live and can't be un-sent; surface the conflict instead. (Spikes 004, 005)

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | buffer-auth-publish | standard | Given a Buffer personal API key, when Funūn calls the GraphQL API, then it lists channels and creates a scheduled post | PARTIAL — endpoint/auth/query-shape validated live; publish pending user key | buffer, auth, graphql, byok |
| 002 | calendar-to-buffer-mapping | standard | Given a Funūn SocialPost[], when mapped to Buffer createPost inputs, then platform/time/media line up with no data loss | VALIDATED ✓ | buffer, data-mapping, calendar |
| 003 | connect-and-push-ux | standard | Given BYOK constraint, when a user connects Buffer and pushes a calendar, then connect→map→push→status flow feels coherent | VALIDATED ✓ (UX judgment is user's) | buffer, ui, ux, byok |
| 004 | buffer-status-sync-back | standard | Given posts scheduled via createPost, when Funūn polls the Buffer `posts` query, then it reconciles Scheduled→Sent back into slot completion | VALIDATED ✓ | buffer, status, sync, graphql |
| 005 | buffer-update-delete-repush | standard | Given an already-pushed calendar, when the user edits/re-pushes, then a create/edit/delete diff avoids duplicate Buffer posts | VALIDATED ✓ | buffer, idempotency, lifecycle |
| 006a | docuseal-mobile-embed | comparison | Given DocuSeal's embedded signing form, when exercised at 375px viewport, then a signer completes fields + drawn signature without leaving the page | VALIDATED ✓ — bottom-sheet wizard, Set-Today, camera capture; best mobile ergonomics | esign, docuseal, mobile, embedded |
| 006b | signwell-mobile-embed | comparison | Given SignWell embedded signing, when exercised at 375px viewport, then same completion bar | VALIDATED ✓ (with caveats: first-paint overflow, small on-doc field tabs; post-completion behavior to verify in 16-09) | esign, signwell, mobile, embedded |
| 007 | docuseal-license-audit-trail | standard | Given DocuSeal repo/docs/terms, when licensing + self-host key + audit-trail claims are verified, then conflicts resolve with citations | VALIDATED ✓ — hosted path AGPL-clear (MIT embed SDK); embedding is Pro-paid even self-hosted; ESIGN/UETA/eIDAS certificate story credible | esign, docuseal, licensing, compliance |

## Reference

- Buffer developer docs: https://developers.buffer.com/index.html
- New GraphQL API: `api.buffer.com` (public beta, personal API keys)
- Access-model analysis (2026): https://zernio.com/blog/buffer-api
