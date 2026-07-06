# Phase 14: Playback Room Refinement - Research

**Researched:** 2026-07-06
**Domain:** Next.js 15 App Router file handling (large uploads, server-side ZIP bundling, server-side PDF generation), Supabase Storage signed URLs
**Confidence:** MEDIUM (core recommendations cross-checked against official docs; some deployment-environment specifics — Vercel plan tier, current storage bucket state — are unverifiable from inside the repo and flagged as assumptions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Navigation & Information Architecture**
- **D-01:** Clicking a Sound Vault project card (`VaultProjectCard.tsx`) now goes directly to the playback room (the `playback.html`-style experience) as the primary landing page for a project — not the current release-readiness/management page. The existing management page (`/vault/[projectId]`) becomes secondary.
- **D-02:** The playback room gets a small, clickable readiness-score widget linking out to the management page, so the artist can still reach readiness/upload-management tools from their new primary landing view. Per D-08, this widget appears in two places: a compact chip near the top app bar/topbar, AND inline near the tracklist/files column.

**Stems & Instrumental Support (new — zero prior backing)**
- **D-03:** Real stems support ships this phase (not deferred) — a single bundled file (e.g. a ZIP) per track for v1. Per-instrument individual stem files is an explicit, noted fast-follow if artists request it after real-life testing — not built now.
- **D-04:** Since a ZIP cannot be streamed through an `<audio>` element, "Stems" is not a playback-source option — it's a download action ("Download stems" button, separate from the play/pause transport). A new, separate "Instrumental" upload slot is added for artists who want a genuinely playable alternate mix — this becomes the second option in the playback toggle (see D-06). Requiring playable stems (not just a ZIP) instead of/alongside the Instrumental slot is a noted future possibility, contingent on live usage feedback — not decided now.
- **D-05:** Upload controls for both stems (ZIP) and instrumental live in multiple places — both the playback room and the existing management page (`/vault/[projectId]`) get upload UI, but both write to the same underlying track record (one canonical DB row / storage path regardless of entry point). No duplicate storage model.
- **D-06:** The player's source-selector becomes a Master / Instrumental toggle (two real, playable audio sources) — "Download stems" is a separate button, not part of this toggle (this directly supersedes the non-functional 3-way Master/Stems toggle that exists today).
- **D-07:** Stems ZIP upload size limit: 250MB (larger than the existing 50MB master/share limit, per CLAUDE.md's storage-bucket guidance of "up to 250MB per track"). Multi-stem WAV bundles are expected to be much larger than a single WAV or MP3.
- **D-08:** Empty-state handling is consistent across all new optional content, matching Phase 9's D-09 lyrics pattern: hide the affordance entirely when the content doesn't exist — no Instrumental uploaded → hide the toggle (show Master only); no stems ZIP uploaded → hide "Download stems" entirely. Never show a disabled/grayed dead-end control.
- **D-09:** Add instructional copy or an info (ⓘ) button near the stems upload control, explaining: what stems are, why to store them on Funūn (music supervisors/collaborators may request them), how to zip them, and how to label the archive for clarity.

**Export Pack (new — zero prior implementation)**
- **D-10:** Export Pack bundles everything available: master WAV, share MP3, stems ZIP, instrumental (if uploaded), a credits/splits sheet (PDF), and a metadata sheet (ISRC/ISWC/BPM/key/language, PDF).
- **D-11:** Delivery is the artist's choice each time — either an immediate direct ZIP download, or a generated shareable link they can send to a recipient (e.g. a music supervisor) directly.
- **D-12:** The shareable export link is a genuinely more sensitive artifact than Phase 9's public share-player link (Phase 9's link is deliberately stream-only, no file access; this one exposes actual master/stems files). It must be an expiring link (e.g. 7 days) — not a permanent link requiring manual revocation.
- **D-13 (deferred, explicit dependency noted):** The user's idea of letting a Funūn-member music supervisor request an export pack directly through the platform (request → artist notified → artist approves → pack/link sent) is real and worth building, but explicitly deferred until after Phase 10 (Connections & Notifications) ships — it depends on in-app notification infrastructure that doesn't exist yet. Do not build a parallel, throwaway notification mechanism for this now.

**Visual Fidelity**
- **D-14:** The existing 3-column layout (`PlaybackView.tsx`: tracklist+files / center player / credits+metadata) already broadly matches `playback.html`'s structure — no dedicated visual redesign pass is needed. New features (uploads, toggle changes, readiness widget) build directly into the current component structure.

### Claude's Discretion
- Exact visual treatment/placement details of the readiness-score widget within the topbar and tracklist-column contexts (D-02/D-08) — follow existing `Topbar` component conventions and `app.css` motion/spacing tokens.
- Exact storage bucket/path convention for stems ZIPs and instrumental files (new upload targets) — follow the existing `track-audio` bucket pattern (`app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts`) unless a clear reason emerges to split buckets.
- Exact wording/placement of the stems info (ⓘ) button copy (D-09).
- PDF generation approach for the credits and metadata sheets (D-10) — planner's call on library/technique, following whatever pattern the codebase already uses for other PDF-adjacent exports if one exists (e.g. the metadata one-sheet's "Print → Save as PDF" pattern noted in `app/(artist)/vault/[projectId]/metadata/onesheet/page.tsx`).
- Exact expiry window for the export link (D-12) — 7 days suggested as a reasonable default; not a hard requirement.

### Deferred Ideas (OUT OF SCOPE)
- Multiple individual stem files (per-instrument, vs. one bundled ZIP) — revisit if artists request it after real-life testing with the v1 bundled-ZIP approach.
- Requiring a genuinely playable stems mix (beyond the ZIP download) — revisit after live testing; the separate Instrumental upload slot covers the playable-audio need for now.
- In-app request/approve flow for Funūn-member music supervisors/industry users to request an Export Pack directly through the platform — explicitly deferred until after Phase 10 (Connections & Notifications) ships; do not build a parallel notification mechanism now.
</user_constraints>

<phase_requirements>
## Phase Requirements

> This phase does not map to `.planning/REQUIREMENTS.md` IDs (those cover the v1.2 Green Room milestone — PROFILE-*, CONNECT-*, NOTIF-*, PRESENCE-*, DISCOVER-*, SAFETY-*). Phase 14 is existing Wave 1 Sound Vault functionality; CONTEXT.md's locked decisions (D-01 through D-14, reproduced verbatim above) are the authoritative requirement set for this phase. The table below maps each decision to the research finding that supports planning it.

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01 | Project card links directly to playback room | Trivial routing change — no new research needed; `VaultProjectCard.tsx` link target and `ProjectTabs.tsx` confirmed as the integration points |
| D-02 | Readiness-score widget, two placements | Existing `lib/vault/readiness.ts` score + `Topbar` component conventions (inspected) — pure display wiring, no new backend logic |
| D-03/D-04/D-06 | Stems as download-only ZIP; new Instrumental playable slot; Master/Instrumental toggle | `tracks.metadata` JSONB extension pattern (Code Examples) — no new DB columns needed, mirrors existing `metadata.master` shape |
| D-05 | Upload controls in multiple places, one canonical record | Direct-to-storage upload (Pattern 1) + JSON-only metadata PATCH keeps a single write path regardless of which UI triggers it |
| D-07 | 250MB stems ZIP upload limit | Architecture Patterns Pattern 1 + Pitfall 1 — direct-to-Storage/TUS approach required because Vercel's 4.5MB body limit rules out proxying through a Route Handler |
| D-08/D-09 | Empty-state hiding; stems info copy | UI-only, no new research required beyond confirming upload/download affordances can be conditionally rendered based on `metadata.stems`/`metadata.instrumental` presence |
| D-10 | Export Pack bundles everything + 2 PDFs | Standard Stack (`archiver`, `@react-pdf/renderer`) + Architecture Pattern 2 |
| D-11 | Artist choice: direct download vs. shareable link | Architecture Pattern 2 (direct download) + Pattern 3 (shareable link) |
| D-12 | Expiring link (~7 days), no manual revocation | Architecture Pattern 3 — native `createSignedUrl` TTL, Don't Hand-Roll section |
| D-13 | Deferred — no research needed this phase | Out of scope per CONTEXT.md; not researched |
| D-14 | No visual redesign — build into existing structure | Confirmed via direct inspection of `PlaybackView.tsx` (325 lines, 3-column layout already matches target) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **TypeScript strict mode** — all new modules (`lib/vault/export-pack.ts`, PDF templates, upload components) must satisfy `"strict": true`; explicit optional (`?`) params, no implicit any.
- **Path aliases only** — new files import via `@/lib/...`, `@/components/...`; never relative `../` imports.
- **Naming conventions** — new files kebab-case (`stems-upload.tsx`, `export-pack.ts`); new functions camelCase, predicate functions prefixed `is`/`can`/`has` (e.g. `hasStems()`, `canDownloadStems()`); PascalCase for new component names (`StemsUpload`, `ExportPackButton`).
- **Error handling** — throw descriptive `Error` instances with actionable messages (e.g. `"Stems archive must be under 250MB"`, mirroring the existing `"Audio must be WAV, FLAC, MP3, or AAC format"` style); destructure `{ error, data }` from Supabase responses and check `error` before using `data`, matching existing routes.
- **No console.log in committed code** — export-pack route and upload handlers must not leave debug logging in; errors bubble via thrown `Error`/`NextResponse.json({ error })`, consistent with the rest of the API layer.
- **Server-first architecture** — the Export Pack route stays a server-side Route Handler (`app/api/vault/[projectId]/export/route.ts`), not a client-side fetch-and-assemble; this also satisfies the "Node.js APIs, not edge runtime" requirement for `archiver`.
- **RLS-enforced multi-tenancy** — any new bucket/table changes must carry owner-scoped RLS policies in the same migration that adds them (mirrors `004_track_audio_storage.sql`'s four-policy pattern); the CLAUDE.md architectural constraint "file uploads use signed URLs; service role key used for server-side signed-URL generation in `lib/storage/index.ts`" extends to the new Export Pack signed URL.
- **Threading constraint** — CLAUDE.md explicitly flags: "Long-running tasks (AI calls, PDF generation) are awaited in API routes; consider job queue for 30s+ operations." This phase's PDF generation + ZIP bundling is exactly this kind of task — see Pitfall 3 for the recommended `maxDuration` mitigation before reaching for a job queue.
- **No test framework installed** — verification for this phase is manual per `human_verify_mode: "end-of-phase"`; see Validation Architecture's Wave 0 Gaps for the one behavior (D-07, deployment-dependent body-size limit) that specifically cannot be caught by local dev testing alone.

## Summary

Phase 14 requires three genuinely new capabilities layered onto an existing, working Sound Vault: (1) large (250MB) file uploads for a stems ZIP and a new instrumental audio slot, (2) a server-generated Export Pack that bundles up to 5 files (master, share MP3, stems ZIP, instrumental, plus two newly-generated PDFs) into a single ZIP, delivered either as an immediate download or an expiring shareable link, and (3) the PDF generation needed to produce those two sheets as real files (not a client "Print to PDF" affordance).

The single most important finding is **architectural, not library-driven**: this codebase's existing audio-upload route proxies raw file bytes through a Next.js API route body (`request.formData()`), and Vercel Serverless Functions enforce a hard, non-configurable 4.5MB request body limit `[CITED: vercel.com/docs/functions/limitations]`. The existing 50MB master-audio upload almost certainly cannot work today in production past 4.5MB — App Router Route Handlers have no equivalent of the old Pages API `bodyParser.sizeLimit` escape hatch; the ceiling is enforced by the platform, not by Next.js. This means **the stems (250MB) and instrumental uploads cannot simply reuse the current route pattern with a bigger `MAX_BYTES` constant** — they must upload directly from the browser to Supabase Storage, bypassing the Next.js function for the byte transfer entirely. The good news: this codebase's `track-audio` bucket already has RLS policies scoping `INSERT` to path-owner (`(storage.foldername(name))[1] = auth.uid()::text`, migration `004_track_audio_storage.sql`), so a direct authenticated-client upload is already structurally supported — it has just never been used (no direct-to-storage upload exists anywhere in the current codebase; this is genuinely new, as CONTEXT.md's `code_context` flags).

For ZIP bundling, `archiver` (npm, `OK` verdict, 8.x, ~30M weekly downloads) is the standard streaming-ZIP library for Node and integrates cleanly with a Route Handler running in the Node.js runtime (not Edge) by piping its output stream into a `Response` body. For PDF generation, `@react-pdf/renderer` (npm, `OK` verdict, 4.x, ~4M weekly downloads) is the correct choice over Puppeteer/Playwright: it is a pure-JS layout engine with no headless-browser dependency, so it sidesteps Vercel's ~250MB deployment bundle limit that a bundled Chromium binary (~300MB) would blow past outright `[CITED: vercel.com/docs/functions/limitations]`. For the expiring shareable link, the codebase already has a working precedent — `supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds)`, used today at a 2-hour TTL (`app/(artist)/vault/[projectId]/page.tsx`, `.../metadata/embed/route.ts`) — and this native mechanism should be reused at a 7-day TTL rather than hand-rolling a DB token/`expires_at` table: Supabase's own storage layer already enforces expiry, satisfying D-12's "no manual revocation" requirement for free.

**Primary recommendation (REVISED — see Confirmed Constraints below):** Build stems/instrumental uploads as direct browser→Supabase-Storage writes (bypassing the Next.js body-size ceiling); generate the Export Pack in a single Node-runtime Route Handler using `archiver` + `@react-pdf/renderer` (server-side PDF). Given the confirmed **Hobby tier** (10s hard `maxDuration`, not raisable), delivery for **both** "direct download" and "shareable link" must go through the same assemble-then-store-then-signed-URL path — never stream the finished archive directly as the Route Handler's `Response` body. The function's job is only to assemble the bundle and `upload()` it to Storage; the actual (potentially large, potentially slow-for-the-recipient) byte transfer happens client-side, direct from Supabase's storage/CDN endpoint, entirely outside the 10s function budget. "Direct download" = short-TTL signed URL (e.g. 5 min), auto-triggered; "shareable link" = long-TTL signed URL (7 days), copied by the artist. No new DB table, no token system, no job queue needed for v1 — but see Pitfall 3 for the real risk this tier imposes on the assembly step itself.

### Confirmed Constraints (resolved during plan-phase, 2026-07-06)
- **Vercel tier: Hobby** (confirmed by user). `maxDuration` is hard-capped at 10s and cannot be raised — this is not a config option, it's a plan-tier ceiling. This invalidates the `maxDuration = 300` figure used below in Pattern 2 and Pitfall 3; both are corrected in place.
- **Existing master/share upload route fix: explicitly OUT OF SCOPE for Phase 14** (confirmed by user). The likely-broken 50MB proxy-upload route (Pitfall 1, Open Question 1) is a separately-tracked pre-existing issue, not a Phase 14 deliverable. Phase 14's hard requirement remains only that the *new* stems/instrumental uploads work correctly at 250MB via the direct-to-storage path.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stems ZIP / instrumental file upload (bytes) | Browser / Client (direct-to-Storage) | Database / Storage (RLS-enforced bucket) | Bypasses the 4.5MB Vercel body-size ceiling on serverless functions; RLS on `storage.objects` already enforces per-user path ownership, so the client can write directly and safely |
| Stems ZIP / instrumental metadata (path, size) persistence | API / Backend | Database / Storage | A small JSON-only follow-up call updates `tracks.metadata`; no file bytes cross this boundary, so it stays well under any body-size limit |
| Master/Instrumental playback toggle | Browser / Client | — | Pure client audio-element source swap in `PlaybackView.tsx`, no new backend surface |
| Export Pack bundling (ZIP + PDF generation) | API / Backend | Database / Storage (source file reads) | CPU/stream-bound work belongs server-side; reads existing Storage objects and DB rows, produces a new Storage object or streamed response |
| Export Pack delivery (download vs. link) | API / Backend | CDN / Storage (signed URL) | The signed URL itself is served directly by Supabase Storage's CDN-fronted endpoint once generated — the Next.js app is out of the hot path for link-based delivery |
| Readiness-score widget | Browser / Client (display) | API / Backend (existing `lib/vault/readiness.ts` score, already computed server-side) | Pure read/display of an already-computed value; no new calculation logic |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `archiver` | 8.0.0 | Server-side streaming ZIP creation for the Export Pack bundle | De facto standard Node ZIP library; streams output (does not buffer the whole archive in memory), integrates with any writable/readable stream source `[VERIFIED: npm registry]` |
| `@react-pdf/renderer` | 4.5.1 | Server-side PDF generation for the credits/splits sheet and metadata sheet | Pure-JS PDF layout engine — no headless browser, no large binary, safe for Vercel's serverless bundle-size limits; renders from JSX/React component trees, which fits this codebase's React-everywhere convention `[VERIFIED: npm registry]` |
| `tus-js-client` | 4.3.1 | Resumable, chunked direct-to-Supabase-Storage upload for the 250MB stems ZIP | Supabase's storage backend implements the TUS resumable-upload protocol and explicitly recommends it over the standard single-PUT client upload for files above ~6MB, for reliability over flaky connections `[CITED: supabase.com/docs/guides/storage/uploads/resumable-uploads]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@supabase/auth-helpers-nextjs` (already installed, 0.10.0) | existing | Browser-side authenticated Supabase client for the direct-to-storage upload | Already the project's client-creation pattern (`lib/supabase/client.ts` → `createClientComponentClient()`); reuse rather than introducing `@supabase/ssr` or a second client pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `archiver` | `jszip` (3.10.1) | `jszip` builds the whole archive in memory (`generateAsync`) rather than streaming — fine for small bundles, risky for a bundle that can include a 250MB stems ZIP plus a 50MB master; `archiver` avoids the memory spike |
| `@react-pdf/renderer` | `puppeteer`/`playwright` HTML-to-PDF | Full HTML/CSS fidelity (could literally reuse the onesheet page's JSX), but a bundled Chromium is ~300MB, which alone exceeds Vercel's ~250MB serverless deployment bundle limit; workarounds (`@sparticuz/chromium-min`, downloading the binary at runtime) exist but add real operational complexity for no benefit here — the credits/metadata sheets are simple structured documents, not full-fidelity marketing pages `[CITED: vercel.com/docs/functions/limitations]` |
| `@react-pdf/renderer` | `pdfkit` / `pdf-lib` | Lower-level, imperative PDF construction (manual coordinate placement) — more code for the same result; `@react-pdf/renderer`'s component model (`<Document>`, `<Page>`, `<View>`, `<Text>`) is a better fit for a two-sheet, tabular-data document and for reusing the shape of data `buildBundle()`/`readComposers()` already produce |
| Direct-to-Storage upload via plain `supabase.storage.upload()` | `tus-js-client` resumable upload | Plain upload is simpler code and works up to the bucket's `file_size_limit`, but Supabase explicitly recommends TUS for anything above ~6MB for resilience; given stems ZIPs will commonly be 50–250MB, resumability materially reduces failed-upload support burden. Instrumental (a single audio file, likely well under 50MB) can reasonably use the simpler plain-upload path if the planner wants to reduce net-new surface area — recommend TUS for stems specifically, discretion on instrumental |

**Installation:**
```bash
npm install archiver @react-pdf/renderer tus-js-client
npm install --save-dev @types/archiver
```

**Version verification:** All three versions above were confirmed live via `npm view <pkg> version` against the npm registry on 2026-07-06 (archiver 8.0.0, published 2026-05-08; @react-pdf/renderer 4.5.1, published 2026-04-15; tus-js-client 4.3.1, published 2025-01-16). Per the package-legitimacy gate, package **names** were still sourced from training knowledge/WebSearch, so they carry `[ASSUMED]` provenance until a human confirms the intended package is indeed what gets installed — see Package Legitimacy Audit below for the full signal set that supports proceeding without a `checkpoint:human-verify` gate.

## Package Legitimacy Audit

| Package | Registry | Age (first publish unknown, latest checked) | Weekly Downloads | Source Repo | Verdict | Disposition |
|---------|----------|------|-------------------|-------------|---------|-------------|
| `archiver` | npm | Actively maintained, last publish 2026-05-08 | ~29.9M/wk | github.com/archiverjs/node-archiver | OK | Approved |
| `@react-pdf/renderer` | npm | Actively maintained, last publish 2026-04-15 | ~3.9M/wk | github.com/diegomura/react-pdf | OK | Approved |
| `tus-js-client` | npm | Actively maintained, last publish 2025-01-16 | ~992K/wk | github.com/tus/tus-js-client | OK | Approved |

**Packages removed due to `[SLOP]` verdict:** none
**Packages flagged as suspicious `[SUS]`:** none

All three names were sourced via training knowledge / WebSearch (`[ASSUMED]` provenance for the name itself), then checked with `gsd-tools query package-legitimacy check --ecosystem npm` — all returned `OK` with no postinstall scripts, active maintenance, high download counts, and a real linked source repo. No `checkpoint:human-verify` gate is required before install based on these signals, but the planner should still have the human confirm `npm install archiver @react-pdf/renderer tus-js-client` resolves to the expected packages (not a typo-squat) at install time, per standard practice.

## Architecture Patterns

### System Architecture Diagram

```text
                        ┌────────────────────────────────────────────┐
                        │             Browser (Playback Room)         │
                        │  PlaybackView.tsx (Master/Instrumental      │
                        │  toggle, Download-stems button, upload UI)  │
                        └───────────────┬──────────────────┬─────────┘
                                        │                  │
        (A) Direct-to-Storage upload   │                  │  (B) Export Pack request
        (stems ZIP / instrumental)     │                  │  (download OR share link)
                                        ▼                  ▼
                        ┌───────────────────────┐  ┌─────────────────────────────┐
                        │  Supabase Storage      │  │  /api/vault/[id]/export     │
                        │  bucket: track-audio   │  │  (Node runtime Route        │
                        │  RLS: path-owner only  │  │  Handler)                   │
                        │  file_size_limit: 250MB│  │                             │
                        └──────────┬────────────┘  │  1. Read tracks + project    │
                                   │                │     rows (master/share/     │
                (C) tiny JSON-only │                │     stems/instrumental      │
                metadata PATCH     │                │     paths, composer splits, │
                (path/size only,   │                │     ISRC/ISWC/BPM/key)      │
                no file bytes)     ▼                │  2. Fetch each existing     │
                        ┌───────────────────────┐   │     Storage object as a     │
                        │ tracks.metadata JSONB │   │     stream                  │
                        │  { stems: {...},      │◄──┤  3. Render credits + meta   │
                        │    instrumental:{...}}│   │     sheets via              │
                        └───────────────────────┘   │     @react-pdf/renderer     │
                                                     │  4. Pipe all streams into   │
                                                     │     archiver → ZIP          │
                                                     └───────────┬─────────────────┘
                                                                 │
                                                                 │
                                                    Upload finished ZIP to Storage
                                                    (upsert, stable path) — ALWAYS,
                                                    regardless of delivery choice
                                                    (confirmed Hobby tier: 10s hard
                                                    maxDuration rules out ever
                                                    streaming the pack through the
                                                    function response — see Pitfall 3)
                                        ┌────────────────────────┴───────────────────────┐
                                        ▼                                                ▼
                          (D-11 direct download)                          (D-11 shareable link)
                        createSignedUrl(path, 60*5)                    createSignedUrl(path,
                        — 5 min TTL, browser                           60*60*24*7) — 7 days,
                        immediately navigates to it;                   artist copies/sends the
                        download happens client→                       raw signed URL — no app
                        Supabase directly, never                       access needed by the
                        proxied through the Vercel                     recipient (D-12)
                        function
```

### Recommended Project Structure
```
app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts   # existing — keep for share/master (small proxy uploads); optionally extend for consistency in a future phase
app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts   # NEW — JSON-only metadata PATCH after direct-to-storage upload (path, size, filename)
app/api/vault/[projectId]/tracks/[trackId]/instrumental/route.ts  # NEW — JSON-only metadata PATCH, same shape
app/api/vault/[projectId]/export/route.ts                   # NEW — Export Pack bundling + delivery (Node runtime, GET or POST)
lib/vault/export-pack.ts                                    # NEW — assemble bundle manifest (which files exist), shared by download + link paths
lib/vault/pdf/credits-sheet.tsx                              # NEW — @react-pdf/renderer <Document> for credits/splits
lib/vault/pdf/metadata-sheet.tsx                             # NEW — @react-pdf/renderer <Document> for ISRC/ISWC/BPM/key/language
lib/supabase/client.ts                                       # existing — reused as-is for the direct browser upload
components/vault/StemsUpload.tsx                             # NEW (or folded into TrackList.tsx) — direct-to-storage upload UI, mirrors AudioSlot pattern
```

### Pattern 1: Direct browser-to-Supabase-Storage upload (bypasses Vercel body-size limit)
**What:** The browser's authenticated Supabase client uploads file bytes straight to Supabase Storage's own endpoint. The Next.js Route Handler only ever receives a small JSON payload afterward (path, size, filename) to persist onto the `tracks` row.
**When to use:** Any upload where the file may exceed ~4MB on a Vercel deployment — applies to the stems ZIP (250MB) and, for consistency, the instrumental file.
**Example:**
```typescript
// Source: Supabase Storage docs pattern (createClientComponentClient already used
// in this codebase — lib/supabase/client.ts) + tus-js-client resumable upload
// https://supabase.com/docs/guides/storage/uploads/resumable-uploads
import * as tus from 'tus-js-client'
import { createClient } from '@/lib/supabase/client'

async function uploadStems(file: File, userId: string, projectId: string, trackId: string) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const path = `${userId}/${projectId}/${trackId}.stems.zip`

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session?.access_token}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: 'track-audio',
        objectName: path,
        contentType: 'application/zip',
      },
      chunkSize: 6 * 1024 * 1024, // Supabase requires a fixed 6MB chunk size for TUS
      onError: reject,
      onSuccess: () => resolve(),
    })
    upload.start()
  })

  // Small JSON-only follow-up — no file bytes cross this boundary.
  await fetch(`/api/vault/${projectId}/tracks/${trackId}/stems`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, size: file.size, name: file.name }),
  })
}
```

### Pattern 2: Streaming ZIP assembly from mixed sources, uploaded to Storage (NOT streamed as the Response body)
**What:** `archiver` pipes multiple readable streams — some fetched live from Supabase Storage, some generated in-process by `@react-pdf/renderer` — into one ZIP output stream. On confirmed **Hobby tier** (10s hard `maxDuration`, not raisable), this stream is piped into a Storage `upload()` call, NOT returned directly as the Route Handler's `Response` — streaming the full archive out to the requester's browser would keep the function alive for however long that download takes (which can vastly exceed 10s for a 250MB+ bundle on a slow connection), and there is no way to raise this ceiling on Hobby.
**When to use:** The Export Pack bundling route, for both the "direct download" and "shareable link" delivery options (they now share this exact same assembly step — only the resulting signed URL's TTL and client behavior differ; see Pattern 3).
**Example:**
```typescript
// Source: archiver docs (github.com/archiverjs/node-archiver) + Next.js Route
// Handler pattern. maxDuration is set to 10 (the Hobby ceiling) as a explicit,
// honest declaration — NOT 300; Hobby cannot raise this regardless of what's written here.
export const runtime = 'nodejs'
export const maxDuration = 10 // Hobby tier hard ceiling — cannot be raised; see Pitfall 3

import archiver from 'archiver'
import { Readable } from 'node:stream'

export async function POST(request: Request, { params }: RouteCtx) {
  // ...auth + ownership checks (mirror existing route pattern)...
  // zlib level 0 ("store", no compression) for already-compressed inputs
  // (stems ZIP, MP3) — re-compressing already-compressed bytes wastes CPU time
  // that this 10s budget cannot afford. Only the two small PDFs benefit from
  // any compression, and even that cost is negligible at their size.
  const archive = archiver('zip', { zlib: { level: 0 } })
  const passthrough = new stream.PassThrough()
  archive.pipe(passthrough)

  for (const file of filesToBundle) {
    const { data } = await service.storage.from('track-audio').download(file.path)
    if (data) archive.append(Readable.fromWeb(data.stream()), { name: file.filename })
  }
  archive.append(await renderCreditsSheet(bundle), { name: 'credits-and-splits.pdf' })
  archive.append(await renderMetadataSheet(bundle), { name: 'metadata.pdf' })
  archive.finalize()

  const packPath = `${userId}/${projectId}/export-pack.zip`
  await service.storage.from('track-audio').upload(packPath, passthrough, {
    contentType: 'application/zip',
    upsert: true,
  })

  // See Pattern 3 for the two signed-URL variants built from packPath.
  return NextResponse.json({ path: packPath })
}
```

### Pattern 3: Expiring signed URL, two TTL variants for the same assembled pack (no hand-rolled token system)
**What:** After Pattern 2 uploads the assembled pack to `packPath`, call `createSignedUrl(packPath, expiresIn)` with one of two TTLs depending on D-11's delivery choice. Both variants call the exact same function — the only difference is the `expiresIn` argument and what the client does with the URL. Supabase enforces expiry at the storage layer, so there is no `expires_at` column to check and no revocation logic to write.
**When to use:** D-11's delivery choice, for BOTH options, given confirmed Hobby tier rules out ever streaming the pack through the function response (Pattern 2's note):
- **"Direct download" (immediate):** short TTL (e.g. 5 minutes) — just long enough for the client to receive the URL and the browser to start the download; not meant to be reused or shared.
- **"Shareable link":** long TTL (7 days, per D-12) — the artist copies/sends this URL to a recipient.
**Example:**
```typescript
// Source: existing codebase precedent, extended/branched TTL
// app/(artist)/vault/[projectId]/page.tsx:188 already does
// .createSignedUrls(paths, 60 * 60 * 2) at a 2-hour TTL for private downloads
async function signExportPack(packPath: string, mode: 'download' | 'share') {
  const expiresIn = mode === 'download' ? 60 * 5 : 60 * 60 * 24 * 7 // 5 min vs 7 days
  const { data: signed } = await service.storage
    .from('track-audio')
    .createSignedUrl(packPath, expiresIn)
  return signed?.signedUrl
  // Client either immediately navigates to this URL (download mode — browser
  // downloads directly from Supabase, NOT proxied through the Vercel function,
  // so the 10s Hobby ceiling never applies to this leg) or displays it for the
  // artist to copy (share mode). No app route, no app auth needed on the
  // recipient's end for either case.
}
```

### Anti-Patterns to Avoid
- **Proxying the stems ZIP through a Next.js Route Handler body:** Will fail with `413 FUNCTION_PAYLOAD_TOO_LARGE` past 4.5MB on Vercel — this is a platform-level ceiling, not a Next.js config option, and there is no App Router equivalent of the old Pages API `bodyParser.sizeLimit`.
- **Hand-rolling a token + `expires_at` table for the shareable export link:** Supabase Storage's `createSignedUrl(path, expiresIn)` already does this natively and is already used elsewhere in this codebase at a shorter TTL — reuse it rather than building a parallel expiry mechanism (this is exactly the kind of "don't hand-roll" problem the phase should avoid).
- **Buffering the entire ZIP or entire source files in memory before responding:** With a 250MB stems ZIP possibly in the bundle, `archive.append()` fed a full in-memory `Buffer` for every file (e.g. via `jszip`'s `generateAsync`) risks hitting serverless function memory ceilings; prefer streaming (`Readable.fromWeb`/`Readable.toWeb`) so peak memory tracks chunk size, not total size.
- **Choosing Puppeteer/Playwright for the two PDF sheets:** A bundled Chromium binary (~300MB) alone exceeds Vercel's ~250MB serverless deployment bundle size limit; `@react-pdf/renderer` avoids this entirely and is more than sufficient for two structured, tabular documents.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Expiring shareable link | Custom token generation + `expires_at` column + on-access expiry check | `supabase.storage.createSignedUrl(path, expiresInSeconds)` | Already the exact mechanism this codebase uses elsewhere (2-hour TTL); Storage enforces expiry server-side with zero app-level bookkeeping |
| Large file upload past 4.5MB | A custom chunked-upload protocol proxied through Next.js API routes | `tus-js-client` against Supabase Storage's native TUS endpoint | Supabase Storage already implements the TUS resumable-upload protocol; reinventing chunking/resumption logic is high-risk, low-value custom code |
| ZIP archive assembly | Manual binary ZIP-format writing, or fully-buffered `jszip` for a 250MB+ bundle | `archiver` (streaming) | Streaming ZIP creation with correct format/CRC handling is a solved, heavily-used problem; don't reimplement or risk memory blowups |
| PDF file generation | `pdfkit`/`pdf-lib` manual coordinate-based drawing, or a headless-browser HTML-to-PDF pipeline | `@react-pdf/renderer` | A declarative component model matches this codebase's React-first convention and avoids the Puppeteer/Playwright binary-size problem on serverless |

**Key insight:** Every "genuinely new" piece of this phase (large uploads, ZIP bundling, PDF generation, expiring links) has a well-established, actively-maintained library or a native Supabase primitive that solves it correctly — the actual engineering risk in this phase is *not* picking the wrong library, it's the platform-level file-size ceiling on the existing upload route pattern, which is easy to miss because it fails silently in local dev (`next dev` has no such limit) and only breaks in production on Vercel.

## Runtime State Inventory

> Not applicable — Phase 14 is additive (new upload slots, new export route, new PDF templates), not a rename/refactor/migration of existing identifiers. No stored data, live service config, OS-registered state, secrets, or build artifacts reference strings that this phase renames.

**Nothing found in any category** — verified by reviewing CONTEXT.md's decisions (D-01 through D-14), none of which involve renaming an existing table, column, bucket, env var, or external service reference. This phase only adds new JSONB fields (`tracks.metadata.stems`, `tracks.metadata.instrumental`), a new route, and a bucket config bump (`file_size_limit`, `allowed_mime_types` — additive, not a rename).

## Common Pitfalls

### Pitfall 1: Assuming the existing 50MB master-upload route "already works" as a scaling template
**What goes wrong:** Naively raising `MAX_BYTES` in `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts` from 50MB to 250MB (or building a new stems route on the identical `request.formData()` pattern) will pass code review and work perfectly in local `next dev`, then fail with `413 FUNCTION_PAYLOAD_TOO_LARGE` in production for any file over 4.5MB.
**Why it happens:** Vercel's serverless function request body limit is enforced by the platform infrastructure in front of the function, not by Next.js — there is nothing in `next.config.mjs` or the route file that can raise it. Local dev has no such proxy in front of it, so the bug is invisible until deployed.
**How to avoid:** Route stems and instrumental uploads through a direct browser→Supabase-Storage path (Pattern 1 above); never through a Next.js Route Handler body for anything that can plausibly exceed a few MB.
**Warning signs:** Any new/changed upload route that calls `request.formData()` or `request.arrayBuffer()` for a file expected to exceed ~4MB.

### Pitfall 2: Forgetting `export const runtime = 'nodejs'` on the export-pack route
**What goes wrong:** `archiver` and Node's `stream`/`zlib` APIs are unavailable in the Edge runtime; if the Route Handler defaults to (or is accidentally configured for) Edge, the build or the request will fail.
**Why it happens:** Next.js App Router Route Handlers can run on either runtime; Edge is sometimes the assumed default for "simple" routes.
**How to avoid:** Explicitly set `export const runtime = 'nodejs'` on the export-pack route (mirrors the existing precedent in `app/api/vault/[projectId]/tracks/[trackId]/metadata/embed/route.ts`, which already does this for ID3/`node-id3` Node-only APIs).
**Warning signs:** Import errors for `node:stream`/`archiver` only surfacing at deploy time, not locally.

### Pitfall 3: Long-running bundling exceeding the serverless function's max duration (CONFIRMED — this project is on Hobby tier)
**What goes wrong:** A bundle containing a 250MB stems ZIP plus a 50MB master plus a share MP3 plus an instrumental plus two PDFs could take long enough (especially re-fetching each Storage object as a stream, then re-uploading the assembled archive) to exceed the function's duration budget.
**Why it happens:** Confirmed during plan-phase: this project is deployed on **Vercel Hobby tier**, which hard-caps `maxDuration` at **10 seconds with no override** — there is no config, env var, or `maxDuration` value that raises this on Hobby (unlike Pro's 300s or Enterprise's higher ceilings). CLAUDE.md's own architectural constraint independently flags this class of problem: "Long-running tasks... consider job queue for 30s+ operations" — on Hobby, the real threshold to worry about is 10x tighter than that. Bundling is mostly I/O passthrough (not CPU-heavy), but the assembly step now does TWO large transfers server-side (download existing sources from Storage, then upload the finished archive back to Storage) within that same 10s window — for a near-250MB stems bundle this requires sustained throughput that is not guaranteed.
**How to avoid (revised for Hobby tier):**
1. Set `export const maxDuration = 10` honestly (raising it does nothing on Hobby — don't write `300` and assume it works).
2. Never stream the finished archive as the Route Handler's `Response` body (Pattern 2/3 revision) — the function's job is only to assemble + upload to Storage; the actual client-facing download happens via a signed URL served directly by Supabase, outside the function's duration budget entirely.
3. Use `archiver('zip', { zlib: { level: 0 } })` (store, no compression) for already-compressed inputs (stems ZIP, MP3) to minimize CPU time inside the 10s window — only the two small PDFs are cheap to compress and it barely matters at their size.
4. **This may still not be enough for very large bundles** (e.g. a stems-heavy multi-track album). If production testing (see Validation Architecture) shows the assembly step itself routinely exceeds 10s, the only real fixes are: (a) upgrade to Vercel Pro (removes the ceiling entirely, trivial config change, no code change), or (b) a background/queued assembly job (webhook-triggered function + polling or realtime status, genuinely new infrastructure). Do not build (b) speculatively for v1 — first confirm with production-realistic file sizes whether the 10s ceiling is actually hit; recommend (a) as the pragmatic fix if it is, since it requires zero application code changes.
**Warning signs:** Export Pack requests failing/timing out specifically for large-catalog releases (albums with many tracks, or stems-heavy releases) but not singles — this is expected to be a real, not theoretical, risk on Hobby tier and must be verified against actual deployed file sizes, not just local dev (see Validation Architecture — Wave 0 Gaps).

### Pitfall 4: Storage bucket `allowed_mime_types` silently rejecting ZIP uploads
**What goes wrong:** The `track-audio` bucket's `allowed_mime_types` array (migration `004_track_audio_storage.sql`) currently only lists audio MIME types — a stems ZIP upload will be rejected at the storage layer with no mention of "add zip to the allowlist" anywhere obvious in application code.
**Why it happens:** The bucket-level allowlist is enforced by Supabase Storage itself, separate from any application-level file-type check.
**How to avoid:** In the same migration that raises `file_size_limit` to 250MB, also add `'application/zip'` and `'application/x-zip-compressed'` (the MIME type some Windows zip tools emit) to `allowed_mime_types`.
**Warning signs:** Direct-to-storage stems uploads failing with a storage-layer error that doesn't match any client-side validation message.

### Pitfall 5: Treating the Export Pack's public link like Phase 9's public share player
**What goes wrong:** Conflating this phase's export link with the `/r/[projectId]` "Now Playing" pattern (gated only by a boolean `is_public` flag on the project, no expiry, streams audio only) risks either making the export link permanent (violates D-12) or making it too broad (exposing all of a project's files publicly via the `is_public` flag rather than a scoped, time-boxed grant).
**Why it happens:** Both are "share this project with someone outside the app" features, but they have fundamentally different sensitivity and lifecycle requirements (D-12 explicitly calls this out).
**How to avoid:** Keep the two mechanisms fully separate: `/r/[projectId]` stays keyed on `vault_projects.is_public`, streams via `TrackView.audioUrl`, and lives on the public/no-auth route group (`app/r/`); the Export Pack link is a Supabase Storage `signedUrl` with a 7-day TTL, generated per-request from an authenticated, owner-only API call, and requires no new `is_public`-style flag or public route at all — the recipient hits the raw signed URL directly.
**Warning signs:** Any design that adds a new boolean "pack is public" flag to `vault_projects`, or that reuses `/r/[projectId]` for file downloads.

## Code Examples

Verified patterns from official sources / existing codebase:

### Existing signed-URL precedent (extend TTL, don't replace mechanism)
```typescript
// Source: app/(artist)/vault/[projectId]/page.tsx:188 (existing codebase)
.createSignedUrls(paths, 60 * 60 * 2) // 2-hour TTL, already in production use
```

### Existing role-based upload/metadata pattern (template for stems/instrumental metadata PATCH)
```typescript
// Source: app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts (existing codebase)
// The `metadata.master = { path, size, ext }` sub-object pattern is the direct
// precedent for `metadata.stems = { path, size, name }` and
// `metadata.instrumental = { path, size, ext }` — no new DB columns/migration
// needed for track-level file references, just an extended JSONB shape.
update = { metadata: { ...metadata, master: { path, size: file.size, ext } } }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Proxy file uploads through API route body (`request.formData()`) | Direct-to-object-storage upload from the browser, backend only persists metadata | Standard practice for any serverless deployment target (Vercel, AWS Lambda, etc.) since these platforms adopted small hard request-body caps | Existing 50MB master/share upload route likely already needs this fix independent of Phase 14; Phase 14 is the forcing function that surfaces it for stems (250MB makes the gap impossible to ignore) |
| Client "Print → Save as PDF" for shareable documents | Server-rendered PDF as a real file artifact | N/A — codebase-specific; onesheet page's print pattern was a reasonable v1 shortcut but doesn't produce a bundleable file | Export Pack needs an actual PDF file object to zip; the onesheet's print pattern cannot produce one without a headless browser |

**Deprecated/outdated:**
- None — no libraries or patterns recommended here are being deprecated in favor of something else; this is new capability, not a migration.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ~~The project is actually deployed on Vercel~~ **CONFIRMED**: Vercel Hobby tier (user-confirmed during plan-phase, 2026-07-06). The 4.5MB body-size ceiling and ~250MB deployment bundle limit apply as described; `maxDuration` is hard-capped at 10s with no override (no Pro/Enterprise `maxDuration` headroom available) | Summary, Pitfall 1, Pitfall 3, Alternatives Considered | No longer a risk — this is now a confirmed hard constraint, not an assumption. All Hobby-tier-dependent recommendations (never stream the full archive as the Response body; explicit production-realistic timing verification) should be treated as required, not conditional |
| A2 | The existing 50MB master-audio upload route does not currently work in production for files over ~4.5MB | Summary, Pitfall 1 | Still inferred, not reproduced live — but moot for Phase 14 planning purposes: user confirmed fixing this route is explicitly **out of scope** for this phase regardless of whether the bug is real. Tracked as a separate pre-existing issue |
| A3 | Reusing the `track-audio` bucket (raising its `file_size_limit` and `allowed_mime_types`) is preferable to a dedicated new bucket for stems/instrumental | Standard Stack, Pitfall 4 | Low risk either way — CONTEXT.md already flags this as Claude's discretion; if a clear operational reason to split buckets emerges during planning (e.g., wanting a different retention/cleanup policy for large ZIPs vs. small audio files), a dedicated bucket is a straightforward alternative |
| A4 | A 7-day `createSignedUrl` TTL, generated at pack-creation time and not re-derived per click, satisfies D-12 without any additional revocation mechanism | Pattern 3, Pitfall 5 | If the product actually wants the artist to be able to revoke a link early (not just let it expire), this native mechanism has no revoke primitive short of deleting/moving the underlying Storage object — worth confirming with the user during planning if early revocation turns out to matter |

## Open Questions — RESOLVED during plan-phase (2026-07-06)

1. ~~Should the existing master/share audio upload route also be migrated to direct-to-storage in this phase?~~ **RESOLVED: No — explicitly out of scope for Phase 14**, per user decision. It remains a separately-tracked, pre-existing issue. Phase 14's hard requirement is only that the *new* stems/instrumental uploads work correctly at 250MB via direct-to-storage.

2. ~~What Vercel plan tier is this project deployed on?~~ **RESOLVED: Hobby tier**, per user confirmation. `maxDuration` is hard-capped at 10s, not raisable. This invalidates every reference to `maxDuration = 300` elsewhere in this document (corrected in place in Pattern 2/3 and Pitfall 3) and requires the Export Pack route to never stream the finished archive as its own Response body — see Pitfall 3's revised mitigation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Storage TUS resumable endpoint | Stems ZIP direct upload (250MB) | Not verifiable from this sandbox (requires a live Supabase project) | — | If TUS proves unavailable/misconfigured on the project's Supabase instance, fall back to a plain (non-resumable) `supabase.storage.upload()` call from the browser — still bypasses the Vercel body-size limit, just less resilient to connection drops on very large files |
| Vercel deployment (for accurate `maxDuration`/body-limit behavior) | Export Pack route duration budget, upload body-size ceiling | **Confirmed: Hobby tier** (user-provided, 2026-07-06) | `maxDuration` hard-capped at 10s, no override | None available on Hobby short of upgrading the plan — see Pitfall 3's revised mitigation (never stream the full archive as the Response body; verify assembly-step timing against real file sizes before shipping) |

**Missing dependencies with no fallback:** none — all core libraries (`archiver`, `@react-pdf/renderer`, `tus-js-client`) are standard npm installs with no environment prerequisite beyond Node.js, which this project already requires.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — `[CITED: CLAUDE.md]` confirms "No test framework in dependencies (testing infrastructure not detected)" |
| Config file | none — see Wave 0 gaps below |
| Quick run command | none available yet |
| Full suite command | none available yet |

### Phase Requirements → Test Map

> Phase 14 has no `REQUIREMENTS.md` IDs (per orchestrator note); the table below maps CONTEXT.md's locked decisions (D-01 through D-14) to verification approach instead.

| Decision | Behavior | Test Type | Automated Command | File Exists? |
|----------|----------|-----------|-------------------|-------------|
| D-01 | Vault project card links to `/vault/[id]/play`, not `/vault/[id]` | manual-only (no test infra) | — | ❌ Wave 0 (if test infra is added) |
| D-06 | Master/Instrumental toggle actually swaps `<audio src>` | manual-only | — | ❌ Wave 0 |
| D-07 | Stems ZIP upload succeeds at sizes approaching 250MB in a real (non-local-dev) deployment | manual-only, deployment-dependent | — | ❌ Wave 0 — this specifically cannot be verified by unit/integration tests alone; requires a staging/production smoke test given the Vercel body-size-limit risk identified above |
| D-10/D-11 | Export Pack ZIP contains all available files + both PDFs, opens correctly; assembly completes within the confirmed Hobby-tier 10s `maxDuration` for realistic (near-250MB) bundles | manual-only, deployment-dependent | — | ❌ Wave 0 — must be tested against a real deployment with realistic file sizes; local `next dev` has no function-duration limit and will not surface a Hobby-tier timeout |
| D-12 | Shareable link stops working after its TTL | manual-only (or a scripted check calling the signed URL after forcing/mocking TTL expiry) | — | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** manual smoke check (no automated quick-run exists)
- **Per wave merge:** manual verification of the specific decisions implemented in that wave
- **Phase gate:** Given D-07's genuinely deployment-dependent risk (the whole 4.5MB body-size finding) AND the confirmed Hobby-tier 10s `maxDuration` ceiling, the phase gate should include two explicit production-deployment tests, neither of which local `next dev` can surface: (1) a stems upload test with a file over 4.5MB (validates the direct-to-storage upload path actually bypasses the body-size limit), and (2) an Export Pack generation test with realistic/near-worst-case file sizes (validates the assembly step completes within 10s — see Pitfall 3).

### Wave 0 Gaps
- No test framework exists in this codebase at all (confirmed via CLAUDE.md and `package.json` — no `"test"` script, no Jest/Vitest config). Introducing one is out of scope for this phase's decisions; treat all verification as manual per the `human_verify_mode: "end-of-phase"` project setting.
- Specifically flag: local `next dev` testing of the stems upload path will NOT surface the Vercel body-size issue even if the direct-to-storage approach is *not* implemented — the planner must ensure the verification step for D-07 explicitly happens against a real deployment (or an equivalent proxy that enforces the same body-size limit), not just local dev.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing Supabase session/cookie auth, unchanged — all new routes must call `createApiClient()` and check `user` before any read/write, matching the existing audio route's pattern |
| V3 Session Management | no | No new session-management surface introduced by this phase |
| V4 Access Control | yes | Owner-only gating (`.eq('user_id', user?.id ?? '')`) must be preserved on the new stems/instrumental metadata routes and the Export Pack route, exactly as already done on `/vault/[projectId]/play` (noted explicitly in CONTEXT.md's Established Patterns) |
| V5 Input Validation | yes | Validate uploaded stems/instrumental MIME type and size client-side (fast feedback) AND rely on the Storage bucket's own `allowed_mime_types`/`file_size_limit` as the authoritative server-side enforcement (client checks are UX only, never trusted alone) |
| V6 Cryptography | yes | Never hand-roll the expiring-link token/signature — use Supabase Storage's `createSignedUrl`, which already implements this correctly (HMAC-signed URL with server-verified expiry) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Uploading a non-ZIP file with a spoofed `.zip` extension/MIME to the stems slot | Tampering | Rely on the Storage bucket's `allowed_mime_types` allowlist as the authoritative check (already the existing pattern for audio types in migration `004`); do not trust client-declared MIME type alone for anything beyond UX |
| Direct-to-storage upload path traversal (a malicious path like `../otherUserId/...`) | Tampering / Elevation of Privilege | The bucket's existing RLS policy already constrains inserts to `(storage.foldername(name))[1] = auth.uid()::text` — as long as the client always derives the path from the authenticated user's own ID (never accepts a path from user input), this is already closed; do not let the client specify an arbitrary object path |
| Forever-live export link (link never actually expiring due to a bug in the delivery flow) | Information Disclosure | Always regenerate/upsert to the same stable path and re-derive a fresh `createSignedUrl` per share action rather than reusing a previously-generated URL indefinitely; verify the TTL parameter is actually passed as seconds (`60*60*24*7`), not milliseconds or some other unit, since a unit mismatch would silently produce a much longer-lived (or shorter-lived) link than intended |
| Export Pack route being invoked by a non-owner for someone else's project | Elevation of Privilege | Apply the same owner-only `.eq('user_id', user.id)` check used everywhere else in this codebase before reading any track/project data or generating a signed URL |

## Sources

### Primary (HIGH confidence)
- `gsd-tools query package-legitimacy check` — `archiver`, `@react-pdf/renderer`, `tus-js-client` all verified `OK` against the npm registry with real repo links, active maintenance, high download counts, no postinstall scripts (2026-07-06)
- Codebase inspection (Read tool) — `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts`, `supabase/migrations/004_track_audio_storage.sql`, `lib/storage/index.ts`, `lib/supabase/client.ts`, `components/vault/TrackList.tsx`, `components/vault/PlaybackView.tsx`, `app/r/[projectId]/page.tsx`, `app/(artist)/vault/[projectId]/metadata/onesheet/page.tsx`, `app/(artist)/vault/[projectId]/page.tsx` — direct evidence for existing patterns, the 50MB/RLS bucket config, and the existing 2-hour signed-URL precedent

### Secondary (MEDIUM confidence)
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations) — 4.5MB request body limit, ~250MB deployment bundle size limit
- [Vercel Knowledge Base — bypass 4.5MB body size limit](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions) — confirms direct-to-cloud-storage as the standard workaround
- [Supabase Docs — Resumable Uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads) — TUS protocol support, recommendation for files >6MB, fixed 6MB chunk size requirement
- [react-pdf.org — Compatibility with Node.js](https://react-pdf.org/compatibility) — Next.js App Router compatibility notes (14.1.1+ / `serverComponentsExternalPackages` config)

### Tertiary (LOW confidence)
- General WebSearch results on archiver/Next.js Route Handler streaming patterns (blog posts, GitHub discussions) — used to confirm the `Readable.toWeb`/`Readable.fromWeb` conversion approach is a known, workable pattern, but not verified against official Next.js docs directly in this session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all three packages verified via `package-legitimacy check` against the live npm registry with strong signals (repo, downloads, no red flags)
- Architecture (direct-to-storage upload, streaming ZIP, signed-URL expiry): HIGH for the Hobby-tier constraint itself (user-confirmed, not inferred) — the resulting architecture revision (never stream the assembled pack through the Response body; both delivery options share one assemble-then-sign path) follows directly and mechanically from that confirmed fact. MEDIUM remains on whether the *existing* 50MB master/share route is actually broken today (still inferred, not reproduced live) — though this is now moot for Phase 14 since fixing it is explicitly out of scope
- Pitfalls: MEDIUM-HIGH — Pitfall 3's core constraint (10s ceiling) is now a confirmed fact rather than a documented-but-unverified platform limit; whether realistic Phase 14 bundle sizes actually exceed 10s in practice remains unverified until production testing (Wave 0 gap)

**Research date:** 2026-07-06
**Valid until:** ~30 days (stable npm packages, stable Vercel platform limits) — re-verify package versions if planning is delayed past early August 2026
