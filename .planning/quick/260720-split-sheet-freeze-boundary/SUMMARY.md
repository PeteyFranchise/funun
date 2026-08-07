---
status: complete
quick_id: 260720-split-sheet-freeze-boundary
date: 2026-07-20
---

# Summary: Split-sheet freeze boundary (bug fix)

## The bug

`PATCH /api/split-sheets/[id]` with a `parties[]` payload delete-and-reinserts every party row, with **no guard on the sheet's status**. It ran identically on a draft, a sheet mid-approval, and a fully executed signed sheet.

Two failure modes, both silent:

1. **Sheet awaiting approvals** — every party row destroyed and recreated, wiping each `approval_token`. Every collaborator's link 404s instantly while `split_sheets.status` still reads `pending_approval`. Nobody is notified.
2. **Executed sheet — data loss on a legal record.** `esign_envelope_signers.split_sheet_party_id` is `ON DELETE CASCADE` (migration 062). Deleting party rows cascade-deletes the envelope signer records — destroying the DB linkage between the executed document and who signed it. The PDF survives; the audit trail tying signatures to people does not.

Initiator-only, so not a security hole — but an artist clicking "edit" on their own signed split sheet would silently destroy its audit linkage.

Surfaced while designing the living-draft flow: Pete asked whether an early-created sheet needs to stay editable as collaborators join. Testing that against the code found the boundary was missing entirely.

## The fix

New pure module `lib/split-sheets/lifecycle.ts`:

| Status | Party edits |
|---|---|
| `draft`, `countered` | Free — the living-draft states |
| `pending_approval`, `approved` | Permitted, but **status resets to `draft`** and approvals clear |
| `esign_pending` | **409** — void the envelope first (P17-02) |
| `executed` | **409** — immutable; create an amendment sheet |

The `executed` rule is not a product preference: the document's own preserved operative text says *"may not be modified or amended except by writing and signed by all Co-writers named above."*

Also closed a back-door: `isAllowedStatusTransition()` prevents PATCHing an executed sheet back to `draft` and then editing freely. Pipeline advancement stays owned by the dedicated routes (send-for-approval, mint, void, webhook completion) — never a raw client-supplied status.

## Verification

- `lib/split-sheets/lifecycle.test.ts` — 19 tests covering every status × both edit kinds, both back-door directions.
- Full suite **64 suites / 684 tests** (was 63/665), tsc + lint clean, zero regressions.

## Related finding (NOT fixed here — needs its own plan)

**The living draft does not exist in the product yet.** `SplitSheetBuilder` can save a draft, but there is no `/split-sheets/[id]` page, no sheet list, and no edit mode — a saved draft becomes unreachable from the UI, and the PATCH route this fix hardens has no UI caller at all. Pete's collaborator-picker point (add someone from the collaborator list to a living draft) also needs that surface. Scoped in the dual-entry design doc.
