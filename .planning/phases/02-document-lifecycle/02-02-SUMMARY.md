---
plan_id: 02-02
phase: 02
status: complete
completed_at: 2026-06-28
commit: fd22eeb
checkpoint: pending-human-verify
---

## Delivered

- `lib/vault/stage3.ts` — DocLike extended with file_url/signed_at; BestStatusResult type captures file_url, signed_at, signers from esign state; all four bestStatus() call sites spread new fields into DocRequirement
- `components/vault/DocumentCard.tsx` — rewrites action row: pending cards show "Upload signed PDF" file input (hidden input + visible button); signed cards show checkmark + signed date + "View PDF" link; signer list renders below protects text with per-signer pending/signed/declined badges
- `components/vault/DocumentStage.tsx` — markSigned() removed; onMarkSigned prop removed from all three DocumentCard call sites; projectId prop added to all three

## Checkpoint verification required

Before plan 02-03 runs, verify end-to-end:

1. Open a vault project at Stage 3 (Documentation)
2. Generate a split sheet or hire-right to create a pending document
3. Confirm pending card shows "Upload signed PDF" button (no "Mark signed")
4. Upload a PDF < 5MB — confirm card updates to signed state with date and "View PDF"
5. Click "View PDF" — confirm PDF opens from Supabase storage URL
6. Try non-PDF or file > 5MB — confirm error message appears on card
7. Confirm vault readiness updates to reflect signed status

Type "approved" when verified, or describe any issues.
