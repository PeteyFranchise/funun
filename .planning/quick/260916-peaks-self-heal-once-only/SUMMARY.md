---
type: quick
slug: peaks-self-heal-once-only
status: complete
created: 2026-09-16
source: .planning/phases/39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor/39-REVIEW.md (WR-02)
key-files:
  modified:
    - app/api/works/[workId]/versions/[versionId]/route.ts
    - app/api/works/[workId]/versions/[versionId]/route.test.ts
---

# WR-02 — the peaks self-heal is once-only now

Closes the last open finding from the Phase 39 code review.

## The gap

The `PATCH` handler's `peaks` branch was reachable by anyone with `'contribute'` tier on the work,
with no check that the column was currently `NULL`. Migration 224's column comment is explicit
that NULL means *"not extracted yet — the player backfills it,"* never *"draw a placeholder
shape"* — but nothing enforced that reading.

The player's own backfill only fires when `drawnPeaks === null`, so today's client behaves. Nothing
stopped a stale browser tab, a future caller, or a room member acting deliberately from replacing
an already-correct waveform for **everyone in the room**, with a valid-shaped array.

Migration 224's CHECK validates the shape and range of what arrives. It cannot speak to
provenance, which is exactly the gap.

## The fix

`.is('peaks', null)` on the update, so the write only lands on a row whose waveform is still unset.

`single()` became `maybeSingle()`, with a no-op response when zero rows match. That pairing is the
part worth understanding: **zero rows is the expected outcome**, not an error. Two clients opening
the same take will race, and the loser must see a no-op rather than a 500 implying something
broke. Left as `single()`, this fix would have converted a benign race into an error report.

## No client change needed — verified, not assumed

`TimedTrackPlayer`'s backfill wraps the PATCH in `try/catch` and ignores the response body
entirely, setting local state regardless — its own comment calls this "best-effort persistence."
The new `{ alreadyComputed: true }` shape therefore cannot break it.

## The tests were proven to bite

Removing `.is('peaks', null)` fails **3 of 18** tests; restoring it passes all 18. Verified by
actually doing it, not by inspection — the same discipline the Phase 40 executors were held to.

Two new assertions: one that the write is scoped to rows with an unset waveform, one that an
already-computed waveform is a 200 no-op rather than a 500.

## Verification

Every step of CI `validate`: `security:migrations:verify` PASS · `typecheck:strict` clean ·
`lint --max-warnings=0` clean · **620 suites / 7,541 tests** · both `npm audit` levels clean.

## Impact, stated honestly

Cosmetic and trust, not data loss — a wrong-looking waveform shown to the room, never audio or
comment content. But it directly contradicted the "computed once … and heals itself" design the
waveform rests on, and the fix is one filter.

## Phase 39 review: now closed

WR-01 remains open (a too-short redraw leaves a stale `pendingSpan` that can be confirmed, posting
coordinates the writer never drew) — real but narrow. WR-03 and WR-04 shipped in migration 225;
this closes WR-02.
