---
phase: 14-playback-room-refinement
verified: 2026-07-07T02:30:00Z
status: human_needed
score: 15/15
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Deploy to real Vercel Hobby environment. Upload a stems ZIP over 4.5MB (ideally ~250MB) from the playback room of an owned project."
    expected: "Upload succeeds with no 413 FUNCTION_PAYLOAD_TOO_LARGE error. Progress indicator advances. After completion, 'Download stems' appears as a separate button distinct from the transport controls."
    why_human: "HOBBY-1: local next dev has no 4.5MB body ceiling — a broken byte-proxy path would falsely pass locally. Must verify that tus-js-client uploads directly to Supabase Storage (bypassing Vercel's serverless body limit), not via a Next.js route. Cannot be simulated in sandbox."
  - test: "On the same deployment, upload an instrumental audio file. Verify Master/Instrumental toggle appears and swaps the audio source."
    expected: "Instrumental row shows 'Uploaded'. Toggle appears only when instrumental is present. Clicking 'Instrumental' in the toggle causes the audio element to play the instrumental track; clicking 'Master' reverts to the master/share URL."
    why_human: "HOBBY-1 (continued): source-swap involves browser audio state + real signed URLs from Supabase. Cannot verify without a live deployment and real signed URLs."
  - test: "On a project populated with master + instrumental + stems + credits metadata, click 'Export pack' -> 'Download ZIP now'."
    expected: "Request completes in under 10 seconds on the real Hobby deployment (no function timeout). Browser downloads a ZIP. Unzipping shows: at least one audio file, credits-and-splits.pdf, metadata.pdf — all with real data (no blank PDFs)."
    why_human: "HOBBY-2: local next dev has no 10s function ceiling. Assembly time (Storage downloads + 2 PDF renders + Storage re-upload) can only be measured against the real Vercel Hobby tier. A timeout here triggers the Vercel Pro upgrade recommendation (per RESEARCH Pitfall 3)."
  - test: "Click 'Get shareable link'. Copy the URL. Open it in a fresh browser window that is not logged in to the app."
    expected: "Link opens and triggers a ZIP download without requiring authentication. Panel shows 'This link expires in 7 days.' helper. If TTL can be tested: link 403s after 7 days."
    why_human: "D-11/D-12: requires a real deployment with a real Supabase signed URL at 60*60*24*7 TTL. Cannot verify unauthenticated access or TTL enforcement locally."
  - test: "As User B (a second account), POST to User A's /api/vault/{id}/export endpoint."
    expected: "Response is 404, never a signed URL pointing to User A's files."
    why_human: "ASVS V4 two-session check. Requires two live authenticated sessions against a real Supabase project. Sandbox has no linked Supabase project (STATE.md Phase 8 blocker)."
  - test: "As User B, POST to User A's /api/vault/{projectId}/tracks/{trackId}/stems and /instrumental endpoints."
    expected: "Both return 404, never the owner's data."
    why_human: "ASVS V4 cross-tenant check on metadata routes (Plan 03 must-have). Requires two live sessions against a real deployment."
  - test: "Open the playback room for a project that has a master WAV uploaded. Press play."
    expected: "Audio actually plays (signed URL fix). Previously this was broken because raw storage paths were passed as audioUrl."
    why_human: "Requires a real Supabase Storage bucket with a real signed URL. Cannot play audio in a sandbox without a live Supabase project with real objects."
  - test: "Generate an export pack and inspect the PDF content: open credits-and-splits.pdf and metadata.pdf from the downloaded ZIP."
    expected: "credits-and-splits.pdf shows real composer names, roles, PRO, IPI, and split percentages. metadata.pdf shows ISRC, ISWC, BPM, key, language per track — not blank placeholder PDFs."
    why_human: "D-10: PDF rendering correctness (real data vs blank) requires an actual project with credits/metadata populated and a full end-to-end export. Cannot verify PDF content from file analysis alone."
---

# Phase 14: Playback Room Refinement Verification Report

**Phase Goal:** Polish the private Playback room and ship "Export pack" (bundling metadata/stems/master/MP3 for a music supervisor). The playback room becomes the primary landing page for a vault project with working master/instrumental playback, direct-to-storage stems/instrumental uploads (250MB), readiness visibility, and a working Export Pack (ZIP assembled server-side, delivered via signed URL — download or 7-day shareable link).
**Verified:** 2026-07-07T02:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria + PLAN must-haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Clicking a Sound Vault project card lands on the playback room; the management page is reachable from it (D-01) | VERIFIED | `VaultProjectCard.tsx:70` — `href={/vault/${card.id}/play}`. `ProjectTabs.tsx:50-54` — `playbackHref` prop renders a "Playback room →" next/link. Management page call site at `vault/[projectId]/page.tsx:384` passes `playbackHref={/vault/${project.id}/play}`. |
| SC-2a | Master/Instrumental toggle swaps the audio source (D-06) | VERIFIED | `PlaybackView.tsx:78` — `useState<'master' \| 'instrumental'>('master')`. Lines 92-94: `activeAudioUrl` branches on `source`. Line 390: `<audio src={activeAudioUrl ?? undefined}>`. Toggle only rendered at line 196 when `current.instrumentalUrl` is present. Old `'stems'` state is gone (node verify confirmed). |
| SC-2b | "Download stems" is a separate button, not part of transport (D-04) | VERIFIED | `PlaybackView.tsx:210-222` — Download stems is an `<a href={current.stemsUrl} download>` link, visually and structurally distinct from the play/pause transport. Only rendered when `current.stemsUrl` present (D-08). |
| SC-2c | Stems ZIP (250MB) and instrumental upload direct-to-storage (D-05/D-07) | VERIFIED (code) / human_needed (deployment) | `StemsUpload.tsx:118-164` — tus.Upload against `/storage/v1/upload/resumable`, chunkSize 6MB, Bearer token, metadata `{ bucketName, objectName, contentType: 'application/zip' }`. On success POSTs JSON to `/stems` route. Instrumental uses plain `supabase.storage.upload()`. Migration 041 sets bucket `file_size_limit=262144000`. HOBBY-1 deferred to human. |
| SC-2d | Track-audio bucket accepts uploads up to 250MB and ZIP MIME types (D-07) | VERIFIED | `supabase/migrations/041_track_audio_stems_config.sql` — `file_size_limit=262144000` (250MB), `allowed_mime_types` includes `application/zip` and `application/x-zip-compressed`. Idempotent `on conflict (id) do update` pattern. No RLS policy DDL altered. |
| SC-2e | hide-when-absent: toggle hidden without instrumental, "Download stems" hidden without stems, upload affordances hidden for non-owner when absent (D-08) | VERIFIED | Toggle at `PlaybackView.tsx:196` gated on `current.instrumentalUrl`. Download link at `211` gated on `current.stemsUrl`. StemsUpload at `219` returns null when `!showInstrumental && !showStems` (i.e., non-owner and both absent). |
| SC-2f | Info (ⓘ) affordance explains what stems are (D-09) | VERIFIED | `StemsUpload.tsx:22-57` — `StemsInfo` popover with title "What are stems?" and explanatory body text about separated instrument/vocal tracks, ZIP format, 250MB limit. Rendered adjacent to the stems upload affordance. |
| SC-2g | JSON-only stems/instrumental metadata routes (POST+DELETE) with owner gate; no file bytes proxied (D-05) | VERIFIED | Both `stems/route.ts` and `instrumental/route.ts` verified via node grep: export `POST`+`DELETE`, no `request.formData(`, `.eq('user_id', user.id)` present on every handler, correct metadata keys. |
| SC-3 | Readiness-score widget in topbar (D-02 placement 1) | VERIFIED | `play/page.tsx:180-186` — `<Link href={/vault/${projectId}}>` with `chipClasses[tone]` rendering "Readiness {readinessScore} · {label}" in the Topbar children slot. `readinessLabel()` from `lib/vault/readiness` computes the tone/label. |
| SC-3b | Readiness-score widget inline (D-02 placement 2) | VERIFIED | `PlaybackView.tsx:170-178` — inline link block "Readiness {readinessScore}/100 · {readinessLabelText} →" using `readinessLabel()`, linking to `/vault/${projectId}`. |
| SC-4a | Export route assembles ZIP with every available artifact + credits/splits PDF + metadata PDF (D-10) | VERIFIED | `export/route.ts` — iterates `manifest.files` (from `buildExportManifest`, which only includes refs that exist), appends each via `service.storage.download()` + `archive.append()`, then appends `renderCreditsSheet(manifest)` and `renderMetadataSheet(manifest)` Buffers. No-master gate at line 110 returns 400. |
| SC-4b | Artist chooses immediate download OR shareable link (D-11) | VERIFIED | `ExportPackPanel.tsx:51` — `requestPack('download')` and `requestPack('share')` modes. Both POSTs to `/api/vault/${projectId}/export` with correct `{ mode }`. Panel shows both delivery buttons (node verify confirmed both mode strings present). |
| SC-4c | 7-day (share) / 5-min (download) signed URL TTLs; Supabase expiry, no manual revocation (D-12) | VERIFIED | `export/route.ts:168` — `const ttl = mode === 'download' ? 60 * 5 : 60 * 60 * 24 * 7`. Uses `service.storage.from(BUCKET).createSignedUrl(packPath, ttl)`. No `expires_at` bookkeeping. `ExportPackPanel.tsx:218` renders "This link expires in 7 days." helper. Node verify confirmed `60 * 60 * 24 * 7` literal present. |
| SC-4d | Route uploads pack to Storage (never streams archive as Response body — Hobby-safe) (D-12/Pitfall 3) | VERIFIED | `export/route.ts:153-156` — `service.storage.from(BUCKET).upload(packPath, passthrough, ...)`. Route returns `NextResponse.json({ data: { url, path, mode } })`, not archive bytes. `maxDuration=10` and `runtime='nodejs'` declared. Node verify confirmed `.upload(` present. |
| SC-4e | D-13 in-app request/approve flow DEFERRED; no parallel notification mechanism added | VERIFIED | No notification, approval flow, or request table found in any of the 6 plans' files. 14-06-SUMMARY.md explicitly records "D-13 remains DEFERRED until after Phase 10." |
| SC-4f | buildExportManifest() is pure — no Storage/DB I/O | VERIFIED | `lib/vault/export-pack.ts` — no `await`, no `createServiceClient`, no `.storage.`, no `.download(`. Node verify confirmed purity. 16/16 TDD tests pass (`jest schema-stems-instrumental` — readers layer). |

**Score:** 15/15 truths verified (0 present-but-behavior-unverified)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/041_track_audio_stems_config.sql` | Bucket 250MB limit + ZIP MIME | VERIFIED | 262144000, application/zip, application/x-zip-compressed, on conflict upsert, no RLS DDL |
| `lib/metadata/schema.ts` | readStems, readInstrumental, StemsFile, InstrumentalFile exports | VERIFIED | Lines 275-308; 16/16 TDD tests pass |
| `package.json` | archiver, @react-pdf/renderer, tus-js-client installed | VERIFIED | Lines 18, 22, 30, 34 in package.json |
| `components/vault/VaultProjectCard.tsx` | href to /play | VERIFIED | Line 70: `href={/vault/${card.id}/play}` |
| `components/vault/ProjectTabs.tsx` | playbackHref prop + next/link | VERIFIED | Lines 4, 18, 50-54 |
| `app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts` | POST+DELETE, JSON-only, owner-gated | VERIFIED | Node verify PASS; no formData; .eq('user_id') on all handlers |
| `app/api/vault/[projectId]/tracks/[trackId]/instrumental/route.ts` | POST+DELETE, JSON-only, owner-gated | VERIFIED | Node verify PASS; no formData; .eq('user_id') on all handlers |
| `lib/vault/export-pack.ts` | buildExportManifest, ExportManifest type, pure | VERIFIED | Exports at lines 42, 102; no I/O; uses readMasterAudio/readStems/readInstrumental |
| `lib/vault/pdf/credits-sheet.tsx` | renderCreditsSheet, @react-pdf/renderer, readComposers | VERIFIED | Node verify PASS; uses renderToBuffer |
| `lib/vault/pdf/metadata-sheet.tsx` | renderMetadataSheet, @react-pdf/renderer, ISRC fields | VERIFIED | Node verify PASS |
| `components/vault/StemsUpload.tsx` | tus-js-client stems, plain upload instrumental, D-09 info | VERIFIED | Lines 118-164 (tus); lines 185-210 (instrumental); StemsInfo popover at lines 22-57 |
| `components/vault/PlaybackView.tsx` | Master/Instrumental toggle, readiness widgets, StemsUpload mounted | VERIFIED | Node verify PASS; source state 'master'\|'instrumental'; both readiness placements wired |
| `app/(artist)/vault/[projectId]/play/page.tsx` | Signed URLs, readiness score, topbar chip | VERIFIED | createSignedUrls at lines 132-138; readinessLabel at line 143; topbar chip at lines 180-186 |
| `app/api/vault/[projectId]/export/route.ts` | archiver ZIP assembly, upload-then-sign, Hobby-safe | VERIFIED | Node verify PASS; ZipArchive + factory alias; upload+sign pattern |
| `components/vault/ExportPackPanel.tsx` | Both delivery modes, 7-day helper, export route call | VERIFIED | Node verify PASS |
| `components/vault/ExportPackButton.tsx` | No-master gate copy, opens panel | VERIFIED | hasMaster gate at line 27; disabled state with "Upload a master WAV…" tooltip |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| VaultProjectCard | /vault/{id}/play | Link href | WIRED | Line 70 |
| ProjectTabs | /vault/{id}/play | playbackHref prop + Link | WIRED | Prop flows from management page call site |
| StemsUpload | stems/route.ts | fetch POST JSON { path, size, name } | WIRED | Lines 145-158 |
| StemsUpload | instrumental/route.ts | fetch POST JSON { path, size, ext } | WIRED | Lines 198-208 |
| play/page.tsx | createSignedUrls | createServiceClient().storage.createSignedUrls | WIRED | Lines 131-138 |
| play/page.tsx | PlaybackView | signedByPath map → audioUrl/instrumentalUrl/stemsUrl | WIRED | toTrackViews at lines 38-73 |
| play/page.tsx | ExportPackButton | exportManifest.hasMaster + artifactLabels props | WIRED | Lines 188-194 |
| export/route.ts | buildExportManifest | import + call, owner-scoped rows | WIRED | Lines 33, 104-107 |
| export/route.ts | renderCreditsSheet, renderMetadataSheet | import + await + archive.append | WIRED | Lines 34-35, 141-146 |
| ExportPackButton | ExportPackPanel | open state + props | WIRED | Lines 55-62 |
| ExportPackPanel | /api/vault/{projectId}/export | fetch POST { mode } | WIRED | Lines 51-75 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| PlaybackView (audioUrl) | `activeAudioUrl` | `toTrackViews` → `signedByPath[t.audio_file_url]` from `createSignedUrls` | Yes — signed URLs from real storage paths per track | FLOWING |
| PlaybackView (instrumentalUrl) | `current.instrumentalUrl` | `readInstrumental(t.metadata)?.path` → signed URL | Yes — only populated when `instrumental.path` exists in metadata | FLOWING |
| PlaybackView (stemsUrl) | `current.stemsUrl` | `readStems(t.metadata)?.path` → signed URL | Yes — only populated when `stems.path` exists in metadata | FLOWING |
| PlaybackView (readinessScore) | `readinessScore` | `vault_readiness_score` DB column passed from play/page.tsx | Yes — real DB column, not hardcoded | FLOWING |
| export/route.ts (ZIP content) | `manifest.files` | `buildExportManifest(project, tracks)` → `readMasterAudio/readStems/readInstrumental` | Yes — only emits entries for refs that exist; no null-path entries | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 16 TDD tests for readStems/readInstrumental | `npx jest schema-stems-instrumental --no-coverage` | 16/16 passed (0.512s) | PASS |
| All committed artifacts exist (17 commits) | `git log --oneline \| grep commit hashes` | All 17 commits found in git log | PASS |
| StemsUpload uses tus-js-client (not FormData proxy) | node verify | PASS | PASS |
| PlaybackView old 'stems' state gone, instrumental present | node verify | PASS | PASS |
| play/page.tsx mints signed URLs | node verify (createSignedUrls present) | PASS | PASS |
| Export route: nodejs runtime, maxDuration=10, archiver, upload, 7-day TTL | node verify | PASS | PASS |
| ExportPackPanel: both delivery modes, 7-day expiry helper, export route call | node verify | PASS | PASS |
| ExportPackPanel + Export pack button mounted in playback room | node verify (PlaybackView + play/page.tsx) | PASS | PASS |
| buildExportManifest is pure (no Storage/DB I/O) | node verify | PASS | PASS |
| Both PDF renderers use @react-pdf/renderer, correct data sources, no Puppeteer | node verify | PASS | PASS |

---

### Requirements Coverage

Phase 14 has no formal IDs in `REQUIREMENTS.md` (which covers Wave 4 Green Room features only). Phase 14 is a cross-domain Sound Vault addition tracked via ROADMAP.md Success Criteria and PLAN frontmatter `must_haves`. All 4 ROADMAP Success Criteria are verified above. No orphaned requirements.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| CR-01 (REVIEW) | stems/route.ts:27-51 + instrumental/route.ts:27-51 | Client-supplied storage `path` persisted with no owner-prefix validation; downstream service-role consumers (signed-URL minting, export ZIP download, DELETE remove) act on it — confused deputy | WARNING (security bug, fix path: /gsd-code-review 14 --fix) | Does not defeat the "non-owner calling someone else's track endpoint gets 404" must-have (user.id gate is present). Separate attack vector: authenticated owner submits a crafted path. Should be fixed before production. |
| CR-02 (REVIEW) | app/r/[projectId]/page.tsx:40 | Raw storage path used as `<audio src>` on public share page — public playback cannot work | WARNING | Pre-existing bug; phase touched this file for D-08 type fixes. Not in phase must-haves. Fix available in review (signed URL block mirrors play/page.tsx). |
| WR-01 (REVIEW) | export/route.ts:122-156 | No archiver error listener; `finalize()` is fire-and-forget | WARNING | Mid-stream failure hangs until 10s Hobby kill with no JSON error. Does not defeat D-10/D-11/D-12 code correctness but degrades observability. |
| WR-08 (REVIEW) | PlaybackView.tsx:149-178 | Files section + inline readiness widget rendered unconditionally; public page gets "Readiness 0/100 · Needs work" | WARNING | UX leak for canManage=false viewers. Phase goal is owner-facing; not a phase must-have gap. |

No `TBD`, `FIXME`, or `XXX` markers in any phase-modified file.

---

### Human Verification Required

The following items require a live deployment against a real Vercel Hobby + Supabase project. All are explicitly scoped as deployment checkpoints in the plans (HOBBY-1 in Plan 05 Task 4, HOBBY-2 in Plan 06 Task 4) and deferred by the user per the verification prompt.

**1. HOBBY-1: Stems upload >4.5MB on real Vercel Hobby deployment**

**Test:** Deploy to Vercel Hobby. In the playback room, upload a stems ZIP over 4.5MB (ideally ~250MB).
**Expected:** Upload succeeds with no 413 error; progress indicator advances; "Download stems" appears as a separate button afterward. Instrumental upload + Master/Instrumental source-swap also confirmed working.
**Why human:** Local `next dev` has no 4.5MB body ceiling — a broken byte-proxy path would falsely pass. Only real Vercel Hobby enforces the ceiling. Confirms tus-js-client bypasses it correctly.

**2. HOBBY-2: Export Pack assembly within 10s on real Vercel Hobby deployment**

**Test:** On a project with a master + stems + instrumental + credits metadata, click "Export pack" → "Download ZIP now". Then "Get shareable link" → open link in fresh unauthenticated browser.
**Expected:** Assembly completes under 10s (no Hobby timeout). ZIP downloads with all available artifacts + two PDFs containing real data. Shareable link works unauthenticated; panel shows "This link expires in 7 days." If 10s ceiling is hit: Vercel Pro upgrade is the fix (per RESEARCH Pitfall 3 — no speculative job queue).
**Why human:** Local `next dev` has no function-duration limit. Only real Hobby deployment reveals whether assembly time is within ceiling.

**3. Audio playback works (signed URL fix verification)**

**Test:** Open the playback room for a project with a master WAV uploaded. Press play.
**Expected:** Audio actually plays. Confirms the raw-path → signed-URL bug fix.
**Why human:** Requires a real Supabase Storage bucket with objects and a live signed URL to verify audio element can actually load and play.

**4. PDF content: credits + metadata sheets contain real data**

**Test:** Download an export pack and open both PDFs.
**Expected:** credits-and-splits.pdf shows real composer names/roles/splits. metadata.pdf shows real ISRC/ISWC/BPM/key/language — not blank pages.
**Why human:** PDF content requires an end-to-end render with a real populated project. File analysis confirms renderers call readComposers + ISRC fields, but cannot confirm actual rendered output without generating a pack.

**5. Security V4 cross-tenant checks (two-session)**

**Test:** As User B, call User A's `/api/vault/{id}/export`, `/tracks/{id}/stems`, and `/tracks/{id}/instrumental` endpoints.
**Expected:** All return 404, never data or a signed URL belonging to User A.
**Why human:** Requires two authenticated sessions against a real Supabase project. Sandbox has no linked project (STATE.md Phase 8 blocker). Code analysis confirms `.eq('user_id', user.id)` is present on every handler path.

---

### Security Note (from Code Review CR-01)

The stems/instrumental POST routes persist client-supplied `body.path` into `tracks.metadata` without validating the owner prefix (`${user.id}/${projectId}/`). Three downstream service-role consumers (signed-URL minting in play/page.tsx, ZIP assembly in the export route, and DELETE storage.remove) act on this path without RLS. An authenticated attacker who knows a victim's object path (guessable from fixed path shapes and IDs that leak via the public `/r/` route) can:
- Receive a valid signed URL to the victim's storage object on their own play page
- Include victim files in their own export ZIP
- Delete the victim's storage object via DELETE

This is distinct from the "non-owner calling another user's track endpoint" must-have (which IS gated). Fix available in 14-REVIEW.md CR-01. Recommend running `/gsd-code-review 14 --fix` before production deployment.

---

### Gaps Summary

No phase must-haves failed. All 15 truths are VERIFIED in the codebase. 8 items require human verification on a live deployment (HOBBY-1, HOBBY-2, playback verification, PDF content, and security two-session checks). These were explicitly designed as deployment checkpoints in the plans and deferred by the user.

The code review findings (CR-01 security bug, CR-02 public playback raw-path) do not defeat any phase must-have but should be addressed before the next production deploy via `/gsd-code-review 14 --fix`.

---

_Verified: 2026-07-07T02:30:00Z_
_Verifier: Claude (gsd-verifier)_
