---
phase: 39
slug: writer-s-room-the-take-as-a-real-review-surface-real-wavefor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-12
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `39-RESEARCH.md` § Validation Architecture, **corrected against the working tree
> on 2026-09-12** — research assumed three test files were missing; all three already exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (project-wide) |
| **Config file** | `jest.config.js` (repo root) |
| **Quick run command** | `npx jest components/catalogue lib/catalogue` |
| **Full suite command** | `npm test` |
| **Type check** | `npm run typecheck` (`tsc --noEmit`) |
| **Estimated runtime** | quick ~15–30s · full suite several minutes |

> **Never run `npm run build` during development** — it clobbers `.next` under a live dev server.
> Use `npm run typecheck` for type verification. (Standing project rule.)

---

## Sampling Rate

- **After every task commit:** `npx jest <the touched test file>` plus `npm run typecheck`
- **After every plan wave:** `npm test` (full suite) + `npm run typecheck`
- **Before `/gsd-verify-work`:** full suite green
- **Phase gate (additional):** the pins RLS smoke (below) run manually against a real Supabase
  project before the migration is claimed live — same discipline Phase 38's D-48 RLS branch
  required.
- **Max feedback latency:** ~30 seconds per task

---

## Per-Task Verification Map

Task IDs are assigned at `/gsd-plan-phase`. Mapping is by decision ID until then — this phase has
no pre-assigned requirement IDs, so `39-CONTEXT.md`'s D-01..D-18 **are** the requirement set.

| Decision | Behavior to verify | Test Type | Automated Command | File Exists |
|----------|--------------------|-----------|-------------------|-------------|
| D-01, D-03 | The shared decode+extract helper produces a stable, correctly scaled peaks array; `waveformPeaks()` output shape unchanged when wrapped | unit | `npx jest lib/catalogue/record-over-beat.test.ts lib/catalogue/waveform.test.ts` | ⚠️ partial — `record-over-beat.test.ts` ✅, `waveform.test.ts` ❌ W0 |
| D-01 | Server rejects a malformed or oversized client-supplied peaks array (wrong length, values outside 0–100) | unit | `npx jest app/api/works` | ❌ W0 |
| D-02 | `VersionComparisonPanel` draws level-matched peaks reflecting `analyzePlaybackLevels()`, not raw peaks | unit | `npx jest lib/catalogue/level-match.test.ts components/catalogue/VersionComparisonPanel.test.tsx` | ✅ both exist |
| D-03 | A take with no stored peaks triggers exactly one lazy backfill, caches the result, and never renders `WAVE_BARS` | unit | `npx jest components/catalogue/TimedTrackPlayer.test.tsx` | ✅ exists |
| D-04, D-05, D-06 | "Mark span" mode disables the seek overlay; span plays once and stops; pre-roll clamps at 0:00 | unit | `npx jest components/catalogue/TimedTrackPlayer.test.tsx` | ✅ exists |
| D-04, D-07 | `end_timestamp_ms` CHECK constraints (`end > start`, duration bound) present in migration 224; carry clamps **both** endpoints together | migration content | `npx jest __tests__/migration-224-writer-room-take-review.test.ts` | ❌ W0 — follows the existing numbered migration-test convention |
| D-07 | A carried range whose in-point exceeds the new take's duration is **offered and flagged**, never dropped and never collapsed to a point | unit | `npx jest lib/catalogue/version-comments.test.ts` | ⚠️ confirm at plan time |
| D-09 | A carried comment renders its "carried from v1" line from `carried_from_version_id` | unit | `npx jest components/catalogue/TimedTrackPlayer.test.tsx` | ✅ exists |
| D-10–D-13 | Pin RLS: author reads/writes own rows; a second authenticated room member gets **zero rows** for the same `version_id`; promotion deletes the pin; pins are never offered for carry | RLS smoke (SQL, real Postgres role context) | manual/scripted checklist — see Manual-Only below | ❌ W0 |
| D-11 | **No pin code path calls `broadcast(...)` or `channel.send(...)`** | static check | `grep -rn "broadcast\|channel.send" <pin route + pin component>` must return zero | ❌ W0 — add to the plan's review gate |
| D-14, D-15, D-16 | Shortcuts suppressed while any input/textarea/contenteditable holds focus or IME is composing; `[`/`]` navigate comments; **two mounted players do not both respond** | unit | `npx jest components/catalogue/TimedTrackPlayer.test.tsx` | ✅ exists |
| D-17, D-18 | Speed resets to 1× per take; `preservesPitch` is reapplied on `loadedmetadata` after a `src` swap | component | `npx jest components/catalogue/VersionComparisonPanel.test.tsx` | ✅ exists |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/catalogue/waveform.ts` + `lib/catalogue/waveform.test.ts` — the shared
      decode-and-extract helper and its unit coverage
- [ ] Peaks-payload bounds test for the version route (fixed length; each value an integer 0–100)
- [ ] `__tests__/migration-224-writer-room-take-review.test.ts` — migration content test for the
      `end_timestamp_ms` ALTER, its CHECK constraints, and the updated trigger/RPCs.
- [ ] Pins RLS smoke checklist — cannot be a jest unit test; RLS needs a real Postgres role
      boundary
- [ ] A grep-based review gate proving the pin path never broadcasts

**Already covered — no Wave 0 work needed:** `components/catalogue/TimedTrackPlayer.test.tsx`,
`components/catalogue/VersionComparisonPanel.test.tsx`, `lib/catalogue/record-over-beat.test.ts`
and `lib/catalogue/level-match.test.ts` all exist and are extended, not created.

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Pin invisibility across accounts | D-11 | RLS is only meaningful against a real Postgres role boundary; jest cannot impersonate two authenticated users | As writer A, drop 3 pins on a take. As writer B (a current room member on the same work), open that take and query the pins table — expect **zero rows**, no marker, no count, and no presence-channel event. Repeat as the work owner: also zero. |
| Promotion consumes the pin | D-12 | End-to-end across client state and DB | Drop a pin, promote it, post the comment. Confirm exactly one marker remains at that timestamp and the pin row is gone. |
| Pitch preservation at 0.5× | D-18 | Audible quality judgement — no assertion can hear smearing | Play a sung take at 0.5×. Confirm it stays in the same key and is still usable for judging intonation; note transient smearing on drums as expected, not a defect. |
| Peaks appear instantly after recording | D-01 | The point of the decision is a felt absence of waiting | Record over a beat, finish the take, and confirm its real shape renders immediately with no placeholder frame. |
| Keyboard safety in a live room | D-16 | Needs real typing surfaces mounted together | With the comment composer, `LyricsPad` and take-rename all reachable, type a space in each. Playback must not toggle. Then press `[` / `]` with focus outside any field and confirm comment navigation. |

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify or a declared Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without an automated verify
- [ ] Full suite green + `npm run typecheck` clean
- [ ] Pins RLS smoke passed against a real Supabase project
- [ ] Grep gate confirms zero broadcast calls on any pin path
- [ ] **Sequencing gate:** production migration parity confirmed through 223 before the owner is
      asked to apply migration 224 (see `39-CONTEXT.md` § Canonical References)
