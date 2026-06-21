# Funūn — build status & next steps

> Last updated: 2026-06-20 · Branch: `funun-redesign` · PR: #1 (open, not merged)
> Repo: https://github.com/PeteyFranchise/ArtistOS-platform

A running handoff of where the redesign stands and what's left. Resume by
checking out the branch (see "Continue on another machine" at the bottom).

---

## TL;DR
The **Funūn redesign** is feature-complete on the `funun-redesign` branch and
open as **PR #1** (review/merge is your call — I did not merge into `main`).
Migrations **010–015 are all applied** to the live DB. Two things still need a
human: drafting the Songtrust outreach email (#8) and ERN/RDR-N XSD validation
(needs the DDEX schema links).

---

## Done ✅

### App shell & design system
- Funūn dark design system (Tailwind tokens, Inter, indigo→fuchsia gradient).
- 252px gradient left-nav with six rooms: Sound Vault · Contract Locker ·
  Antenna · PitchPlug · Rights Coach · Earnings.

### Screens (hi-fi, from the design handoff)
- Sound Vault dashboard · Playback/release detail (waveform, mini-player) ·
  Release Readiness · Antenna (filters + match rings).

### Rooms
- **Contract Locker** — aggregated documents + AI verification panel + external
  PDF upload (Claude reads the PDF natively). Needs `ANTHROPIC_API_KEY`.
- **Rights Coach** — wires the direct-overlay eligibility engine.
- **Earnings** — DSR import (real, persisted) + illustrative partner preview.

### Profiles + social layer (all live)
- `/profile` (owner), `/u/[handle]` (public), `/r/[projectId]` Now Playing.
- Follow · Wall · Endorsements · threaded Release Comments · Activity feed
  (auto-emit on release/placement + readiness-milestone DB trigger) · 1:1 DMs
  (Realtime + polling fallback).
- PitchPlug embeds profile + release links.

### Lyrics
- Per-track lyrics in `tracks.metadata`; Metadata Studio input; embedded into
  ID3 `USLT` + sidecar. See `docs/song-lyrics.md`.

### Rights & DDEX
- **Eligibility engine** (`lib/eligibility/direct-overlay.ts`) — Tier 1/2.
- **CWR / registration** lane (publishing) — pre-existing, intact.
- **ERN** export → ERN 4.3-aligned (MessageHeader, namespace, resource/release
  refs, ISO-8601 duration, contributors, **DealList**, env `DDEX_DPID`). Verified
  well-formed; NOT XSD-validated.
- **RDR-N** (neighbouring rights): `Performer`/`RecordingInfo` model + Metadata
  Studio editor + Core/Recommended **readiness** (surfaced in Release Readiness
  + Rights Coach) + best-effort **RDR-N XML export** (`?format=rdr`).
- **DSR ingest**: tolerant flat-file parser + `/api/earnings/import` + persisted
  aggregates (`dsr_imports`) shown in the Earnings room.
- Docs: `ddex-rdr-compliance.md`, `ddex-standards-map.md`, `song-lyrics.md`,
  `publishing-admin-partners.md`, `cwr-plan.md`.

### Migrations applied to live DB (project ref wgfjakfiyeewzfuxkgyo)
- 010 public showcase profile fields · 011 contract verification + storage
  bucket · 012 social layer (7 tables + RLS) · 013 readiness-milestone trigger ·
  014 dm_messages realtime publication · 015 dsr_imports table.

---

## To do ▢

### Needs a human
- [ ] **#8 — Songtrust partnership outreach email.** Draft asking: API vs CWR
      ingestion, field mapping, white-label terms, sync carve-out for ReRight.
      (Self-contained spec in task #8 / `docs/publishing-admin-partners.md`.)
- [ ] **ERN / RDR-N XSD validation.** Needs the normative ERN 4.3 + RDR-N XSD
      links from the DDEX Knowledge Base (or the DDEX Workbench API). Today the
      exports are only well-formed, not schema-validated.

### Code follow-ups (lower priority)
- [ ] ERN: `TechnicalDetails` / `SoundRecordingEdition` (file refs, codecs),
      allowed-value-set mapping for roles/genres/release-type, real DPIDs (PIE).
- [ ] RDR-N: collection-mandate party + territory + `RightsStatementProfile`;
      validate vs XSD; partner routing (RDx / aggregator) — not a direct node.
- [ ] DSR: harden the parser against specific DSR profiles (currently tolerant/
      heuristic); map ISRC→release titles in the Earnings breakdown.
- [ ] DM: presence indicator + unread badges (Realtime is in; these are extra).
- [ ] PIE / MEAD standards (party identity, rich metadata) — not started.

### Housekeeping
- [ ] **Revoke Supabase Management tokens** at
      https://supabase.com/dashboard/account/tokens (013 + 014/015 tokens).
- [ ] Decide on the final brand **name** (working name "Funūn"; "Sound Vault"
      collides; see naming history) and run the rename if it changes.
- [ ] **Rename everything ArtistOS → Funūn.** Three layers:
      1. ✅ **GitHub repo** renamed `ArtistOS-platform` → **`funun`**
         (github.com/PeteyFranchise/funun); local `origin` remote updated; PR #1
         carried over. (GitHub redirects the old URL.)
      2. **Local folders** `~/Desktop/ArtistOS-platform/artistos-platform` →
         e.g. `~/Desktop/funun` (then re-open the project from the new path).
         Still manual — touches the local filesystem.
      3. ✅ **In-code references** cleaned — all ~41 "ArtistOS"/"artistos"
         occurrences replaced (brand strings → **Funūn**, npm name → `funun`,
         `sendViaArtistOS` → `sendViaFunun`, demo tmp path + README dir/clone →
         `funun`). `tsc` + `next build` green. Only intentional mentions remain
         (this STATUS doc + naming history).
- [ ] Review + merge **PR #1** → `main` when ready.
- [ ] Set `ANTHROPIC_API_KEY` (contract verification) and optionally `DDEX_DPID`
      in the deploy env.

---

## Continue on another machine
```
cd ArtistOS-platform/artistos-platform
git fetch origin && git checkout funun-redesign
npm install            # if needed
NEXT_PUBLIC_VAULT_DEMO=true npm run dev   # demo mode, no auth
```
- Verify with `node_modules/.bin/tsc --noEmit` + `npm run build`.
- `.env.local` is gitignored — set secrets per machine.
- In-app browser preview is unavailable from the `lexclock` session root; verify
  via build, not the preview server.
