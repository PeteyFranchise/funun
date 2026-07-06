# Phase 14: Playback Room Refinement - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 14 polishes the artist-facing **private Playback room** (`playback.html`'s design — tracklist, WAV/stems/instrumental upload, credits & splits, metadata) and ships a real **Export Pack** feature. This is existing **Wave 1 Sound Vault** functionality, discovered during Phase 9's discussion to need its own refinement pass — it is explicitly NOT part of The Green Room (Phases 8–13) networking milestone, and has no dependency on it. Requirements are not yet mapped to `REQUIREMENTS.md` IDs; this was a fresh addition to the roadmap (see `.planning/ROADMAP.md` §"Phase 14").

**Key findings from codebase investigation (before discussion):**
- The `/vault/[projectId]/play` page (`PlaybackView.tsx`) — the intended playback room — is **completely unreachable from the app's UI today**. No nav link, no tab, no button points to it anywhere. It only exists as dead code reachable by typing the URL directly.
- Clicking a Sound Vault project card currently goes to `/vault/[projectId]` — a different, broader release-readiness/management page (cover art upload, document manager, tools panel, `TrackList`-based master/share MP3 upload, submission history) — which also has no link onward to `/play`.
- The Master/Stems toggle in `PlaybackView.tsx` is **non-functional** — flipping it doesn't change the audio source at all (`current.audioUrl` is used unconditionally). There is **zero stems backing anywhere** — no schema field, no upload route, no storage. The "Stems: Not added" text is a hardcoded placeholder.
- "Export pack" (`playback.html`'s button) **does not exist anywhere** in the codebase — no route, no bundling logic, nothing.
- Master WAV / share MP3 upload actually happens on the *other* page (`/vault/[projectId]` via `TrackList.tsx`), not on `/play` — `/play` today is read-only for files.

</domain>

<decisions>
## Implementation Decisions

### Navigation & Information Architecture
- **D-01:** Clicking a Sound Vault project card (`VaultProjectCard.tsx`) now goes **directly to the playback room** (the `playback.html`-style experience) as the primary landing page for a project — not the current release-readiness/management page. The existing management page (`/vault/[projectId]`) becomes secondary.
- **D-02:** The playback room gets a small, clickable **readiness-score widget** linking out to the management page, so the artist can still reach readiness/upload-management tools from their new primary landing view. Per D-08, this widget appears in **two places**: a compact chip near the top app bar/topbar, AND inline near the tracklist/files column.

### Stems & Instrumental Support (new — zero prior backing)
- **D-03:** Real stems support ships this phase (not deferred) — a **single bundled file (e.g. a ZIP)** per track for v1. Per-instrument individual stem files is an explicit, noted fast-follow if artists request it after real-life testing — not built now.
- **D-04:** Since a ZIP cannot be streamed through an `<audio>` element, "Stems" is **not** a playback-source option — it's a **download action** ("Download stems" button, separate from the play/pause transport). A **new, separate "Instrumental" upload slot** is added for artists who want a genuinely playable alternate mix — this becomes the second option in the playback toggle (see D-06). Requiring playable stems (not just a ZIP) instead of/alongside the Instrumental slot is a noted future possibility, contingent on live usage feedback — not decided now.
- **D-05:** Upload controls for both stems (ZIP) and instrumental live in **multiple places** — both the playback room and the existing management page (`/vault/[projectId]`) get upload UI, but both write to the **same underlying track record** (one canonical DB row / storage path regardless of entry point). No duplicate storage model.
- **D-06:** The player's source-selector becomes a **Master / Instrumental toggle** (two real, playable audio sources) — "Download stems" is a separate button, not part of this toggle (this directly supersedes the non-functional 3-way Master/Stems toggle that exists today).
- **D-07:** Stems ZIP upload size limit: **250MB** (larger than the existing 50MB master/share limit, per CLAUDE.md's storage-bucket guidance of "up to 250MB per track"). Multi-stem WAV bundles are expected to be much larger than a single WAV or MP3.
- **D-08:** Empty-state handling is consistent across all new optional content, matching Phase 9's D-09 lyrics pattern: **hide the affordance entirely** when the content doesn't exist — no Instrumental uploaded → hide the toggle (show Master only); no stems ZIP uploaded → hide "Download stems" entirely. Never show a disabled/grayed dead-end control.
- **D-09:** Add instructional copy or an info (ⓘ) button near the stems upload control, explaining: what stems are, why to store them on Funūn (music supervisors/collaborators may request them), how to zip them, and how to label the archive for clarity.

### Export Pack (new — zero prior implementation)
- **D-10:** Export Pack bundles **everything available**: master WAV, share MP3, stems ZIP, instrumental (if uploaded), a **credits/splits sheet** (PDF), and a **metadata sheet** (ISRC/ISWC/BPM/key/language, PDF).
- **D-11:** Delivery is **the artist's choice each time** — either an immediate direct ZIP download, or a generated **shareable link** they can send to a recipient (e.g. a music supervisor) directly.
- **D-12:** The shareable export link is a genuinely more sensitive artifact than Phase 9's public share-player link (Phase 9's link is deliberately stream-only, no file access; this one exposes actual master/stems files). It must be an **expiring link** (e.g. 7 days) — not a permanent link requiring manual revocation.
- **D-13 (deferred, explicit dependency noted):** The user's idea of letting a Funūn-member music supervisor **request** an export pack directly through the platform (request → artist notified → artist approves → pack/link sent) is real and worth building, but explicitly **deferred until after Phase 10 (Connections & Notifications) ships** — it depends on in-app notification infrastructure that doesn't exist yet. Do not build a parallel, throwaway notification mechanism for this now.

### Visual Fidelity
- **D-14:** The existing 3-column layout (`PlaybackView.tsx`: tracklist+files / center player / credits+metadata) already broadly matches `playback.html`'s structure — **no dedicated visual redesign pass is needed**. New features (uploads, toggle changes, readiness widget) build directly into the current component structure.

### Claude's Discretion
- Exact visual treatment/placement details of the readiness-score widget within the topbar and tracklist-column contexts (D-02/D-08) — follow existing `Topbar` component conventions and `app.css` motion/spacing tokens.
- Exact storage bucket/path convention for stems ZIPs and instrumental files (new upload targets) — follow the existing `track-audio` bucket pattern (`app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts`) unless a clear reason emerges to split buckets.
- Exact wording/placement of the stems info (ⓘ) button copy (D-09).
- PDF generation approach for the credits and metadata sheets (D-10) — planner's call on library/technique, following whatever pattern the codebase already uses for other PDF-adjacent exports if one exists (e.g. the metadata one-sheet's "Print → Save as PDF" pattern noted in `app/(artist)/vault/[projectId]/metadata/onesheet/page.tsx`).
- Exact expiry window for the export link (D-12) — 7 days suggested as a reasonable default; not a hard requirement.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` §"Phase 14: Playback Room Refinement" — goal, dependency note (none — independent of Phase 8–13 chain), placeholder success criteria pending this context
- `.planning/phases/09-rich-member-profile/09-CONTEXT.md` — the Phase 9 discussion that surfaced this phase; explicitly distinguishes Phase 9's public, stream-only share player from this phase's private, full-detail working room — the two must NOT be conflated

### Design references
- `docs/design/wave-4-social-layer/sound-vault.html` — the Sound Vault dashboard (project card grid); confirms what a project card looks like and that it should lead into the playback room (D-01)
- `docs/design/wave-4-social-layer/playback.html` — the target design for this phase: 3-column layout (tracklist+files / center player+toggle+waveform+transport / credits+splits+metadata), "Export pack" button in the topbar
- `docs/design/wave-4-social-layer/artist-profile.html` — reference only for contrast; this is Phase 9's public player, NOT this phase's scope

### Codebase integration points
- `components/vault/VaultProjectCard.tsx` (line ~70) — current card link target (`/vault/${card.id}`) needs to change to point at the playback room per D-01
- `app/(artist)/vault/[projectId]/page.tsx` — current release-readiness/management page (425 lines: `EditProjectForm`, `CoverArtUpload`, `AssetUpload`, `DocumentManager`, `ToolsPanel`, `ProjectTabs`, `TrackList`, `SubmissionHistory`) — becomes secondary per D-01/D-02, reachable via the new readiness widget
- `app/(artist)/vault/[projectId]/play/page.tsx` — the existing (currently orphaned) playback room page; becomes the primary landing page per D-01
- `components/vault/PlaybackView.tsx` — the current player component (325 lines); gets the Master/Instrumental toggle fix (D-06), new upload affordances (D-05), and the readiness widget (D-02) built into its existing structure (D-14) — do not redesign from scratch
- `components/vault/TrackList.tsx` — existing master/share MP3 upload pattern (`upload(trackId, file, role)`) — direct precedent for the new stems/instrumental upload implementation (D-05)
- `components/vault/ProjectTabs.tsx` — confirmed to have zero links to `/play` today; needs a route/link update per D-01
- `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts` — existing `role: 'master' | 'share'` upload route pattern (50MB limit, `EXT_BY_MIME` allowlist) — the pattern to extend for stems (ZIP, 250MB per D-07) and instrumental (audio file) uploads
- `app/(artist)/vault/[projectId]/metadata/onesheet/page.tsx` — existing "Print → Save as PDF to share this sheet" pattern, potentially reusable/referenceable for the credits/metadata PDF sheets (D-10)
- `lib/vault/readiness.ts` — existing readiness score calculation, source for the new readiness widget (D-02)
- `lib/metadata/schema.ts` — `readComposers()` already provides credits/splits data needed for the Export Pack's credits sheet (D-10)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/vault/TrackList.tsx`'s `upload()` function and role-based upload pattern — direct template for stems ZIP and instrumental audio upload (D-05)
- `app/api/vault/[projectId]/tracks/[trackId]/audio/route.ts`'s `EXT_BY_MIME`/`role` pattern — extend rather than replace for the new upload types
- `lib/metadata/schema.ts` (`readComposers`) — already reads exactly the credits/splits data the Export Pack's credits sheet needs

### Established Patterns
- 50MB audio upload limit exists today (`MAX_BYTES` in the audio route) — stems needs its own, larger limit (250MB, D-07), so this can't just reuse the same constant unconditionally
- Owner-only gating pattern (`.eq('user_id', user?.id ?? '')`) already correctly applied on `/vault/[projectId]/play` — preserve this; the playback room's new primary-landing role does not change its owner-only nature

### Integration Points
- `VaultProjectCard.tsx` → new link target (D-01)
- `PlaybackView.tsx` → toggle rework (D-06), new upload UI (D-05), readiness widget (D-02), all built into the existing 3-column structure (D-14)
- A new Export Pack route/action (D-10/D-11/D-12) — genuinely new code, no existing precedent in the codebase to extend; will need PDF generation (credits/metadata sheets) and either a ZIP-bundling step or a signed-URL/expiring-link mechanism

</code_context>

<specifics>
## Specific Ideas

- The Playback room should become the artist's primary "landing" experience for a project — the release-readiness/management tooling becomes secondary, reachable via a small widget rather than being the first thing seen.
- Export Pack should feel like "everything an industry partner needs to pay you or place your song" (echoing `sound-vault.html`'s own subtitle text) — comprehensive, not a stripped-down file drop.
- The user is already thinking ahead to a Funūn-native request/fulfillment loop between industry members and artists for export packs — a real product direction, deliberately sequenced after Phase 10's notification system lands.

</specifics>

<deferred>
## Deferred Ideas

- **Multiple individual stem files** (per-instrument, vs. one bundled ZIP) — revisit if artists request it after real-life testing with the v1 bundled-ZIP approach.
- **Requiring a genuinely playable stems mix** (beyond the ZIP download) — revisit after live testing; the separate Instrumental upload slot covers the playable-audio need for now.
- **In-app request/approve flow** for Funūn-member music supervisors/industry users to request an Export Pack directly through the platform — explicitly deferred until after Phase 10 (Connections & Notifications) ships; do not build a parallel notification mechanism now.

### Reviewed Todos (not folded)
None — no pending todos matched Phase 14's scope (`todo.match-phase` returned zero matches).

</deferred>

---

*Phase: 14-Playback Room Refinement*
*Context gathered: 2026-07-06*
