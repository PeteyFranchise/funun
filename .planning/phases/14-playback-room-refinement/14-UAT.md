---
status: closed_by_owner_waiver
phase: 14-playback-room-refinement
source: [14-VERIFICATION.md]
started: 2026-07-07T02:03:17Z
updated: 2026-07-18T22:00:00Z
waiver: "2026-07-18 — owner (Pete) directed all 9 UAT items be treated as successful without execution ('clear the board'). Recorded as an accepted-risk waiver, not pass evidence: results below remain [pending]/unexecuted. Highest residual risk is HOBBY-1 (the >4.5MB stems upload path on a real Vercel deployment — a broken byte-proxy path passes locally but 413s in production); if large stems uploads fail after deploy, run this checklist as the repro script."
---

## Current Test

number: 1
name: HOBBY-1 — stems ZIP upload over 4.5MB on real Vercel deployment
expected: |
  Upload succeeds with no 413 FUNCTION_PAYLOAD_TOO_LARGE error. Progress indicator advances. After completion, "Download stems" appears as a separate button distinct from the transport controls.
awaiting: user response

## Tests

### 1. HOBBY-1 — stems ZIP upload over 4.5MB on real Vercel deployment
expected: Deploy to real Vercel Hobby. Upload a stems ZIP over 4.5MB (ideally ~250MB) from the playback room of an owned project. Upload succeeds with no 413 FUNCTION_PAYLOAD_TOO_LARGE; progress advances; "Download stems" appears as a separate button afterward.
result: [pending]

### 2. Instrumental upload + Master/Instrumental source swap
expected: On the same deployment, upload an instrumental audio file. Instrumental row shows "Uploaded". Toggle appears only when instrumental is present. Clicking "Instrumental" plays the instrumental track; clicking "Master" reverts to the master/share URL.
result: [pending]

### 3. HOBBY-2 — export pack "Download ZIP now" within Hobby 10s ceiling
expected: On a project with master + instrumental + stems + credits metadata, click "Export pack" → "Download ZIP now". Completes in under 10 seconds (no function timeout). Browser downloads a ZIP containing at least one audio file, credits-and-splits.pdf, and metadata.pdf — all with real data. A timeout here triggers the Vercel Pro upgrade recommendation (no job queue).
result: [pending]

### 4. Shareable link works unauthenticated with 7-day TTL helper
expected: Click "Get shareable link", copy the URL, open in a fresh browser not logged in to the app. Link triggers a ZIP download without authentication. Panel shows "This link expires in 7 days." helper. If TTL can be tested: link 403s after 7 days.
result: [pending]

### 5. Cross-tenant export blocked (ASVS V4, two sessions)
expected: As User B (second account), POST to User A's /api/vault/{id}/export endpoint. Response is 404 — never a signed URL pointing to User A's files.
result: [pending]

### 6. Cross-tenant stems/instrumental routes blocked (ASVS V4, two sessions)
expected: As User B, POST to User A's /api/vault/{projectId}/tracks/{trackId}/stems and /instrumental endpoints. Both return 404, never the owner's data.
result: [pending]

### 7. Playback room audio actually plays (signed URL fix)
expected: Open the playback room for a project with a master WAV uploaded. Press play. Audio plays (previously broken — raw storage paths were passed as audioUrl).
result: [pending]

### 8. Generated PDFs contain real data
expected: Generate an export pack and open credits-and-splits.pdf and metadata.pdf from the ZIP. Credits sheet shows real composer names, roles, PRO, IPI, split percentages. Metadata sheet shows ISRC, ISWC, BPM, key, language per track — not blank placeholder PDFs.
result: [pending]

### 9. Public Now Playing page streams audio and hides owner-only UI (post-review fixes CR-02, WR-08)
expected: Open /r/{projectId} for a public release in a logged-out browser. Pressing play streams the master audio (signed URL — previously raw storage paths 404'd). The page shows no "Files" section and no "Readiness x/100" widget — those render only for the owner.
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps
