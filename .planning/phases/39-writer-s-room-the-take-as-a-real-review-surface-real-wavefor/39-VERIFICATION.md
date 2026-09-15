---
phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
verified: 2026-09-15T15:56:55Z
status: human_needed
score: 10/11 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "As writer A, drop 3 pins on a take. As writer B — a current room member on the same work, NOT the pin author — open that take and (a) look for a pin dot/count on the waveform and (b) issue a direct GET to /api/works/{workId}/versions/{versionId}/pins while authenticated as writer B. Repeat as the work owner."
    expected: "Writer B and the work owner each see zero pins, zero count, and zero trace in the UI, AND the direct API request returns an empty pins array for both — not just an empty UI (a visual absence could be a UI filter; only an empty API response proves the RLS policy, not the route, is what is hiding the rows)."
    why_human: "RLS is only meaningful against a real Postgres role boundary; Jest cannot impersonate two authenticated users. This is D-11's only meaningful proof and 39-11-SUMMARY.md explicitly records it as NOT run — Task 2 steps 3-6 were deliberately deferred by owner decision (verify organically as beta testers arrive, 2026-08-25 precedent), not simulated. Pins shipped to production on 2026-09-15 without this proof. A facilitator-led session per docs/verification/BETA-RLS-SMOKE-SESSION.md's pattern is the designated follow-up."
---

# Phase 39: Writer's Room — the take as a real review surface Verification Report

**Phase Goal:** Make a recording take in the Writer's Room something a writer can actually review
against, instead of a decorative strip — real waveform peaks, range comments, private pins,
keyboard shortcuts, and playback speed, all on one spine (the waveform).

**Verified:** 2026-09-15T15:56:55Z
**Status:** human_needed
**Re-verification:** No — initial verification (no prior VERIFICATION.md existed for this phase)

**Context:** This phase is already shipped to production. Migration 224 is applied (confirmed
parity, 221 rows, 0 mismatches per 39-11-SUMMARY.md), code is deployed via PR #72
(merge `04b32caf`, confirmed on `main`) and a follow-up production defect fix via PR #73 (merge
`ebec2452`, confirmed on `main`). This report is a retrospective, codebase-grounded check of what
39-11-SUMMARY.md claims, not a re-run of that manual pass.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Both hardcoded `WAVE_BARS` decorative arrays are retired; every take draws its real, persisted waveform | ✓ VERIFIED | `grep -rn "WAVE_BARS" components/ lib/` returns zero matches. `work_versions.peaks SMALLINT[]` exists with a `work_versions_peaks_shape` constraint fixing cardinality at 200 (`supabase/migrations/224_writer_room_take_review_surface.sql:33`). `TimedTrackPlayer.tsx` and `VersionComparisonPanel.tsx` both import and gate on `isValidPeaksPayload`/`levelMatchedPeaks` from `lib/catalogue/waveform.ts`, which itself imports the existing `waveformPeaks()` from `lib/catalogue/record-over-beat.ts` (`grep -c "from '@/lib/catalogue/record-over-beat'" lib/catalogue/waveform.ts` = 1; `grep -c "Math.abs(samples" lib/catalogue/waveform.ts` = 0 — no second peak algorithm). Production-verified per 39-11-SUMMARY.md: "a new take stored 200 peaks at creation, rendered immediately, no placeholder frame." |
| 2 | `VersionComparisonPanel` draws level-matched peaks (the picture matches what is actually playing); every other surface draws raw peaks | ✓ VERIFIED | `VersionComparisonPanel.tsx:91-96` gates `activeRawPeaks` through `isValidPeaksPayload` then `levelMatchedPeaks(activeRawPeaks, activeVolume)` — the same volume already applied to `<audio>.volume`. `TimedTrackPlayer.tsx` draws `livePeaks` unscaled. `components/catalogue/VersionComparisonPanel.test.tsx` and `TimedTrackPlayer.test.tsx` both pass (56/56 across the four component/lib test files in this family, `npx jest --testPathPatterns="TimedTrackPlayer.test\|VersionComparisonPanel.test\|WorkPage.test\|version-comparison.test\|RecordOverBeatStudio"`). |
| 3 | Every take-creation path (hum, record-over, plain upload, producer return) persists real peaks computed client-side at creation; a decode failure never blocks the upload; the server rejects a malformed/wrongly-sized payload | ✓ VERIFIED | `lib/catalogue/version-upload-client.ts`'s `resolvePeaks()` trusts a valid caller-supplied array, drops an invalid one, and falls back to `extractPeaksFromBlob` with the failure caught into `null`. `RecordOverBeatStudio.tsx` derives peaks from its own rendered buffer via `peaksFromBuffer` (no second decode). `app/api/works/[workId]/versions/[versionId]/route.test.ts` covers 5 malformed peaks shapes on the PATCH route, each asserted 400 + no `.update` call. `npx jest --testPathPatterns="versions/\[versionId\]/route.test\|version-upload-client.test"` — all pass. |
| 4 | A take with no stored peaks self-heals on first open (client decode + PATCH write-back), and every later viewer benefits without a reload | ✓ VERIFIED | Code: `TimedTrackPlayer.tsx`'s backfill effect, guarded by a module-level `backfillsInFlight: Set<string>`, calls `extractPeaksFromUrl` then `PATCH`es `{ peaks }` back. This is a state-transition/self-healing behavior no static-markup test can exercise (no jsdom in this repo) — but 39-11-SUMMARY.md records a real production check beyond the checklist: versions with peaks went from 0/6 to 2/6 the moment a take was opened, with inspected arrays showing cardinality 200, range 8-100, and real per-take distinct-value dynamics (not a placeholder shape). Treated as verified on the strength of this concrete production evidence, not code presence alone. |
| 5 | A comment can carry a span (`end_timestamp_ms`), drag-select paints it, and a range comment plays its span (once, with an opt-in Loop toggle for repeats — per the locked D-05 refinement of the roadmap's "playback loops it") | ✓ VERIFIED | Migration 224 adds `end_timestamp_ms`/`needs_reposition` with paired CHECK constraints (`work_version_comments_end_after_start`, `work_version_comments_end_range`), a restated column GRANT list, and a 7-arg `create_work_version_comment` RPC — confirmed present via `npx jest __tests__/migration-224-writer-room-take-review.test.ts` (18/18 pass). `TimedTrackPlayer.tsx` wires `normalizeSpanDrag`/`spanGeometry` for the Mark-span drag, a `stopPointMsRef` play-once-and-stop mechanism, and an explicit `aria-pressed` Loop toggle (never the native `.loop` property — `grep -c ".loop = "` returns 0). Production-verified: carrying one comment v2→v3 in 39-11's pass copied it correctly and set `needs_reposition` correctly. |
| 6 | A carried span whose in-point no longer fits the new take is clamped (both endpoints together, never collapsed to a point) and flagged, never silently dropped | ✓ VERIFIED | `review_work_version_comment_carry()` in migration 224 uses two `CROSS JOIN LATERAL` derivations with a one-millisecond start-reservation headroom; the migration test explicitly asserts the function body does NOT match a bare single-endpoint `LEAST(source.end_timestamp_ms` pattern (the exact failure mode that would roll back a carry batch). `lib/catalogue/take-spans.ts`'s `clampCarriedSpan` mirrors this arithmetic client-side and is unit-tested (`take-spans.test.ts`, 13 cases including the D-07 no-collapse-to-point assertion). `TimedTrackPlayer.tsx` amber-flags a `needsReposition:true` marker and chip, with a Reposition action. |
| 7 | A pin is wordless, private-by-design in its data model and doctrine, promotable into a comment (consuming the pin), never offered for carry, and never touches the realtime presence channel or notifications | ✓ VERIFIED | `work_version_pins` (migration 224) has exactly one RLS policy (`work_version_pins_author_only`, `author_user_id = auth.uid()` on both USING/WITH CHECK), no UPDATE grant, and a composite FK tying `version_id` to `work_id` (added during the pre-application audit recorded in 39-11-SUMMARY.md). `__tests__/writer-room-private-pins.test.ts` is a doctrine gate proving no pin route/component path imports `WriterRoomPresence`, calls `broadcast(`/`channel.send(`/`createNotification(`, or defines a pin-shaped event name — and pins the player's `onCommentChanged(` call-site count so promotion can never grow a second route to the room. Production-verified same-account behavior in 39-11: 3 pins rendered as plain dots; promotion consumed the pin (3→2, exactly one comment marker, no duplicate); removal worked with no confirmation dialog (2→1, stayed gone after reload); pins never appeared in the carry-forward offer. |
| 8 | A pin is invisible to every OTHER room member — no pin, no count, no trace for anyone but its author | ? UNCERTAIN — see Human Verification | The route's own `.eq('author_user_id', user.id)` filter is explicitly documented in-code as redundant narrowing, never the safeguard — the single RLS policy above is the real enforcement point. No Jest test in this repo can impersonate two authenticated Postgres roles to prove that boundary. **39-11-SUMMARY.md states this plainly and by name: "D-11 IS NOT VERIFIED" — steps 3-6 of its own Task 2 checklist (writer B sees zero pins/zero rows from the endpoint; the owner sees zero; no notification/live update) were deliberately deferred, not simulated, by owner decision. Pins shipped to production on 2026-09-15 without this proof.** No other phase artifact contradicts this — ROADMAP.md and STATE.md do not claim pin privacy is verified (both are simply stale on Phase 39's completion status generally; see Gaps Summary). |
| 9 | Keyboard shortcuts drive playback (space, arrow/shifted-arrow nudge, bracket comment stepping), scoped to exactly one active player, and are suppressed under every typing surface and IME composition | ✓ VERIFIED | `lib/catalogue/take-transport.ts` — `resolveTransportAction`, `shouldSuppressShortcut`, `claimActivePlayer`/`releaseActivePlayer`/`isActivePlayer` — all unit-tested (`take-transport.test.ts`, 33 total assertions across the three lib/catalogue pure modules, `npx jest --testPathPatterns="waveform.test\|take-transport.test\|take-spans.test"` passes). `TimedTrackPlayer.tsx` wires exactly one guarded `document.addEventListener('keydown', ...)` per player instance, gated first-line on `isActivePlayer` then `shouldSuppressShortcut`. A real production defect was found and fixed in this same pass: clicking the waveform left focus on the seek `<input type="range">`, which `shouldSuppressShortcut` treated as a typing surface, silently eating the spacebar. Fixed in PR #73 (`ebec2452`, confirmed merged to `main`) — `shouldSuppressShortcut` now excludes `type="range"` from INPUT suppression, with two regression tests added. Re-verified on production after deploy per 39-11-SUMMARY.md. |
| 10 | Four-step (0.5×/0.75×/1×/1.5×) pitch-preserving playback speed exists in both players and resets to 1× per take | ✓ VERIFIED | `lib/catalogue/take-transport.ts` exports `PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.5]` and `applyPlaybackShape` (sets `playbackRate`, `preservesPitch = true`, `webkitPreservesPitch = true`). Both `TimedTrackPlayer.tsx` and `VersionComparisonPanel.tsx` render the identical 4-step control and call `applyPlaybackShape` at multiple sites (press, `onLoadedMetadata`, and a side/version-change effect) so a freshly mounted `<audio>` element never silently reverts to the browser default. Speed state is component-instance-scoped (no context/global store), so a new mount always opens at 1×. Production-verified: "0.5x on a sung take held key and stayed usable for judging intonation" (39-11-SUMMARY.md, D-18 PASS). |
| 11 | "Note" terminology (referring to `work_version_comments` records) is renamed to "comment" across `TimedTrackPlayer.tsx`, `VersionComparisonPanel.tsx`, and `RecordOverBeatStudio.tsx`, per D-08 | ✓ VERIFIED | `grep -n "unresolved notes\|View.*notes\|Note {n}\|Leave a note\|timed notes\|open timed notes" components/catalogue/TimedTrackPlayer.tsx components/catalogue/VersionComparisonPanel.tsx components/catalogue/RecordOverBeatStudio.tsx` returns zero matches. `StudioNotes.tsx`, the producer-handoff `handoffNote` field, `lyric_suggestions.note`, and `DiaryFeed`'s diary note are correctly left untouched — each is a distinct record type explicitly excluded by D-08, confirmed by direct inspection of `RecordOverBeatStudio.tsx`. |

**Score:** 10/11 truths verified (1 explicitly, correctly reported as unverified by the phase's own artifacts — not silently passed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/224_writer_room_take_review_surface.sql` | Peaks column, range/reposition columns, pins table, all with correct grants/policies | ✓ VERIFIED | 417 lines, applied to production per 39-11-SUMMARY.md. Amended pre-application to add an `IMMUTABLE` 0–100 range helper and a composite FK on pins — both present in the current file. |
| `__tests__/migration-224-writer-room-take-review.test.ts` | Content-assertion test locking the migration's security shape | ✓ VERIFIED | `npx jest __tests__/migration-224-writer-room-take-review.test.ts` — 18/18 pass. |
| `types/catalogue.ts` (`WorkVersion.peaks`, `WorkVersionComment.end_timestamp_ms`/`needs_reposition`, `WorkVersionPin`/`WorkVersionPinView`) | Type surface mirroring the migration | ✓ VERIFIED | All fields present at the expected lines; `npx tsc --noEmit` exits 0. |
| `lib/catalogue/waveform.ts`, `take-transport.ts`, `take-spans.ts` (+ tests) | Pure, dependency-free modules for peaks/keyboard/span logic | ✓ VERIFIED | All three exist, import nothing from `components/`, and pass their unit suites. |
| `app/api/works/[workId]/versions/complete/route.ts`, `.../[versionId]/route.ts` | Accept and bound a `peaks` payload | ✓ VERIFIED | `PeaksSchema` present in both; PATCH route rejects malformed shapes with 400 and no write. |
| `app/api/works/[workId]/versions/[versionId]/comments/route.ts` | Accepts/validates `endTimestampMs`, forwards to the 7-arg RPC | ✓ VERIFIED | Confirmed via route source and `__tests__/writer-room-timed-track-comments-api.test.ts`. |
| `app/api/works/[workId]/versions/[versionId]/pins/route.ts` + `[pinId]/route.ts` | GET/POST/DELETE for private pins | ✓ VERIFIED | Both exist; GET filters redundantly on `author_user_id` with the RLS policy as the documented real enforcement point. |
| `components/catalogue/TimedTrackPlayer.tsx` | Real waveform, mark-span mode, pins, keyboard, speed, comment terminology | ✓ VERIFIED | `WAVE_BARS` removed; all five pillars' code paths present and wired (see Observable Truths above). |
| `components/catalogue/VersionComparisonPanel.tsx` | Real level-matched waveform, speed control, comment terminology | ✓ VERIFIED | `WAVE_BARS` removed; matches `TimedTrackPlayer`'s idiom. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `create_work_version_comment` RPC signature | Comments route's `supabase.rpc()` call | 7-arg signature incl. `p_end_timestamp_ms` | ✓ WIRED | Confirmed in migration + route source; RPC error classification reads real `error.message` (a pre-existing dead check was fixed as part of this work). |
| `work_versions.peaks` | PATCH route (39-03) and both players (39-06/39-07) | `{ peaks }` PATCH branch; `peaks` prop on both players | ✓ WIRED | Confirmed via grep and passing component tests. |
| `work_version_pins` RLS | Pins route | Route adds no ownership filter as the real safeguard (documented, intentionally redundant only) | ✓ WIRED (code-level) — cross-account guarantee itself is the unresolved human item | Route code matches the doctrine; the live RLS boundary itself is Truth #8's open item. |
| `lib/catalogue/take-transport.ts` | `TimedTrackPlayer.tsx` keydown listener | `claimActivePlayer`/`isActivePlayer`/`shouldSuppressShortcut`/`resolveTransportAction` | ✓ WIRED | One listener per player instance, confirmed by source inspection and passing tests; production defect (scrubber/INPUT suppression) found and fixed within this same wiring. |

### Requirements Coverage

**Known, expected traceability gap — not a failure.** Phase 39's decision IDs (D-01 through D-18)
are phase-local decisions recorded in `39-CONTEXT.md`, not entries in `.planning/REQUIREMENTS.md`.
`grep -n "Phase 39\|39-0[1-9]\|39-1[0-1]" .planning/REQUIREMENTS.md` returns nothing, and no
`D-0[1-9]`/`D-1[0-8]` pattern appears anywhere in that file. Plan 39-01-SUMMARY.md itself records
that `requirements.mark-complete` returned `not_found` for all of them. This is treated as the
phase context flagged it: a known traceability gap in the GSD process for this phase, not a
missing implementation — every D-ID has coverage evidence in its owning plan's SUMMARY.md
`coverage:` block, cross-checked against the codebase in the Observable Truths table above.

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|--------------|--------|----------|
| D-01 | 39-01, 39-02, 39-03, 39-06, 39-11 | Real, client-side-extracted peaks, persisted per take | ✓ SATISFIED | Truths #1, #3, #4 |
| D-02 | 39-02, 39-07 | A/B panel draws level-matched peaks | ✓ SATISFIED | Truth #2 |
| D-03 | 39-02, 39-03, 39-06, 39-11 | Lazy backfill for takes with no peaks | ✓ SATISFIED | Truth #4 |
| D-04, D-05, D-06 | 39-01, 39-02, 39-04, 39-08 | Mark-span mode, span playback, 2s pre-roll | ✓ SATISFIED | Truth #5 |
| D-07 | 39-01, 39-02, 39-04, 39-08, 39-11 | Carried span clamped jointly, flagged not dropped | ✓ SATISFIED | Truth #6 |
| D-08 | 39-03, 39-06, 39-07 | "Comment" terminology, not "note" | ✓ SATISFIED | Truth #11 |
| D-09 | 39-01, 39-04, 39-06 | "Carried from v{n}" provenance line | ✓ SATISFIED | Confirmed in `TimedTrackPlayer.tsx` ("Carried from " string present) |
| D-10, D-12, D-13 | 39-01, 39-05, 39-09, 39-11 | Wordless pin, promote-consumes, never carried, no confirm on remove | ✓ SATISFIED | Truth #7 |
| D-11 | 39-01, 39-05, 39-09, 39-11 | Pin invisible to every other room member; never broadcasts | ⚠️ PARTIAL | The no-broadcast/no-notification half is code-verified (Truth #7's doctrine gate); the cross-account invisibility half is explicitly unverified (Truth #8) |
| D-14, D-15, D-16 | 39-02, 39-10, 39-11 | Space/arrow/bracket shortcuts, scoped, suppressed correctly | ✓ SATISFIED | Truth #9 (includes the production defect + fix) |
| D-17, D-18 | 39-02, 39-07, 39-10, 39-11 | Four-step pitch-preserving speed, resets per take | ✓ SATISFIED | Truth #10 |

### Anti-Patterns Found

None blocking. `grep -n -E "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER"` across every file this phase's
plans modified returns zero matches (the only `placeholder` hits are legitimate HTML `placeholder=`
form-field attributes, not stub markers).

**Non-blocking documentation gap (informational, not a phase-goal failure):** `.planning/ROADMAP.md`
and `.planning/STATE.md` are stale relative to the actual shipped state. ROADMAP.md still shows
`39-11-PLAN.md` unchecked (`[ ]`), "Plans: 10/11 plans executed," and "Status: READY TO EXECUTE
2026-09-13... Nothing in Phase 39 has been executed" — despite `39-11-SUMMARY.md` (committed
`18f4fd46`, 2026-09-15) recording the migration applied, both PRs merged to `main`, and 11 of 15
manual checks completed. `.planning/STATE.md` similarly still reads "39-11 Tasks 2-3 outstanding"
from an earlier commit (`e56b5f4b`) that predates the actual completion commits. This does not
affect the product itself (verified directly against the code and production evidence above) but
means the project's own tracking artifacts currently understate Phase 39's real completion state.
Worth a bookkeeping pass before treating Phase 39 as closed in ROADMAP.md/STATE.md.

### Test / Build Evidence (run fresh for this verification)

| Check | Command | Result |
|-------|---------|--------|
| WAVE_BARS retirement | `grep -rn "WAVE_BARS" components/ lib/` | 0 matches |
| Phase unit tests (peaks/transport/spans) | `npx jest --testPathPatterns="waveform.test\|take-transport.test\|take-spans.test"` | 3 suites / 33 tests pass |
| Migration content test | `npx jest --testPathPatterns="migration-224-writer-room-take-review"` | 1 suite / 18 tests pass |
| Route + pins + comments tests | `npx jest --testPathPatterns="versions/\[versionId\]/route.test\|writer-room-timed-track-comments-api\|version-comments.test\|writer-room-private-pins\|pins/route.test\|version-upload-client.test"` | 6 suites / 39 tests pass |
| Player/panel component tests | `npx jest --testPathPatterns="TimedTrackPlayer.test\|VersionComparisonPanel.test\|WorkPage.test\|version-comparison.test\|RecordOverBeatStudio"` | 4 suites / 56 tests pass |
| Typecheck | `npx tsc --noEmit` | exit 0, clean |
| Lint (CI gate: `--max-warnings=0`) | `npm run lint -- --max-warnings=0` | exit 0, clean |
| Full suite (run once, per verification guidance) | `npm test -- --runInBand` | 611 suites / 7384 tests pass |
| Security migration gate | `npm run security:migrations:verify` | PASS |
| PR merges on `main` | `git log --oneline \| grep -E "04b32caf\|ebec2452"` | Both present; `git branch --contains` confirms both on `main` |

### Human Verification Required

### 1. Pin cross-account invisibility (D-11)

**Test:** As writer A, drop 3 pins on a take. As writer B — a current room member on the same
work, not the pin's author — open that take and (a) check the UI for any pin dot/count/trace and
(b) issue a direct authenticated GET to `/api/works/{workId}/versions/{versionId}/pins`. Repeat as
the work owner (broadest read in the room).

**Expected:** Writer B and the work owner each see zero pins in the UI AND get an empty array back
from the direct API request. Both halves matter — a UI-only check could be passing because of a
client-side filter rather than the database policy; only an empty API response proves the RLS
policy itself is the thing hiding the rows.

**Why human:** RLS is only meaningful against a real second authenticated Postgres role; Jest
cannot impersonate two users. This is the phase's own explicitly-flagged open item —
`39-11-SUMMARY.md` states "D-11 IS NOT VERIFIED" in its own words and names this as the exact
missing proof. It is a deliberate, recorded owner decision (verify organically as beta testers
arrive, per the 2026-08-25 precedent cited in the SUMMARY) — not an oversight, and not something
this verification pass should paper over by marking it passed on the strength of the code review
above.

**Related accepted risk (not itself a gap, but relevant context for whoever runs this check):**
authenticated users hold a direct `GRANT INSERT` on `work_version_pins` scoped only by
`author_user_id = auth.uid()` — a direct PostgREST write with a spoofed `work_id`/`version_id`
would bypass the API route's `resolveWorkAccess(..., 'contribute')` membership check. This was
found during the pre-application audit and deliberately left unfixed, because closing it would
change the access model D-11 locks to exactly one rule. Confirmed present in the current migration
(`GRANT INSERT (work_id, version_id, author_user_id, timestamp_ms) ... TO authenticated` with only
the single `author_user_id = auth.uid()` policy). Scope is narrow (a forged row is still private to
its forger and grants no new read), and it is explicitly recorded in `39-11-SUMMARY.md`, not hidden.

### Gaps Summary

No code-level gaps. All five roadmap pillars (real peaks, range comments, private pins, keyboard
shortcuts, playback speed) have working, tested, and — for everything short of the cross-account
RLS boundary — production-verified implementations, confirmed independently in this pass via fresh
test runs, typecheck, lint, a full suite run, and direct source/migration inspection rather than
by trusting SUMMARY.md claims.

The one open item is D-11's cross-account pin-privacy proof, which the phase's own artifacts
already and correctly refuse to claim as verified. This routes the phase to `human_needed` rather
than `passed` — not because anything is broken, but because the single most safety-relevant claim
in the "private pins" pillar (a pin is genuinely invisible to everyone but its author) has never
been exercised against a second real identity. Recommended next step: the facilitator-led,
two-identity session `39-11-SUMMARY.md` itself points to, structured like
`docs/verification/BETA-RLS-SMOKE-SESSION.md`'s refusal-plus-success pairing (a UI absence alone
proves nothing; pair it with a direct API call returning empty).

A separate, non-blocking bookkeeping gap: ROADMAP.md and STATE.md have not been updated to reflect
that plan 39-11 actually completed (migration applied, both PRs merged, 11/15 manual checks done).
This doesn't affect the product but should be reconciled so the project's own tracking reflects
reality.

---

_Verified: 2026-09-15T15:56:55Z_
_Verifier: Claude (gsd-verifier)_
