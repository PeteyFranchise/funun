---
phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
plan: 11
subsystem: verification
tags: [manual-verification, production-migration, rls, uat, human-gated]

# Dependency graph
requires:
  - phase: 39-01
    provides: "Migration 224 — work_versions.peaks, comment span/reposition columns, work_version_pins"
  - phase: 39-03
    provides: "Creation-time peaks extraction on every version-write path"
  - phase: 39-05
    provides: "Private pins routes with room membership checked at write time"
  - phase: 39-06
    provides: "Real waveform rendering plus the one-time self-healing peaks backfill"
  - phase: 39-09
    provides: "Pin layer, drop, promote and remove in the take player"
  - phase: 39-10
    provides: "Keyboard transport and the four-step playback speed control"
provides:
  - "Migration 224 applied to production with confirmed local/remote parity"
  - "Phase 39 code deployed to production (PR #72, merge commit 04b32caf)"
  - "Recorded outcomes for 11 of 15 manual verifications; 4 explicitly deferred"
  - "One production defect found and fixed (PR #73, merge commit ebec2452)"
affects: ["Phase 39 verification", "Phase 40 (DAW marker export) — depends on range comments shipped here"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service-role read-only diagnostic scripts run against production to corroborate visual UAT — pin counts, peaks cardinality/range, comment lineage. Visual confirmation alone cannot distinguish a UI filter from a policy."

key-files:
  created:
    - .planning/todos/pending/2026-09-15-carry-forward-two-step-affordance.md
  modified:
    - lib/catalogue/take-transport.ts
    - lib/catalogue/take-transport.test.ts
    - supabase/migrations/224_writer_room_take_review_surface.sql
    - __tests__/migration-224-writer-room-take-review.test.ts
    - .claude/CLAUDE.md

key-decisions:
  - "Migration 224 was amended BEFORE application, not after, on the strength of a repo audit: peaks gained a database-enforced 0-100 range via an IMMUTABLE helper (a CHECK cannot hold a subquery), and work_version_pins replaced two independent foreign keys with one composite FK plus the unique key it requires. Editing in place was correct because the migration was unapplied; a 225 would have been required an hour later."
  - "The audit's third finding — that authenticated users hold direct INSERT on work_version_pins, so a direct PostgREST write bypasses the route's membership check — was deliberately NOT fixed. Closing it moves the access model, which D-11 locks to exactly one rule, and that is a decision rather than a fix. Recorded as accepted risk: the row is visible only to its author, notifies nobody, and grants no read the attacker did not already have."
  - "Task 2 steps 3-6 deferred rather than simulated. They are the only meaningful proof of D-11 and need two authenticated Postgres roles. Consistent with the owner's 2026-08-25 decision to verify organically as beta testers arrive rather than fabricate accounts."
  - "D-16 was recorded as PASSED even though a real keyboard defect was found in the same pass. Its four stated criteria all held. The defect was against the feature's purpose, not its acceptance criteria, and conflating the two would corrupt the record in both directions."
---

# 39-11 — Manual verification and production application

## Task 1 — migration application: COMPLETE

| Step | Result |
|---|---|
| 1 · Sequencing gate | Parity through 223 including 219-223; 224 the sole mismatch, local-only |
| 2 · Reservation | No collision — one 224 across all worktrees, none on remote |
| 3 · Push | `npx supabase@latest db push` — completed without error |
| 4 · Parity | 221 rows, **0 mismatches**, 224 local = remote |
| 5 · Schema cache | Comments read cleanly against the then-deployed OLD code, which also evidences 224's backward compatibility |

Migration 224 applied 2026-09-15. Production migration ceiling is now 224.

## Task 2 — pins privacy

| Step | Result |
|---|---|
| 1 · Three pins as plain dots | **PASS** — confirmed on screen; 3 rows at 16.8s / 44.4s / 68.1s, one author, one version |
| 2 · Coachmark once, dismissal persists | **PASS** — appeared before the first pin, dismissed via X, absent after reload |
| 3 · Writer B sees zero pins | **DEFERRED** |
| 4 · Writer B gets zero rows from the endpoint | **DEFERRED** |
| 5 · Owner also sees zero | **DEFERRED** |
| 6 · No notification, no live update | **DEFERRED** |
| 7 · Promotion consumes the pin | **PASS — D-12 verified.** Pins 3 to 2, the 44.4s row gone, exactly one comment marker at 0:44, no duplicate |
| 8 · Removal, no confirmation dialog | **PASS** — pins 2 to 1, stayed gone after reload |
| 9 · No pin offered for carry-forward | **PASS** — offer listed exactly 1 comment and zero pins; the earlier take kept its own pin |

## Task 3 — felt qualities

| Check | Result |
|---|---|
| Peaks appear instantly after recording (D-01) | **PASS** — a new take stored 200 peaks at creation, rendered immediately, no placeholder frame |
| 0.5x pitch preservation (D-18) | **PASS** — a sung take held its key and stayed usable for judging intonation |
| Keyboard safety in a live room (D-16) | **PASS** — space in the comment composer, take-rename and LyricsPad never toggled playback; one spacebar moved only one take |

## Verified beyond the checklist

**The peaks backfill round-trip**, which 39-06 deferred as unreachable by any test here. Versions
with peaks went 0/6 to 2/6 the moment a take was opened. Stored arrays inspect clean: cardinality
200, range 8-100, 48 and 70 distinct values — real dynamics, not a placeholder. This also proves
the 0-100 constraint added to 224 accepts genuine data, since a wrong bound would have rejected
the PATCH and rendered nothing.

**`review_work_version_comment_carry()`**, the riskiest thing 224 rewrote. Carrying one comment
from v2 to v3 copied it correctly, left the source intact, and set `needs_reposition = false` —
correct, since 44.4s fits inside v3's 100 seconds.

**D-06 pre-roll.** Bracket-stepping to a comment at 0:44 moved playback to roughly 0:42, so a
writer hears the run-up rather than landing cold.

## Defect found and fixed: the scrubber swallowed the spacebar

Clicking a waveform leaves focus on the scrubber, an `<input type="range">`.
`shouldSuppressShortcut` treated any INPUT as a typing surface, so the keydown handler returned
early — before `preventDefault()` — and the browser scrolled the page. The most natural gesture
in the room, click the take you want and press space, did the wrong thing; clicking elsewhere
first appeared to fix it, which is how it read as broken rather than as a bug.

Fixed in PR #73 (`ebec2452`): INPUT now suppresses every type except `range`. Checkbox and radio
stay suppressed deliberately, since space toggles them natively. Two regression cases added
against the pure guard. Re-verified on production after deploy: clicking a waveform then pressing
space now plays the take.

No automated check could have caught this — it needs real focus in a real DOM, and no jsdom is
installed anywhere in this repo.

## D-11 IS NOT VERIFIED

Task 2 steps 3-6 are the only meaningful proof that a private pin is private. Jest cannot
impersonate two authenticated Postgres roles, so the RLS boundary has never been exercised by a
second identity. Pins shipped to production on 2026-09-15 without that proof.

This is a deliberate owner decision, not an oversight. It must not be read as passed. The
remaining work is a facilitator-led session per `docs/verification/BETA-RLS-SMOKE-SESSION.md`:
writer B confirms zero pins visually AND zero rows from a direct request to the pins endpoint —
a visual absence could be a UI filter, only an empty response is the policy — plus the same as
the work owner, who holds the broadest read in the room. Running it on a live shared work is
non-invasive by design: a pin is wordless, notifies nobody, and rides no realtime channel.

**Accepted risk, recorded separately:** authenticated users hold direct INSERT on
`work_version_pins`, so a direct PostgREST write bypasses the route's membership check. Scope is
narrow — the row is private to its author and grants no new reads — but it is unfixed.

## Self-Check

- Migration 224 applied and parity confirmed: **yes**
- Code deployed to production: **yes** (04b32caf, plus ebec2452 for the fix)
- Every manual verification has a recorded outcome: **yes** — 11 pass, 4 deferred
- Any verification marked passed on the strength of reading code: **no**
- D-11 claimed as verified: **no, explicitly not**
