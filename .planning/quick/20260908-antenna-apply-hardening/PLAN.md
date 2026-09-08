---
quick_id: 260908-antenna
slug: antenna-apply-hardening
date: 2026-09-08
phase_ref: 38.0.2
---

# Harden `apply_to_opportunity_atomic` (migration 200)

Deferred finding from 38.0.2's orchestrator notes, held out of that phase for
unrelated blast radius (Antenna, not workspaces) and explicitly cleared to act
on once 38.0.2's push window closed. It has.

## Tasks

1. Author `supabase/migrations/200_apply_to_opportunity_atomic_hardening.sql`:
   `search_path` → `''`, schema-qualify all relation references including
   `%ROWTYPE`, re-issue REVOKE naming `anon`/`authenticated`.
2. `__tests__/migration-200.test.ts` — text-lock + drift guard.
3. ROADMAP ledger: claim 200, move Phase 38.2 to 203/204, leave 201–202 alone.

## Must not change

Logic, outcome strings, columns, signature, `RETURNS TABLE`, or the `FOR UPDATE`
lock modes. Lock modes are a separate migration with its own verification.

## Verification

Body compared back against 046 programmatically; five mutations proved.
