---
status: testing
phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
source: [31-VERIFICATION.md]
started: 2026-08-16T04:05:00Z
updated: 2026-08-16T04:05:00Z
---

## Current Test

number: 1
name: Public /selects/[token] player — playback, reactions, approve/request-changes, safe invalid token
expected: |
  Playback streams the watermarked preview (audible soft tonal pulse for a WAV-sourced track), reactions
  persist, approve/request-changes transitions the Selects status, and an invalid token shows only the
  "This link isn't live." state (no org/client/AE/track data leaked).
awaiting: user response

## Tests

### 1. Public /selects/[token] player
expected: Open a sent Selects link in a browser — play a track, react (love/pass/more-like-this), approve, request changes. Playback streams the watermarked preview (audible soft tonal pulse for a WAV-sourced track); reactions persist; approve/request-changes moves the Selects status; an invalid/expired token shows only the safe "This link isn't live." state and leaks no org/client/AE/track data.
result: [pending]

### 2. My Client Partners — own-book scope, tabs, insight columns, persistence
expected: As a non-leadership AE, open My Client Partners + a company workspace + a person workspace + the Selects builder. Only your own assigned clients render; Clients/Companies tabs work; column show/hide + drag-reorder + sort persist per-AE across reload (cookie); the leadership "Client Partners" tower link is absent for the AE role; an uncovered org/person URL 404s.
result: [pending]

### 3. Selects curate-and-send end-to-end
expected: As an AE, build a Selects from The Crate — add/remove tracks (add idempotent, remove soft with an Undo toast), per-track + cover notes with auto-save (visible saved state), AI-draft off a linked brief (rights-ready-first starter), save/recall + team-share a Crate search. Send is disabled until ≥1 track, then mints a working /selects/{token} link.
result: [pending]

### 4. Download gate — account-gated, watermarked-only, fail-closed
expected: On a sent Selects, attempt a guest download (no login) → account-gate modal, no file. Repeat signed-in as a Client Partner → receives a watermarked file. With download_enabled=false → download refused. With a track longer than download_max_seconds → refused (fails closed, not trimmed). Never a clean master.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

### G1. Audible watermark tag applies only to WAV-sourced previews (partial)
status: partial
source: 31-VERIFICATION.md
detail: |
  lib/watermark/stream-preview.ts injectTonalPulse() tone-injects only raw 16-bit PCM WAV audio
  (PCM_EXTENSIONS = {'wav'}); compressed sources (mp3/aac/flac/ogg/webm) are copied to the previews
  bucket byte-for-byte, untagged — no codec/DSP package is installed (correctly gated behind the
  Package Legitimacy Gate per 31-01's owner-locked approach, which covers WAV tone-injection only).
  Since the vault's default playable "share" file is typically MP3, this is plausibly the common case.
  The hard R12 guarantee ("never serve a clean master") still holds structurally for EVERY format and
  is test-proven; this gap narrows only the D-01 audible-tag content-protection value on compressed sources.
owner_decision: Accept MP3/AAC pass-through previews for now (forensic-download fast-follow), OR bring a
  vetted audio-codec/watermarking package through the Package Legitimacy Gate so the tonal pulse also
  applies to compressed sources. Non-blocking; documented as the plan's own fast-follow.
