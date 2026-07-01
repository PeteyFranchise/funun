---
phase: 05-launchpad-checklist
plan: "06"
subsystem: admin-ui
tags: [admin, checklist, tips, dnd-kit, crud, approve-reject]
status: complete
completed_date: "2026-06-30"
duration_minutes: 15

dependency_graph:
  requires:
    - "05-01 (launchpad_checklist_items table + types)"
    - "05-02 (admin route group, is_admin gate, @dnd-kit install)"
    - "05-05 (admin API endpoints: checklist CRUD/reorder, tips approve/reject)"
  provides:
    - ChecklistAdmin client component (dnd-kit sortable CRUD)
    - TipsAdmin client component (approve/reject)
    - /admin/checklist page (live, wired)
    - /admin/tips page (live, wired)
  affects:
    - LAUNCH-05 (admin can add/edit/reorder/delete in-app without Supabase Studio)
    - LAUNCH-03 (admin tip approval UI completes the admin-facing half)

tech_stack:
  added: []
  patterns:
    - dnd-kit DndContext/SortableContext/useSortable/arrayMove for drag reorder
    - CSS.Transform.toString for dragging transform style
    - Inline expand form pattern (no modal) for add/edit and delete confirm
    - role="alert" on inline delete confirm for screen reader announce
    - AutoGrowTextarea (scrollHeight trick) for auto-sizing tip edit areas
    - createServiceClient() in server components for admin-only reads (after layout gate)

key_files:
  created:
    - components/admin/ChecklistAdmin.tsx
    - components/admin/TipsAdmin.tsx
  modified:
    - app/(admin)/checklist/page.tsx
    - app/(admin)/tips/page.tsx

decisions:
  - Admin pages use createServiceClient() directly (not fetch of own API), per RESEARCH anti-pattern — the (admin) layout gate is the auth boundary; mutations still go through Plan 05 API routes which re-verify is_admin
  - SortableRow implemented as an inner function component (not a separate file) — keeps dnd-kit wiring co-located and avoids a thin component file
  - TipCard approved-text shown read-only after approve; rejected cards hidden behind "Show rejected" toggle matching UI-SPEC States table
  - Error state per-card in TipsAdmin (not a global banner) so failures don't block other drafts

metrics:
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 2
---

# Phase 05 Plan 06: Admin UI — ChecklistAdmin and TipsAdmin Summary

**One-liner:** In-app admin UI with dnd-kit drag reorder + mobile arrow reorder for checklist items, inline add/edit/delete-confirm forms, and an editable approve/reject tip draft list — replacing Supabase Studio for both admin workflows.

## What Was Built

### Task 1 — ChecklistAdmin (`components/admin/ChecklistAdmin.tsx`)

Full-featured admin checklist component with two reorder modes and inline CRUD forms:

**Drag reorder (desktop):** `DndContext` (closestCenter) wrapping `SortableContext` (verticalListSortingStrategy) over `SortableRow` components. Each `SortableRow` uses `useSortable({ id: item.key })` and applies `CSS.Transform.toString(transform)` + `transition` as inline styles. The drag handle (6-dot grip SVG) is `hidden md:flex` with `cursor-grab`/`cursor-grabbing` and carries dnd-kit's `{...attributes} {...listeners}` with `aria-label="Drag to reorder {item.label}"`. `isDragging` applies `opacity-60 scale-[1.02] shadow-2xl`.

**Mobile arrow reorder:** Up/down arrow buttons (`flex md:hidden`) call `move(key, 'up'|'down')` which `arrayMove`s the local list and calls `persistOrder`. First row's up-arrow and last row's down-arrow are `disabled`.

**`persistOrder`:** Both drag-end and mobile move paths call the same shared `persistOrder(reordered)` which sends `PATCH /api/admin/checklist` with `{ order: reordered.map((it, idx) => ({ key: it.key, sort_order: idx })) }` — the full list with 0-based positions.

**Inline add form:** "Add checklist item" gradient CTA toggles an inline form below the list with fields: key, label, section (dropdown), action type (dropdown), action href, action label, sort order. Submits `POST /api/admin/checklist`. On success the new item appends to local state.

**Inline edit form:** Each row's Edit button expands an inline form pre-filled with the item's current values. Saves via `PATCH /api/admin/checklist/[itemKey]`. On success, local state updates in-place.

**Inline delete confirm:** Each row's Delete button expands a `role="alert"` block with the exact UI-SPEC copy: "Delete this item? All artist progress on it will be permanently removed. This cannot be undone." plus [Cancel] / [Delete item]. Confirming sends `DELETE /api/admin/checklist/[itemKey]` and removes the row from local state. The FK ON DELETE CASCADE (migration 028) handles `launchpad_progress` cleanup.

**Empty state:** "No checklist items yet. Add the first one above."

**Error handling:** Mutation errors display "Couldn't save — please try again." inline in the active form.

### Task 2 — TipsAdmin (`components/admin/TipsAdmin.tsx`)

Tip draft review component with per-card edit and approve/reject workflow:

**Draft cards:** Each `TipCard` renders an `AutoGrowTextarea` pre-filled with `tip_draft` (auto-grows via `scrollHeight`), the item label, author (`ai`/`admin`) and drafted date as `text-[11px] text-lavdim` metadata, and Approve/Reject pill buttons.

**Approve:** `PATCH /api/admin/tips/[key]` with `{ action: 'approve', tip_text: <current textarea value> }`. The admin's edits become the published tip. On success, card transitions to the approved state: `bg-emerald-400/[0.04] border-emerald-400/20` tint, "Approved" badge, buttons hidden. The approved tip body is shown read-only.

**Reject:** `PATCH /api/admin/tips/[key]` with `{ action: 'reject' }`. Card transitions to rejected state: `bg-rose-400/[0.04]` tint, "Rejected" badge. Rejected cards are filtered out of the default view and shown under a "Show rejected (N)" toggle.

**Approve/Reject button aria-labels:** `"Approve tip for {key}"` / `"Reject tip for {key}"` per UI-SPEC.

**Empty state:** "No tip drafts pending approval."

**Error handling:** Per-card error so a failure on one draft does not block others.

### Task 3 — Admin Pages Wired

**`app/(admin)/checklist/page.tsx`:** Fetches all `launchpad_checklist_items` rows (`*`) via `createServiceClient()` ordered by `sort_order`. Renders `<ChecklistAdmin initialItems={items} />` inside the existing `flex-1 px-9 py-[30px]` wrapper with the "Checklist Items" heading. Auth boundary is the (admin) layout gate; all mutations re-verify `is_admin` via the Plan 05 API routes.

**`app/(admin)/tips/page.tsx`:** Fetches rows where `tip_draft IS NOT NULL` via `createServiceClient()` (`.not('tip_draft', 'is', null)`), selecting `key, label, tip_draft, tip_body, tip_approved, author, tip_drafted_at`, ordered by `tip_drafted_at`. Renders `<TipsAdmin initialDrafts={drafts} />` under the "Tips" heading.

Both pages retain `export const dynamic = 'force-dynamic'` from Plan 02 (required because the layout calls `createServerClient()` which accesses cookies; this prevents static pre-render errors).

## Deviations from Plan

None — plan executed exactly as written.

The plan listed `checklist/page.tsx` acceptance criteria as "fetches items via createServiceClient() directly (not via fetch of its own API)" — implemented exactly this way. Both pages query Supabase directly in the server component and render the client components without any intermediate API fetch.

## Known Stubs

None. Both admin pages render live client components connected to the Plan 05 API routes. No placeholder content remains.

## Threat Flags

None. Both threat model mitigations are implemented:
- T-05-02 (EoP): Admin pages only render inside the (admin) layout `is_admin` gate (Plan 02). All client mutations go through Plan 05 API routes which independently re-verify `is_admin` before any write — defense in depth.
- T-05-09 (Tampering): Reorder, edit, and delete are routed through Plan 05 service-role routes that validate the admin gate, the EDITABLE_FIELDS allowlist, and the itemKey regex. The client cannot bypass them.
- T-05-SC (Tampering): No new @dnd-kit packages installed — Plan 02 installs were reused.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: ChecklistAdmin dnd-kit CRUD | bd09f4d | components/admin/ChecklistAdmin.tsx |
| Task 2: TipsAdmin approve/reject | 874b474 | components/admin/TipsAdmin.tsx |
| Task 3: Wire admin pages | ec7a45a | app/(admin)/checklist/page.tsx, app/(admin)/tips/page.tsx |

## Self-Check: PASSED

Files exist:
- components/admin/ChecklistAdmin.tsx: FOUND
- components/admin/TipsAdmin.tsx: FOUND
- app/(admin)/checklist/page.tsx: FOUND
- app/(admin)/tips/page.tsx: FOUND

Commits exist:
- bd09f4d: FOUND (ChecklistAdmin)
- 874b474: FOUND (TipsAdmin)
- ec7a45a: FOUND (admin pages wired)

Build: `npm run build` passes with zero TypeScript errors.
