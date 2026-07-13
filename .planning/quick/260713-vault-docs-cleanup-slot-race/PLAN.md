# Quick Plan: Vault Document Cleanup Check + Opportunity Slot Race

Date: 2026-07-13

## Scope

1. Run a live read-only cleanup check for legacy `vault_documents` rows that fail the new evidence rule.
2. Fix the Antenna opportunity application race where two concurrent applies can both pass the slots check and overwrite `slots_filled`.

## Findings From Cleanup Check

- Checked signed/verified document rows in the live database.
- Found 2 legacy rows without required evidence.
- Cleanup decision: downgrade both legacy rows to `pending` and clear earned-state timestamps/verification fields because no signed PDF, e-sign completion payload, or verification evidence is attached.

## Implementation Plan

- Add a Postgres RPC that atomically:
  - Locks the opportunity row.
  - Verifies it is active and has a remaining slot when slots are capped.
  - Locks and updates the caller's match row only if it is not already applied.
  - Increments `slots_filled`.
  - Inserts the artist submission row.
- Replace the route's check-then-update sequence with the RPC.
- Add focused tests for the route calling the RPC and handling full/already-applied outcomes.
