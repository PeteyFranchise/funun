---
created: 2026-09-14T00:00:00Z
title: Concurrent stems/instrumental writes can silently drop track metadata (audit M-02)
area: data-integrity
resolved: 2026-09-16
resolved_by: migration 226 (not yet applied)
files:
  - app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts
  - app/api/vault/[projectId]/tracks/[trackId]/instrumental/route.ts
---

## RESOLVED 2026-09-16 — confirmed, then fixed

**The finding was real.** All four call sites did exactly what was described. Fixed by migration
226 plus rewiring both routes to `set_track_metadata_asset` / `clear_track_metadata_asset`, which
merge and remove single JSONB keys in the database.

Notably the fix chosen was NOT the one this todo suggested first. A compare-and-swap on
`updated_at` was available with no migration — the trigger from migration 001 maintains it — but
stems and instrumental touch different keys, so a CAS would make them conflict and retry over a
collision that need not exist. `||` lets both writes succeed. The contention was removed rather
than detected.

**Migration 226 is written but NOT APPLIED.** Production is at 225, and deploy ordering matters:
the routes call RPCs that do not exist until 226 lands, so the migration must go first.

## Original report

## Provenance

Reported by the `funun-repo-audit` skill run on 2026-09-14 at commit `22958185`
(Medium, confidence High). **Not independently verified.** Of the three Medium
findings this one reads as the most concrete — the described mechanism is a
textbook read-modify-write race and the routes are small enough to confirm
quickly.

## Context

Both routes read the entire `tracks.metadata` JSON object, change one property in
application memory, and write the whole column back — with no version column, no
conditional compare-and-swap, and no row lock. Ownership predicates protect
*authorization* but do nothing about *staleness*.

## Scenario

1. Request A reads metadata `M` while adding stems.
2. Request B reads the same `M` while adding an instrumental.
3. A writes `M + stems`.
4. B writes its stale `M + instrumental`.
5. The stems entry is gone.

Reverse the ordering and the instrumental is lost instead. A DELETE can likewise
erase an unrelated concurrent addition.

The uploaded asset itself survives in Storage, but the metadata reference to it
disappears — so it becomes orphaned and invisible to the user, while the UI shows
state that silently contradicts what was uploaded. Nothing errors.

## Fix direction

Use a database RPC that updates or removes only the target JSONB key with
`jsonb_set` / `-` under row locking, or add an optimistic `version` / `updated_at`
predicate with conflict retry.

**An in-process mutex is not sufficient** — this deploys serverless, so concurrent
requests run in separate instances.

Prefer a forward-only service RPC and deploy route consumers before removing the
old update path.

## Tests

Real concurrent database tests, not mocked: stems POST vs instrumental POST,
POST vs DELETE, and updates to unrelated metadata keys. Assert that either both
independent changes survive, or one request returns a conflict — never a silent
loss.
