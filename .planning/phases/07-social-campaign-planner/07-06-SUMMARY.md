---
phase: 07-social-campaign-planner
plan: 06
subsystem: frontend
tags: [react, tailwind, preview-then-accept, campaign-history, server-fetch, typescript]

# Dependency graph
requires:
  - phase: 07-social-campaign-planner
    plan: 03
    provides: POST/PATCH/DELETE /api/launchpad/[projectId]/campaigns, PATCH slots/[slotId]
  - phase: 07-social-campaign-planner
    plan: 04
    provides: POST slots/[slotId]/generate (preview-only, zero DB write)
  - phase: 07-social-campaign-planner
    plan: 05
    provides: CampaignCalendar (with onOpenGenerate seam), CampaignSlot, PlatformSelector
provides:
  - components/launchpad/SlotGeneratePanel.tsx (SlotGeneratePanel — D-10 preview-then-accept slide-in panel)
  - components/launchpad/SaveToCalendarPicker.tsx (SaveToCalendarPicker — D-11 standalone tool output save modal)
  - components/launchpad/CampaignHistoryList.tsx (CampaignHistoryList — D-04/D-05 switch-active + inline-confirm hard-delete)
  - app/(artist)/launchpad/[projectId]/page.tsx (modified — campaign server fetch + CampaignCalendar + CampaignHistoryList third stacked block)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-10 preview-then-accept: SlotGeneratePanel POSTs to generate route on open, stores suggestion in state, never writes — write only on explicit 'Use this' click via onAccept callback"
    - "TipPanel shell reused verbatim: fixed inset-0 z-50 flex justify-end, max-w-md aside, border-l border-white/10 bg-[#0a0a0f], backdrop button click-close, useEffect Escape listener"
    - "D-11 centered modal: SaveToCalendarPicker uses flex items-center justify-center (not the slide-in) with max-w-sm rounded-[18px] bg-card card — three <select> fields, disabled state when filteredSlots empty"
    - "D-05 active-row-no-delete: CampaignHistoryList conditionally renders either emerald Active badge or (Set active + Delete trigger) per is_active — active row renders no delete trigger"
    - "ChecklistAdmin inline-confirm reused verbatim: role='alert', rounded-[10px] border border-rose-500/30 bg-rose-500/5 p-4, N from campaign.posts.length, bg-rose-500 confirm button"
    - "T-07-19 RLS guard: page reads social_campaigns via supabase (createServerClient, user-scoped) not service client; explicit .eq('user_id', user.id) on both active and list queries"

key-files:
  created:
    - components/launchpad/SlotGeneratePanel.tsx
    - components/launchpad/SaveToCalendarPicker.tsx
    - components/launchpad/CampaignHistoryList.tsx
  modified:
    - app/(artist)/launchpad/[projectId]/page.tsx

key-decisions:
  - "SlotGeneratePanel fetches suggestion on slot open (useEffect with cancelled-flag for cleanup) so the panel appears immediately; if slot changes, prior fetch is cancelled"
  - "SaveToCalendarPicker slot display text: first 50 chars of caption if present, otherwise 'Slot ({content_type})' — avoids blank options when slots have no caption yet"
  - "CampaignHistoryList renders inline confirm block as a child of the same campaign div (not a separate list element) using mx-[18px] padding to align with the row's horizontal rhythm"
  - "page.tsx project select extended with genre and cover_art_url — genre for CampaignCalendar nudge badges, cover_art_url available if needed downstream"
  - "D-14 follow-up admin action (NOT code): after Phase 7 ships, social-adjacent Phase 5 checklist items (e.g. 'social teasers') should have their action_href deep-linked to /launchpad/[projectId]#campaign via the existing /admin/checklist CRUD — no schema change, no new code"

requirements-completed: [SOCIAL-03, SOCIAL-04, SOCIAL-05, SOCIAL-06]

coverage:
  - id: C1
    description: "SlotGeneratePanel: TipPanel shell verbatim, POSTs to generate route on open, suggestion shown before any write, 'Use this' calls onAccept then closes — never silently overwrites (D-10, SOCIAL-05)"
    requirement: "SOCIAL-05"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit — no errors in SlotGeneratePanel.tsx"
        status: pass
      - kind: other
        ref: "Source assertion: handleAccept() calls onAccept(slot.id, suggestion) then onClose() — write is in the callback, not in the useEffect fetch. Generation completing only calls setSuggestion(), never onAccept(). 'Use this' button disabled={!suggestion}."
        status: pass
    human_judgment: false
  - id: C2
    description: "SaveToCalendarPicker: centered modal (flex items-center justify-center, max-w-sm card), no tool_outputs reference, saves only via onSave on 'Save to slot' (D-11, SOCIAL-05)"
    requirement: "SOCIAL-05"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit — no errors in SaveToCalendarPicker.tsx"
        status: pass
      - kind: other
        ref: "Source assertion: fixed inset-0 z-50 flex items-center justify-center (centered, not slide-in). grep 'tool_outputs' — matches comment only ('Never touches tool_outputs'), no variable/field reference. handleSave() calls onSave(slotId, toolOutput) then onClose()."
        status: pass
    human_judgment: false
  - id: C3
    description: "CampaignHistoryList: active row shows emerald badge with NO delete trigger; inactive rows show 'Set active' + 'Delete' opening inline confirm (role=alert); no window.confirm (D-04/D-05)"
    requirement: "SOCIAL-04"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit — no errors in CampaignHistoryList.tsx"
        status: pass
      - kind: other
        ref: "Source assertion: campaign.is_active conditional renders badge (no Delete trigger) OR (Set active + Delete trigger). Inline confirm block has role='alert', border-rose-500/30 bg-rose-500/5. window.confirm appears in comment only ('never window.confirm'), not in executable code."
        status: pass
    human_judgment: false
  - id: C4
    description: "page.tsx server fetch reads active social_campaigns via createServerClient() with .eq('user_id', user.id).eq('is_active', true).maybeSingle(); CampaignCalendar in third mt-9 space-y-9 block (SOCIAL-03, T-07-19)"
    requirement: "SOCIAL-03"
    verification:
      - kind: automated
        ref: "npm run build — green"
        status: pass
      - kind: other
        ref: "Source assertion: both social_campaigns queries use supabase (createServerClient result), not service (createServiceClient). .eq('user_id', user.id) present on both. CampaignCalendar is in div.mt-9.space-y-9 block below PitchComposer block."
        status: pass
    human_judgment: false

duration: ~6min
completed: 2026-07-03
status: complete
---

# Phase 07 Plan 06: Feature Completion — SlotGeneratePanel, SaveToCalendarPicker, CampaignHistoryList, Page Wiring

**Preview-then-accept loop (D-10/D-11), campaign history management (D-04/D-05), and Launchpad page mount — closing SOCIAL-01..07 end-to-end from /launchpad/[projectId]**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-07-03
- **Tasks:** 3 (all auto)
- **Files modified:** 4 (3 new, 1 modified)

## Accomplishments

- `components/launchpad/SlotGeneratePanel.tsx` — D-10 preview-then-accept panel:
  - Shell is verbatim `TipPanel.tsx` reuse: `fixed inset-0 z-50 flex justify-end`, `max-w-md` slide-in aside, `border-l border-white/10 bg-[#0a0a0f]`, Escape useEffect, backdrop-button click-close
  - On open (slot becomes non-null), POSTs to `/api/launchpad/{projectId}/campaigns/{campaignId}/slots/{slotId}/generate` and stores the returned caption as suggestion state
  - Loading state: text "Generating…" in the Suggestion block position (no spinner — codebase text-loading convention)
  - Error state: `text-xs text-rose-300` in suggestion position
  - "Current" block: `text-[12px] font-bold uppercase tracking-[.14em] text-lavdim` label + `text-[14px] text-white/60` content
  - "Suggestion" block: same label + AI preview in `rounded-[14px] border border-brandindigo/30 bg-brandindigo/5 p-4` accent-tinted card
  - Footer: "Discard" (secondary, closes unchanged) + "Use this" (`bg-grad shadow-cta`, disabled until suggestion exists, calls `onAccept(slot.id, suggestion)` then closes) — generation completing never itself writes (D-10)
  - Panel title: "Generate hook" for `short_form_video`/`stories`, "Generate caption" otherwise

- `components/launchpad/SaveToCalendarPicker.tsx` — D-11 standalone tool output save:
  - Centered modal (NOT slide-in): `fixed inset-0 z-50 flex items-center justify-center`, same backdrop, `w-full max-w-sm rounded-[18px] border border-hair bg-card p-5`
  - Three stacked `<select>` fields (Platform, Week, Slot) with `PitchComposer.tsx` exact select styling and `text-[12px] font-bold uppercase tracking-[.14em] text-lavdim` labels
  - Platform options derived from distinct platforms in `posts`; Week is 1–4; Slot options filtered to matching platform+week (disabled "No open slot for this platform/week yet" when none)
  - "Save to slot" primary (`bg-grad shadow-cta`) enabled only when a real slot is chosen; calls `onSave(slotId, toolOutput)` then closes
  - No `tool_outputs` reference in executable code — only in a comment stating it is intentionally absent (D-11)
  - Supports Escape + backdrop-click dismissal

- `components/launchpad/CampaignHistoryList.tsx` — D-04/D-05 history management:
  - Container: `rounded-[14px] border border-hair bg-card divide-y divide-hair`
  - Each row: `flex items-center justify-between gap-3 px-[18px] py-4` — campaign name (`text-[14px] font-bold text-white`) + created date (`text-[12.5px] text-lavdim`) on left
  - Active row: `inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300` "Active" badge; NO delete trigger rendered (D-05)
  - Inactive rows: "Set active" secondary button (PATCHes `/api/launchpad/{projectId}/campaigns` with `{campaignId}`, calls `onActiveChanged`) + "Delete" `text-xs text-rose-300` text trigger
  - Delete trigger opens inline confirm block verbatim from `ChecklistAdmin.tsx`: `role="alert"`, `rounded-[10px] border border-rose-500/30 bg-rose-500/5 p-4`, copy "Delete this campaign? All {N} slots..." where N = `campaign.posts.length`, "Delete campaign" `bg-rose-500 hover:bg-rose-600` confirm button + "Cancel"
  - No `window.confirm` in executable code (in comment only, as explicit prohibition)

- `app/(artist)/launchpad/[projectId]/page.tsx` — server wiring:
  - Project select extended with `genre` and `cover_art_url` fields
  - `Promise.all` extended with three new queries: `artist_profiles.genres` (user-scoped, for nudge badges), active `social_campaigns` row (`.eq('user_id', user.id).eq('is_active', true).maybeSingle()` via `createServerClient` — T-07-19 RLS guard), all campaigns list
  - Active campaign shaped via `readPosts()` for defensive coercion of the JSONB posts array
  - Third `div.mt-9.space-y-9` stacked block below the PitchComposer block: `CampaignCalendar` (initialCampaign, profileGenres, projectGenre) + `CampaignHistoryList` (campaigns, onActiveChanged, onDeleted)
  - Existing `LaunchpadRoom`, `PitchComposer`, and `PitchHistoryList` render blocks unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: SlotGeneratePanel + SaveToCalendarPicker** - `5a404ab` (feat)
2. **Task 2: CampaignHistoryList** - `b6c13af` (feat)
3. **Task 3: Page wiring** - `341bc60` (feat)

## Files Created/Modified

- `components/launchpad/SlotGeneratePanel.tsx` — `SlotGeneratePanel`; TipPanel shell verbatim; generate-on-open useEffect with cancel flag; "Generating…" text-loading; brandindigo/5 suggestion card; "Use this" writes only via onAccept
- `components/launchpad/SaveToCalendarPicker.tsx` — `SaveToCalendarPicker`; centered modal (flex items-center justify-center); three selects with filtered slot options; "Save to slot" calls onSave; no tool_outputs reference in executable code
- `components/launchpad/CampaignHistoryList.tsx` — `CampaignHistoryList`; emerald Active badge on active rows; no delete trigger on active row (D-05); ChecklistAdmin inline-confirm pattern verbatim; no window.confirm in executable code
- `app/(artist)/launchpad/[projectId]/page.tsx` — adds campaign server fetch (createServerClient, .eq('user_id', user.id)); third stacked block with CampaignCalendar + CampaignHistoryList; project select extended with genre + cover_art_url

## Decisions Made

- `SlotGeneratePanel` fetches suggestion immediately on open (not deferred to a button click) — matches the "generates then shows preview" UX flow; uses cancelled-flag pattern in useEffect to avoid stale-callback issues when slot changes while a fetch is in-flight
- `SaveToCalendarPicker` slot display text uses first 50 chars of caption when available, otherwise `Slot ({content_type})` — avoids blank options for slots with no caption yet
- `CampaignHistoryList` renders inline confirm block inside the campaign row's container div (with horizontal padding `mx-[18px]`) to maintain visual alignment with the row — no extra border-radius nesting needed
- D-14 admin data follow-up (NOT code): after Phase 7 ships, Phase 5 checklist items tagged with social actions (e.g. "social teasers") should have their `action_href` updated to deep-link into the campaign calendar section via the existing `/admin/checklist` CRUD — this is an admin data edit requiring zero code changes, intentionally excluded from this plan per scope discipline

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. All three components type-check clean (`npx tsc --noEmit` — no output for any of the three files). `npm run build` completed successfully. All source assertions verified.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-07-19 (Elevation of Privilege) | page reads social_campaigns via `createServerClient()` (user-scoped, RLS-enforced) with explicit `.eq('user_id', user.id)` — never `createServiceClient()` |
| T-07-20 (Tampering) | Set-active/delete actions hit 07-03's routes which re-derive ownership + enforce active-cannot-be-deleted server-side; client list is untrusted |
| T-07-21 (Repudiation/silent overwrite) | SlotGeneratePanel only writes via onAccept on "Use this"; SaveToCalendarPicker only writes via onSave on "Save to slot" — generation completing never mutates (D-10/D-11) |

## D-14 Follow-up (Admin Action, Not Code)

After Phase 7 ships, update `action_href` values on relevant Phase 5 checklist items (e.g. "social teasers") to deep-link into `/launchpad/[projectId]#campaign` via the existing `/admin/checklist` CRUD interface. This requires no schema change and no new code — it is a pure data edit for the project owner to perform once the calendar section is live.

## Known Stubs

None. All components are fully wired:
- `SlotGeneratePanel` calls the real generate route (07-04) and writes via the real slot PATCH (07-03) through `onAccept`
- `SaveToCalendarPicker` saves via `onSave` into the real slot PATCH path
- `CampaignHistoryList` hits the real PATCH (set-active) and DELETE (remove campaign) routes from 07-03
- `CampaignCalendar` receives the real `initialCampaign` from the server-side fetch

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary changes introduced beyond what was planned and mitigated in the threat model.

## Self-Check: PASSED

Files verified present on disk:
- components/launchpad/SlotGeneratePanel.tsx: FOUND
- components/launchpad/SaveToCalendarPicker.tsx: FOUND
- components/launchpad/CampaignHistoryList.tsx: FOUND
- app/(artist)/launchpad/[projectId]/page.tsx: FOUND

Commits verified in git log:
- 5a404ab: FOUND
- b6c13af: FOUND
- 341bc60: FOUND
