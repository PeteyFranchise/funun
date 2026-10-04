---
quick_id: 261004-snk
slug: studio-notes-scope-by-kind
branch: studio-notes-scope-by-kind
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - lib/catalogue/studio-notes.ts
  - lib/catalogue/studio-notes.test.ts
  - components/catalogue/StudioNotes.tsx
  - components/catalogue/WorkPage.tsx
  - components/catalogue/WorkPage.test.tsx
  - components/catalogue/LyricsPad.tsx
  - components/catalogue/LyricBlockCard.tsx
  - components/catalogue/LyricBlockCard.test.tsx
requirements:
  - D-SNK-01
  - D-SNK-02
  - D-SNK-03
  - D-SNK-04
  - D-SNK-05

must_haves:
  truths:
    - The Studio Notes module lists song-kind threads only; audio and lyric threads no longer appear in it.
    - The Studio Notes module description counts only song-kind unresolved threads — the same number its Open chip shows.
    - The Versions module description names unresolved audio threads, and every thread it counts is displayed somewhere inside that module (active take → in its player; archived take → on its archived row).
    - A lyric block with an unresolved comment thread shows a count on its own Comments control.
    - A historical `?studioNote=<id>` notification link for a lyric-kind note opens that block's comments panel instead of landing on an empty highlight.
  artifacts:
    - lib/catalogue/studio-notes.ts exports pure, source-scoped selectors used by every count on the work page.
    - lib/catalogue/studio-notes.test.ts covers each selector with all three kinds present.
  key_links:
    - presentStudioNotes stays unnarrowed — both the server page and app/api/works/[workId]/studio-notes/route.ts depend on the three-store facade.
    - WorkPage keeps the aggregated list and is the single place the three per-surface counts are derived.
---

<objective>
Scope the Studio Notes surface to song-level notes only, and keep every unresolved
thread visible on the surface that now owns it.

Purpose: implement the owner's ratified 2026-10-04 decision in
`.planning/deliberations/writers-room-canvas-vs-tabs.md` without letting an
unresolved thread go dark. Both halves ship together — scoping alone is a
visibility regression.

Output: a song-scoped Studio Notes module whose count matches what it shows; an
unresolved-thread count on Versions that matches what Versions shows; a per-block
unresolved marker on lyric blocks; and a lyric deep-link that still lands somewhere.
</objective>

<verified_facts>
Every claim this plan rests on, checked against source. Confirmed unless marked.

| Claim | Status | Evidence |
|---|---|---|
| `presentStudioNotes` spreads all three kinds into one list | CONFIRMED | `lib/catalogue/studio-notes.ts:186-191` |
| `TimedTrackPlayer` renders audio comments to the user, not merely the type | CONFIRMED | `components/catalogue/TimedTrackPlayer.tsx:433-434` computes `unresolvedCount` / `visibleNoteCount`; `:795` renders `View {visibleNoteCount} {unresolved }comment(s)`; markers + thread panel fed by `loadComments` at `:305-335` |
| `LyricCommentsPanel` renders per-block and is reachable from a block | CONFIRMED | `LyricBlockCard.tsx:310-319` "💬 Comments" button → `LyricsPad.tsx:845` `handleOpenBlockComments(block.id, block.label)` → `LyricsPad.tsx:626-641` `onOpenComments(blockId,label)` → `WorkPage.tsx:1664` → `handleOpenLyricComments` (`WorkPage.tsx:1078-1091`) → overlay at `WorkPage.tsx:1911-1928` |
| `openStudioNoteCount` counts unresolved roots across **all three kinds** | CONFIRMED | `WorkPage.tsx:1441` filters the aggregated `studioNotes` prop on `resolvedAt === null`; rendered at `:1482` |
| Other consumers of the aggregated three-kind list | CONFIRMED (3 found) | (a) `app/(artist)/vault/works/[workId]/page.tsx:817`; (b) `app/api/works/[workId]/studio-notes/route.ts:106`; (c) `WorkPage.tsx` itself. Narrowing `presentStudioNotes` would strand (a) and (b). |
| The `StudioNotes` composer can create audio and lyric notes | CONFIRMED | `StudioNotes.tsx:186-214` three-way source picker + version/timestamp/block selects; posts `source` to `/api/works/{id}/studio-notes` (`:149-161`) |
| A `lyrics`-kind note's mention notification deep-links into the Studio Notes module | CONFIRMED — **this is the regression the verification pass found** | `app/api/works/[workId]/studio-notes/route.ts:203-205`: only `audio` gets the `?version=&comment=&t=` form; `song` **and `lyrics`** both get `?studioNote=<id>`, consumed at `page.tsx:115` → `WorkPage.tsx:1500` → `StudioNotes.tsx:379-391`, which bails when the id is absent from `notes` |
| Audio notes are fetched for the whole work, archived takes included | CONFIRMED | `page.tsx:243-248` — `work_version_comments` filtered on `work_id` only |
| `VersionsList` renders a player only for active takes with playback; archived takes get a bare `<details>` row with no comment surface | CONFIRMED | `WorkPage.tsx:357-410` |
| `suggestionCounts` is the existing precedent for a per-block `Record<string, number>` | CONFIRMED | `WorkPage.tsx:1666` → `LyricsPad.tsx:89,419,847` → `LyricBlockCard.tsx:90,220,307` renders `⇄ Alternates (N)` |
| A per-block unresolved marker already exists | **FALSE — none exists** | `LyricBlockCard.tsx:310-319` renders a bare "💬 Comments" with no count or dot |
| `#lyric-{blockId}` anchors exist (the target of `StudioNotes.tsx:336`) | **FALSE — no such id is rendered anywhere** | grep for `id={\`lyric-` returns only `lyric-comments-title`, `lyric-history-title`, `lyric-suggestion-title`. Pre-existing dead link; **out of scope**, record in SUMMARY. |
| `components/catalogue/StudioNotes.test.tsx` exists | **FALSE — it does not exist** | only `lib/catalogue/studio-notes.test.ts`. The brief's reference to it is incorrect; this plan extends the lib test and `WorkPage.test.tsx` instead. |
| Module `description` strings render in static markup | CONFIRMED | `LyricsPad.tsx:379`; `reconcileWriterRoomLayout(null, …)` → `defaultWriterRoomLayout` includes all three module keys (`lib/catalogue/writer-room-layout.ts:80-85,100`) |
| Harness: `testEnvironment: 'node'`, no jsdom; components asserted via `renderToStaticMarkup` | CONFIRMED | `jest.config.js`; `WorkPage.test.tsx:1-18` |
| Gate scripts all present, incl. `audit:gate` | CONFIRMED | `package.json` scripts |
| Working tree: 10 modified tracked, 8 untracked, none under `components/catalogue/` or `lib/catalogue/` | CONFIRMED | `git status --porcelain` at plan time |

**UNVERIFIABLE:** whether an `isRepeat` lyric block can carry its own unresolved
comment rows. Repeat blocks render no Comments button (`LyricBlockCard.tsx:310`),
so no marker can attach to them. Task 3 records the finding rather than inventing
an affordance.
</verified_facts>

<design_decisions>
**D-SNK-01 — the filter belongs at the WorkPage boundary, not in `presentStudioNotes`.**
`presentStudioNotes` is the read-time facade over three authoritative stores and has
two callers that legitimately want all three kinds: the server page and the
studio-notes API route. Narrowing it strands both. `WorkPage` must *also* keep the
aggregated list, because it is the only place that can derive the Versions count and
the per-block markers from one consistent snapshot. So: the lib keeps aggregating and
gains pure, named, source-scoped selectors; `WorkPage` applies them. One source of
truth, three honest views of it.

**D-SNK-02 — the composer is part of the surface.** Leaving the three-way source
picker in place would let a writer post an audio or lyric note from the Notes module
and watch it vanish from the list they are looking at. Both creation paths already
exist where the notes belong (`TimedTrackPlayer.submitComment`, `LyricCommentsPanel.onSubmit`),
so the picker is a duplicate path to an invisible result. Removing it is the same
subtraction as removing the rows. The API route stays generic — it is the shared
three-store facade and nothing else calls it with the other kinds.

**D-SNK-03 — the Versions count covers every take the module renders, active and
archived.** An unresolved thread on an archived take is exactly the "unresolved thread
on an old take" the deliberation says must not go dark, and archived takes render no
player. Counting only active takes would be honest-but-lossy; counting all takes
without showing the archived ones would be a label claiming more than it displays.
Both are fixed by counting all takes *and* putting a per-take count on the archived
rows, so every counted thread is displayed somewhere inside the module.

**D-SNK-04 — wording follows the surface, not the schema.** The player already says
"unresolved comments"; the archived rows and the module description use the same noun
so the number a writer reads on the module header is the number they find inside it.

**D-SNK-05 — the lyric deep link is routed, not dropped.** `WorkPage` still holds the
aggregated list, so it can resolve a `?studioNote=` id that belongs to a lyric note
into that block's comments panel using the existing `handleOpenLyricComments`. The
routing decision is a pure lib function so this harness can test it.
</design_decisions>

<context>
@.planning/deliberations/writers-room-canvas-vs-tabs.md
@./.claude/CLAUDE.md
@lib/catalogue/studio-notes.ts
@lib/catalogue/studio-notes.test.ts
@components/catalogue/StudioNotes.tsx
@components/catalogue/LyricBlockCard.tsx
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add source-scoped selectors to the studio-notes lib (D-SNK-01, D-SNK-05)</name>
  <files>lib/catalogue/studio-notes.ts, lib/catalogue/studio-notes.test.ts</files>
  <behavior>
    - `selectSongStudioNotes` over a mixed three-kind list returns only the song-source threads, order preserved.
    - `countUnresolvedAudioNotes` with a version-id allowlist counts unresolved audio roots whose version is in the allowlist, and excludes an audio root whose version is absent from it.
    - `countUnresolvedAudioNotes` counts a thread whose root is unresolved even when a reply exists, and does not count a resolved root.
    - `countUnresolvedAudioNotesByVersion` returns a record keyed by version id holding the same per-version numbers, and omits versions with none.
    - `countUnresolvedLyricNotesByBlock` returns a record keyed by block id of unresolved lyric roots, omitting blocks with none.
    - `resolveLyricNoteDeepLink` given a lyric root's id returns that note's block id and context label; given a song note's id, an audio note's id, an unknown id, or null returns null.
    - `resolveLyricNoteDeepLink` also matches a **reply** id, returning the parent thread's block id and label.
  </behavior>
  <action>
Leave `presentStudioNotes` aggregating all three stores exactly as it is (D-SNK-01) —
its two existing callers depend on the full list. Add four pure, exported, named
functions to `lib/catalogue/studio-notes.ts`, each taking an already-presented
`StudioNoteThreadView[]`:

1. `selectSongStudioNotes(notes)` — returns the subset whose `source` is the song
   kind. Order preserved; no copying, no re-sorting.
2. `countUnresolvedAudioNotes(notes, versionIds)` — `versionIds` is an iterable of
   the version ids the caller actually renders. Counts roots where `source` is audio,
   `resolvedAt` is null, and `context.versionId` is in `versionIds`. The allowlist
   parameter is what makes the resulting label match its surface (D-SNK-03); it is
   required, not optional.
3. `countUnresolvedAudioNotesByVersion(notes, versionIds)` — same predicate, returned
   as `Record<string, number>` keyed by `context.versionId`, with zero-count versions
   omitted. `countUnresolvedAudioNotes` must be derived from this one so the total and
   the per-row numbers can never disagree.
4. `countUnresolvedLyricNotesByBlock(notes)` — `Record<string, number>` keyed by
   `context.blockId` over unresolved lyric roots, zero-count blocks omitted.

Also add `resolveLyricNoteDeepLink(notes, noteId)` returning
`{ blockId: string; label: string } | null` (D-SNK-05). It finds the thread whose root
id **or any reply id** equals `noteId`, and returns the block id and `context.label`
only when that thread's context is the lyric kind; everything else returns null.
Guard a null/empty `noteId` by returning null.

Narrow through the existing `context` discriminant rather than casting — the context
union already carries `versionId` / `blockId`, so no type assertion is needed and none
should be added. Follow the file's existing style: named exports, `export function`,
no semicolons, 2-space indent.

Extend `lib/catalogue/studio-notes.test.ts` rather than creating a new file. Its
fixtures already provide one song thread with a reply, one audio note on `VERSION`,
and one **resolved** lyric note on `BLOCK` — add the extra rows each behaviour above
needs (at minimum: a second, unresolved lyric root; an audio note on a version that is
deliberately left out of the allowlist; a resolved audio root). Keep the existing three
test cases passing unchanged — they assert the aggregation this task must not alter.
  </action>
  <verify>
    <automated>npx jest lib/catalogue/studio-notes.test.ts</automated>
  </verify>
  <done>All five functions exported and covered; `presentStudioNotes` and `studioNoteMatchesFilter` behaviour unchanged (their original three assertions still pass verbatim).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Scope the Studio Notes surface and its count to song notes (D-SNK-01, D-SNK-02)</name>
  <files>components/catalogue/StudioNotes.tsx, components/catalogue/WorkPage.tsx, components/catalogue/WorkPage.test.tsx</files>
  <behavior>
    - Rendering `WorkPage` with one unresolved song thread, one unresolved audio thread and one unresolved lyric thread shows the song thread's body in the Studio Notes module and neither of the other two bodies anywhere in that module.
    - With that same fixture the Studio Notes module description reads `1 open thread`, not `3 open threads`.
    - With zero unresolved song threads but unresolved threads of the other two kinds, the description reads `0 open threads`.
    - Singular/plural still agrees: two unresolved song threads read `2 open threads`.
  </behavior>
  <action>
In `WorkPage.tsx`: keep the `studioNotes` prop as the full aggregated list — Task 3
needs it. Introduce a memoised `songStudioNotes` from `selectSongStudioNotes(studioNotes)`
and pass **that** to `<StudioNotes notes={…}>` (currently `WorkPage.tsx:1488`). Change
`openStudioNoteCount` (`WorkPage.tsx:1441`) to filter `songStudioNotes` instead of
`studioNotes`, so the number at `:1482` counts exactly the threads the module lists
under its Open chip. Leave the description's existing singular/plural shape alone.

In `StudioNotes.tsx`, remove the ability to create a note of the other two kinds
(D-SNK-02):
- Delete the three-way source picker (`:184-198`) along with the version/timestamp
  controls (`:201-208`) and the block select (`:210-214`). A new note is always a
  song note; a reply keeps inheriting its parent's source as it does today.
- Drop `versions` and `lyricBlocks` from `StudioNotesProps`, from `NoteComposer`'s and
  `NoteThread`'s parameter lists, and from every call site inside the file — then drop
  the two corresponding props from the `<StudioNotes>` element in `WorkPage.tsx`.
- Do **not** touch `NoteThread`'s per-context rendering branches. The
  `StudioNoteThreadView` context union still permits all three kinds, those branches
  are merely unreached, and removing them is churn this change does not need.

Then run `npm run typecheck:strict` and delete only what it reports as newly unused
inside `StudioNotes.tsx` as a consequence of the above — nothing else. Expect at least
the timestamp-parsing helper and possibly the source-type import to fall out; the
timestamp *formatter* is still used by the audio branch you are keeping, so do not
remove it on sight. Resolve each report by reading the reference, not by guessing.

`deriveBlockNumerals` is used elsewhere in `WorkPage.tsx`; confirm before assuming the
removed `lyricBlocks` expression was its only caller.

In `WorkPage.test.tsx`: extend the existing `makeProps` fixture with a `studioNotes`
array carrying one unresolved thread of each kind (the type is
`StudioNoteThreadView[]`; mirror the shape `lib/catalogue/studio-notes.test.ts`
produces). Assert the four behaviours above against `renderToStaticMarkup` output. The
module descriptions do render in static markup — `LyricsPad.tsx:379` emits them and the
default room layout includes all three module keys — so assert on the description text
directly.
  </action>
  <verify>
    <automated>npx jest components/catalogue/WorkPage.test.tsx && npm run typecheck:strict</automated>
  </verify>
  <done>The Studio Notes module renders and counts song threads only; no other `WorkPage` or `LyricsPad` test regresses; `typecheck:strict` is clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Keep unresolved audio and lyric threads visible where they now live (D-SNK-03, D-SNK-04, D-SNK-05)</name>
  <files>components/catalogue/WorkPage.tsx, components/catalogue/LyricsPad.tsx, components/catalogue/LyricBlockCard.tsx, components/catalogue/LyricBlockCard.test.tsx, components/catalogue/WorkPage.test.tsx</files>
  <behavior>
    - With one unresolved audio thread on an active take and one on an archived take, the Versions module description names two unresolved comments alongside the active-take count.
    - With no unresolved audio threads, the Versions module description is byte-identical to today's.
    - The archived-takes section shows the per-take unresolved number on the archived row that has one, and shows nothing extra on an archived row that has none.
    - A lyric block with two unresolved threads renders its count on the existing Comments control; a block with none renders the control exactly as today.
    - A repeat block renders no Comments control and therefore no marker — unchanged.
  </behavior>
  <action>
**Versions (D-SNK-03, D-SNK-04).** In `WorkPage.tsx`, derive
`unresolvedAudioByVersion = countUnresolvedAudioNotesByVersion(studioNotes, versions.map(v => v.id))`
and its total from the aggregated list. The allowlist is every take `VersionsList`
renders — active *and* archived — because this task makes both display their own
number, so the header total and the surface agree.

Change the Versions description (`WorkPage.tsx:1446`) to append the unresolved clause
only when the total is above zero, keeping today's exact string when it is zero. Use
the same noun the player already shows the writer (`TimedTrackPlayer.tsx:795` says
"comments"), with its own singular/plural agreement, separated from the takes clause
by the ` · ` separator this file already uses.

Pass `unresolvedAudioByVersion` into `VersionsList` as a new prop and render the
per-take number on each **archived** row (`WorkPage.tsx:395-410`), beside the existing
Download/Restore controls, only when that take has one. An archived take has no player,
so say plainly that restoring is how to open them — a number with no route to the thread
is the defect this change exists to remove. Active takes need nothing added: their
player already surfaces the count.

**Lyric blocks (D-SNK-03).** Mirror the `suggestionCount` path exactly — it is the
established precedent for a per-block number on this card:
- `WorkPage.tsx`: derive `countUnresolvedLyricNotesByBlock(studioNotes)` and pass it to
  `<LyricsPad>` next to `suggestionCounts` (`WorkPage.tsx:1666`).
- `LyricsPad.tsx`: accept it as an optional `Record<string, number>` defaulting to `{}`
  (`:89`, `:419` show the shape) and forward the per-block value to `LyricBlockCard`
  beside `suggestionCount` (`:847`). This adds a prop of a shape the component already
  carries; it is not a change to the `roomModules` contract or to the layout.
- `LyricBlockCard.tsx`: accept an optional count defaulting to `0` (`:90`, `:220`) and
  render it on the existing Comments button (`:310-319`) in the same parenthesised form
  the Alternates button uses at `:307`. Append the number to the button's `aria-label`
  too, so the count is not sighted-only. Invent no new element — the marker rides the
  control that already exists.
- Repeat blocks render no Comments button, so they get no marker. If you find that a
  repeat block can hold its own unresolved rows, record it in the SUMMARY as a finding;
  do not add an affordance for it here.

**Lyric deep link (D-SNK-05).** `app/api/works/[workId]/studio-notes/route.ts:203-205`
sends lyric-kind mention notifications to `?studioNote=<id>`, which Task 2 just emptied
of lyric threads. In `WorkPage.tsx`, add an effect keyed on `highlightedStudioNoteId`
that calls `resolveLyricNoteDeepLink(studioNotes, highlightedStudioNoteId)` and, on a
hit, opens that block's panel through the existing `handleOpenLyricComments(blockId, label)`.
Song ids keep flowing to `StudioNotes` untouched; audio notes never use this link form.
Satisfy `react-hooks/exhaustive-deps` honestly — `lint` runs at `--max-warnings=0` and
those warnings usually describe a real defect. Do not leave the API route, the
notification shape, or `page.tsx`'s search-param handling modified; the routing happens
entirely in the component that already holds the data.

**Tests.** Extend `WorkPage.test.tsx` for the Versions description (both the zero case
and the active+archived case) and the archived-row number, and `LyricBlockCard.test.tsx`
for the marker and its `aria-label`, both via `renderToStaticMarkup`. The deep-link
effect cannot be observed in this harness — its decision is already covered by Task 1's
`resolveLyricNoteDeepLink` cases, which is why that logic lives in the lib.
  </action>
  <verify>
    <automated>npx jest components/catalogue lib/catalogue/studio-notes.test.ts</automated>
  </verify>
  <done>Every unresolved thread counted by a label is displayed by that label's own surface; no `components/catalogue` test regresses.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| server component → client component | `studioNotes` crosses as props; already RLS-filtered by `page.tsx` before `presentStudioNotes` |
| browser → studio-notes API | unchanged by this plan; no route, schema, or policy is touched |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-SNK-01 | Information disclosure | per-block / per-take counts derived from `studioNotes` | low | accept | Counts are derived from rows the viewer is already served and already renders; no new query, no widened select, no new route. Nothing is read that was not read before. |
| T-SNK-02 | Tampering | npm/pip/cargo installs | n/a | accept | No dependency is added or changed by this plan. |
| T-SNK-03 | Repudiation | removal of the composer's non-song creation paths | low | accept | No authoritative row, RPC, or audit record changes; `work_studio_notes`, `work_version_comments` and `work_lyric_block_comments` keep their existing writers. |
</threat_model>

<verification>
Full Verification Gate, every command, before any claim of green
(`.github/workflows/quality.yml` + `.claude/CLAUDE.md`):

```bash
npm run security:migrations:verify
npm run typecheck:strict
npm run lint
npm test -- --runInBand
npm audit --omit=dev --audit-level=moderate
npm audit --audit-level=high
npm run audit:gate
```

Do **not** run `npm run build` — a dev server is live on :3000 and the build clobbers `.next`.

Label-integrity pass (`label-integrity-funun`) — for each of the three counts, name the
set it claims and the set the surface displays, and show they are the same set:

1. Studio Notes `N open threads` → unresolved song-kind roots → the module's Open chip.
2. Versions `N unresolved comments` → unresolved audio roots on takes this module
   renders → active takes show theirs in the player, archived takes on their own row.
3. Block `💬 Comments (N)` → unresolved lyric roots for that block → the panel that
   button opens.

Working-tree discipline: a parallel session owns this checkout. Stage explicit paths
only, never `git add -A`. Before committing, re-run `git status --porcelain` and confirm
the other session's footprint is still **10 modified tracked and 8 untracked**, none of
them under `components/catalogue/` or `lib/catalogue/`.
</verification>

<success_criteria>
- Studio Notes lists and counts song-kind threads only.
- No count on the work page claims more than its own surface displays.
- No unresolved thread of any kind is less visible than it was before this change —
  including one on an archived take and one reached by an old `?studioNote=` link.
- No new component, no new dependency, no change to the tab/module structure,
  `LyricsPad`'s `roomModules` contract, or `WorkPage`'s composition.
- `presentStudioNotes` and the studio-notes API route are unchanged.
- Full Verification Gate green, all seven commands.
- PR opened against `main`.
</success_criteria>

<pr_body_requirements>
The PR body must state, in this order:

1. **The ratified decision, in the owner's words** (2026-10-04,
   `.planning/deliberations/writers-room-canvas-vs-tabs.md`): *"notes tab should be
   scoped to song-level studio notes only… audio notes go inside Takes beside the
   waveform, lyrics notes go in the canvas beside the block stays this way."*
2. **This is mostly a subtraction.** `TimedTrackPlayer` already renders audio comments
   beside the waveform (`:433-434`, `:795`) and `LyricCommentsPanel` already renders
   per-block comments reachable from the block's own button. The anchored kinds were
   duplicated in the Studio Notes module, not missing from their homes.
3. **The visibility regression this would have caused, and how each count covers it.**
   The Studio Notes module was the one place an unresolved thread on an old take stayed
   visible. Name the three replacements and what each counts: the song-scoped
   `N open threads`; the Versions `N unresolved comments` covering active takes (shown
   in their player) and archived takes (shown on their archived row); the per-block
   `💬 Comments (N)`. State that a lyric-kind `?studioNote=` notification link now opens
   the block's panel instead of landing on an empty highlight — a consumer of the
   aggregated list found during verification.
4. **The layout question remains unratified and untouched.** Canvas-vs-tabs and the
   mobile case are still proposals; the tab/module structure, `LyricsPad`'s
   `roomModules` contract and `WorkPage`'s composition are unchanged by this PR.
</pr_body_requirements>

<output>
Create `.planning/quick/261004-snk-studio-notes-scope-by-kind/261004-snk-SUMMARY.md` when done.

Record in it: the dead `#lyric-{blockId}` anchor at `StudioNotes.tsx:336` (left in
place, out of scope); whether a repeat block can hold its own unresolved lyric rows;
and that `components/catalogue/StudioNotes.test.tsx` does not exist, so coverage landed
in `lib/catalogue/studio-notes.test.ts` and `components/catalogue/WorkPage.test.tsx`.
</output>
