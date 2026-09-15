---
phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
reviewed: 2026-09-15T00:00:00Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - __tests__/migration-224-writer-room-take-review.test.ts
  - __tests__/writer-room-private-pins.test.ts
  - __tests__/writer-room-timed-track-comments-api.test.ts
  - app/(artist)/vault/works/[workId]/page.tsx
  - app/api/works/[workId]/versions/[versionId]/comments/route.ts
  - app/api/works/[workId]/versions/[versionId]/pins/[pinId]/route.ts
  - app/api/works/[workId]/versions/[versionId]/pins/route.test.ts
  - app/api/works/[workId]/versions/[versionId]/pins/route.ts
  - app/api/works/[workId]/versions/[versionId]/route.test.ts
  - app/api/works/[workId]/versions/[versionId]/route.ts
  - app/api/works/[workId]/versions/complete/route.ts
  - components/catalogue/RecordOverBeatStudio.tsx
  - components/catalogue/TimedTrackPlayer.test.tsx
  - components/catalogue/TimedTrackPlayer.tsx
  - components/catalogue/VersionComparisonPanel.test.tsx
  - components/catalogue/VersionComparisonPanel.tsx
  - components/catalogue/WorkPage.test.tsx
  - components/catalogue/WorkPage.tsx
  - lib/catalogue/take-spans.test.ts
  - lib/catalogue/take-spans.ts
  - lib/catalogue/take-transport.test.ts
  - lib/catalogue/take-transport.ts
  - lib/catalogue/version-comments.test.ts
  - lib/catalogue/version-comments.ts
  - lib/catalogue/version-comparison.test.ts
  - lib/catalogue/version-comparison.ts
  - lib/catalogue/version-upload-client.test.ts
  - lib/catalogue/version-upload-client.ts
  - lib/catalogue/waveform.test.ts
  - lib/catalogue/waveform.ts
  - supabase/migrations/224_writer_room_take_review_surface.sql
  - types/catalogue.ts
findings:
  critical: 0
  warning: 4
  info: 1
  total: 5
status: issues_found
---

# Phase 39: Code Review Report

**Reviewed:** 2026-09-15
**Depth:** standard
**Files Reviewed:** 32
**Status:** issues_found

## Summary

This is a post-ship review of a large, already-deployed feature set (real waveform rendering,
Mark-span range comments, private pins, keyboard transport, and the migration 224 schema that
backs all of it). The full test suite for every in-scope file passes (`130` tests across the
`lib/catalogue`, component, and route test files, plus `16` more for the two bracketed-path route
suites that the repo's own Jest CLI quirk would otherwise silently skip — both re-verified here
with `--testPathPatterns`). No `console.log`, debug artifacts, empty catches, or hardcoded
secrets were found in scope.

I looked hardest at `TimedTrackPlayer.tsx`, per the brief, for interaction bugs between the four
plans that rewrote it in sequence (real waveform, Mark-span, private pins, keyboard transport). I
did not find a crash, a security gap, or a case where a private pin leaks to a non-author (the two
explicitly accepted risks — direct-INSERT bypass on `work_version_pins`, and D-11 unverified by
Jest — were confirmed as described and are not restated below). What I did find is one real,
reproducible state-management bug in the Mark-span flow, one data-integrity gap between the
client's stated "a reply never carries a span" invariant and what the database actually allows,
one authorization gap on the peaks self-heal endpoint, and one grant-discipline inconsistency in
migration 224 that this same codebase has already been burned by once (documented in migration
197) for a different object type.

None of these are crashes or data leaks. All are real and independently verifiable from source.

## Warnings

### WR-01: A too-short redraw during Mark-span (including Reposition) silently keeps the stale pending span

**File:** `components/catalogue/TimedTrackPlayer.tsx:552-576` (`handleSpanPointerDown` /
`handleSpanPointerUp`), and `components/catalogue/TimedTrackPlayer.tsx:538-550`
(`repositionComment`)

**Issue:** `pendingSpan` is only ever cleared by `enterSpanMode()` (on first entering Mark-span
mode) or by a *successful* drag in `handleSpanPointerUp` (`if (normalized) setPendingSpan(normalized)`,
`lib/catalogue/take-spans.ts:26` returns `null` for anything under `MIN_SPAN_MS` = 250ms). It is
never cleared when a drag fails that check. Concretely:

1. A writer drags a first span (≥250ms). `pendingSpan` is set to span A; the Confirm/Cancel
   affordance appears (`TimedTrackPlayer.tsx:1041`).
2. Still in Mark-span mode (the span layer stays mounted — `spanMode` hasn't changed), the writer
   starts a second, shorter drag to redraw it — a very plausible correction gesture, especially on
   touch where a quick redraw can easily land under 250ms.
3. `handleSpanPointerUp` computes `normalizeSpanDrag(...)`, gets `null`, and skips
   `setPendingSpan`. `pendingSpan` is still span A. The inline comment at
   `take-spans.ts:11-13` ("a drag narrower than MIN_SPAN_MS snaps back with no confirm affordance
   at all") is only true the *first* time; here it snaps back to the *previous* span, not to
   nothing, and the Confirm button stays live and pointed at span A.
4. If the writer clicks Confirm believing they just redrew the span, `confirmSpan()` opens the
   composer with `pendingSpan` still equal to the stale span A, and `submitComment()` posts A's
   coordinates, not the (invisible, failed) redraw the writer attempted.

The same defect makes `repositionComment()` — which pre-seeds `pendingSpan` from a carried,
clamped span with no drag at all — actively worse: a writer who opens Reposition and then makes a
too-short correction drag gets no feedback at all that their drag was rejected, and Confirm posts
the original pre-clamped coordinates.

This is exactly the kind of component-interaction bug the "four plans, one file" risk calls out:
the redraw-reset invariant lives only inside the component's pointer handlers, not in the pure,
already-tested `lib/catalogue/take-spans.ts` module, so no unit test exercises it and (per this
repo's no-jsdom constraint) no component test could either.

**Fix:** Clear `pendingSpan` at the start of a new drag, not only on a successful one:

```typescript
function handleSpanPointerDown(event: React.PointerEvent<HTMLDivElement>) {
  const ms = msFromClientX(event.clientX)
  setPendingSpan(null) // a new drag always discards whatever was pending before it
  setDragAnchorMs(ms)
  setDragPointerMs(ms)
  event.currentTarget.setPointerCapture(event.pointerId)
}
```

### WR-02: The peaks self-heal PATCH has no once-only or ownership guard — any room contributor can overwrite a take's canonical waveform at any time

**File:** `app/api/works/[workId]/versions/[versionId]/route.ts:64-74`

**Issue:** The `PATCH` handler's `peaks` branch is reachable by anyone with `'contribute'` tier
access to the work (checked at line 24), with no check that the version's `peaks` column is
currently `NULL` (the only legitimate case per the design — see the column comment in the
migration: "A NULL value means 'not extracted yet — the player backfills it,' never 'draw a
placeholder shape.'"). `TimedTrackPlayer.tsx`'s own backfill effect (`:232-263`) only fires when
`drawnPeaks === null`, but nothing stops a different client (a stale browser tab, a buggy future
caller, a deliberately malicious room member) from calling this same endpoint with an arbitrary
valid-shaped array (200 ints, 0-100) for a take that already has a correct, previously-computed
waveform, silently replacing it for every future viewer. The CHECK constraint added in migration
224 (`work_versions_peaks_shape`) validates shape and range, not provenance or idempotency.

Impact is limited to a cosmetic/trust concern (a wrong-looking waveform shown to the whole room,
not audio or comment data), but it directly contradicts the "computed once … and heals itself"
design stated in the code's own comments, and it's a one-line fix.

**Fix:** Only accept the write when the value is currently unset:

```typescript
if ('peaks' in body) {
  const { data, error } = await supabase
    .from('work_versions')
    .update({ peaks: body.peaks })
    .eq('id', versionId)
    .eq('work_id', workId)
    .is('peaks', null) // self-heal only — never overwrite an already-computed shape
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Request could not be completed.' }, { status: 500 })
  return NextResponse.json({ data })
}
```

### WR-03: "A reply never carries a span" is a client-only invariant — the RPC and trigger both accept a spanned reply

**File:** `supabase/migrations/224_writer_room_take_review_surface.sql:159-217` (`create_work_version_comment`),
`:70-149` (`validate_work_version_comment`); client-side comment asserting the invariant at
`components/catalogue/TimedTrackPlayer.tsx:656-658`; API pass-through at
`app/api/works/[workId]/versions/[versionId]/comments/route.ts:200-208`

**Issue:** `TimedTrackPlayer.tsx` only sends `endTimestampMs` when `!replyingToId`
(`const spanForPost = !replyingToId ? pendingSpan : null`), and the comment above it states the
rule as a hard design invariant ("A reply never carries a span — a reply is a message in a
thread, not a second span"). But nothing downstream enforces that:

- `CommentBodySchema` in the route (`comments/route.ts:31-39`) validates that
  `endTimestampMs > timestampMs` when both are present, but never rejects the combination of
  `endTimestampMs` with a non-null `parentCommentId`.
- `create_work_version_comment()` inserts whatever `p_end_timestamp_ms` it's given regardless of
  `p_parent_comment_id`.
- `validate_work_version_comment()`'s trigger reassigns `NEW.timestamp_ms := v_parent.timestamp_ms`
  for a reply (`:135`) but never touches or nulls `NEW.end_timestamp_ms`.
- The table-level CHECK (`work_version_comments_end_after_start`) only requires
  `end_timestamp_ms > timestamp_ms`, which a reply can trivially satisfy once its `timestamp_ms`
  has been rewritten to the parent's.

Today's UI never produces this state, and the only visible consumer of spans
(`roots.filter(comment => comment.endTimestampMs != null)` in `TimedTrackPlayer.tsx:840-841`)
filters to root comments, so a stray spanned reply wouldn't currently render as a phantom band.
The risk is forward-looking but concrete: `39-11-SUMMARY.md`'s own `affects` field states phase 40
(DAW marker export) "depends on range comments shipped here." If that export reads
`end_timestamp_ms` without also filtering `parent_comment_id IS NULL`, a spanned reply — created
by any future client bug, a direct RPC call, or API misuse — would export as a spurious marker.

**Fix:** Enforce the invariant where it can't be bypassed — in the trigger:

```sql
IF NEW.parent_comment_id IS NOT NULL THEN
  ...
  NEW.timestamp_ms := v_parent.timestamp_ms;
  NEW.end_timestamp_ms := NULL; -- a reply is never a span, regardless of what the caller sent
END IF;
```

### WR-04: `work_version_peaks_in_range()` is revoked from PUBLIC/anon but never explicitly re-granted to `authenticated` — inconsistent with the file's other two RPCs and with a lesson this codebase already documented

**File:** `supabase/migrations/224_writer_room_take_review_surface.sql:19-30`

**Issue:** Both other privileged routines this migration adds explicitly restate both halves of
the grant:

```sql
REVOKE EXECUTE ON FUNCTION public.create_work_version_comment(...) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_work_version_comment(...) TO authenticated;
```

(same pattern at `:367-370` for `review_work_version_comment_carry`). `work_version_peaks_in_range`
gets only the `REVOKE` (`:30`), with no matching `GRANT ... TO authenticated`. This function is
called directly inside the `work_versions_peaks_shape` CHECK constraint (`:34-38`), which is
evaluated as the actual session role — `authenticated`, via PostgREST — whenever any contributor
writes `work_versions.peaks` (both the initial `complete` route and the `PATCH` self-heal covered
in WR-02 above). Without its own `EXECUTE` privilege, `authenticated` can only run that check today
because Postgres grants `EXECUTE` to `PUBLIC` by default on function creation and this migration
does not revoke that grant *for* `authenticated` (only for `PUBLIC` and `anon` by name) — so the
current behavior is correct by omission, not by design.

This is the same class of trap `197_workspace_structural_integrity.sql:787-791` documents at
length for *tables*: "a REVOKE from PUBLIC never touches a direct grant… [Supabase's bootstrap]
is a DIRECT grant to each named role." The equivalent is true for functions — Postgres's own
implicit PUBLIC grant is masking the absence of an explicit one here. Nothing is broken today, but
the very next grant-hardening pass that follows this codebase's own established pattern (name
`authenticated` explicitly in a `REVOKE`, the way `182_...` did for
`workspace_audit_log` before `197` had to correct it) would silently break every write to
`work_versions.peaks`, including the D-03 self-heal, and no Jest test would catch it — the
migration test (`__tests__/migration-224-writer-room-take-review.test.ts:30-31`) only asserts the
function is referenced in the CHECK, not that its grants are complete.

**Fix:** Restate the grant explicitly, matching the file's own established pattern:

```sql
REVOKE EXECUTE ON FUNCTION public.work_version_peaks_in_range(SMALLINT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_version_peaks_in_range(SMALLINT[]) TO authenticated;
```

## Info

### IN-01: `app/(artist)/vault/works/[workId]/page.tsx`'s `work_version_comments` select omits the two new span columns

**File:** `app/(artist)/vault/works/[workId]/page.tsx:244-247`

**Issue:** This server-component query selects an explicit column list for the unified Studio
Notes feed (`audioNoteRows`) that predates migration 224 and was not updated to include
`end_timestamp_ms` / `needs_reposition`. Today this has no observable effect —
`lib/catalogue/studio-notes.ts`'s `normalizeAudioNote` never reads either field, so nothing
renders incorrectly. `TimedTrackPlayer.tsx` itself always fetches its own comments from
`/api/works/.../comments`, which does select the full column list, so the take-review surface
proper is unaffected. Flagging only because it's schema drift that will bite silently if the
Studio Notes feed is ever extended to show span info for audio notes, since the cast at line
`278` (`as WorkVersionComment[]`) won't catch the missing columns at compile time.

**Fix:** Add `end_timestamp_ms, needs_reposition` to the select list for consistency with the
schema, even though nothing currently reads them from this path.

---

_Reviewed: 2026-09-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
