---
phase: 31-ae-client-workspace-selects-my-client-partners-client-partne
plan: 13
subsystem: ui
tags: [nextjs, supabase, watermarking, opengraph, react-server-components]

requires:
  - phase: 31-ae-client-workspace-selects-my-client-partners-client-partne (31-12)
    provides: getPreviewSignedUrl (watermarked-preview signed-URL accessor)
  - phase: 31-ae-client-workspace-selects-my-client-partners-client-partne (31-04)
    provides: Selects API (selects/selects_tracks/selects_reactions schema, isLegalSelectsTransition, share_token minting at send)
provides:
  - "Public SSR /selects/[token] player route — the outbound Selects motion's payoff (R12)"
  - "app/api/selects/[token]/react, /respond, /download token-gated public API routes"
  - "lib/selects/public-resolve.ts — the single share_token resolution authority"
affects: [31.1-selects-coedit, verify-work]

tech-stack:
  added: []
  patterns:
    - "Public token-gated resolution: resolveSelectsByToken(service, token) — the ONE authority every public /selects/[token] surface (page, og:image, react/respond/download routes) calls; never an id-addressable variant"
    - "Server-resolved audio props: SelectsPlayer.tsx never calls getPreviewSignedUrl itself — page.tsx resolves every preview server-side and passes pre-signed URLs/'processing' status down as props"
    - "Best-effort isolated write for a not-yet-migrated column: respond route writes changes_requested_reason in a SEPARATE update call after the primary status transition succeeds, so a pending human-gated migration can never break the core flow"

key-files:
  created:
    - app/selects/[token]/page.tsx
    - app/selects/[token]/opengraph-image.tsx
    - components/selects-player/SelectsPlayer.tsx
    - components/selects-player/theme.ts
    - app/api/selects/[token]/react/route.ts
    - app/api/selects/[token]/respond/route.ts
    - app/api/selects/[token]/download/route.ts
    - lib/selects/public-resolve.ts
    - lib/selects/viewer-cookie.ts
    - supabase/migrations/113_selects_changes_reason.sql
  modified:
    - lib/selects/types.ts

key-decisions:
  - "Suggested Songs sourced from lib/deals/catalog-query.ts's loadCatalogPage (the same rights-ready buyer-catalogue query, unfiltered, capped at 5, excluding already-curated tracks) rather than a new query — guarantees every suggestion is genuinely licensable"
  - "Suggested-Songs '+' add is EPHEMERAL (React state only, not persisted) — no public track-add API route exists in this plan's scope; full co-edit add/remove + the Removed tray stay the marked 31.1 extension"
  - "Download length-cap (D-02 download_max_seconds) fails CLOSED — a track longer than the configured cap is refused entirely rather than served untrimmed, since no audio-trim primitive exists in the watermark pipeline yet"
  - "changes_requested_reason (a client's optional free-text reason on Request changes) needed a new column not in migration 111 — added via a new, additive, human-gated migration 113, written through a SEPARATE best-effort UPDATE so the core approve/request-changes flow works before the owner pushes it"

requirements-completed: [R12, R5, D-01, D-02, D-03, D-13]

coverage:
  - id: D1
    description: "A valid /selects/[token] link (no login) SSR-renders the player, resolved only via share_token"
    verification:
      - kind: other
        ref: "npx tsc --noEmit clean; grep -q share_token app/selects/[token]/page.tsx"
        status: pass
    human_judgment: true
    rationale: "No live Supabase instance in this sandbox to exercise a real token end-to-end — needs a human/UAT pass against a seeded Selects"
  - id: D2
    description: "An invalid/expired token renders the safe leaks-nothing state with no org/client/AE/track data"
    verification: []
    human_judgment: true
    rationale: "Requires visual/manual confirmation that no data-bearing element renders — not covered by an automated test in this plan"
  - id: D3
    description: "Player streams only via getPreviewSignedUrl (31-12); reactions/approve/request-changes work via the token routes"
    verification:
      - kind: other
        ref: "grep -q getPreviewSignedUrl components/selects-player/SelectsPlayer.tsx; grep -q isLegalSelectsTransition app/api/selects/[token]/respond/route.ts"
        status: pass
    human_judgment: true
    rationale: "Full audio playback + reaction round-trip needs a live DB/storage environment — verifier must classify with real data"
  - id: D4
    description: "Download is account-gated, D-02-configurable, watermarked-only under every path"
    verification: []
    human_judgment: true
    rationale: "Data-flow review confirms no master-bucket import exists, but the guest-gate/CP-download/disabled/capped branches need a human/UAT pass with a real session"

duration: ~50min
completed: 2026-08-15
status: complete
---

# Phase 31 Plan 13: Public Selects Player Summary

**Built the client-facing `/selects/[token]` SSR player to the locked mockup — watermarked-only playback via 31-12's accessor, no-login reactions/approve/request-changes, and an account-gated download route that never touches the master-audio bucket.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-08-15
- **Tasks:** 3
- **Files modified:** 11 (10 created, 1 modified)

## Accomplishments
- Public SSR `/selects/[token]` route resolved solely via `selects.share_token` (service-role read, no id-addressable path anywhere), with a safe "This link isn't live." state that renders zero org/client/AE/track data on an invalid or still-draft token
- `SelectsPlayer.tsx` built to the locked reference (`phase-31-shareable-music-player.html`): three-circle app bar, Glow Up View toggle (Look 2 flat-dark default), dense tap-to-play CURATED TRACKS list, `•••` sheet, docked mini-player, previewable Suggested Songs
- `react`/`respond`/`download` token-gated public API routes — no login required for play/keep/pass/approve/request-changes; download is the one action gated to an authenticated Client Partner account
- OpenGraph metadata (`generateMetadata` + a `next/og` `opengraph-image.tsx`) so a forwarded link unfurls on-brand
- Download route structurally cannot resolve a clean master — it imports only the watermark pipeline's public output accessors, never `readMasterAudio` or the `track-audio` bucket name

## Task Commits

Each task was committed atomically:

1. **Task 1: SSR token route — service-role read, OpenGraph, react/respond APIs** - `c1316c7` (feat)
2. **Task 2: SelectsPlayer — playback, reactions, approve/request-changes, Suggested Songs** - `befaa32` (feat)
3. **Task 3: Download gate — account-gated, watermarked-only, D-02 respected** - `7a0adf5` (feat)

## Files Created/Modified
- `app/selects/[token]/page.tsx` - SSR player route; resolves by share_token, hydrates viewer reactions, sources previews + Suggested Songs
- `app/selects/[token]/opengraph-image.tsx` - branded gradient og:image (Next file-convention route, nodejs runtime)
- `components/selects-player/SelectsPlayer.tsx` - the client player, built to the locked reference
- `components/selects-player/theme.ts` - standalone always-dark `.selp`-scoped theme
- `app/api/selects/[token]/react/route.ts` - per-track reaction, guest-or-org-member attribution
- `app/api/selects/[token]/respond/route.ts` - Approve / Request changes via `isLegalSelectsTransition`
- `app/api/selects/[token]/download/route.ts` - account-gated, watermarked-only download
- `lib/selects/public-resolve.ts` - single share_token resolution authority (page, og:image, all three routes)
- `lib/selects/viewer-cookie.ts` - shared guest viewer-key cookie name constant
- `supabase/migrations/113_selects_changes_reason.sql` - additive, human-gated column for the client's optional Request-changes reason
- `lib/selects/types.ts` - added `changes_requested_reason` (optional) to `Selects`, added `SELECTS_REACTION_VALUES`

## Decisions Made
- Suggested Songs reuse `lib/deals/catalog-query.ts`'s `loadCatalogPage` (the same rights-ready buyer-catalogue query) rather than a bespoke query — every suggestion is guaranteed licensable by construction
- The Suggested "+" add is ephemeral/client-state-only (no persistence route in this plan's scope); full co-edit add/remove and the Removed tray remain the marked 31.1 extension per the plan text
- Download's length-cap (`download_max_seconds`) fails closed — refuses a too-long track outright rather than serving it untrimmed, since no trim primitive exists in the watermark pipeline yet
- `changes_requested_reason` needed a new column; added it via a new additive migration (113) rather than skip the plan's explicit "append the reason on changes" instruction, but wrote it through an isolated, best-effort second UPDATE so the core status-transition write never depends on the migration being pushed yet

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added migration 113 for `selects.changes_requested_reason`**
- **Found during:** Task 1 (respond route)
- **Issue:** The plan's action text explicitly requires the respond route to "append the reason on changes," but migration 111 has no column to hold a client's free-text reason
- **Fix:** Added a new, additive, human-gated migration (`113_selects_changes_reason.sql`) with a single nullable `TEXT` column; the respond route writes it in a SEPARATE `UPDATE` call after the primary status-transition write succeeds, so a missing/not-yet-pushed column can never break Approve/Request changes
- **Files modified:** `supabase/migrations/113_selects_changes_reason.sql`, `app/api/selects/[token]/respond/route.ts`, `lib/selects/types.ts`
- **Committed in:** `c1316c7`

**2. [Rule 3 - Blocking] Excluded the new migration's column from the public read path**
- **Found during:** Task 1 (self-review before commit)
- **Issue:** `resolveSelectsByToken`'s column list initially included `changes_requested_reason` — since migration 113 is human-gated and not yet pushed, this would have made EVERY `/selects/[token]` resolution fail with a Postgres "unknown column" error until the owner manually runs `supabase db push`, breaking the whole player
- **Fix:** Reverted `SELECTS_COLUMNS` in `lib/selects/public-resolve.ts` to migration 111's exact live column set; the new column is only ever written (never selected) via the respond route's isolated best-effort update
- **Files modified:** `lib/selects/public-resolve.ts`
- **Committed in:** `c1316c7`

**3. [Rule 1 - Bug] Fixed a CSS sibling-selector scoping bug in the ported theme**
- **Found during:** Task 2 (theme.ts authoring)
- **Issue:** While scoping the locked reference's `.srow2+.srow2{...}` adjacent-sibling rule under the `.selp` wrapper, an initial pass produced `.selp .srow2+.selp .srow2{...}` — a selector that can never match (it requires a `.selp` element as an immediate sibling of `.srow2`) — which would have silently dropped the Suggested Songs row dividers
- **Fix:** Corrected to `.selp .srow2+.srow2{...}` (prefix only the leading compound selector, leave the sibling combinator intact)
- **Files modified:** `components/selects-player/theme.ts`
- **Committed in:** `befaa32`

**4. [Rule 3 - Blocking] Set `runtime = 'nodejs'` on the OpenGraph image route**
- **Found during:** Task 1 (build verification)
- **Issue:** `opengraph-image.tsx` defaults to the Edge runtime, but it calls `createServiceClient` (`@supabase/supabase-js`, which uses `process.version` — unsupported on Edge); the build emitted a Node-API-in-Edge-Runtime warning
- **Fix:** Added `export const runtime = 'nodejs'` (mirrors the same convention already used by other server-heavy routes, e.g. `app/api/vault/[projectId]/export/route.ts`)
- **Files modified:** `app/selects/[token]/opengraph-image.tsx`
- **Committed in:** `c1316c7`

---

**Total deviations:** 4 auto-fixed (1 missing critical, 2 blocking, 1 bug)
**Impact on plan:** All four were necessary for correctness (a broken player, a false "done" render, and a genuine CSS regression) — no scope creep beyond what the plan's own action text required.

## Known Stubs

- **License → Deals room:** the `•••` sheet's "License this track" adds to an ephemeral, client-side-only cart and shows a confirmation toast ("Your AE will follow up to finish this license"); it does not create a real deal or navigate to an actual Deals room — that integration is Phase 16 territory and out of this plan's `files_modified` scope. `components/selects-player/SelectsPlayer.tsx`, `licenseTrack()`.
- **Forensic per-share download (D-03/A2):** `renderForensicDownload` (31-12) is still a stub that always returns `'pending'` — the download route falls through to the interim audibly-tagged stream-preview render, as explicitly sanctioned by the plan text. This is the plan's own documented A2 fast-follow, not a new stub. `app/api/selects/[token]/download/route.ts`.
- **Download length-cap enforcement:** no audio-trim primitive exists yet, so a track exceeding `download_max_seconds` is refused outright rather than served as a trimmed clip. Documented above under Decisions; a future fast-follow would add real trimming. `app/api/selects/[token]/download/route.ts`.
- **Guest reaction hydration on first visit:** a first-time guest's own prior reactions cannot be hydrated server-side until their `funun_svk` cookie exists (it is minted client-side on mount) — cosmetic only, since the reaction upsert itself is idempotent and correct regardless. `app/selects/[token]/page.tsx`, `components/selects-player/SelectsPlayer.tsx`.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required

**One migration requires manual push.** `supabase/migrations/113_selects_changes_reason.sql` is drafted but NOT applied (this project's standing convention — migrations are human-gated, owner runs `supabase db push`). Until it is pushed, a client's "Request changes" reason is accepted by the API but silently not persisted (the primary status transition still succeeds — see Deviation #2 above); no other functionality in this plan depends on it.

## Next Phase Readiness
- The outbound Selects motion (send → open → play/react → approve/request-changes) is now end-to-end for Slice 1's scope
- Full co-edit add/remove, the Removed tray, and per-share forensic downloads are cleanly deferred to Phase 31.1 per the plan's own scope boundary — no ad-hoc scaffolding was left behind that would need to be undone
- Human/UAT verification is required against a live Supabase environment (seeded Selects, real storage) before this is considered launch-ready — this sandbox has no live DB to exercise the full round-trip

---
*Phase: 31-ae-client-workspace-selects-my-client-partners-client-partne*
*Completed: 2026-08-15*

## Self-Check: PASSED

All 10 created files confirmed tracked in git (`git ls-files`). All 3 task commits confirmed in `git log` (`c1316c7`, `befaa32`, `7a0adf5`). `npx tsc --noEmit` clean on every new/modified file (verified excluding the two pre-existing, explicitly out-of-scope failures noted in the execution brief: `app/api/cron/daily-observability-check/route.ts`, `app/api/health/route.ts`). `npm run build` compiles successfully with network access enabled; the same two pre-existing files are the only build failures. ESLint clean on all new/modified files.
