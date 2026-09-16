---
phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv
verified: 2026-09-16T02:31:37Z
status: human_needed
score: 14/14 E-NN decisions structurally verified (0 failed, 0 present-behavior-unverified); 8 items require human execution before the phase can ship
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Import a Funūn-exported Audacity label track into Audacity against any audio file (plan 40-02's own human-check, never performed anywhere in this phase)."
    expected: "The number of labels equals the number of comments the room showed; a range comment appears as a region with the same in/out points the room shaded; a point comment appears at a single position, not a zero-length artifact."
    why_human: "No Audacity instance exists in this environment. The format is pinned byte-for-byte against Audacity's own manual and covered by exact-string unit tests, but no live import has occurred."
  - test: "Run the eight-step byte-level procedure in docs/catalogue/AUDITION-MARKER-FORMAT.md against a real Adobe Audition install (plan 40-08's named release gate, T-40-37)."
    expected: "Encoding is UTF-8 (not UTF-16/BOM); line endings are CRLF with a trailing tab before each terminator; a range marker's Type column is 'Cue' and it imports at 6 seconds, not 66. All three currently-INFERRED facts in the doc and in lib/catalogue/take-export-audition.ts become CONFIRMED with a date, or the Audition option is removed per E-12's one-line fallback."
    why_human: "Nobody on this phase has Adobe Audition installed. Confirmed by direct inspection: `grep -c INFERRED` still returns 6 in the source module and 7 in the doc — no CONFIRMED marker exists anywhere. This is explicitly the phase's own release gate, not a formality (per 40-08-PLAN.md's own '<verification>' section: 'If it has not been run, the phase is not green')."
  - test: "In a browser on a take in the Writer's Room: confirm two separate controls (Export comments, Export my pins) are visible and neither offers the other's content."
    expected: "Two visually distinct controls, matching the take action row's quiet 10px vocabulary."
    why_human: "No jsdom exists in this repo; component rendering and interaction state are unobservable by any test here."
  - test: "Export comments on a take with unresolved comments; confirm the browser saves a file whose name contains the song title and the take's vN, and that opening it shows one marker per unresolved comment with the author's display name (not @handle)."
    expected: "A real, correctly-named, correctly-populated download."
    why_human: "No live request has been made against either export route in this environment (no test database, no jsdom)."
  - test: "Export comments on a take whose comments are ALL resolved; confirm no file is saved and the resolved-count message renders in place."
    expected: "The exact 409 sentence appears, with the correct count, and no file lands on disk."
    why_human: "Requires a live 409 response rendered in a real browser; unobservable by source assertion alone."
  - test: "Export a take with a repositioning-flagged comment (if one exists) and confirm the skipped-count sentence appears after the download; if no such take exists, record this as unverified rather than passed."
    expected: "The X-Funun-Skipped-Reposition header value renders as the correct skippedRepositionNote() sentence after a successful download."
    why_human: "Requires a live response header read in a real browser; the import of the sentence helper is proven, the runtime read is not."
  - test: "Export my pins on a take with pins, then on a take with none."
    expected: "A file with 'my-pins' in its name in the first case; the no-pins 409 sentence with no file in the second."
    why_human: "Same jsdom/live-request limitation as above."
  - test: "Check the take's action row at a phone-width viewport with all three format-choice labels visible (post plan 40-08) and confirm the controls wrap rather than overflow."
    expected: "Two controls, each disclosing up to three format buttons, wrap cleanly at mobile width."
    why_human: "Visual/responsive layout judgment; no jsdom exists in this repo."
---

# Phase 40: Writer's Room — DAW marker export (Audition, Audacity, CSV) Verification Report

**Phase Goal:** Serialize a take's comments as timeline markers a writer can drop into their DAW.
One export endpoint, up to three separately-named format options (Audacity and CSV certain;
Audition conditional on its format being verified, per E-12), and download controls on the take —
with pins exported separately, author-only, so a shareable file can never contain them.

**Verified:** 2026-09-16T02:31:37Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Summary

This phase has no `**Requirements:**` line in ROADMAP.md, so E-01..E-14 in `40-CONTEXT.md` serve
as the requirement set, as instructed. All 14 decisions are structurally implemented, and every
claim was checked against the actual codebase — not against SUMMARY.md prose — by reading source,
running the targeted test suites, running the full suite once, running `typecheck:strict`, `lint`,
`security:migrations:verify`, and executing `npm run export:audition-sample --silent` live to
inspect its actual bytes.

**The code is sound.** I found no fabricated test, no stub, no silent scope-narrowing, and no
disagreement between what the SUMMARYs claim and what the source does. The one specific risk named
in the verification brief — the Audition cross-format divergence test allegedly still comparing
against a hardcoded literal instead of a live import — turned out to be **already fixed**: the test
file does import `renderAudacityLabels` live and calls it, though a stale paragraph of comment text
above the test still describes the old (pre-fix) transcription approach and should be deleted (see
Finding 1). This is a documentation-hygiene issue, not a functional gap.

**The phase is not yet shippable**, and its own plans say so explicitly: `human_needed` is the
correct status because plan 40-08's own `<verification>` section states "if it has not been run,
the phase is not green" about the real-Audition byte check, and no such check has occurred anywhere
in this environment — `grep -c INFERRED` still returns non-zero in both the source module and the
documentation, with zero `CONFIRMED` markers anywhere. Six additional UI/behavioral checks named in
plans 40-02 and 40-07 have also never been performed (no jsdom exists in this repo). None of this
is a surprise or a cover-up — every one of these gaps is named, by the plans themselves, as a
deliberate human-verification boundary (`human_verify_mode: end-of-phase`). This report exists to
confirm that boundary is real and complete, not to pretend the code is done when it structurally
cannot self-certify the parts that need a person and a piece of software this environment doesn't
have.

## Goal Achievement

### Observable Truths (E-01 through E-14, cross-referenced against 40-CONTEXT.md)

| # | Decision | Status | Evidence |
|---|----------|--------|----------|
| E-01 | Unresolved comments only | ✓ VERIFIED | `classifyCommentExport` filters `resolvedAt === null` after the root filter (`lib/catalogue/take-export.ts:174`); asserted by exact-string tests |
| E-02 | Author may export own pins | ✓ VERIFIED | `GET .../pins/export/route.ts` exists, filters `.eq('author_user_id', user.id)` (line 110) |
| E-03 | Pins get a separate file/action, never touching comments export | ✓ VERIFIED | Two route files, two classifiers (`classifyCommentExport`/`classifyPinExport`), zero shared query path; enforced by 3 independent doctrine gates (per-route tests in 40-04/40-05 plus the cross-route `writer-room-daw-export-separation.test.ts`), all of which pass and were each proven non-vacuous by observed failing breaks (documented with actual failure output in 40-06-SUMMARY.md) |
| E-04 | Pin label is `Pin {timestamp}` | ✓ VERIFIED | `pinToMarker`: `` `Pin ${formatTrackTimestamp(pin.timestampMs)}` `` (`take-export.ts:120`) |
| E-05 | One take, always | ✓ VERIFIED | Both routes filter `.eq('work_id', workId)` AND `.eq('version_id', versionId)` on every query |
| E-06 | Provenance in filename, no in-file header | ✓ VERIFIED | `exportFilename()` reproduces `Midnight - v3 - comments.txt` and `Midnight - v3 - my-pins.csv` exactly (asserted `toBe` in `take-export.test.ts:254,260`); no provenance line in any renderer |
| E-07 | Label carries display name, never @handle | ✓ VERIFIED | `commentToMarker` reads `comment.author?.name`, never a handle field |
| E-08 | Carried comment keeps `[vN]` prefix | ✓ VERIFIED | `carriedPrefix` composed from `carriedFromVersionDisplay` (`take-export.ts:96-98`) |
| E-09 | Repositioning-flagged comments excluded, count stated | ✓ VERIFIED | `classifyCommentExport`'s reposition filter + `skippedRepositionCount` carried on the success path (not only the refusal path); `X-Funun-Skipped-Reposition` header present in the comments route; `skippedRepositionNote()` rendered client-side |
| E-10 | Nothing is recorded — pure read | ✓ VERIFIED | No `.insert(`/`.update(`/`.upsert(`/`.delete(`/`.rpc(` in either route (grep confirms zero matches); both routes export exactly one `GET` handler; enforced by 3 doctrine-gate test files |
| E-11 | Refuse and say which case, never silently empty | ✓ VERIFIED | Five distinguishable `refusalReason`/`refusalMessage` pairs (`no_comments`, `all_resolved`, `all_repositioning`, `no_pins`, plus success `none`), each an exact literal sentence, asserted byte-for-byte in tests; both routes return **409**, never 200, for a refusal |
| E-12 | Ship what's confirmed; Audition conditional | ✓ VERIFIED (structurally) — release gate open | Audition serializer built, isolated (1 import), byte-pinned by 17 exact-string tests; `docs/catalogue/AUDITION-MARKER-FORMAT.md` names the exact fallback (delete one array entry, revert one test number); **the byte-level human check itself has not been run** (see Human Verification) |
| E-13 | Three separately-named formats, chosen by DAW | ✓ VERIFIED | UI offers exactly 3 options (`Audacity`, `Audition`, `Spreadsheet (CSV)`) labeled by DAW, not format; both routes accept all three format ids |
| E-14 | Full display name (not first-name-only) | ✓ VERIFIED | Same code path as E-07 — `comment.author?.name` is the full name field, never split |

**Score:** 14/14 E-NN decisions are structurally present, wired, and tested. This score reflects
code-level implementation, not shippability — see Human Verification below for what stands between
here and a merge.

### Requirements Coverage

Phase 40 has no `**Requirements:**` line in ROADMAP.md and no corresponding entries in
`.planning/REQUIREMENTS.md` (confirmed: grepping REQUIREMENTS.md for `E-0`/`E-1` patterns and for
"daw-marker-export" returns no matches). Per the verification brief, E-01..E-14 in `40-CONTEXT.md`
were treated as the requirement set and are fully cross-referenced above. No E-NN decision was found
unimplemented by any plan.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lib/catalogue/take-export.ts` | Pure core: marker shape, sanitiser, classifiers, filename | ✓ VERIFIED | 2 imports exactly, 0 `Promise<>`, 42+ exact-string tests, all pass |
| `lib/catalogue/take-export-formats.ts` | Audacity + CSV renderers | ✓ VERIFIED | Whole-file `toBe` tests pass; `csvField`/`csvCell` equivalence table proven equal on quoting; `lib/metadata/export.ts` untouched by this plan (confirmed separately fixed later by an unrelated commit `b355538c`, outside this phase's scope) |
| `lib/catalogue/take-export-audition.ts` | Isolated Audition renderer | ✓ VERIFIED | 1 import exactly; `auditionDuration` is a separate named function; named negative test asserts it never returns the end-timestamp value; live cross-format test confirmed (see Finding 1) |
| `scripts/print-audition-sample.ts` + `export:audition-sample` npm script | One-command byte-exact sample | ✓ VERIFIED | Executed live: `npm run export:audition-sample --silent` produces exactly 4 CRLF-terminated lines, 6 tab-separated fields per line, zero stray banner bytes on stdout |
| `app/api/works/[workId]/versions/[versionId]/comments/export/route.ts` | GET-only, 409 refusals, X-Funun-Skipped-Reposition header | ✓ VERIFIED | Confirmed via source read and doctrine test; single exported handler |
| `app/api/works/[workId]/versions/[versionId]/pins/export/route.ts` | GET-only, author-filtered, no skipped-count header | ✓ VERIFIED | Confirmed via source read; `author_user_id` filter present and doctrine-tested to be load-bearing |
| `components/catalogue/TakeMarkerExport.tsx` | Two independent controls, two handlers, two literal URLs | ✓ VERIFIED | 184 lines; exactly 2 `fetch(` call sites; exactly 3 `id: '...'` format entries; no static download anchor |
| `docs/catalogue/AUDITION-MARKER-FORMAT.md` | Actionable human procedure | ✓ VERIFIED | Read in full — see Finding 2 |
| 5 doctrine/source-assertion test files | Non-vacuous security/structural gates | ✓ VERIFIED | All pass; the cross-route gate's non-vacuity was proven by 4 observed-and-reverted deliberate breaks with quoted failure output in 40-06-SUMMARY.md |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `ExportMarker` (40-01) | `renderAudacityLabels`/`renderMarkerCsv` (40-02) | direct import | ✓ WIRED | Confirmed by passing test suites |
| `ExportMarker` (40-01) | `renderAuditionMarkers` (40-03) | direct import, 1 import total | ✓ WIRED | `grep -c "^import"` returns 1 |
| `classifyCommentExport().refusalMessage` | Comments route 409 body | direct call | ✓ WIRED | `route.ts:144-146` returns `classification.refusalMessage` verbatim |
| `skippedRepositionNote()` | `TakeMarkerExport.tsx` success message | direct import | ✓ WIRED | Component imports from `@/lib/catalogue/take-export`, not re-typed |
| `Content-Disposition` filename | Client blob-download | header read, not rebuilt | ✓ WIRED | Component reads the header rather than reconstructing `exportFilename` client-side |
| `renderAuditionMarkers` | Comments/Pins route dispatch | format enum branch | ✓ WIRED | Both routes accept `'audition'` in their Zod format enum and dispatch to it |
| `renderAudacityLabels` (40-02) | Cross-format divergence test (40-03) | live import | ✓ WIRED (see Finding 1) | `take-export-audition.test.ts:7` imports and calls the real function |

### Specific Risk Checks (per verification brief)

**1. The Audition duration trap — VERIFIED, with a documentation-hygiene note (Finding 1).**
- `auditionDuration(startMs, endMs)` exists as a separate named export (`take-export-audition.ts`), never an inline subtraction.
- A named negative test exists: `'does NOT return the end timestamp 1:18.000 for a 72000ms-to-78000ms range — that is the duration trap'` (`take-export-audition.test.ts:49-51`), asserting `expect(result).not.toBe('1:18.000')`.
- The cross-format divergence test **does** import `renderAudacityLabels` live (`import { renderAudacityLabels } from './take-export-formats'` at line 7) and calls it directly on a real `ExportMarker[]` input, asserting the live-computed Audacity value (`'78.000000'`) against the live-computed Audition value (`'0:06.000'`) and asserting they are not equal. **Finding 1:** a leftover comment block (lines 123-131) still describes the *old* approach ("The Audacity value below is not a guess: it is a literal transcription of 40-02-PLAN.md's own pinned behavior contract...") even though the code beneath it was rewired to a live import, and a second, newer comment at lines 140-142 correctly describes the current (live-import) state. This is a stale/contradictory comment, not a functional defect — the test itself proves what it claims to prove, live. Recommend deleting the stale paragraph in a follow-up so a future reader isn't misled about which claim is current.

**2. E-03 separation is structural — VERIFIED, non-vacuous.**
- Neither export route contains a reference to the other's table name or view type (confirmed by direct grep, not just by reading the test).
- The UI uses two independent handlers with two literal template-literal URLs (`fetch(` appears exactly twice in `TakeMarkerExport.tsx`, at two distinct literal paths).
- `__tests__/writer-room-daw-export-separation.test.ts` includes a Group Zero anti-vacuity check (asserts both loaded sources are non-empty and contain `export async function`) and was proven non-vacuous by four deliberate breaks, each observed to fail the correct group and then fully reverted — the actual Jest failure output for all four breaks is quoted verbatim in `40-06-SUMMARY.md`. I did not merely trust that claim; I independently confirmed the test file's structure (Group Zero exists, `readFileSync` at module scope so a wrong path throws at load time) by reading the source directly.

**3. Refusals are 409, not 200 — VERIFIED in both routes.**
- Comments route: `return NextResponse.json({ reason: ..., message: ... }, { status: 409 })` (line 144-146), with a comment explaining why 409 rather than 200 was chosen.
- Pins route: `return NextResponse.json({ error: ..., message: ... }, { status: 409 })` (line 122-124), same reasoning.
- The two routes use different keys (`reason` vs `error`) alongside a common `message` field — an intentional, acknowledged asymmetry (documented in 40-07-SUMMARY.md's Decisions Made) that the UI component correctly reads around by only depending on the common `message` field.

**4. Verification commands — no bracketed Jest paths found.** Grepped the phase's plans, summaries, and the AUDITION-MARKER-FORMAT.md doc for `jest "app/...[..."` patterns; none exist. All test invocations in every plan use `--testPathPatterns="..."`.

**5. The Audition format is honestly unverified — VERIFIED as an honest gap, not a hidden one.**
- `grep -c INFERRED` returns 6 in `lib/catalogue/take-export-audition.ts` and 7 in `docs/catalogue/AUDITION-MARKER-FORMAT.md`; zero `CONFIRMED` markers exist anywhere in either file.
- The document is genuinely actionable: it states the format plainly (section 1), names its three independent third-party sources without claiming any is Adobe (section 2), names exactly three INFERRED facts with the consequence of each being wrong (section 3), gives 8 single-command procedure steps (section 4), and names the `--silent` gotcha **prominently, before step 3**, in its own callout box — not buried in a footnote, exactly as required.
- I independently ran `npm run export:audition-sample --silent > /tmp/funun-audition-sample.csv` and confirmed: exit 0, exactly 4 CRLF-terminated lines, 6 tab-separated fields per line, header exactly `Name\tStart\tDuration\tTime Format\tType\tDescription`, no stray bytes. The script and its documentation are correct as written.

**6. Human-only behaviors reported honestly — VERIFIED.** Plan 40-07's SUMMARY explicitly lists the five behaviours only verifiable by hand (controls rendering distinctly, a live 409 in place, a real download with correct name/contents, the skipped-count sentence, mobile wrapping) under a section titled "Behaviours Only Verifiable By Hand," each stated as unproven rather than assumed. These are folded into this report's `human_verification` list rather than counted toward the score, per this workflow's rules.

### Anti-Patterns Found

None. Scanned every file modified across all 8 plans for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"not yet implemented"/"coming soon" — zero matches.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Targeted test suites (all 3 phases of the phase's own tests) | `npx jest --testPathPatterns="take-export"` | 82/82 pass | ✓ PASS |
| Doctrine/source-assertion gates | `npx jest --testPathPatterns="writer-room-comments-export-api\|writer-room-pin-export-api\|writer-room-daw-export-separation\|writer-room-take-marker-export-ui\|writer-room-private-pins"` | 70/70 pass | ✓ PASS |
| Full suite (run once) | `npm test -- --runInBand` | 620 suites / 7539 tests pass | ✓ PASS |
| Strict typecheck | `npm run typecheck:strict` | clean | ✓ PASS |
| Lint | `npm run lint` (`--max-warnings=0`) | clean | ✓ PASS |
| Migration security gate | `npm run security:migrations:verify` | clean, migration ceiling unchanged at 225 | ✓ PASS |
| Live Audition sample byte check | `npm run export:audition-sample --silent \| od -c \| awk -F'\t' '{print NF}'` | 4 lines, 6 fields each, CRLF terminators, correct header | ✓ PASS |
| Real Audacity import | — | not run | ? SKIP (human verification) |
| Real Audition import | — | not run | ? SKIP (human verification) |
| Live browser export flow | — | not run (no jsdom) | ? SKIP (human verification) |

### Migration / Deployment State

Confirmed: `supabase/migrations/` ceiling is still `225_reply_span_and_peaks_grant.sql` — no new migration was added, matching the phase's own statement that none was needed. Everything for this phase lives on local `main` only (46 commits ahead of `origin/main`, confirmed via `git status`), no PR opened, no production deploy — consistent with the "not deployed" framing given for this verification.

### Out-of-scope observation (not a phase 40 gap)

`.planning/todos/pending/2026-09-15-csv-cell-injection-guard-metadata-export.md` — created by plan
40-02 as a deliberate non-fix record — was later independently resolved by an unrelated commit
(`b355538c fix(security): neutralise CSV injection in the distributor metadata export`) and moved
to `.planning/todos/completed/`. The pending copy shows as a locally deleted, uncommitted file in
the current working tree (`git status` shows `D .planning/todos/pending/...`). This is stray local
housekeeping unrelated to any of Phase 40's 8 plans or their commits — it does not affect this
phase's must-haves — but should be committed or restored so the working tree matches intent.

### Human Verification Required

Eight items, none of which were performed anywhere in this phase, and all of which the phase's own
plans name as end-of-phase release gates rather than optional follow-ups (`human_verify_mode:
end-of-phase`). See the frontmatter `human_verification` list for full test/expected/why-human
detail on each. In brief:

1. Real Audacity import of a Funūn-exported label track (plan 40-02's own human-check).
2. The full eight-step byte-level Audition procedure in `docs/catalogue/AUDITION-MARKER-FORMAT.md`
   against a real Adobe Audition install — **this is the phase's named release gate; per 40-08's own
   verification section, the phase is not green until it runs, or the Audition option is removed
   per E-12's documented one-line fallback.**
3-7. Five live-browser UI checks from plan 40-07 (two distinct controls visible; a real comments
   download with correct name/contents; the all-resolved refusal rendering in place; the
   skipped-reposition sentence after a real download; the pins export producing a correctly-named
   file or the no-pins refusal).
8. Mobile-width wrapping check for the take's action row now that three format buttons are offered
   per control (plan 40-08's one remaining UI check).

### Gaps Summary

No gap was found in what the code does. Every E-01..E-14 decision is implemented, tested, and wired
exactly as decided, and the one thing flagged for special scrutiny in the verification brief (a
possibly-fake cross-format test) turned out to be genuinely live-wired, with only a stale comment
left behind as cosmetic cleanup. The reason this phase is not `passed` is not a defect — it is that
the phase's own design correctly refuses to self-certify the parts that require a human and a piece
of proprietary software (Adobe Audition) or a real browser (no jsdom in this repo). Recording it as
`human_needed` rather than `passed` is the accurate reflection of that design, and recording it as
`gaps_found` would misstate a deliberately-deferred human gate as a code defect.

---

_Verified: 2026-09-16T02:31:37Z_
_Verifier: Claude (gsd-verifier)_
