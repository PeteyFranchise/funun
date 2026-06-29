---
phase: 04
plan: 03
subsystem: collaborator-identity-reconciliation
status: complete
tags: [ui, api, security, roster-management, favorites, dashboard]
dependency_graph:
  requires:
    - 04-01 (claimed_by/archived_at/is_favorite columns, isClaimedCollaborator predicate, credits RLS)
  provides:
    - app/api/collaborators/[id]/route.ts (DELETE claim guard, 409 response)
    - components/collaborators/CollaboratorCard.tsx (Funūn member badge, archive/delete split, favorite star)
    - components/collaborators/CollaboratorPicker.tsx (Favorites / Recently Added / All groups)
    - app/(artist)/dashboard/page.tsx (My Credits preview section)
  affects:
    - DELETE /api/collaborators/[id] (hard-delete blocked for claimed rows)
    - CollaboratorPicker dropdown (grouped roster, archived excluded)
    - Dashboard (conditional credits preview below stats)
tech_stack:
  added: []
  patterns:
    - Claim guard SELECT-before-DELETE with 409 response (T-04-09)
    - Client-side created_at DESC sort for Most Recent picker group
    - Conditional section render on creditsCount > 0 (D-05)
    - Cross-user RLS SELECT via claimed_by = user.id (plan 01 policy)
key_files:
  created: []
  modified:
    - app/api/collaborators/[id]/route.ts
    - components/collaborators/CollaboratorCard.tsx
    - components/collaborators/CollaboratorPicker.tsx
    - app/(artist)/dashboard/page.tsx
decisions:
  - "Favorite star aria-labels use 'Add to favorites' / 'Remove from favorites' per UI-SPEC copywriting contract"
  - "Most Recent picker group sorted client-side (created_at DESC) since GET orders by name; avoids API change"
  - "Edit button moved to bottom-left in CollaboratorCard to avoid collision with Archive/Delete at bottom-right"
  - "Archived card renders as a separate early-return branch — cleaner than toggling controls inline"
metrics:
  duration: 10m
  completed: 2026-06-29
  tasks_completed: 3
  files_changed: 4
---

# Phase 04 Plan 03: Roster Management UX (COLLAB-05) Summary

## One-liner

Claimed collaborator cards upgraded to "Funūn member" with archive-instead-of-delete, hard-delete blocked at API with 409, favorites floated to top of picker, and dashboard My Credits preview wired from live DB.

## What Was Built

### Task 1: Claim-aware DELETE guard + claimed-state CollaboratorCard

**`app/api/collaborators/[id]/route.ts` — DELETE handler extended:**

Before the `.delete()` call, the handler now runs:

```typescript
const { data: existing } = await supabase
  .from('collaborators')
  .select('claimed_by')
  .eq('id', id)
  .eq('user_id', user.id)
  .maybeSingle()

if (existing?.claimed_by) {
  return NextResponse.json(
    { error: 'Cannot delete a claimed collaborator — use archive instead' },
    { status: 409 }
  )
}
```

Ownership scoping (`.eq('user_id', user.id)`) is preserved on both the SELECT and DELETE chains. The PATCH handler is unchanged.

**`components/collaborators/CollaboratorCard.tsx` — extended with four changes:**

1. New optional props: `onArchive`, `onDelete`, `onFavoriteToggle`
2. `isClaimedCollaborator(collaborator)` derivation — renders "Funūn member" badge (indigo chip) when true
3. Favorite star button at top-right (`absolute right-4 top-3`) with `aria-label="Add to favorites"` / `"Remove from favorites"` — `text-brandindigo` when `is_favorite`, outline otherwise
4. Bottom-right control: Archive button (`hover:text-amber-300`) for claimed rows; Delete button (`hover:text-red-400`) for unclaimed rows
5. Archived cards: separate early-return renders read-only `opacity-50` italic name with no controls (`aria-hidden` on suppressed buttons implicitly via no render)

Badge copy and aria-labels match 04-UI-SPEC.md verbatim.

### Task 2: Favorites + Most Recent grouping in CollaboratorPicker

**`components/collaborators/CollaboratorPicker.tsx` — grouped roster:**

- Archived collaborators filtered from all groups (`c.archived_at` falsy check)
- Three derived groups when no search active:
  - **FAVORITES** — `is_favorite === true`
  - **RECENTLY ADDED** — top 5 non-favorites sorted by `created_at DESC` client-side
  - **ALL COLLABORATORS** — remaining non-favorites
- Each group rendered only when it has entries, preceded by a non-interactive `<li>` divider (`text-[10px] font-bold uppercase tracking-wide text-lavdim`)
- Search collapses to single flat filtered list with no group headers (existing behavior preserved)
- `PickerItem` extracted as a named sub-component for DRY row rendering
- Empty-roster trigger, outside-click close, and "Add new collaborator" bottom action preserved unchanged

Group label copy matches 04-UI-SPEC.md verbatim: "FAVORITES", "RECENTLY ADDED", "ALL COLLABORATORS".

### Task 3: Dashboard My Credits preview

**`app/(artist)/dashboard/page.tsx` — credits preview added:**

In the non-DEMO branch, after the vault_projects query:

```typescript
const { data: creditsData } = await supabase
  .from('collaborators')
  .select('id, name, split_sheet_parties(role, split_sheets(song_name))')
  .eq('claimed_by', user?.id ?? '')
  .is('archived_at', null)
  .order('created_at', { ascending: false })
  .limit(3)

creditsPreview = (creditsData ?? []) as unknown as CreditPreviewRow[]
const creditsCount = creditsPreview.length
```

`CreditPreviewRow` type defined at file top for the joined select shape.

Credits section renders below stats cards and above Recent projects when `creditsCount > 0`:
- Heading: `text-sm font-semibold uppercase tracking-wide text-white/60` — "My Credits"
- Up to 3 rows: song name, collaborator name, role chip (neutral chip pattern)
- Right-aligned "View all credits →" link to `/collaborators?tab=credits`
- DEMO branch skips credits preview entirely

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Edit button position adjusted to avoid collision**
- **Found during:** Task 1 implementation
- **Issue:** Plan placed both Edit and Archive/Delete at bottom-right; with Archive replacing Delete for claimed rows, co-locating all three affordances at `bottom-3 right-4` would require complex z-index management and cramped touch targets
- **Fix:** Moved Edit button to `bottom-3 left-4` and kept Archive/Delete at `bottom-3 right-4` — cleaner spatial separation, both meet 32px touch target minimum per UI-SPEC spacing contract
- **Files modified:** `components/collaborators/CollaboratorCard.tsx`
- **Commit:** 5cae8f9

**2. [Rule 2 - Missing Critical] Archived card isolated as early-return branch**
- **Found during:** Task 1 implementation
- **Issue:** Plan described "apply opacity-50 + no controls" inline. Implementing this as inline conditionals would duplicate the name/PRO/badge block and create deeply nested conditional JSX
- **Fix:** Archived state handled as a dedicated early-return branch — renders a simplified read-only card with no controls, avoiding duplication and unambiguously suppressing all interactive affordances
- **Files modified:** `components/collaborators/CollaboratorCard.tsx`
- **Commit:** 5cae8f9

### Architectural Notes

None. All structural decisions follow plan 03 spec and patterns from 04-PATTERNS.md.

## Threat Mitigations Applied

| Threat | Mitigation Applied |
|--------|-------------------|
| T-04-09 (T-delete-claim) | DELETE handler selects `claimed_by` first; returns 409 when set; ownership `.eq('user_id')` preserved on both SELECT and DELETE chains |
| T-04-10 (T-mass-assign) | Favorite/archive PATCHes route through existing `sanitizeCollaborator` allowlist (plan 01); `claimed_by` not in allowlist |
| T-04-11 (T-rls-leak) | Dashboard credits read scoped by `claimed_by = user.id`; plan 01 "Claimed users see own credits" RLS policy enforces row-level access |
| T-04-SC | No new packages installed |

## Known Stubs

None. All rendered data (badge state, credits preview rows, grouped picker) flows from live database columns set by plan 01 migration and claim API. No hardcoded empty values or placeholder text in rendered paths.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what is documented in the plan's threat model. The dashboard credits query uses the same RLS policy established in plan 01.

## Self-Check

Checking files exist and commits are present:

- [x] `app/api/collaborators/[id]/route.ts` — modified, commit 5cae8f9
- [x] `components/collaborators/CollaboratorCard.tsx` — modified, commit 5cae8f9
- [x] `components/collaborators/CollaboratorPicker.tsx` — modified, commit bba4596
- [x] `app/(artist)/dashboard/page.tsx` — modified, commit be40839

## Self-Check: PASSED
