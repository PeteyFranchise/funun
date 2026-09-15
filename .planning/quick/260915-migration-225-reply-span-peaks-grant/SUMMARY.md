---
type: quick
slug: migration-225-reply-span-peaks-grant
status: complete
created: 2026-09-15
migration: 225
applied: 2026-09-15
key-files:
  created:
    - supabase/migrations/225_reply_span_and_peaks_grant.sql
    - __tests__/migration-225-reply-span-and-peaks-grant.test.ts
  modified:
    - app/api/works/[workId]/versions/[versionId]/comments/route.ts
    - __tests__/writer-room-timed-track-comments-api.test.ts
---

# Migration 225 — reply spans and the peaks grant

Closes WR-03 and WR-04 from the Phase 39 code review.

## What changed

**`work_version_comments_reply_has_no_span`** — a CHECK binding
`parent_comment_id` and `end_timestamp_ms`, so a reply cannot carry a span
through any write path. Chose a CHECK over a trigger guard: a trigger reads
better in an error message but would have meant restating an ~80-line function
from 224, and the point here is an unbypassable guarantee rather than a
readable one. The readable error lives at the API edge instead.

**`GRANT EXECUTE ON FUNCTION public.work_version_peaks_in_range(SMALLINT[]) TO authenticated`** —
restores the convention 224's other two routines follow. The function is called
inside the CHECK on every peaks write and worked only via Postgres's implicit
PUBLIC grant.

**`CommentBodySchema`** — a second `.refine()` rejecting `endTimestampMs`
alongside `parentCommentId`, turning what would surface as a raw constraint
violation into a 400 saying "A reply cannot carry a span".

## Verification

Every step of CI `validate`, not a subset:

| Step | Result |
|---|---|
| `security:migrations:verify` | PASS |
| `typecheck:strict` | exit 0 |
| `lint` (`--max-warnings=0`) | exit 0 |
| `npm test -- --runInBand` | **612 suites / 7,391 tests** |
| `npm audit --omit=dev --audit-level=moderate` | exit 0 |
| `npm audit --audit-level=high` | exit 0 |

Suites went 611 to 612 (the new migration test file) and tests 7,384 to 7,391
(6 migration assertions plus 1 API assertion).

## Checked before writing, not assumed

- Migration 225 was free — no file, no competing `.planning/quick/**` reservation.
- **Zero existing production rows would violate the new CHECK.** Queried directly:
  4 comments, 0 replies, 0 spans. Had any reply carried a span, the ALTER would
  have failed on application rather than at review time.
- Migration 160 already uses the same `CHECK (parent_comment_id IS NULL OR …)`
  idiom on this table, so the shape is the table's own convention.

## APPLIED 2026-09-15 — verified behaviourally

Production migration ceiling is now **225**. `migration list` reports 222 rows,
**0 mismatches**, 225 local = remote.

Both findings were confirmed by behaviour, not by the push's exit code — which
matters especially for WR-04, whose whole nature was a grant that *looked*
present but worked only by accident. An applied migration would have proven
nothing about it.

**WR-03 refusal probe.** A spanned reply inserted directly against production
was rejected by name — `work_version_comments_reply_has_no_span` — with positive
controls passing alongside (comments and versions still readable, 4 and 7 rows).
Refusal paired with a positive control, per the discipline in
`docs/verification/BETA-RLS-SMOKE-SESSION.md`: a refusal on its own can be
produced by an unrelated failure.

**WR-04 grant.** Opening the "Heartburn" take — chosen because it had no stored
peaks — ran the backfill end to end under a real `authenticated` session: decode,
PATCH, the `work_versions_peaks_shape` CHECK, and therefore
`work_version_peaks_in_range()`. Versions with peaks went 3 to 4 and the value
persisted.

Worth recording how nearly this was missed: the first attempt reopened a take in
"Justified Noise", which already had peaks. The waveform appeared, which looked
like success, but nothing backfilled and the grant was never exercised. Only the
server-side count showed it. A visual "it worked" was not evidence.

**PostgREST cache.** Comments read cleanly against the new schema.

## Left for a separate pass

WR-01 (a too-short redraw leaves a stale `pendingSpan` that can be confirmed,
posting coordinates the writer never drew) and WR-02 (the peaks self-heal PATCH
has no once-only guard, so any contribute-tier member can overwrite a take's
canonical waveform at any time). Both are application code needing no migration.
