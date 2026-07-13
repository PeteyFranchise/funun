---
name: spike-findings-funun
description: Implementation blueprint from Buffer-integration spike experiments. Requirements, proven patterns, and verified knowledge for building Funun's Buffer social-posting integration (BYOK auth, calendar->post mapping, connect/push UX). Auto-loaded during Buffer-integration implementation work.
---

<context>
## Project: funun

Explore a **Buffer API integration** for Funun's social campaign planner (Wave 3, Phase 7) and the UI experience around it. Today Funun hands a generated 4-week content calendar off to Buffer via a Buffer-compatible CSV export (SOCIAL-07). These spikes de-risked a *direct* API integration: push a calendar straight into a user's Buffer queue, sync posting status back, and avoid the manual CSV round-trip -- for a synergistic effect between Funun's planning layer and Buffer's scheduling/publishing layer. Tracked as SOCIAL-08 in REQUIREMENTS.md.

Spike session wrapped: 2026-07-03
</context>

<requirements>
## Requirements

Non-negotiable design decisions that emerged during spiking. Every feature area reference honors these.

- **BYOK (bring-your-own-key) is the only viable auth model.** Buffer's third-party OAuth is closed to new developers in 2026. Users generate a personal API key at `publish.buffer.com/settings/api` and paste it into Funun. No seamless "connect your Buffer" OAuth onboarding is possible.
- **Media must be pre-hosted at a public URL.** Buffer has no image/video upload; Funun's public `cover_art_url` maps directly. Attach an image only for `static_image`/`lyric_graphic` slots (D-16).
- **API requires the user to be on a paid Buffer plan** ($6+/channel, bundled -- no separate API tier).
- **A per-user platform->Buffer-channel map is required** (from the channels query). Funun's `x` translates to Buffer's service name `twitter`.
- **Platform coverage gaps must be a calm nudge, not an error.** Skip slots with no matching channel and offer to connect it.
- **Status sync-back (Buffer Scheduled->Sent -> Funun completion) is what makes this synergistic** -- without it the integration is "CSV export with extra steps."
- **BYOK onboarding must be framed honestly**, and the connect screen must include a plain-language "What is Buffer?" explainer (artists may not know Buffer).
- **Persist `{ buffer_post_id, contentSig, last_status }` per slot** at push time -- the join key for status sync (004) and re-push diffing (005).
- **Status sync is a POLL, not a webhook** (none documented): run the `posts` query filtered by `channelIds`+`status`, reconcile by id, map `sent`->complete via `sentAt`; reconcile must be idempotent.
- **Re-push is a DIFF (create/edit/delete), never a blind re-create**, and **never edit/delete a `sent` post** (can't un-send -- surface the conflict).
</requirements>

<findings_index>
## Feature Areas

| Area | Reference | Key Finding |
|------|-----------|-------------|
| Buffer integration (auth + mapping) | references/buffer-integration.md | BYOK personal-key + GraphQL `createPost`; `SocialPost -> createPost` is a thin transform; endpoint/auth/query-shape confirmed live |
| Buffer connect & push UX | references/buffer-connect-ux.md | Honest BYOK connect -> channel map -> push -> status-sync flow is coherent; coverage gap as nudge; explainer required |
| Buffer sync & lifecycle | references/buffer-sync-lifecycle.md | Poll `posts` query for status->completion (idempotent); re-push is a create/edit/delete diff that avoids duplicates and never touches `sent` posts |

## Source Files

Original spike source is preserved in `sources/` -- runnable harness (`001/server.mjs`), self-verifying mapper (`002/map.mjs` + `buffer-inputs.json`), and the self-contained UX mock (`003/index.html`).
</findings_index>

<metadata>
## Processed Spikes

- 001-buffer-auth-publish
- 002-calendar-to-buffer-mapping
- 003-connect-and-push-ux
- 004-buffer-status-sync-back
- 005-buffer-update-delete-repush
</metadata>
