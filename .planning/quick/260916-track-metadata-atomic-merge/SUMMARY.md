---
type: quick
slug: track-metadata-atomic-merge
status: complete
created: 2026-09-16
migration: 226
applied: 2026-09-16
source: .planning/todos/pending/2026-09-14-track-metadata-lost-update.md (audit M-02)
key-files:
  created:
    - supabase/migrations/226_track_metadata_atomic_asset_merge.sql
    - __tests__/migration-226-track-metadata-atomic-merge.test.ts
  modified:
    - app/api/vault/[projectId]/tracks/[trackId]/stems/route.ts
    - app/api/vault/[projectId]/tracks/[trackId]/instrumental/route.ts
---

# M-02 — concurrent stems and instrumental writes stop dropping each other

## Verified first, because the todo said it hadn't been

The finding was recorded as **"not independently verified."** It is now confirmed: all four call
sites — stems POST/DELETE and instrumental POST/DELETE — read the whole `tracks.metadata` object,
spread it in JavaScript, and wrote the entire column back. No version predicate, no lock.

Two requests reading the same object each wrote their own copy, and the second silently erased the
first one's key. The uploaded file survived in Storage; only the reference to it vanished. So the
asset became orphaned and invisible while the UI showed state contradicting what had just been
uploaded — and nothing errored.

Reachable by one user with two concurrent requests: uploading stems and an instrumental in quick
succession, two tabs, or a double-click.

## Why a merge rather than a compare-and-swap

`tracks` already has a `BEFORE UPDATE` trigger maintaining `updated_at` (migration 001), so an
optimistic CAS was available **with no migration at all**. It was rejected deliberately.

Stems and instrumental touch **different keys**. A CAS would make them conflict and retry over a
collision that has no reason to exist — correct, but it treats the symptom. `||` merges at the top
level, so both writes simply succeed.

The right fix removes the contention rather than detecting it. That was worth a migration.

## What shipped

**`set_track_metadata_asset(track, project, key, value)`** — `metadata || jsonb_build_object(...)`.
**`clear_track_metadata_asset(track, project, key)`** — `metadata - key`, leaving siblings intact.

Both `SECURITY INVOKER`, so the existing RLS on `tracks` stays in force; the `user_id = auth.uid()`
predicate inside each is a second, independent gate rather than redundant narrowing — the posture
plan 40-05 took with private pins.

**The key is an allowlist**, not a passthrough. Without `p_key NOT IN ('stems', 'instrumental')`
these would be an arbitrary metadata write primitive reachable by any authenticated caller — a far
larger surface than the defect being fixed.

**Grant discipline applied rather than relearned.** Both functions carry `REVOKE ... FROM PUBLIC,
anon` *and* `GRANT ... TO authenticated`. Migration 224 forgot the second half, which became WR-04
and needed migration 225 to correct; a test now asserts both halves for both functions.

## The tests were proven to bite

Reintroducing the read-modify-write fails 2 of 10; restoring passes all 10. Done by actually
reintroducing it.

The route assertions target the **shape of the defect** — `.update({ metadata`, `{ ...metadata`,
`delete nextMeta.` — so the pattern cannot return in any of its spellings.

One self-inflicted trap worth recording: the first version of the `SECURITY INVOKER` count
assertion scored **three** matches, because the migration's own header comment says
"SECURITY INVOKER, deliberately". Anchored to `/^SECURITY INVOKER$/gm` so it counts the clause
rather than any mention. This is the second time in two days a comment has satisfied a
source-counting assertion; it is a standing hazard of the technique, not a one-off.

## Verification

Every step of CI `validate`: `security:migrations:verify` PASS · `typecheck:strict` clean ·
`lint --max-warnings=0` clean · **621 suites / 7,552 tests** · both `npm audit` levels clean.

## APPLIED 2026-09-16 — record corrected 2026-09-19

Applied to production ahead of the PR #82 merge, which was the required order: the new routes call
RPCs that do not exist until 226 is applied, so code-first would have broken stems and
instrumental uploads outright. This is not a case where either half is safe alone.

**This summary sat at `applied: false` for three days after the fact.** Recording it late is worth
noting, because the frontmatter is what a future reader checks first — and for three days it said
the opposite of the truth. The 225 summary was updated at application time; this one was not.

### Confirmed by behaviour on 2026-09-19, not by the push's exit code

Both RPCs were called from an anon client against production:

```
set_track_metadata_asset   → 42501: permission denied for function set_track_metadata_asset
clear_track_metadata_asset → 42501: permission denied for function clear_track_metadata_asset
```

`42501` is the informative result. Had the migration never landed, PostgREST would have answered
`PGRST202` — function absent from the schema cache — so a single probe distinguishes "applied and
correctly locked down" from "never applied". Both functions exist, and `anon` cannot execute
either, which is the grant discipline the migration set out to enforce.
