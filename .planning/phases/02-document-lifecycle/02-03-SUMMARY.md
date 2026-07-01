---
plan_id: 02-03
phase: 02
status: complete
completed_at: 2026-06-28
commit: 9cffc9e
checkpoint: pending-human-verify
---

## Delivered

- `lib/tools/splitsheet.ts` — SplitContributor type gains optional `email` field; buildSplitSheet extracts and passes email through when present
- `components/vault/ToolSidePanel.tsx` — DraftContributor gains `email: string`; all seed/add paths initialize `email: ''`; SplitSheetForm renders an optional email input below each contributor name; submitSplitSheet sends `email || undefined` per contributor
- `lib/vault/stage3.ts` — bestStatus() now uses contributors-based signer fallback: when readEsignState returns no signers, derives signer list from document_data.contributors with status mirroring the document's top-level status (pending → pending, signed → signed)

## Checkpoint verification required

Before closing Phase 02, verify end-to-end:

1. Open a vault project at Stage 3 → click "Generate Split Sheet"
2. Enter two contributors: one with name + email, one with name only (email blank). Set % to total 100%. Save.
3. Confirm the document card shows: amber "Pending" badge + signer list with both names (one with email, one without), both showing amber "pending" badge
4. Click "Upload signed PDF" and upload a PDF < 5MB
5. Confirm: emerald "Signed" badge + signed date + "View PDF" link + signer list now shows emerald "signed" badges for both contributors
6. Open a different vault project with no split sheet yet — confirm no signer list on the empty card (no regression)

Type "approved" when verified, or describe any issues.
