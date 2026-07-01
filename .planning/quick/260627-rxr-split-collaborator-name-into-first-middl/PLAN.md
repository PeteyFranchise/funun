---
quick_id: 260627-rxr
slug: split-collaborator-name-into-first-middl
status: in_progress
---

# Split collaborator name into first/middle/last fields

## What
Replace the single `name` field on CollaboratorForm with separate First Name,
Middle Name/Initial (optional), Last Name, and an optional Suffix field (Jr., Sr., II, etc.)
revealed via "+ Add name field". Add a legal-name guidance callout and enforce
first name, last name, email, and phone as required minimums to get started.

## Why
Artists filling this in at the studio need to capture legal identity accurately
for PRO/copyright alignment, but won't have IPI/publisher info handy. Required
minimum = enough to place someone on a split sheet. The rest gets filled in later.

## Tasks

### Task 1 — DB migration: add name columns
File: `supabase/migrations/019_collaborator_name_fields.sql`
Add `first_name TEXT`, `middle_name TEXT`, `last_name TEXT`, `name_suffix TEXT` columns
to `collaborators` — all nullable for backward compat. Existing rows keep their
`name` value; new rows assemble `name` from the parts on save.

### Task 2 — lib/collaborators/index.ts: add fields + helper
- Add `first_name`, `middle_name`, `last_name`, `name_suffix` to COLLABORATOR_EDITABLE_FIELDS and CollaboratorProfile type
- Add `assembleDisplayName(c: Partial<CollaboratorProfile>): string` helper
  → `[first_name] [middle_name] [last_name][, name_suffix]` — falls back to `name` if parts absent

### Task 3 — CollaboratorForm.tsx: restructured name section + guidance
- Replace single `name` input with: First Name (required), Middle Name/Initial (optional), Last Name (required)
- "+ Add name field" reveals a Suffix field (Jr., Sr., II, etc.)
- On submit, assemble `name` from parts and include it in the payload (so downstream split-sheet/metadata code keeps working)
- Make `email` and `phone` required (add `required` attribute + client-side guard)
- Add a guidance callout above the name fields explaining:
  - The name must appear exactly the same on every work and with every rights registry
  - Inconsistencies cause payment freezes and misdirected royalties
  - Funūn does not pay writers or artists — Funūn organizes their data so they can communicate easily with the entities (PROs, MLC, SoundExchange, etc.) that actually collect their royalties
- All other fields (PRO, IPI, publisher, MLC, SoundExchange, address) keep their optional status but get a note: "Required to receive royalty payments — can be filled in later"

### Task 4 — CollaboratorCard.tsx + CollaboratorPicker.tsx: use assembleDisplayName
Replace direct `c.name` references with `assembleDisplayName(c)` for display (both card and picker).

### Verify
`npm run build` green, no TypeScript errors.
