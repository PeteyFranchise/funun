---
type: quick
slug: migration-225-reply-span-peaks-grant
created: 2026-09-15
source: .planning/phases/39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor/39-REVIEW.md
migration: 225
---

# Migration 225 — reply spans and the peaks grant

Closes WR-03 and WR-04 from the Phase 39 code review. Both touch migration 224,
which is **already applied in production**, so neither could be corrected in
place — that is the whole reason this is a separate migration rather than an
edit.

## WR-03 — "a reply never carries a span" was client-only

`TimedTrackPlayer` sends `endTimestampMs` only when there is no `replyingToId`
and states the rule as a hard invariant. Nothing below the client enforced it:
the RPC inserted whatever `p_end_timestamp_ms` it was given regardless of
`p_parent_comment_id`, the trigger rewrote a reply's `timestamp_ms` without
touching `end_timestamp_ms`, and the existing end-after-start CHECK was
trivially satisfiable once that rewrite had happened.

Forward-looking but concrete: **Phase 40 exports range comments as DAW markers.**
A spanned reply — from a future client bug, a direct RPC call, or API misuse —
would export as a marker for a moment nobody marked.

**Approach:** a table CHECK rather than a trigger guard. A trigger would give a
friendlier message but would mean restating an ~80-line function from 224,
inviting drift between the two files. A CHECK cannot be bypassed by any write
path, which is the guarantee actually wanted. The readable client error is added
at the API edge instead, where it belongs.

## WR-04 — the peaks range helper has no grant of its own

`work_version_peaks_in_range()` was revoked from PUBLIC and anon in 224 but never
granted to `authenticated`, unlike the two other routines that migration added,
which each restate both halves. It is called inside the `work_versions_peaks_shape`
CHECK on every write to `work_versions.peaks`, and works today only because
Postgres grants EXECUTE to PUBLIC by default and 224 revoked that by name for
PUBLIC and anon rather than for `authenticated`. Correct by omission.

Same trap `197_workspace_structural_integrity.sql:787-791` documents for tables.
The next grant-hardening pass naming `authenticated` explicitly in a REVOKE would
silently break every peaks write, surfacing as waveforms quietly refusing to save.

## Tasks

1. Write `supabase/migrations/225_reply_span_and_peaks_grant.sql` — the CHECK and
   the GRANT.
2. Lock both with content-assertion tests, resolving the migration by directory
   scan rather than a hardcoded number.
3. Reject a spanned reply in `CommentBodySchema` so the API returns an honest 400
   instead of surfacing a raw constraint violation.
4. Run every step of CI `validate`, not a subset.

## Pre-flight checks performed

- Migration 225 free: no file, no competing `.planning/quick/**` reservation.
- **Zero existing production rows violate the proposed CHECK** — 4 comments, 0
  replies, 0 spans. Confirmed by direct query before writing.
- Column is `parent_comment_id`; migration 160 already uses this exact
  `CHECK (parent_comment_id IS NULL OR …)` idiom on the same table.

## Not in scope

WR-01 (stale `pendingSpan` can be confirmed) and WR-02 (the peaks self-heal PATCH
has no once-only guard) are application-code findings needing no migration, left
for a separate pass.

**Application of migration 225 is human-gated**, as every migration in this repo
is. No agent runs `db:push`.
