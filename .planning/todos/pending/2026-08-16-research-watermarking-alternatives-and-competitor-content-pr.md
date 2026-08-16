---
created: 2026-08-16T05:28:28.552Z
title: Research watermarking alternatives & competitor content-protection services
area: research
files:
  - lib/watermark/stream-preview.ts (injectTonalPulse — WAV-only tone injection)
  - lib/watermark/provider.ts (WatermarkProvider interface any alternative implements)
  - lib/watermark/README.md (owner-locked approach + Package Legitimacy Gate)
  - .planning/phases/31-ae-client-workspace-selects-my-client-partners-client-partne/31-VERIFICATION.md (gap G1)
---

## Problem

The Phase 31 Selects player protects previews with an **in-house** watermark (owner-locked
approach, 31-01). Today `injectTonalPulse` only tone-tags **raw WAV** — compressed sources
(mp3/aac/flac/ogg/webm) are copied to the previews bucket byte-for-byte, **untagged** (no
codec/DSP package installed). Since the vault's default playable "share" file is typically
MP3, that's plausibly the common case. The hard "never serve a clean master" guarantee still
holds for every format (tested), but the **audible-tag / forensic content-protection value
(D-01/D-03) is missing on compressed audio** — this is Phase 31 verification gap **G1**, an
open owner decision, and the D-03 forensic-download feature is a deferred fast-follow.

Before we invest further in-house, we want to know what's out there and what the field uses.

## Solution

Research (feeds a future watermarking spike / decision — possibly Phase 31.1 or a dedicated
content-protection phase). Three angles:

1. **Third-party watermarking services/SDKs** that cover **compressed** audio (mp3/aac/flac/
   ogg), not just WAV — both the audible-preview tag and the inaudible forensic (per-recipient)
   encode. Candidates to evaluate: forensic-audio-watermarking vendors, audio-fingerprinting/
   ID providers, and any npm/native lib that does robust spread-spectrum or psychoacoustic
   watermarking. Note pricing model (per-render vs flat), API shape, and self-host vs SaaS.

2. **Competitor / field scan** — what do sync-licensing platforms, music-supervision & pitch
   tools, and catalogue/library platforms use for **preview protection + per-recipient leak
   tracing**? (e.g. how do they watermark shared previews, do they trace leaks to a recipient,
   audible vs inaudible, download policy.) Capture what reads as table-stakes vs differentiator.

3. **Tradeoffs vs in-house**, per option: cost/per-render, vendor lock-in, **codec coverage**,
   **forensic robustness** (survives re-encode / trim / AD-DA re-record), latency/async-render
   fit for **Vercel Hobby (10s cap)**, and data-privacy of shipping master audio to a 3rd party.

**Hard constraints (carry into any option):**
- The **never-master guarantee** must hold regardless — the player signs only the returned
  watermarked render path, never the master bucket (R12 / T-31-01).
- Any proposed package/service **MUST clear Phase 31-01's Package Legitimacy Gate**
  (npmjs/authoritative-source verification, publish date, downloads, source repo) before any
  install — a `[SLOP]` package is forbidden. This is a **blocking-human** gate.
- Whatever is chosen implements the existing `WatermarkProvider` interface (`lib/watermark/
  provider.ts`) — `renderStreamPreview` + `renderForensicDownload`, async/pre-computed — so the
  render pipeline (31-12) and player (31-13) don't change shape.

**Ties to:** 31-VERIFICATION.md gap **G1** · the open owner decision on the WAV-only audible
tag · 31-01 owner-locked approach + `WatermarkProvider` · the **D-03** forensic-download
fast-follow.

**Output:** a comparison of ≥2–3 concrete options with the tradeoffs above + a recommendation,
enough to decide "stay in-house (and add a codec)" vs "adopt a service." Then route to a spike
(`/gsd-spike`) or a decision if a service looks worth it.
