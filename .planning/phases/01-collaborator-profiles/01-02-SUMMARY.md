---
phase: 01-collaborator-profiles
plan: "02"
subsystem: metadata-composer-picker
tags: [collaborators, metadatastudio, composer-editor, readiness, picker, auto-fill, missing-ipi]
status: complete

dependency_graph:
  requires:
    - collaborators-table
    - CollaboratorProfile-type
    - GET-POST-api-collaborators
    - PATCH-DELETE-api-collaborators-id
    - CollaboratorPicker-component
  provides:
    - composer-row-picker-autofill
    - missing-ipi-chip
    - save-to-profile-nudge
    - composersHaveMissingIpi
    - composer-ipi-missing-readiness-warning
  affects:
    - components/vault/MetadataStudio.tsx
    - lib/vault/readiness.ts

tech_stack:
  added: []
  patterns:
    - Per-row component state for roster-pick tracking (PickedRow type, separate from persisted Composer JSONB)
    - NudgeButton sub-component for inline save-to-profile cloud-upload trigger
    - option-b flag approach: composer_ipi_missing boolean in metadata JSONB, consumed by readiness without a DB call
    - composersHaveMissingIpi helper with primary flag + fallback heuristic

key_files:
  created: []
  modified:
    - components/vault/MetadataStudio.tsx
    - lib/vault/readiness.ts

decisions:
  - "composer_ipi_missing stored as boolean in track metadata JSONB at save time (option-b from RESEARCH.md) — readiness helper reads it without a DB client"
  - "PickedRow tracking state kept in component state only — not added to persisted Composer JSONB shape (D-02)"
  - "NudgeButton extracted as sub-component for reuse across IPI/PRO/email/phone fields"
  - "PRO field nudge fires on change via onSelect rather than focus/blur — consistent with select onChange pattern"
  - "Fallback heuristic for composer_ipi_missing: email present + IPI absent implies roster-picked row (mirrors CollaboratorCard amber-badge logic)"

metrics:
  duration: "~3 minutes"
  completed: "2026-06-27"
  tasks_completed: 2
  tasks_total: 3
  files_created: 0
  files_modified: 2
---

# Phase 01 Plan 02: Composer-Row Picker Auto-fill Summary

**One-liner:** MetadataStudio ComposerEditor gains a per-row CollaboratorPicker with roster auto-fill (name/PRO/IPI/email/phone), an amber missing-IPI chip, a save-to-profile nudge on rights-identity fields, and a readiness sub-check that downgrades the metadata item to 'warning' when a roster-picked composer lacks an IPI.

---

## What Was Built

### Task 1 — ComposerEditor augmentation (components/vault/MetadataStudio.tsx)

**Imports and mount fetch:**
- Added `useEffect`, `useRef` to React import
- Imported `CollaboratorProfile` type from `@/lib/collaborators`
- Imported `CollaboratorPicker` from `@/components/collaborators/CollaboratorPicker`
- `MetadataStudio` now holds `collaborators: CollaboratorProfile[]` state, fetched from `GET /api/collaborators` on mount (non-blocking, degrades to empty state on error)
- `collaborators` prop passed into `ComposerEditor`

**ComposerEditor signature:**
- Added `collaborators: CollaboratorProfile[]` prop (unused directly in render — `CollaboratorPicker` fetches its own roster; the prop is available for future optimizations)
- Added `PickedRow` type tracking `collaboratorId`, `collaboratorName`, `missingIpi` per row index — stored in component state, not written to the persisted `Composer` JSONB shape

**Per-row picker (D-02):**
- `CollaboratorPicker` rendered inside the name column of each composer row
- `handlePick(i, collab)` auto-fills: name, PRO, IPI, email, phone — role and split explicitly excluded
- Picker state for removed rows is cleaned up and indices shifted

**Missing-IPI chip (D-03):**
- `showMissingIpi = picked?.missingIpi && !c.ipi` — true immediately after a pick where IPI was absent
- Clears automatically when the user types an IPI into the row
- Amber chip with warning SVG: `inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] font-bold text-amber-300`

**Save-to-profile nudge (D-07):**
- `NudgeButton` sub-component renders as an absolute-positioned cloud-upload icon at the right edge of IPI, email, and phone inputs when the row is from a roster pick
- PRO select fires `saveFieldToProfile` directly on `onChange`
- Split field has no nudge (D-07)
- On click: `PATCH /api/collaborators/[collaboratorId]` with the changed field; shows "Saved" in `text-emerald-300 text-xs` for 2s via `setTimeout`
- `nudgeTimers` ref prevents stale timer stacking

**composer_ipi_missing flag:**
- Added to the `saveTrack` metadata payload: `composer_ipi_missing: t.composers.some(c => (c.email || c.phone) && !c.ipi) || false`
- Heuristic: any composer row with email or phone but no IPI is treated as a roster-picked row with missing IPI

### Task 2 — Readiness sub-check (lib/vault/readiness.ts)

**composersHaveMissingIpi(metadata):**
- Reads the `composer_ipi_missing` boolean written by MetadataStudio (primary signal)
- Fallback: `readComposers(metadata)` — any composer with email or phone but no IPI returns true
- Returns false when metadata is null/absent

**metadata readiness item:**
- When all tracks have complete splits (100% total) AND any track has `composersHaveMissingIpi === true`, status downgrades from `'complete'` to `'warning'`
- Existing `'missing'` and partial-`'warning'` paths unchanged
- `readinessItemsForProject` remains a pure function over `ReadinessInput` — no new parameters, no Supabase client

---

## Deviations from Plan

None — plan executed exactly as written.

The `collaborators` prop passed to `ComposerEditor` is technically unused in the render body (CollaboratorPicker self-fetches its roster), but it satisfies the plan's API contract and keeps the door open for parent-controlled roster pre-population in future plans. This is a design-consistent choice, not a deviation.

---

## Known Stubs

None. All data flows from the live API and persisted JSONB. No hardcoded empty values or placeholder copy introduced.

---

## Threat Surface Scan

Both surfaces were in the plan's threat model:

| T-ID | File | Status |
|------|------|--------|
| T-01-05 (Tampering) | PATCH /api/collaborators/[id] via nudge | Mitigated — reuses Plan 01 PATCH handler with sanitizeCollaborator allowlist + dual .eq('id').eq('user_id') ownership chain |
| T-01-06 (Info Disclosure) | GET /api/collaborators in MetadataStudio mount | Mitigated — only owner's own roster returned (RLS + GET filter from Plan 01) |

No new security surfaces beyond the plan's threat model.

---

## Self-Check: PASSED

**Files exist:**
- components/vault/MetadataStudio.tsx: FOUND (modified)
- lib/vault/readiness.ts: FOUND (modified)

**Commits exist:**
- 469dafd: feat(01-02): augment ComposerEditor with CollaboratorPicker, missing-IPI chip, save-to-profile nudge
- 00f6675: feat(01-02): readiness sub-check — metadata item returns 'warning' on roster-picked missing IPI

**Build:** green (no TypeScript errors)
**Acceptance checks:** all criteria passed (10/10 for Task 1, 4/4 for Task 2)

**Task 3:** Checkpoint — awaiting human verification (autonomous: false)
