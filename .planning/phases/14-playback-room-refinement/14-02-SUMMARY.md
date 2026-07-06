---
phase: 14-playback-room-refinement
plan: "02"
subsystem: vault-navigation
tags: [routing, navigation, playback-room, D-01]
dependency_graph:
  requires: []
  provides: [vault-card-to-playback-room, management-page-playback-link]
  affects: [components/vault/VaultProjectCard.tsx, components/vault/ProjectTabs.tsx, app/(artist)/vault/[projectId]/page.tsx]
tech_stack:
  added: []
  patterns: [next/link, optional-prop-threading]
key_files:
  created: []
  modified:
    - components/vault/VaultProjectCard.tsx
    - components/vault/ProjectTabs.tsx
    - app/(artist)/vault/[projectId]/page.tsx
decisions:
  - D-01 implemented: VaultProjectCard.tsx href changed from /vault/{id} to /vault/{id}/play — playback room is now the primary project landing page
  - ProjectTabs new optional prop playbackHref?: string renders a right-aligned "Playback room →" next/link; prop is optional so any other caller is unaffected
metrics:
  duration: 2min
  completed: "2026-07-06"
  tasks_completed: 2
  tasks_total: 2
status: complete
---

# Phase 14 Plan 02: Navigation Routing — Playback Room as Front Door Summary

VaultProjectCard now links directly to /vault/{id}/play (the playback room) as the primary project landing; the management page gains a right-aligned "Playback room →" tab-row link so /play is no longer orphaned dead code.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Point Sound Vault project card at playback room (D-01) | c541fa5 | components/vault/VaultProjectCard.tsx |
| 2 | Add Playback room link to ProjectTabs; wire up from management page (D-01) | 0ffec79 | components/vault/ProjectTabs.tsx, app/(artist)/vault/[projectId]/page.tsx |

## What Was Built

### Task 1 — VaultProjectCard href change

Single-line routing edit in `VaultProjectCard.tsx`: changed `href={`/vault/${card.id}`}` to `href={`/vault/${card.id}/play`}`. No markup, class, or prop changes. The playback room is now the first page an artist reaches when clicking any project card in the Sound Vault grid.

### Task 2 — ProjectTabs playbackHref prop

- Added `import Link from 'next/link'` to `ProjectTabs.tsx`.
- Extended the component signature from `{ items: TabItem[] }` to `{ items: TabItem[]; playbackHref?: string }`.
- Added `items-center` to the tablist `flex` container so the new link aligns with the tab buttons.
- When `playbackHref` is provided, renders a `<Link>` with `ml-auto` (right-aligned) and the secondary-nav style `text-white/50 hover:text-white/80 text-sm font-medium transition` — consistent with inactive tab button treatment, not an accent CTA.
- Updated the single call site in `app/(artist)/vault/[projectId]/page.tsx` (~line 383) to pass `playbackHref={`/vault/${project.id}/play`}`.
- `TabItem` type, active-tab `useState`, and panel-visibility toggle logic are unchanged.

## Verification

Both automated greps printed PASS. TypeScript (`npx tsc --noEmit`) produced zero errors.

```
# Task 1
grep -q '/vault/${card.id}/play' components/vault/VaultProjectCard.tsx && ! grep -q 'href={`/vault/${card.id}`}' components/vault/VaultProjectCard.tsx && echo PASS
→ PASS

# Task 2
grep -q "playbackHref" components/vault/ProjectTabs.tsx && grep -q "next/link" components/vault/ProjectTabs.tsx && grep -q 'playbackHref={`/vault/${project.id}/play`}' "app/(artist)/vault/[projectId]/page.tsx" && echo PASS
→ PASS
```

## Prop Signature (for future callers)

```typescript
// components/vault/ProjectTabs.tsx
export function ProjectTabs({
  items,
  playbackHref,
}: {
  items: TabItem[]
  playbackHref?: string   // optional — renders "Playback room →" link when provided
})
```

Pass `playbackHref={`/vault/${project.id}/play`}` from any page that has `project.id` and wants the link. Omit it entirely to get the original tab-only layout.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

None — only client-side routing targets changed between two already-owner-gated routes. No new data, auth, or upload surface introduced (aligns with T-14-03, disposition: accept).

## Self-Check: PASSED

- [x] `components/vault/VaultProjectCard.tsx` — `href={`/vault/${card.id}/play`}` present, bare management href absent
- [x] `components/vault/ProjectTabs.tsx` — `playbackHref` prop + `next/link` import present
- [x] `app/(artist)/vault/[projectId]/page.tsx` — `playbackHref={`/vault/${project.id}/play`}` present
- [x] Commit c541fa5 exists (Task 1)
- [x] Commit 0ffec79 exists (Task 2)
- [x] TypeScript clean (no errors)
