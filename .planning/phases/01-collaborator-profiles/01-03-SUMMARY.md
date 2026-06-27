---
phase: 01-collaborator-profiles
plan: "03"
subsystem: split-sheet-builder
tags: [split-sheets, collaborators, picker, even-split, industry, api-routes, crud]
status: complete

dependency_graph:
  requires:
    - collaborators-table
    - split-sheets-table
    - split-sheet-parties-table
    - CollaboratorPicker-component
    - CollaboratorProfile-type
  provides:
    - generateApprovalToken
    - validateApprovalTotal
    - evenSplit
    - APPROVAL_TOKEN_EXPIRY_DAYS
    - SplitSheetParty-type
    - GET-api-split-sheets
    - POST-api-split-sheets
    - PATCH-DELETE-api-split-sheets-id
    - SplitSheetBuilder-component
    - industry-split-sheets-page
  affects:
    - app/(industry)/layout.tsx

tech_stack:
  added: []
  patterns:
    - Node crypto.randomBytes(32) for token generation (zero new dependencies)
    - delete-and-reinsert party replacement for Phase 1 simplicity (D-19 deferred iteration)
    - PARTY_FIELDS allowlist sanitizer mirroring COLLABORATOR_EDITABLE_FIELDS pattern
    - CollaboratorPicker onSelect auto-fills name/email/pro/ipi, not role/split (per-row auto-fill D-13)
    - validateApprovalTotal rounds to 3 decimal places to handle floating-point (D-14)

key_files:
  created:
    - lib/split-sheets/approval.ts
    - app/api/split-sheets/route.ts
    - app/api/split-sheets/[id]/route.ts
    - components/split-sheets/SplitSheetBuilder.tsx
    - app/(industry)/split-sheets/page.tsx
  modified:
    - app/(industry)/layout.tsx

decisions:
  - "validateApprovalTotal rounds sum to 3 decimal places before comparing to 100 — handles IEEE 754 imprecision from even splits (e.g. 100/3 = 33.333...)"
  - "Party replacement on PATCH uses delete-and-reinsert for Phase 1 simplicity — full per-party diff deferred to later iteration"
  - "Industry entry point passes no projects prop to SplitSheetBuilder — sheet is always standalone (D-18, D-20)"
  - "sanitizeParty allowlist mirrors COLLABORATOR_EDITABLE_FIELDS pattern (T-01-07 mass-assignment defense)"

metrics:
  duration: "~45 minutes"
  completed: "2026-06-27"
  tasks_completed: 3
  tasks_total: 4
  files_created: 5
  files_modified: 1
---

# Phase 01 Plan 03: Split Sheet Builder Summary

**One-liner:** Standalone SplitSheetBuilder with per-party CollaboratorPicker auto-fill, even-split pre-fill and live 100% total validation, full CRUD API persisting to split_sheets/split_sheet_parties (vault_project_id nullable), and an industry /split-sheets entry point with nav link.

---

## What Was Built

This plan delivers the split-sheet creation slice (COLLAB-03, D-13, D-14, D-18, D-20). Artists and industry users can now create a standalone split sheet with collaborator auto-fill, even-split pre-fill, and live total validation. The approval token helpers in `lib/split-sheets/approval.ts` are also available for Plan 04 to reuse.

### lib/split-sheets/approval.ts

Four exports (no external dependencies — Node built-in crypto only):

- **`generateApprovalToken()`** — `randomBytes(32).toString('hex')`, 256 bits of entropy
- **`validateApprovalTotal(splits)`** — rounds sum to 3 decimal places, returns `true` iff total === 100 (T-01-07)
- **`evenSplit(count)`** — `Math.round((100/count)*1000)/1000`, rounds to 3 decimal places (D-14)
- **`APPROVAL_TOKEN_EXPIRY_DAYS = 30`** — shared constant for both approval and invite expiry windows
- **`SplitSheetParty`** type — named party row shape used by the API

### CRUD API Routes

**`GET /api/split-sheets`** — user-scoped list with eager `split_sheet_parties(*)` join, ordered by `created_at` descending. Auth-gated (401 if no session). Exposes only the initiator's own sheets (T-01-09).

**`POST /api/split-sheets`** — creates sheet + parties in two inserts. Validates `song_name` non-empty, `parties.length >= 1`, party names, and `validateApprovalTotal()` (rejects totals ≠ 100). `initiator_user_id` sourced from session only (T-01-07). `vault_project_id` nullable (D-18).

**`PATCH /api/split-sheets/[id]`** — edits `song_name`, `vault_project_id`, `status` (allowlisted), and replaces parties (delete-and-reinsert). Scoped to `.eq('initiator_user_id', user.id)` (T-01-08). Re-validates total when parties replaced.

**`DELETE /api/split-sheets/[id]`** — deletes sheet scoped to initiator; parties cascade via FK. Returns `{ ok: true }` (T-01-08).

All handlers use `createApiClient()` + `getUser()` 401 gate. `sanitizeParty()` PARTY_FIELDS allowlist used for all party writes (T-01-07).

### SplitSheetBuilder Component

`components/split-sheets/SplitSheetBuilder.tsx` — client component ('use client') with sections per UI-SPEC:

1. **Song name input** — required, full-width, validated before submit
2. **Linked project select** — optional; "Not tied to a release" option sets `vaultProjectId = null` (D-18); omitted if no `projects` prop passed
3. **Writers & Split section** — repeating party rows mirroring ComposerEditor grid: `CollaboratorPicker` | Name | Role select (`COMPOSER_ROLE_VALUES/LABELS`) | PRO select (`PRO_VALUES/LABELS`) | IPI | Split % | Remove button
4. **Even split** — `evenSplit(parties.length)` pre-fills splits on party add/remove (D-14); "Split evenly" link recomputes
5. **Running total** — live sum displayed as "Total: X%"; green (`text-emerald-300`) at exactly 100, amber otherwise
6. **Action row** — "Save draft" (ghost) and "Send for approval" (primary); send CTA disabled when total ≠ 100 with tooltip

`CollaboratorPicker.onSelect` auto-fills name/email/pro/ipi for the row (D-13); role and split are never auto-filled (D-17).

### Industry Entry Point

`app/(industry)/split-sheets/page.tsx` — `force-dynamic` server component; redirects to `/signin` if unauthenticated; renders `<SplitSheetBuilder />` with no `projects` prop (always standalone per D-18, D-20).

`app/(industry)/layout.tsx` — "Split Sheets" nav link added between Opportunities and Post, matching existing link styling exactly (D-20).

---

## Deviations from Plan

None — plan executed exactly as written. All three tasks committed individually:

- `c3d4062`: feat(01-03): split-sheet approval helpers and CRUD API
- `0770900`: feat(01-03): SplitSheetBuilder component with picker-enabled party rows
- `4b47e1f`: feat(01-03): industry /split-sheets entry point and nav link

Task 4 checkpoint was approved by developer on 2026-06-27.

---

## Known Stubs

None. All data flows from the live API and database. The "Send for approval" CTA in Plan 03 creates/saves the sheet as draft; the actual token-email dispatch is wired in Plan 04. This is intentional per plan design — no stub that prevents the plan's goal (split sheet creation and persistence) from being achieved.

---

## Threat Surface Scan

All surfaces were in the plan's threat model and mitigated:

| T-ID | File | Status |
|------|------|--------|
| T-01-07 (Tampering) | POST/PATCH /api/split-sheets | Mitigated — `sanitizeParty()` allowlist + server-side `validateApprovalTotal()` + initiator_user_id from session |
| T-01-08 (Elevation) | PATCH/DELETE /api/split-sheets/[id] | Mitigated — `.eq('initiator_user_id', user.id)` scoping on every write |
| T-01-09 (Info Disclosure) | GET /api/split-sheets | Mitigated — `.eq('initiator_user_id', user.id)` filter |

No new security surfaces beyond the plan's threat model.

---

## Self-Check: PASSED

**Files exist:**
- lib/split-sheets/approval.ts: FOUND
- app/api/split-sheets/route.ts: FOUND
- app/api/split-sheets/[id]/route.ts: FOUND
- components/split-sheets/SplitSheetBuilder.tsx: FOUND
- app/(industry)/split-sheets/page.tsx: FOUND

**Commits exist:**
- c3d4062: feat(01-03): split-sheet approval helpers and CRUD API
- 0770900: feat(01-03): SplitSheetBuilder component with picker-enabled party rows
- 4b47e1f: feat(01-03): industry /split-sheets entry point and nav link

**Task 4 checkpoint:** Approved by developer on 2026-06-27.

**Build:** green (TypeScript and lint clean after all three tasks)
**Acceptance checks:** all criteria passed (approval helpers exported, party scoping correct, industry nav present)
