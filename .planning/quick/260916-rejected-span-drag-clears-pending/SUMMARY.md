---
type: quick
slug: rejected-span-drag-clears-pending
status: complete
created: 2026-09-16
source: .planning/phases/39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor/39-REVIEW.md (WR-01)
key-files:
  modified:
    - components/catalogue/TimedTrackPlayer.tsx
    - components/catalogue/TimedTrackPlayer.test.tsx
---

# WR-01 — a rejected span drag clears the pending span

Closes the last open finding from the Phase 39 code review.

## The bug

`handleSpanPointerUp` read `if (normalized) setPendingSpan(normalized)`. `normalizeSpanDrag`
returns `null` for a drag under `MIN_SPAN_MS` (250ms), and the truthiness guard discarded that
null — so `pendingSpan` kept whatever it held before.

The comment directly above claimed *"a drag shorter than MIN_SPAN_MS snaps back with no confirm
affordance at all."* That was true only for the **first** drag. Afterwards:

1. A writer marks a span. Confirm appears, pointed at span A.
2. Still in Mark-span mode, they redraw it shorter — a very plausible correction, especially on
   touch where a quick redraw easily lands under 250ms.
3. The drag is rejected. `pendingSpan` is still span A. Confirm is still live.
4. They press Confirm believing they redrew it, and post **span A's coordinates** — the span they
   had visibly replaced.

`repositionComment()` made it worse. It pre-seeds `pendingSpan` with no drag at all, so a
too-short correction there posted the original pre-clamped coordinates — a span the writer never
drew in the first place.

## The fix

`setPendingSpan(normalized)`, unconditionally.

The framing that matters: **`normalizeSpanDrag` already returns `null` to mean "no span."** The
component was second-guessing its own pure module and throwing that signal away. Passing it
straight through is the behaviour the comment always described, and it fixes `repositionComment`
for free rather than needing a second patch.

## The test was proven to bite

Reintroducing `if (normalized)` fails exactly 1 of 24 tests; restoring passes all 24. Verified by
actually reintroducing the bug, not by inspection.

The assertion targets the **shape of the bug** rather than the shape of the fix — it rejects both
`if (normalized) setPendingSpan` and `normalized && setPendingSpan`, so the guard cannot come back
in either spelling.

A source assertion, unavoidably: this invariant lives inside a pointer handler and there is no
jsdom in this repo, so no rendered test can reach it. That is exactly what the review said made
the bug invisible in the first place — *"the redraw-reset invariant lives only inside the
component's pointer handlers, not in the pure, already-tested module."*

## Verification

Every step of CI `validate`: `security:migrations:verify` PASS · `typecheck:strict` clean ·
`lint --max-warnings=0` clean · **620 suites / 7,542 tests** · both `npm audit` levels clean.

## Phase 39 code review: closed

| Finding | Status |
|---|---|
| WR-01 | closed here |
| WR-02 | closed — peaks self-heal is once-only |
| WR-03 | closed — migration 225, a reply cannot carry a span |
| WR-04 | closed — migration 225, the peaks helper has its grant |
| IN-01 | open (informational): the Studio Notes select never picked up the two new span columns. Harmless — nothing reads them from that path. |
