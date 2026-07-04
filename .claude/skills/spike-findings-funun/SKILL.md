---
name: spike-findings-funun
description: Implementation blueprint from Buffer-integration spike experiments. Requirements, proven patterns, and verified knowledge for building Funūn's Buffer social-posting integration (BYOK auth, calendar→post mapping, connect/push UX). Auto-loaded during Buffer-integration implementation work.
---

<context>
## Project: funun

Explore a **Buffer API integration** for Funūn's social campaign planner (Wave 3, Phase 7) and the UI experience around it. Today Funūn hands a generated 4-week content calendar off to Buffer via a Buffer-compatible CSV export (SOCIAL-07). These spikes de-risked a *direct* API integration: push a calendar straight into a user's Buffer queue, sync posting status back, and avoid the manual CSV round-trip — for a synergistic effect between Funūn's planning layer and Buffer's scheduling/publishing layer. Tracked as SOCIAL-08 in REQUIREMENTS.md.

Spike session wrapped: 2026-07-03
</context>

<requirements>
## Requirements

Non-negotiable design decisions that emerged during spiking. Every feature area reference honors these.

- **BYOK (bring-your-own-key) is the only viable auth model.** Buffer's third-party OAuth is closed to new developers in 2026. Users generate a personal API key at `publish.buffer.com/settings/api` and paste it into Funūn. No seamless "connect your Buffer" OAuth onboarding is possible.
- **Media must be pre-hosted at a public URL.** Buffer has no image/video upload; Funūn's public `cover_art_url` maps directly. Attach an image only for `static_image`/`lyric_graphic` slots (D-16).
- **API requires the user to be on a paid Buffer plan** ($6+/channel, bundled — no separate API tier).
- **A per-user platform→Buffer-channel map is required** (from the channels query). Funūn's `x` translates to Buffer's service name `twitter`.
- **Platform coverage gaps must be a calm nudge, not an error.** Skip slots with no matching channel and offer to connect it.
- **Status sync-back (Buffer Scheduled→Sent → Funūn completion) is what makes this synergistic** — without it the integration is "CSV export with extra steps."
- **BYOK onboarding must be framed honestly**, and the connect screen must include a plain-language "What is Buffer?" explainer (artists may not know Buffer).
</requirements>

<findings_index>
## Feature Areas

| Area | Reference | Key Finding |
|------|-----------|-------------|
| Buffer integration (auth + mapping) | references/buffer-integration.md | BYOK personal-key + GraphQL `createPost`; `SocialPost → createPost` is a thin transform; endpoint/auth/query-shape confirmed live |
| Buffer connect & push UX | references/buffer-connect-ux.md | Honest BYOK connect → channel map → push → status-sync flow is coherent; coverage gap as nudge; explainer required |

## Source Files

Original spike source is preserved in `sources/` — runnable harness (`001/server.mjs`), self-verifying mapper (`002/map.mjs` + `buffer-inputs.json`), and the self-contained UX mock (`003/index.html`).
</findings_index>

<metadata>
## Processed Spikes

- 001-buffer-auth-publish
- 002-calendar-to-buffer-mapping
- 003-connect-and-push-ux
</metadata>
