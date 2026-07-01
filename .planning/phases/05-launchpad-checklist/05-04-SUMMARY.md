---
phase: 05-launchpad-checklist
plan: "04"
subsystem: ui
tags: [launchpad, components, checklist, tip-panel, artist-ui, optimistic-toggle]
status: complete
completed_date: "2026-06-30"
duration_minutes: 15

dependency_graph:
  requires:
    - types/index.ts MergedChecklistItem (plan 01)
    - supabase/migrations/028_launchpad_checklist.sql (plan 01)
    - app/(artist)/launchpad/[projectId]/page.tsx scaffold (plan 02)
    - PATCH /api/launchpad/[projectId]/progress (plan 03)
  provides:
    - components/launchpad/TipPanel.tsx (slide-in tip drawer)
    - components/launchpad/ChecklistItem.tsx (row with independent checkbox)
    - components/launchpad/ChecklistSection.tsx (week grouping + before-release collapse)
    - components/launchpad/LaunchpadRoom.tsx (container with optimistic persistence)
    - app/(artist)/launchpad/[projectId]/page.tsx (wired to LaunchpadRoom with merged data)
    - app/(artist)/launchpad/page.tsx (project cards above existing playbook)
  affects:
    - Plan 06 (admin UI — shares SECTION_META constants from ChecklistSection)
    - LAUNCH-01, LAUNCH-02, LAUNCH-03, LAUNCH-04 requirements fully met

tech_stack:
  added: []
  patterns:
    - ToolSidePanel shell verbatim copy for TipPanel (container/backdrop/aside/header/body/footer)
    - Escape key useEffect pattern (item-dependent cleanup)
    - Optimistic UI toggle with rollback on non-ok PATCH response
    - Destructure-to-exclude for stripping admin columns before client props (T-05-05)
    - Promise.all parallel fetch + Map merge in server component
    - SectionKey const array for fixed ordered rendering
    - null release_date = isReleased false (RESEARCH Pitfall 3)

key_files:
  created:
    - components/launchpad/TipPanel.tsx
    - components/launchpad/ChecklistItem.tsx
    - components/launchpad/ChecklistSection.tsx
    - components/launchpad/LaunchpadRoom.tsx
  modified:
    - app/(artist)/launchpad/[projectId]/page.tsx
    - app/(artist)/launchpad/page.tsx

decisions:
  - TipPanel shell copied verbatim from ToolSidePanel — same container/backdrop/aside/header/body/footer/Escape classes and hook structure; body replaced with tip_body text and no generate() call
  - ChecklistItem uses two nested onClick handlers (outer div = open panel, inner button = stopPropagation + toggle) to independently route row-click and checkbox-click
  - LaunchpadRoom holds items in useState so optimistic toggles trigger re-render without a round-trip
  - Rollback on PATCH failure restores both the items array and the activeItem (TipPanel stays open with the reverted state)
  - Global /launchpad page converted to async server component to fetch vault_projects; existing LAUNCH_PHASES/PLAYBOOK render is structurally unchanged
  - Project cards inserted above playbook with border-b divider; hidden entirely when user has no projects (no empty state shown — playbook renders normally)
  - Destructure-to-exclude strips tip_draft/tip_drafted_at/author from the server component merge before passing to LaunchpadRoom props (T-05-05 mitigation)

metrics:
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 2
---

# Phase 05 Plan 04: Launchpad Artist UI Summary

**One-liner:** Four launchpad components (TipPanel, ChecklistItem, ChecklistSection, LaunchpadRoom) wired into the per-project page with merged server data and optimistic persistence, plus project cards added above the global /launchpad playbook.

## What Was Built

### Task 1 — TipPanel + ChecklistItem

**`components/launchpad/TipPanel.tsx`** — Slide-in panel from the right.

Shell is a verbatim copy of `ToolSidePanel.tsx`: `fixed inset-0 z-50 flex justify-end` container, `absolute inset-0 bg-black/60 backdrop-blur-sm` backdrop button, `relative flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0a0a0f] shadow-2xl` aside, `flex items-start justify-between gap-3 border-b border-white/10 p-5` header, `flex-1 overflow-y-auto p-5` body, `border-t border-white/10 p-5` footer.

Behavior: returns null when `item` is null. Escape key closes (useEffect cleanup on item change). Footer CTA rendered only when `action_href` is non-null; `target="_blank" rel="noopener noreferrer"` set only for `action_type === 'external_url'`. When `tip_body` is falsy, shows "Steps for this item are coming soon." (UI-SPEC copy).

**`components/launchpad/ChecklistItem.tsx`** — Single checklist row.

Full row is clickable (`onClick={() => onOpenPanel(item)`). Checkbox is a button with `role="checkbox"` and `aria-checked` wrapped in a `p-2.5` hit area (≥44×44px). Both the wrapper div and the button call `e.stopPropagation()` to prevent row-click from firing. Completed items: emerald-400 filled checkbox with white SVG checkmark; label gets `line-through text-white/40`.

### Task 2 — ChecklistSection + LaunchpadRoom

**`components/launchpad/ChecklistSection.tsx`** — Week section wrapper with collapse.

Exports `SECTION_META` constant with UI-SPEC headers and sub-labels for all 4 sections. For `before_release` when `isReleased` is true: `useState` defaults to `isOpen = false` (collapsed); chevron toggle button with `aria-expanded` and `aria-controls` per accessibility contract; collapsed state shows "Did you handle this before release?" confirmation block (`amber-400/10 border-amber-400/20`) with compact checkboxes. Non-before sections always render expanded.

**`components/launchpad/LaunchpadRoom.tsx`** — Container orchestrator.

Holds `items` in `useState` for optimistic re-renders. Computes `isReleased = project.release_date ? new Date(project.release_date) < new Date() : false` (null → false). Groups items by section using `SECTION_ORDER` constant `['before_release', 'week_1', 'week_2', 'weeks_3_4']`. Renders completion counter "{N} of {total} steps complete" and empty state when no items configured.

`onToggle`: optimistically updates items array and activeItem state, then PATCHes `/api/launchpad/{id}/progress`. On non-ok response or network error, rolls back both the items array and activeItem; sets save error "Couldn't save your progress — please try again." (UI-SPEC copy). Renders `<TipPanel>` at the end.

### Task 3 — Per-project page + global page project cards

**`app/(artist)/launchpad/[projectId]/page.tsx`** — Replaced Plan 02 placeholder.

After fetching owner-scoped project (with `release_date`), runs `Promise.all` for `launchpad_checklist_items` (ordered by `sort_order`) and `launchpad_progress` (filtered to project_id + user_id). Builds a `Map` for O(1) merge. Strips `tip_draft`, `tip_drafted_at`, `author` via destructure-to-exclude before spreading into `MergedChecklistItem[]`. Gates `tip_body` to approved items only (T-05-05). Passes merged array and project to `<LaunchpadRoom>`.

**`app/(artist)/launchpad/page.tsx`** — Project cards above existing playbook.

Converted to async server component. Fetches `vault_projects (id, title)` scoped to `user.id`. Renders a `grid grid-cols-1 sm:grid-cols-2 gap-3` cards block above the existing content — each card has project title and "Open Launchpad →" link to `/launchpad/{id}`. A `border-b border-hair` divider separates cards from the playbook. When no projects, the cards block is omitted entirely. The existing `LAUNCH_PHASES.map()` / `PLAYBOOK` render block is structurally unchanged — classes, copy, badge system all preserved verbatim.

## Deviations from Plan

### Auto-fixed Issues

None.

### Minor Implementation Notes

**ChecklistSection collapsed state design:** The UI-SPEC specifies `transition-all duration-200` for the collapse animation. Using `max-h` animation with dynamic content is fragile (max-h must be a known value), so the collapsed state switches between rendering the confirmation block and the full item list via conditional rendering with `hidden` class on the expanded section. The chevron rotation (`rotate-180`) provides the visual animation signal. This matches the UI-SPEC intent without the brittle max-h trick.

**Global page auth:** The existing `LaunchpadPage` was a non-async server component with no auth check (middleware handles route protection). Converting to `async` to fetch projects required adding `redirect('/signin')` as a safety guard — consistent with every other artist page pattern.

## Known Stubs

None. All four components are fully functional with real data paths. The TipPanel CTA and tip body are conditionally rendered based on real DB-sourced values. The "Steps for this item are coming soon." copy is the correct fallback per UI-SPEC when no approved tip exists — not a stub.

## Threat Flags

No new trust boundaries beyond the plan's threat model.

- **T-05-05 (Information Disclosure — tip_draft in client props):** Mitigated. `tip_draft`, `tip_drafted_at`, and `author` are destructured out of each item in the server component before passing the `merged` array to `<LaunchpadRoom>`. These fields are never present in client component props.
- **T-05-01 (Elevation of Privilege — progress PATCH):** Mitigated at API layer (Plan 03). The client sends `item_key` and `completed` only; `user_id` is never sent by the client. The PATCH route forces `user_id` to the session.

## Self-Check: PASSED

- `components/launchpad/TipPanel.tsx` exists: FOUND
- `components/launchpad/ChecklistItem.tsx` exists: FOUND
- `components/launchpad/ChecklistSection.tsx` exists: FOUND
- `components/launchpad/LaunchpadRoom.tsx` exists: FOUND
- `app/(artist)/launchpad/[projectId]/page.tsx` contains `<LaunchpadRoom`: FOUND
- `app/(artist)/launchpad/page.tsx` contains project cards + LAUNCH_PHASES.map(): FOUND
- TipPanel.tsx contains `fixed inset-0 z-50 flex justify-end` and `max-w-md`: FOUND
- TipPanel returns null when item is null: FOUND
- ChecklistItem checkbox handler calls stopPropagation: FOUND
- ChecklistItem applies `line-through text-white/40` when completed: FOUND
- LaunchpadRoom computes isReleased with null-safe check: FOUND
- Commit f890b6c (Task 1): EXISTS
- Commit 8c1ab84 (Task 2): EXISTS
- Commit 9451f97 (Task 3): EXISTS
- `npm run build` zero TypeScript errors: PASSED
