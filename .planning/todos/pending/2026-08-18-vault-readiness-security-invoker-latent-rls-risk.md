---
created: 2026-08-18T04:00:00Z
title: calculate_vault_readiness() SECURITY INVOKER — latent RLS-recursion re-arm risk (low priority)
area: database
files:
  - supabase/migrations/064_fix_split_sheet_rls_recursion.sql
  - .planning/debug/resolved/split-sheet-rls-recursion.md
---

## Status (2026-08-18)

Surfaced during debug-session triage. The split-sheet RLS recursion (SQLSTATE 42P17) was fully
fixed and verified live by **migration 064** — that bug is closed. But the debug session flagged one
thing it deliberately did NOT fix:

`public.calculate_vault_readiness()` is `LANGUAGE plpgsql` **SECURITY INVOKER** and reads
`split_sheets`. It's called by `update_vault_readiness()`, wired as an AFTER INSERT/UPDATE/DELETE
trigger on `tracks`, `vault_documents`, `vault_assets`, `tool_outputs` — i.e. the **core vault write
path**. 064 broke the specific policy cycle, so it's safe today. But because the function reads
`split_sheets` as the invoker (RLS-subject), **any future RLS policy added to `split_sheets` (or a
table it transitively reads) that re-introduces a cycle would re-arm the exact same 42P17 on every
vault write.**

## The fix (when someone decides to)
Make `calculate_vault_readiness()` `SECURITY DEFINER` (with `SET search_path = ''` + fully-qualified
`public.*` refs, matching the 064 helper precedent) so it no longer expands RLS on the tables it
reads. This closes the re-arm class permanently.

## Why deferred
Per the resolved debug session (`.planning/debug/resolved/split-sheet-rls-recursion.md`): this is a
**security decision** (widening a trigger function's privilege), not a recursion fix, and belongs in
its own reviewed change — not smuggled into the forward-only 064 hotfix. Low priority: nothing is
broken now; it's a guardrail against a future footgun. Worth folding into any future migration that
adds RLS near `split_sheets` / the readiness tables.
