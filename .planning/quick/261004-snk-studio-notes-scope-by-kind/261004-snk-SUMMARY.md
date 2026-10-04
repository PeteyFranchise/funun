---
phase: quick/261004-snk-studio-notes-scope-by-kind
plan: 261004-snk
subsystem: ui
tags: [react, studio-notes, writers-room, label-integrity, nextjs, jest]

requires: []
provides:
  - "lib/catalogue/studio-notes.ts exports selectSongStudioNotes, countUnresolvedAudioNotes(ByVersion), countUnresolvedLyricNotesByBlock, resolveLyricNoteDeepLink — pure selectors over presentStudioNotes' unnarrowed output"
  - "Studio Notes module lists and counts song-kind threads only; its Open chip and its description count the exact same set"
  - "Versions module names unresolved audio-comment threads across active AND archived takes, with each counted thread displayed somewhere in the module (player for active, archived row for archived)"
  - "Lyric blocks carry their own unresolved-comment marker on the existing Comments control, mirroring suggestionCount's precedent"
  - "A historical lyric-kind ?studioNote= deep link resolves to the block's own comments panel instead of landing on nothing"
affects: [writers-room, catalogue, label-integrity-funun]

tech-stack:
  added: []
  patterns:
    - "Source-scoped pure selectors over an unnarrowed read-time facade (presentStudioNotes stays the three-store aggregate; WorkPage derives all per-surface counts from one snapshot) rather than narrowing the facade itself, since two other callers (server page, API route) still need all three kinds"
    - "countUnresolvedX and countUnresolvedXByVersion derived from the same internal computation so a header total and its per-row breakdown can never drift apart"
    - "handleOpenLyricComments converted from a plain function declaration to useCallback so a new effect could depend on it honestly under react-hooks/exhaustive-deps"

key-files:
  created: []
  modified:
    - lib/catalogue/studio-notes.ts
    - lib/catalogue/studio-notes.test.ts
    - components/catalogue/StudioNotes.tsx
    - components/catalogue/WorkPage.tsx
    - components/catalogue/WorkPage.test.tsx
    - components/catalogue/LyricsPad.tsx
    - components/catalogue/LyricBlockCard.tsx
    - components/catalogue/LyricBlockCard.test.tsx

key-decisions:
  - "D-SNK-01: the filter lives at the WorkPage boundary, not inside presentStudioNotes — narrowing the facade would strand the server page and the studio-notes API route, both of which still need all three kinds"
  - "D-SNK-02: removed the StudioNotes composer's audio/lyric creation paths entirely — both already exist at their real anchors (TimedTrackPlayer, LyricCommentsPanel), so the picker was a duplicate route to a result the now-scoped module would never show"
  - "D-SNK-03/04: the Versions allowlist is every take VersionsList renders (active AND archived); archived rows gained their own per-take unresolved count since they have no player to show it in; wording matches the player's own 'unresolved comments' noun"
  - "D-SNK-05: the lyric deep-link routing decision is a pure, lib-level, unit-testable function (resolveLyricNoteDeepLink); WorkPage routes a hit through the pre-existing handleOpenLyricComments rather than any new UI or API path"

requirements-completed: [D-SNK-01, D-SNK-02, D-SNK-03, D-SNK-04, D-SNK-05]

duration: ~70min
completed: 2026-10-04
status: complete
---

# Quick Task 261004-snk: Studio Notes Scoped by Kind Summary

**Studio Notes now lists and counts song-level threads only; every unresolved audio and lyric thread the old aggregate count used to cover stays visible on the surface that now owns it — Versions (active player + archived row) and the lyric block's own Comments control, respectively — with a pure lib-level resolver routing old `?studioNote=` lyric links to the right panel instead of an empty highlight.**

## Performance

- **Duration:** ~70 min
- **Completed:** 2026-10-04
- **Tasks:** 3/3
- **Files modified:** 8 (2 lib, 6 components/tests)

## Where the filter landed, and why that boundary

The filter lives at the **`WorkPage` boundary**, not inside `presentStudioNotes` (D-SNK-01). `presentStudioNotes` (`lib/catalogue/studio-notes.ts:186`) is unchanged and still spreads all three stores (song/audio/lyrics) into one list — it has two other callers that legitimately need all three kinds: the server page (`app/(artist)/vault/works/[workId]/page.tsx:817`) and the studio-notes API route (`app/api/works/[workId]/studio-notes/route.ts:106`). Narrowing the facade itself would have stranded both.

Instead, four new pure, named, exported selectors were added to `lib/catalogue/studio-notes.ts`, each taking an already-presented `StudioNoteThreadView[]`:

- `selectSongStudioNotes(notes)` — the song-kind subset, order preserved.
- `countUnresolvedAudioNotesByVersion(notes, versionIds)` / `countUnresolvedAudioNotes(notes, versionIds)` — the latter is *derived from* the former (`Object.values(...).reduce(...)`), so a header total and its per-row breakdown can never disagree.
- `countUnresolvedLyricNotesByBlock(notes)` — unresolved lyric roots keyed by block id, zero-count blocks omitted.
- `resolveLyricNoteDeepLink(notes, noteId)` — matches a thread's root id **or any reply id**, returns `{ blockId, label }` only when that thread's context is lyric-kind, else null.

`WorkPage.tsx` keeps the full aggregated `studioNotes` list and is the **only** place that derives all three per-surface counts from one consistent snapshot — `songStudioNotes`, `unresolvedAudioByVersion`/`unresolvedAudioTotal`, and `unresolvedLyricByBlock` are all `useMemo`'d off the same `studioNotes` prop.

## The three counts, and proof each matches what its surface shows

| Surface | Count | What it counts | Where every counted item is displayed |
|---|---|---|---|
| Studio Notes `N open threads` | `openStudioNoteCount` = `songStudioNotes.filter(resolvedAt === null).length` | unresolved **song-kind** roots only | the module's own thread list, under its "Open" filter chip (`counts.open` inside `StudioNotes.tsx` is computed from the *same* `songStudioNotes` array passed as its `notes` prop — there is no second count to drift) |
| Versions `N unresolved comments` | `unresolvedAudioTotal` = sum of `countUnresolvedAudioNotesByVersion(studioNotes, versions.map(v => v.id))` | unresolved **audio-kind** roots, allowlisted to every take id `VersionsList` renders (active + archived) | active takes: `TimedTrackPlayer` already renders its own per-version unresolved count in the player (pre-existing, `:433-434`/`:795`); archived takes: the new per-take number on the archived row, added this task, visible only when that take has one |
| Block `💬 Comments (N)` | `unresolvedLyricByBlock[block.id]` = `countUnresolvedLyricNotesByBlock(studioNotes)[block.id] ?? 0` | unresolved **lyric-kind** roots for that block | the same Comments button that opens `LyricCommentsPanel` for that block — the count rides the control that already opens the matching panel, not a new element |

Confirmed via `lib/catalogue/studio-notes.test.ts`'s new `describe('Studio Notes source-scoped selectors', ...)` block (allowlist inclusion/exclusion, resolved-root exclusion, reply-not-double-counted) and `WorkPage.test.tsx`'s new `describe('WorkPage — Studio Notes scoped by kind', ...)` block (rendered markup, not just the selector output) — see Task Commits below.

## No unresolved thread goes dark, including on an archived take

- **Active audio take:** unaffected — `TimedTrackPlayer` already rendered its own unresolved count before this task; nothing in this change touches that component.
- **Archived audio take:** previously had no comment surface at all (a bare `<details>` row). This task added a per-take `{unresolvedCount} unresolved comment(s)` span to that row, shown only when `unresolvedAudioByVersion[version.id] > 0`, with a `title="Restore this take to open its comments"` hint since an archived take has no player to open from directly. Verified in `WorkPage.test.tsx`: a two-archived-row fixture (one with an unresolved note, one without) asserts the number appears next to the row that has one and nowhere near the row that doesn't.
- **Lyric block:** previously had a bare "💬 Comments" button with no count. Now mirrors `suggestionCount`'s exact precedent (`LyricBlockCard.tsx:307` for Alternates) — same parenthesised form, plus the count is also appended to the button's `aria-label` so it isn't sighted-only.
- **Song thread:** unaffected positionally — it is the one kind that keeps living in the Studio Notes module.

## The composer's audio/lyric creation paths

Removed entirely from `StudioNotes.tsx`'s `NoteComposer` (D-SNK-02):

- Deleted the three-way source picker, the version/timestamp inputs, and the block `<select>`.
- `NoteComposer`'s `source` is no longer stateful — a new note is always `'song'`; a reply still inherits its parent's source unchanged (`replyTo?.source ?? 'song'`), which is now moot in practice since this module only ever shows song threads to reply to.
- Dropped the `versions`/`lyricBlocks` props from `StudioNotesProps`, `NoteComposer`, `NoteThread`, and the `<StudioNotes>` element in `WorkPage.tsx`.
- `parseTimestamp` (only used by the removed audio-source submit path) was deleted; `formatTimestamp` was **kept** — it's still used by `NoteThread`'s audio-context "▶ Play from" link, which (per the plan) was deliberately left untouched since it's unreached now, not removed as churn.
- `deriveBlockNumerals` stayed imported in `WorkPage.tsx` — confirmed it has two other callers (`:995`, `:1041`) before removing its third (`lyricBlocks=...`) call site.
- Why remove rather than leave inert: left in place, a writer could post an audio or lyric note from the Notes module composer and watch it vanish from the list in front of them, since both creation paths already exist at their real anchors (`TimedTrackPlayer.submitComment`, `LyricCommentsPanel.onSubmit`). The API route (`app/api/works/[workId]/studio-notes/route.ts`) stays fully generic — it is the shared three-store facade and nothing else calls it with the other kinds, so it needed no change.

## The mention-notification link for lyric threads

`app/api/works/[workId]/studio-notes/route.ts:203-205` sends lyric-kind mention notifications to `?studioNote=<id>` (unchanged — this route was not touched). Previously that landed in the aggregated Studio Notes module; after this task's scoping, that module no longer contains lyric threads, so the id would never match anything there.

Fix lives entirely in `WorkPage.tsx`, not the route or `page.tsx`'s search-param handling:

```ts
useEffect(() => {
  if (!highlightedStudioNoteId) return
  const lyricTarget = resolveLyricNoteDeepLink(studioNotes, highlightedStudioNoteId)
  if (lyricTarget) void handleOpenLyricComments(lyricTarget.blockId, lyricTarget.label)
}, [highlightedStudioNoteId, studioNotes, handleOpenLyricComments])
```

`handleOpenLyricComments` was converted from a plain function declaration to `useCallback(..., [refreshLyricComments])` specifically so this new effect's dependency array could list it honestly — `refreshLyricComments` was already a stable `useCallback`, so this doesn't introduce a new source of re-render churn. `highlightedStudioNoteId` continues to flow unchanged to `<StudioNotes highlightedNoteId={highlightedStudioNoteId}>` for the song-id case (that component's own internal effect now simply no-ops for a lyric id, since it won't find a match in the now-scoped `songStudioNotes`). Audio notes never used this link form (they already get their own `?version=&comment=&t=` shape) and are untouched.

This effect's actual branch-taken behavior cannot be observed by this repo's test harness (`renderToStaticMarkup` never runs effects — no jsdom exists here). Coverage is split accordingly: `resolveLyricNoteDeepLink`'s own decision logic (root-id match, reply-id match, song/audio/unknown/null → null) is fully unit-tested in `lib/catalogue/studio-notes.test.ts`; `WorkPage.test.tsx` adds one render-level test confirming a lyric-kind `highlightedStudioNoteId` causes no crash and highlights nothing inside the (now song-only) Studio Notes module, since the render-time prop-driven highlight logic (not the effect) is what's actually observable there.

## presentStudioNotes and the API route

Both confirmed unchanged:

```
$ git diff cf8184ac..HEAD -- lib/catalogue/studio-notes.ts | grep -c '^-.*presentStudioNotes\|^-.*studioNoteMatchesFilter'
0
$ git diff cf8184ac..HEAD -- app/api/works/\[workId\]/studio-notes/route.ts
(empty)
```

`presentStudioNotes` and `studioNoteMatchesFilter` are byte-identical to before this task — only new functions were appended below them. The route file has zero diff.

## Tab/module structure, roomModules, and WorkPage composition

Unchanged. `roomModules: WriterRoomModule[]` still has exactly three entries (`module:versions`, `module:diary`, `module:notes`) in the same order; `LyricsPad`'s `roomModules` prop contract (`WriterRoomModule[]`) was not touched; the new `unresolvedCommentCounts` prop added to `LyricsPadProps` mirrors the existing optional `suggestionCounts?: Record<string, number>` shape exactly — it is a new leaf prop, not a change to the module/layout contract. The canvas-vs-tabs layout question from `writers-room-canvas-vs-tabs.md` remains unratified and untouched by this task.

## Verification Gate — all six commands, this session

```
$ npm run security:migrations:verify
PASS: migrations 214–218 are transactional, collision-sensitive, least-privilege, checksum-pinned, and covered by read-only probes.

$ npm run typecheck:strict
(clean — tsc --noEmit --noUnusedLocals --noUnusedParameters, no output, exit 0)

$ npm run lint
(ESLINT_USE_FLAT_CONFIG=false eslint . --ext .js,.jsx,.ts,.tsx --max-warnings=0 — only the ESLintRCWarning migration notice, zero lint errors/warnings, exit 0)

$ npm test -- --runInBand
Test Suites: 641 passed, 641 total
Tests:       8030 passed, 8030 total
Snapshots:   0 total
Time:        33.844 s

$ npm audit --omit=dev --audit-level=moderate
found 0 vulnerabilities

$ npm audit --audit-level=high
7 high severity vulnerabilities — braces/chokidar/micromatch/fast-glob chain under tailwindcss and eslint-config-next (devDependencies)
```

The `npm audit --audit-level=high` findings are **pre-existing and out of scope**: no `package.json`/`package-lock.json` change was made by this task, and the chain (`braces` → `chokidar`/`micromatch` → `tailwindcss`/`fast-glob` → `eslint-config-next`) is entirely build-tooling devDependencies, unrelated to Studio Notes. Confirmed covered by an existing tracked deferral rather than a new, unacknowledged gap:

```
$ npm run audit:gate
audit-gate: clean -- 1 active deferral(s), earliest expiry 2026-11-02.
```

Local to this task's own 234 tests (`components/catalogue` + `lib/catalogue/studio-notes.test.ts`): 28 suites, all passing, included in the 641/8030 totals above.

## Working-tree discipline — both counts re-verified before finishing

```
$ git status --porcelain
 M app/(auth)/AuthBanner.tsx
 M app/help/page.tsx
 M app/r/[projectId]/page.tsx
 M assets/marketing/landing.html
 M assets/marketing/manifest.json
 M components/buyer/BuyerTopNav.tsx
 M components/nav/ArtistNav.tsx
 M components/nav/WorkspaceNav.tsx
 M scripts/marketing-artifact.test.ts
 M scripts/marketing-assets.ts
?? .planning/quick/261003-uniform-header-pronunciation/
?? .planning/quick/261004-snk-studio-notes-scope-by-kind/
?? .planning/reviews/CODEX-PROMPT-260930-marketing-page-port-FOLLOWUP.md
?? .planning/reviews/CODEX-PROMPT-260930-marketing-page-port-to-root-route.md
?? .planning/reviews/CODEX-RESPONSE-260930-marketing-page-port-to-root-route.md
?? .planning/todos/pending/2026-09-29-paid-tier-interest-capture-before-stripe.md
?? .planning/todos/pending/2026-09-30-ship-marketing-page-at-root-scope.md
?? .planning/todos/pending/2026-10-03-ipi-check-digit-validation.md
?? components/brand/
```

**10 modified tracked files**, matching the plan's recorded baseline exactly. **9 untracked** (one more than the plan's recorded "8" — the extra entry is `.planning/quick/261003-uniform-header-pronunciation/`, a second quick-task directory the parallel session created after the plan snapshot was taken; not a count discrepancy caused by this task). None of either list falls under `components/catalogue/` or `lib/catalogue/`. Every commit in this task staged explicit paths only — no `git add -A`/`git add .` was used at any point.

## Task Commits

1. **Task 1: Add source-scoped selectors to the studio-notes lib (D-SNK-01, D-SNK-05)** — `b7d0b4b1` (feat)
2. **Tasks 2+3: Scope the Studio Notes surface + keep every unresolved thread visible (D-SNK-01 through D-SNK-05)** — `c6c7f3d5` (feat)

**Commit-granularity note:** the plan specified Task 2 and Task 3 as separate tasks, but both land in the same `WorkPage.tsx` derived-state block (`songStudioNotes`, `unresolvedAudioByVersion`, `unresolvedLyricByBlock` are all computed adjacently, off the same `studioNotes` prop, specifically so they can't drift from each other — that's the point of D-SNK-01's single-snapshot design). Splitting that block across two commits would have meant staging artificial, non-compiling intermediate states. Both tasks are fully present, independently traceable by the behaviors listed in each task's own `<behavior>` block and covered by dedicated tests, in this one commit.

## Known Stubs

None. No hardcoded empty value, placeholder text, or unwired data source was introduced.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern, or schema change at a trust boundary was introduced — `T-SNK-01`/`T-SNK-02`/`T-SNK-03` in the plan's own threat register (all `accept`, no new query/route/dependency) were the only applicable entries and none required a mitigation beyond what the plan already recorded.

## Findings Recorded (not fixed — out of scope per the plan)

- **The `#lyric-{blockId}` dead link stays dead.** `StudioNotes.tsx`'s `NoteThread` still renders `<a href="#lyric-${note.context.blockId}">Open lyric section</a>` for a lyric-kind thread context (this branch is now unreached in practice, since the module no longer lists lyric threads, but it was explicitly left untouched per the plan's "do not touch NoteThread's per-context rendering branches" instruction). No `id="lyric-{blockId}"` anchor is rendered anywhere in the codebase — confirmed by the verification pass that produced this plan, re-confirmed not to have changed by this task. Pre-existing, recorded, out of scope.
- **Whether a repeat lyric block can hold its own unresolved comment rows is UNVERIFIABLE from the application code alone** (would require a database state where `lyric_blocks.repeat_of_block_id` is set on a block that nonetheless has rows in `work_lyric_block_comments` keyed to its own `block_id`, rather than its source's). What's confirmed: `LyricBlockCard.tsx`'s Comments button is gated on `!isRepeat && onOpenComments`, so **no marker can attach to a repeat block regardless of the answer** — this task added no new affordance for that case, per the plan's instruction to record the finding rather than invent one. `components/catalogue/LyricBlockCard.test.tsx` gained a test asserting a repeat block renders no Comments control (and therefore no marker) even when handed a nonzero `unresolvedCommentCount`.
- **`components/catalogue/StudioNotes.test.tsx` does not exist** (confirmed, matching the plan's own verified-facts correction to the original briefing). Coverage for this task's selector and scoping behavior landed in `lib/catalogue/studio-notes.test.ts` (Task 1) and `components/catalogue/WorkPage.test.tsx` (Tasks 2–3), per the plan's `<output>` instruction.

## Deviations from Plan

None beyond the commit-granularity note above (Tasks 2 and 3 landed in one commit rather than two, for the reason stated). No Rule 1/2/3 auto-fixes were needed — the plan's verified facts were accurate and its action blocks were followed as written.

## Self-Check: PASSED

- `lib/catalogue/studio-notes.ts` — FOUND, contains `selectSongStudioNotes`, `countUnresolvedAudioNotesByVersion`, `countUnresolvedAudioNotes`, `countUnresolvedLyricNotesByBlock`, `resolveLyricNoteDeepLink`
- `lib/catalogue/studio-notes.test.ts` — FOUND, 10 tests passing
- `components/catalogue/StudioNotes.tsx` — FOUND, no `versions`/`lyricBlocks` props remain
- `components/catalogue/WorkPage.tsx` — FOUND, `songStudioNotes`/`unresolvedAudioByVersion`/`unresolvedLyricByBlock` all present
- `components/catalogue/LyricsPad.tsx` — FOUND, `unresolvedCommentCounts` prop present
- `components/catalogue/LyricBlockCard.tsx` — FOUND, `unresolvedCommentCount` prop present on the Comments button
- Commit `b7d0b4b1` — FOUND in `git log --oneline --all`
- Commit `c6c7f3d5` — FOUND in `git log --oneline --all`
- Full verification gate (6 commands + `audit:gate`) — all run this session, output recorded verbatim above
