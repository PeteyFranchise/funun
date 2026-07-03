---
phase: 07-social-campaign-planner
plan: 05
subsystem: frontend
tags: [react, tailwind, optimistic-update, calendar, social, typescript]

# Dependency graph
requires:
  - phase: 07-social-campaign-planner
    plan: 01
    provides: lib/launchpad/campaigns.ts (SocialCampaign, SocialPost, Platform, PLATFORM_VALUES, PLATFORM_LABELS, CONTENT_TYPE_LABELS), lib/launchpad/platform-nudges.ts (getPlatformNudges, getPlatformNudgeRationale)
  - phase: 07-social-campaign-planner
    plan: 03
    provides: POST/GET /api/launchpad/[projectId]/campaigns, PATCH /api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]
  - phase: 07-social-campaign-planner
    plan: 04
    provides: GET /api/launchpad/[projectId]/campaigns/[campaignId]/export, POST /api/launchpad/[projectId]/campaigns/[campaignId]/slots/[slotId]/generate
provides:
  - components/launchpad/PlatformSelector.tsx (PlatformSelector — 6-platform multi-select with genre nudge badges)
  - components/launchpad/CampaignSlot.tsx (CampaignSlot — one slot card with chips, checkbox, inline-edit, posting-time, generate button)
  - components/launchpad/CampaignCalendar.tsx (CampaignCalendar — week-grouped container + optimistic PATCH + export sub-block)
affects: [07-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LaunchpadRoom WR-02 optimistic-update + re-fetch-on-failure rollback — each PATCH callback optimistically updates setCampaign, then on non-ok response calls GET /campaigns to restore authoritative state rather than blind-reversing to the pre-optimistic snapshot"
    - "ChecklistItem checkbox reuse — exact h-5 w-5 custom button, emerald-400 checked state, p-2.5 44×44px hit area, e.stopPropagation() so completion toggle is fully independent of inline-edit and generate panel (D-13)"
    - "PlatformSelector nothing-pre-checked rule (D-09) — selected prop is parent-controlled; component never initializes with any platform checked regardless of nudge badges"
    - "Export chip-checkboxes default to all platforms/weeks in the active campaign (derive from campaign.posts, not a constant) — the sane export-everything default per UI-SPEC §CSV Export UI"
    - "onOpenGenerate seam — CampaignCalendar accepts onOpenGenerate prop (07-06 wires SlotGeneratePanel) with a local state placeholder as fallback so the calendar renders without needing the panel wired first"

key-files:
  created:
    - components/launchpad/PlatformSelector.tsx
    - components/launchpad/CampaignSlot.tsx
    - components/launchpad/CampaignCalendar.tsx
  modified: []

key-decisions:
  - "Genre label for nudge badge resolved via GENRES array from lib/genres.ts — converts profile genre slugs or project free-text to display labels (e.g. 'hip_hop_rap' → 'Hip-Hop / Rap') for the 'Best fit for {Genre}' copy"
  - "Export chip-checkboxes treat empty exportPlatforms state as 'all selected' rather than pre-seeding useState with campaign platforms — avoids stale initial state when the calendar loads with an existing campaign"
  - "Export button rendered as <a> tag with href to the export route rather than fetch + blob — matches the existing pattern in lib/metadata/export.ts and avoids streaming complexity; disabled via onClick preventDefault + aria-disabled"
  - "onOpenGenerate prop on CampaignCalendar is optional — local state placeholder seam left for 07-06 (plan comment explicitly marks where to remove the fallback)"

requirements-completed: [SOCIAL-01, SOCIAL-02, SOCIAL-03, SOCIAL-04, SOCIAL-06, SOCIAL-07]

coverage:
  - id: C1
    description: "PlatformSelector: 6 platforms from PLATFORM_VALUES, nothing pre-checked, advisory badges for nudged platforms (SOCIAL-01, SOCIAL-02, D-09)"
    requirement: "SOCIAL-01"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit — no errors in PlatformSelector.tsx"
        status: pass
      - kind: other
        ref: "Source assertion: PLATFORM_VALUES.map() over 6 platforms; checked prop = selected.includes(platform); no default checked state; badge rendered only for isNudged && genreLabel"
        status: pass
    human_judgment: false
  - id: C2
    description: "CampaignSlot: checkbox stopPropagation, caption inline-edit, completed text-white/40 line-through, chips PLATFORM_LABELS/CONTENT_TYPE_LABELS, generate hook/caption label, no source field (SOCIAL-04, SOCIAL-06, D-03, D-13)"
    requirement: "SOCIAL-04"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit — no errors in CampaignSlot.tsx"
        status: pass
      - kind: other
        ref: "Source assertion: e.stopPropagation() at onClick before onToggleComplete; textarea on editingCaption, blur calls onEditCaption; text-white/40 line-through when post.completed; generateLabel conditional on short_form_video/stories; source field absent from render"
        status: pass
    human_judgment: false
  - id: C3
    description: "CampaignCalendar: week-grouped grid, empty state, optimistic+WR-02 rollback for all three slot callbacks, export sub-block (SOCIAL-03, SOCIAL-07, D-02, D-18)"
    requirement: "SOCIAL-03"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit — no errors; npm run build — green"
        status: pass
      - kind: other
        ref: "Source assertion: space-y-9 week sections; WEEK_NUMBERS.map() groups posts by week; each callback: optimistic setCampaign → PATCH → on failure refetchCampaign(); export sub-block with amber notice + platform/week toggles + a[href to export route]"
        status: pass
    human_judgment: false

duration: ~4min
completed: 2026-07-03
status: complete
---

# Phase 07 Plan 05: Campaign Calendar UI Components Summary

**PlatformSelector, CampaignSlot, CampaignCalendar — the three core calendar-view components pixel-matched to shipped Phase 5/6 siblings, with the checkbox-independent-of-panel (stopPropagation) and optimistic-update + re-fetch-on-failure rollback interaction contracts**

## Performance

- **Duration:** ~4 min
- **Completed:** 2026-07-03T06:43:00Z
- **Tasks:** 3 (all auto)
- **Files modified:** 3 (all new)

## Accomplishments

- `components/launchpad/PlatformSelector.tsx` — 6-platform multi-select (`PLATFORM_VALUES`) with:
  - Native `<input type="checkbox">` with `accent-brandindigo` — exact `CuratorCard.tsx` multi-select pattern
  - Advisory "Best fit for {Genre}" badge (`inline-flex … border-brandindigo/30 bg-brandindigo/10 … text-brandindigo`) rendered only for platforms returned by `getPlatformNudges` (D-09)
  - Nothing pre-checked on first render regardless of nudge badges — the `checked` prop reflects the parent-controlled `selected` array; no internal initial state
  - "Generate calendar" CTA (`bg-grad shadow-cta`) disabled when `selected.length === 0` (title tooltip) and shows "Generating…" during generation
  - Genre label resolved from `GENRES` array for human-readable badge copy (e.g. "Best fit for Hip-Hop / Rap")

- `components/launchpad/CampaignSlot.tsx` — one slot card with:
  - Container `rounded-[14px] border border-hair bg-card px-[18px] py-4` — pixel-identical to `ChecklistItem.tsx`
  - Two neutral chips (platform, content_type) using `PLATFORM_LABELS`/`CONTENT_TYPE_LABELS` — `CuratorCard.tsx` genre-chip treatment
  - Completion checkbox: **exact reuse** of `ChecklistItem.tsx` markup — `h-5 w-5` custom `<button role="checkbox">`, `border-emerald-400 bg-emerald-400` + white checkmark SVG when checked, `p-2.5` 44×44px hit area, `e.stopPropagation()` so toggling never opens inline-edit or generate panel (D-13)
  - Caption: regular weight `text-[14px] leading-[1.5] text-white` (NOT bold); click → `<textarea>` styled identically to `PitchComposer.tsx` note field; auto-saves on blur via `onEditCaption` (D-03)
  - Completed state: `text-white/40 line-through` on caption text
  - Posting-time meta line `text-[12.5px] text-lavdim`; click reveals native `datetime-local` input (D-15)
  - Inline generate button: `rounded-md border border-white/15 …` secondary style; label "Generate hook" for `short_form_video`/`stories`, "Generate caption" otherwise (UI-SPEC Copywriting Contract)
  - `source` field intentionally absent from render (data-layer only)

- `components/launchpad/CampaignCalendar.tsx` — week-grouped container with:
  - `PlatformSelector` at top wired to `selectedPlatforms`/`setSelectedPlatforms` + `handleGenerate` POSTing to `/api/launchpad/${projectId}/campaigns`
  - Empty state card (`rounded-[14px] border border-hair bg-card px-[18px] py-10 text-center`) verbatim from `LaunchpadRoom.tsx` — "No campaign yet" + UI-SPEC body copy
  - `WEEK_NUMBERS.map()` groups `campaign.posts` by week 1-4; each week renders a `ChecklistSection`-style header (`text-[12px] font-bold uppercase tracking-[.16em] text-lavdim` + sub-label) followed by `grid grid-cols-1 gap-3 sm:grid-cols-2` of `CampaignSlot` cards
  - `space-y-9` between week sections — `LaunchpadRoom.tsx` section spacing convention
  - All three slot callbacks follow the **WR-02 pattern**: optimistic `setCampaign` → PATCH single field → on failure `refetchCampaign()` (GET `/campaigns`, finds active campaign) rather than blind-reverting to the pre-optimistic snapshot
  - Export to Buffer sub-block: platform + week chip-checkboxes (all platforms/weeks in the active campaign pre-selected), amber free-plan notice, solid-white "Export CSV" `<a>` link to `/api/launchpad/${projectId}/campaigns/${campaign.id}/export?platforms=…&weeks=…`, disabled state with tooltip when nothing selected, Buffer tags caveat small print
  - `onOpenGenerate` prop seam for 07-06 to wire `SlotGeneratePanel` (local state placeholder as fallback with explanatory comment)

## Task Commits

Each task was committed atomically:

1. **Task 1: PlatformSelector** - `dce9d50` (feat)
2. **Task 2: CampaignSlot** - `e555044` (feat)
3. **Task 3: CampaignCalendar** - `4d58aff` (feat)

## Files Created/Modified

- `components/launchpad/PlatformSelector.tsx` — `PlatformSelector`; `PLATFORM_VALUES.map()` over 6 platforms; `getPlatformNudges` advisory badges; `GENRES` label resolver; `bg-grad shadow-cta` generate CTA
- `components/launchpad/CampaignSlot.tsx` — `CampaignSlot`; `ChecklistItem` checkbox markup verbatim; `e.stopPropagation()`; caption inline-edit textarea; `datetime-local` posting-time edit; "Generate hook"/"Generate caption" label logic
- `components/launchpad/CampaignCalendar.tsx` — `CampaignCalendar`; week-grouped grid; WR-02 optimistic+refetch callbacks; Export to Buffer sub-block; `onOpenGenerate` prop seam

## Decisions Made

- Genre label for nudge badge resolved via `GENRES` array from `lib/genres.ts` — converts profile genre slugs or project free-text to display labels for "Best fit for {Genre}" copy
- Export chip-checkboxes treat empty `exportPlatforms` state as "all selected" rather than pre-seeding `useState` — avoids stale initial state when the calendar loads with an existing campaign
- Export button is `<a href>` rather than fetch+blob — matches the `lib/metadata/export.ts` download pattern; disabled via `onClick e.preventDefault()` + `aria-disabled`
- `onOpenGenerate` prop is optional on `CampaignCalendar` — local state placeholder seam for 07-06 with an explicit plan comment marking where to remove the fallback

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. All three files type-check clean (`npx tsc --noEmit` — no output). `npm run build` completed successfully. All source assertions verified: checkbox stopPropagation (D-13), nothing pre-checked (D-09), caption regular weight not bold (D-03), completed text-white/40 line-through, generate hook/caption label distinction, source field absent, WR-02 refetch pattern, amber export notice, export chip-checkboxes pre-selected.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-07-17 (client-trust) | Client sends only single-field slot edits (`{ completed }`, `{ caption }`, `{ posting_time }`); server re-validates via `sanitizeSlotEdit` (07-03) — no authorization logic in client components |
| T-07-18 (stale UI) | On PATCH failure the component calls `refetchCampaign()` (GET /campaigns) rather than blind-reverting — UI cannot silently diverge from the server after a rejected write |

## Known Stubs

None. All three components fully wired: `getPlatformNudges`/`PLATFORM_VALUES`/`PLATFORM_LABELS`/`CONTENT_TYPE_LABELS` (07-01), all API routes (07-03/07-04). The `onOpenGenerate` prop seam is intentional scaffolding for 07-06, not a data stub — the calendar renders correctly without it.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary changes introduced. Client components call only server routes established in 07-03/07-04.

## Self-Check: PASSED

Files verified present on disk:
- components/launchpad/PlatformSelector.tsx: FOUND
- components/launchpad/CampaignSlot.tsx: FOUND
- components/launchpad/CampaignCalendar.tsx: FOUND

Commits verified in git log:
- dce9d50: FOUND
- e555044: FOUND
- 4d58aff: FOUND
