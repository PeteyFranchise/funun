---
phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor
plan: 03
subsystem: api
tags: [catalogue, waveform, zod, nextjs-route, supabase]

# Dependency graph
requires:
  - phase: 39-01
    provides: "lib/catalogue/waveform.ts (PEAKS_BAR_COUNT, isValidPeaksPayload, peaksFromBuffer, extractPeaksFromBlob) and migration 224's work_versions.peaks column"
  - phase: 39-02
    provides: "the same waveform.ts module, hardened and tested"
provides:
  - "uploadWorkVersion computes/accepts peaks for every take-creation path (hum, record-over, plain upload, producer return)"
  - "POST /api/works/[workId]/versions/complete accepts and bounds a peaks array"
  - "PATCH /api/works/[workId]/versions/[versionId] accepts a { peaks } write-back branch, the D-03 lazy-backfill write endpoint"
  - "app/api/works/[workId]/versions/[versionId]/route.test.ts — the route's first test file"
  - "RecordOverBeatStudio reuses its rendered buffer instead of re-decoding, and its two timed-comment strings match phase vocabulary"
affects: [39-06, 39-04, 39-05, 39-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Peaks resolution kicked off alongside (not after) the signed-URL upload so client-side decode overlaps network transfer"
    - "A malformed peaks payload is discarded silently on the completion route (upload still succeeds); the same shape is rejected outright on the PATCH write-back route (400, no write)"

key-files:
  created:
    - app/api/works/[workId]/versions/[versionId]/route.test.ts
  modified:
    - app/api/works/[workId]/versions/complete/route.ts
    - app/api/works/[workId]/versions/[versionId]/route.ts
    - lib/catalogue/version-upload-client.ts
    - lib/catalogue/version-upload-client.test.ts
    - components/catalogue/RecordOverBeatStudio.tsx

key-decisions:
  - "Peaks are computed client-side for every take including plain uploads, because the browser already holds the exact bytes it is about to send and the real ceiling is 50MB (MAX_BYTES), not Sound Vault's 250MB (D-01 as amended, from the plan objective)"
  - "A decode failure on the completion route degrades to null and never blocks the upload; the D-03 lazy backfill (plan 39-06) heals it later"

patterns-established:
  - "resolvePeaks() as the single control point deciding between a trusted caller-supplied array and the decode fallback, used by the one shared upload funnel (uploadWorkVersion)"

requirements-completed: [D-01, D-03, D-08]

coverage:
  - id: D1
    description: "POST /versions/complete and PATCH /versions/[versionId] both accept a peaks array only in the exact PEAKS_BAR_COUNT/0..100 shape, rejecting five malformed shapes with a 400 and no database write on the PATCH route"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "app/api/works/[workId]/versions/[versionId]/route.test.ts#PATCH /api/works/[workId]/versions/[versionId] — peaks"
        status: pass
    human_judgment: false
  - id: D2
    description: "uploadWorkVersion resolves peaks for every creation path — trusts a valid caller-supplied array, drops an invalid one to null, and falls back to a client-side decode (never blocking the upload on decode failure)"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "lib/catalogue/version-upload-client.test.ts#uploadWorkVersion"
        status: pass
    human_judgment: false
  - id: D3
    description: "RecordOverBeatStudio's saveRoughTake derives peaks from its already-rendered buffer via peaksFromBuffer instead of re-decoding, and its two timed-comment strings use the phase's vocabulary"
    requirement: "D-08"
    verification:
      - kind: unit
        ref: "npm run typecheck (clean) + npx jest components/catalogue lib/catalogue (62 suites / 465 tests pass)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-09-13
status: complete
---

# Phase 39 Plan 03: Peaks on Every Creation Path Summary

**Every take-creation path (hum, record-over, plain upload, producer return) now sends a real waveform through a single funnel, and both version-write routes bound the peaks payload to the exact agreed shape — with a real test proving five malformed shapes are refused.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-09-13T22:15:03Z
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- Both `POST /api/works/[workId]/versions/complete` and `PATCH /api/works/[workId]/versions/[versionId]` now accept a `peaks` array, bounded by a shared `PeaksSchema` (`PEAKS_BAR_COUNT` integers, each 0..100). The completion route discards a malformed payload silently (the take is still saved); the PATCH route rejects it outright with 400 and no write.
- A new `app/api/works/[workId]/versions/[versionId]/route.test.ts` — the route's first test file — covers all five malformed peaks shapes (too short, too long, value 101, value -1, fractional value) plus a valid write and a mixed-key rejection (`peaks` + `label` in one request), each asserting both the response status and whether the underlying Supabase `.update` spy was ever called.
- `uploadWorkVersion` (the single funnel for all four take-creation paths) now resolves a `peaks` array on every call via a new `resolvePeaks()` helper: a caller-supplied array is trusted only when `isValidPeaksPayload` passes, otherwise treated as absent; with nothing supplied, it decodes the file itself via `extractPeaksFromBlob`, catching any decode failure into `null` so a take is never blocked. The decode is started alongside (not after) the signed-URL upload so it overlaps the network transfer.
- `RecordOverBeatStudio.saveRoughTake` derives its take's peaks from the buffer `renderRoughMix` already produced, via `peaksFromBuffer`, instead of letting the shared upload client re-decode the encoded WAV — the one case in the app where the browser already owns a fully decoded buffer.
- The two D-08 terminology strings in the producer-handoff feedback fieldset ("Loading open timed notes…" / "No open timed notes on the backing take…") are renamed to "comments," matching the phase's vocabulary for `work_version_comments` records. A full sweep of the file found no other row describing that record type as a "note" — the producer-handoff note (`handoffNote`, "What are we changing? (optional)") is a distinct record type and was left untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Accept and bound peaks on the two version-write routes** - `2e54422d` (feat)
2. **Task 2: uploadWorkVersion computes peaks for every take it sends** - `37312fbf` (feat)
3. **Task 3: Record-over studio reuses its rendered buffer, and says "comments"** - `6e5b8115` (feat)

_No TDD tasks in this plan; each commit is a single feat commit covering its task's action + test additions together._

## Files Created/Modified

- `app/api/works/[workId]/versions/complete/route.ts` - Adds `PeaksSchema`, parses `body.peaks`, resolves to the parsed array or `null` on any failure, adds `peaks` to the `work_versions` insert
- `app/api/works/[workId]/versions/[versionId]/route.ts` - Adds a fourth strict union member `{ peaks: PeaksSchema }` to `PatchVersionSchema` and a `'peaks' in body` branch that updates `work_versions.peaks`, placed after the take lookup (so a missing take still 404s) and before the archive branch
- `app/api/works/[workId]/versions/[versionId]/route.test.ts` - New route test: 7 cases covering 5 malformed peaks shapes, one valid write, and one mixed-key rejection
- `lib/catalogue/version-upload-client.ts` - Extends `UploadWorkVersionInput` with optional `peaks`, adds `resolvePeaks()`, kicks off the decode alongside the signed-URL upload, adds `peaks` to the `versions/complete` request body
- `lib/catalogue/version-upload-client.test.ts` - Adds 3 cases: verbatim forwarding of a valid caller-supplied array, dropping a wrong-length array to `null`, and resolving (not rejecting) when decode throws with no array supplied
- `components/catalogue/RecordOverBeatStudio.tsx` - `saveRoughTake` derives peaks from the rendered buffer via `peaksFromBuffer` and passes it to `uploadWorkVersion`; renames the two D-08 timed-comment strings

## Decisions Made

- Peaks are computed client-side for every take including plain uploads (not just hum/record-over), because the browser already holds the exact bytes it is about to send and the Writer's Room's real per-take ceiling is 50MB, not Sound Vault's 250MB — this was the plan's stated amendment to D-01, carried through unchanged.
- A decode failure on the completion route is deliberately non-blocking: the audio object is already stored by the time peaks are resolved, and D-03's lazy backfill (a later plan) is the designated healing path — failing the whole take creation over a waveform-extraction error would be a worse outcome than a temporarily-null `peaks` column.

## Deviations from Plan

None functionally — plan executed as written. Two of the plan's own grep-based acceptance criteria are numerically off by one and could not be literally satisfied without an unnatural code shape; documented below since they affect how the plan's stated criteria read against the actual diff.

### Notes on plan acceptance-criteria arithmetic (not a code deviation)

1. **`grep -c "extractPeaksFromBlob" lib/catalogue/version-upload-client.ts` returns 2, not the plan's stated 1.** One match is the import line (`import { extractPeaksFromBlob, isValidPeaksPayload } from '@/lib/catalogue/waveform'`), the other is the single call site inside `resolvePeaks()`. There is exactly one call site — the intent of the criterion (no duplicate decode logic) is met; the plan's arithmetic simply didn't account for the import line also containing the substring.
2. **`grep -c "peaksFromBuffer" components/catalogue/RecordOverBeatStudio.tsx` returns 2, not the plan's stated 1**, for the identical reason: one import line, one call site inside `saveRoughTake`.

Both counts were verified deliberately (not accidentally): `extractPeaksFromBlob`/`peaksFromBuffer` each has exactly one call site in its respective file, matching the plan's actual functional requirement ("no second decode").

---

**Total deviations:** 0 functional deviations. 2 informational notes on plan grep-criteria arithmetic (see above).
**Impact on plan:** None on scope, correctness, or security. All three tasks executed exactly as specified.

## Issues Encountered

- Jest's CLI pattern matching treats `[` and `]` in a path as glob character classes, so `npx jest "app/api/works/[workId]/versions/[versionId]/route.test.ts"` reports "No tests found" until the brackets are escaped (`\[workId\]`, `\[versionId\]`). Not a code issue — noted here only because it could trip up a future contributor running the same test path directly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 39-06 (D-03's lazy backfill) can now write a recovered `peaks` array back through the `PATCH .../[versionId]` `{ peaks }` branch this plan added.
- Not verified by this plan (per its own `<verification>` section): no request actually reaches Postgres until migration 224 is applied in plan 39-11 — the `peaks` column and the `work_versions_peaks_shape` CHECK constraint exist only in the unapplied migration file at this point.
- Plans 39-04 (comments route) and 39-05 (pins routes) were executing in parallel in separate worktrees during this plan's execution; this plan touched none of their files (`comments/**`, `pins/**`, `lib/catalogue/version-comments.ts`, `types/catalogue.ts`, or any migration), per the coordination note.

---
*Phase: 39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor*
*Completed: 2026-09-13*
