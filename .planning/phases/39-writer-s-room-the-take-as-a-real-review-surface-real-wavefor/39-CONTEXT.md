# Phase 39: Writer's Room — the take as a real review surface - Context

**Gathered:** 2026-09-12
**Status:** Ready for planning

<domain>
## Phase Boundary

A writer can see what a take actually sounds like, mark both moments and spans on it, flag
spots privately while listening, and drive playback from the keyboard.

Five items on one spine (the waveform): real peaks, range comments, private pins, keyboard
shortcuts, playback speed.

**Out of scope, owner-decided 2026-09-12:** waveform zoom (deferred — range comments may
absorb the precision need; revisit only if usage shows writers hitting the ceiling).
Also out: shared/team markers; freehand drawing and stamps; a general audio editor; video
tracks; stacked multi-track lanes; guest/external reviewer links.

**Nothing here touches rights.** No comment, pin, range or reaction may alter authorship,
credits, splits, rights, approvals, delivery state or membership.

</domain>

<decisions>
## Implementation Decisions

### Terminology (owner-raised — applies project-wide, not just this phase)
- **D-08:** The record a person leaves on a take or a lyric block is a **comment**, never a
  "note". In a songwriting app "note" reads as a musical note — the owner hit this confusion
  directly during discussion. Use: *timed comment*, *range comment*, *section comment*.
  - This **settles the open naming question** in `docs/design/WRITERS-ROOM-WAVEFORM-NOTES-2027.md`
    ("Waveform Notes" vs "Track Notes") as **neither**.
  - The schema already agrees: `work_version_comments`, `work_lyric_block_comments`,
    `idea_comments`. Only user-facing copy drifted.
  - **Fix in this phase.** The copy inventory is larger than first estimated (corrected
    2026-09-12 during UI research): **21 user-facing strings across three files**, not four
    across two — `TimedTrackPlayer.tsx` (12), `VersionComparisonPanel.tsx` (6),
    `RecordOverBeatStudio.tsx` (3). The most prominent are in `TimedTrackPlayer.tsx`:
    `"View {n} unresolved notes"` (:342 — the exact string the 2027 doc singles out),
    `"Bring notes forward from…"` (:443), `"Note {n} of {m}"` (:490), and the composer
    placeholder `"Leave a note at {time}"` (:553).
    **The authoritative row-by-row inventory lives in `39-UI-SPEC.md`** — use that, not this
    summary, when doing the rename.
  - **Studio Notes keeps its name.** It is the *surface* where comments gather, not a record
    type. No table renames, no migration, no touching `work_studio_notes` /
    `work_note_reactions`. "Studio Notes shows 4 comments" is correct usage.
  - **Unrelated "note" uses stay as they are** — producer-handoff note, lyric-suggestion note,
    connection note, diary note. Different things; do not rename them.

### Waveform peaks
- **D-01 (AMENDED 2026-09-12 after research):** Peaks are computed **at creation, client-side,
  for every take** — no server-side extraction path at all.
  - Hum and record-over-beat takes decode from the `AudioBuffer` the browser already holds
    (`RecordOverBeatStudio.tsx:397` decodes one; `waveformPeaks()` takes exactly that).
  - Plain uploads decode from the `Blob` the browser holds *before* it uploads.
  - Peaks are POSTed alongside the version. `lib/catalogue/level-match.ts` already runs
    `decodeAudioData()` in production, so this is an established path, not a new capability.
  - **Why amended:** the original decision carried a server-side fallback justified by "uploads
    up to 250MB". That ceiling was misattributed — it is Sound Vault's
    (`lib/storage/index.ts:7`). Writer's Room takes are capped at **50MB** by `MAX_BYTES`
    (`lib/catalogue/audio-mime.ts:13`), enforced at `versions/upload-intent/route.ts:49` and
    `versions/complete/route.ts:67`. At 50MB the client handles every take, so the fallback —
    which had no clean implementation on Vercel (no ffmpeg on the default runtime, no
    server-side PCM decode precedent in this repo) — is removed entirely.
  - **Intent preserved:** a writer who just made a take never sees a placeholder.
  - **Safety net:** D-03's lazy backfill is the single retry path for any decode that fails.
- **D-02:** `VersionComparisonPanel` draws **level-matched** peaks; every other surface draws
  **raw** peaks. A/B playback is already level-matched via `lib/catalogue/level-match.ts`, so
  drawing raw peaks there would show one thing while playing another. Principle: *the picture
  matches what you are actually hearing.*
- **D-03:** Takes with no peaks (everything that predates this phase, plus any extraction
  failure) **backfill lazily on first open** — decode once client-side, write the peaks back.
  Self-healing, no migration job, and it doubles as the retry path. During that one decode,
  show a flat rest-state bar that is visibly **not** a waveform.
- **HARD CONSTRAINT:** the fallback must never be the hardcoded `WAVE_BARS` array. Removing it
  from `TimedTrackPlayer.tsx:44` and `VersionComparisonPanel.tsx:32` is the point of the phase.

### Range comments
- **D-04:** A span is defined in an explicit **"Mark span" mode**. Pressing it disables the
  seek overlay, drag paints the span, confirm opens the composer on it, Esc/confirm exits.
  - *Why a mode:* an invisible `<input type="range">` currently covers the whole waveform for
    seeking (`TimedTrackPlayer.tsx:377`), so a plain drag is **already taken**. The 2027 doc
    also requires that clicking the waveform never accidentally creates a comment.
  - One interaction model on desktop and mobile — no modifier-drag, no long-press.
- **D-05:** Opening a range comment **plays its span once and stops**. A loop toggle sits beside
  the comment for repeated section work. Nothing loops on its own.
- **D-06:** Playback begins with **2 seconds of pre-roll** before a comment's timestamp or a
  span's in-point, clamped to 0:00 near the top of a take. The shaded span still renders at its
  true bounds; only playback starts early. (Settles the 2027 doc's open "default pre-roll
  duration" question.)

### Comments across takes
- **D-07:** A carried range comment **keeps its span**, clamped to the new take's duration.
  If the in-point itself falls beyond the new take, the comment is **still offered but flagged
  as needing a new position** — never silently dropped, never collapsed to a point.
- **D-09:** A carried comment shows a quiet **"carried from v1"** line.
  `carried_from_version_id` is already stored, so this is presentation only — no schema work.
  Stops the confusion of a comment that appears to predate the take it sits on.
- Unchanged and load-bearing: comments bind to the exact take they were written on and never
  move automatically. `work_version_comment_carry_reviews` remains the only path, and the
  explicit "start fresh" (carry nothing) choice stays recorded.

### Private pins
- **D-10:** A pin is **wordless** — purely a position. Writing a sentence is the friction being
  removed; if you have words, you have a comment.
- **D-11:** Pins are **invisible to everyone else** — no pin, no count, no trace. This keeps
  pins entirely outside the comments doctrine: no mentions, no notifications, no resolution, no
  recipient validation.
  - **HARD CONSTRAINT:** a pin must **never** broadcast on the `writers-room:{workId}:presence`
    channel. That channel currently carries `lock_changed`, `lyric_saved`, `comment_changed`,
    `track_comment_changed` and `suggestion_changed` (`WriterRoomPresence.tsx:104-118`,
    broadcast from `WorkPage.tsx`). Pins add **no** event to it.
- **D-12:** Promoting a pin into a comment **consumes the pin** — it becomes the comment and
  disappears. Keeps pins a staging stage inside one flow rather than a parallel system, and
  avoids two markers at one timestamp meaning the same thing.
- **D-13:** Pins **stay on the take they were dropped on** and are never offered for carry.
  They are scratch about one specific performance and cost nothing to re-drop. They remain
  visible to their owner on the old take.

### Keyboard
- **D-14:** Transport vocabulary — **space** play/pause, **← →** nudge 5s, **⇧← ⇧→** nudge 1s.
  Web-player conventions, learnable without being taught. No J/K/L.
- **D-15:** The keyboard also navigates comments: **[** and **]** step to previous/next comment,
  seeking there with the D-06 pre-roll and opening that thread. Delivers the 2027 doc's
  "accessible keyboard navigation between markers and threads"; the Prev/Next buttons already
  exist, so this binds what is there.
  - *Why `[` / `]`:* ⇧←/⇧→ was initially assigned to both fine nudge and comment navigation.
    The owner resolved the clash in favour of keeping fine nudge on the arrows — with zoom
    deferred, the 1s step is a writer's only precision tool for placing a comment.
- **D-16:** All shortcuts are suppressed whenever an input, textarea or contenteditable holds
  focus. Non-negotiable: the room contains `LyricsPad`, the comment composer and the
  take-rename field, all of which are typed into constantly.

### Playback speed
- **D-17:** Four steps — **0.5 / 0.75 / 1 / 1.5**. 0.5 to catch a mumbled lyric, 0.75 for
  detail and intonation work, 1 to listen, 1.5 to skim a long take. 2× omitted as rarely useful
  on music. Speed **resets to 1× when moving to another take**, so nobody opens v3 wondering
  why it drags.
- **D-18:** Slowing **preserves pitch** (`preservesPitch = true`). 0.5× stays in the same key so
  intonation remains judgeable — which is a main reason a writer slows a take at all. Accepts
  time-stretch smearing on drums and sharp transients. No varispeed/tape option.

### Claude's Discretion
- Peak resolution (target ~200 values per take), storage shape on `work_versions`, and the exact
  rest-state visual.
- Minimum usable span length (guard against accidental sub-100ms spans).
- Whether pins live on their own table or as a flagged row — subject to D-11's hard constraints.
- Exact migration numbers — see the sequencing gate in Canonical References.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The phase's own design source
- `docs/design/WRITERS-ROOM-WAVEFORM-NOTES-2027.md` — 265 lines; already specifies most of
  items 1–3. This phase settles two of its stated open questions: the public name (D-08) and
  the default pre-roll duration (D-06). Its "2027-level improvements" list is **not** phase
  scope except where a decision above pulls an item in.
- `.planning/ROADMAP.md` § Phase 39 — the five items, six operating boundaries, out-of-scope list.

### Design language (owner-ratified 2026-08-30)
- `.claude/skills/sketch-findings-funun/SKILL.md` — dark ink/card surfaces, lavender text,
  indigo→fuchsia gradient spent once per screen, two-column desktop / single-stream mobile,
  industry-cool voice, LearnWhy read-more pattern.
- `.planning/deliberations/the-catalogue-unreleased-works.md` — LOCKED decisions CAT-Q1/Q2/Q3.

### Account and authority doctrine
- `docs/architecture/ACCOUNT-TYPES.md` — professional roles never grant authorship, ownership
  or rights. Relevant because pins and comments must stay creative context only.

### SEQUENCING GATE — read before claiming a migration number
- `.planning/todos/pending/2026-09-01-writers-room-section-comments-production-activation.md` —
  migration 146 is applied. Its owner/member/non-member multi-account UAT remains deferred and
  pending; that human behavior check is not a Phase 39 sequencing blocker.
- Production is applied, registered, structurally verified, and deployed through migrations
  219–223. Phase 39 reserves **migration 224** after a 2026-09-13 scan of
  `supabase/migrations/`, untracked files, `.planning/quick/**`, and the authoritative ROADMAP
  ledger found no collision. Re-run the collision scan immediately before creating the file;
  if 224 is no longer free, stop and re-plan every Phase 39 migration reference.
- Plan 39-11 remains the human gate: an executor never applies migration 224. Before the owner
  push, production migration parity must be confirmed through 223.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/catalogue/record-over-beat.ts:46` — `waveformPeaks(buffer, barCount)`. Already
  production-proven in `RecordOverBeatStudio`. **Use as-is**; do not write a second peaks
  function.
- `lib/catalogue/level-match.ts` — `analyzePlaybackLevels`, already normalizes A/B playback.
  D-02 extends its reach to the drawn waveform in that panel only.
- `lib/catalogue/local-drafts.ts` — existing per-user local persistence keyed
  `funun:user:{id}:work:{id}:version:{id}:…`. Prior art for per-viewer state; note that pins
  must survive a device change, so this is a pattern reference, not a storage answer.
- `TimedTrackPlayer` already has clustered markers, an active vertical selection line, and
  Prev/Next thread navigation — D-15 binds keys to what exists rather than building new nav.

### Established Patterns
- **Direct table writes stay revoked**; validated server functions perform mutations
  (see migration 160's `validate_work_version_comment`). New writes follow the same shape.
- **Comments are version-scoped and immutable in placement** — `work_version_comments` has
  `timestamp_ms INTEGER NOT NULL` bounded 0–86400000, body 1–2000 chars, ≤25 mentions.
  Range support adds a nullable `end_timestamp_ms`; keep the existing CHECK discipline.
- **Live room updates are `broadcast`, not `postgres_changes`** — `WriterRoomPresence.tsx:81`
  opens a private presence channel and `WorkPage.tsx` broadcasts typed events onto it. Any new
  shared write follows that path; pins deliberately do not (D-11).
- Funūn conventions: named exports, no semicolons, 2-space indent, `@/` imports only,
  section-header comments, descriptive thrown Errors.

### Integration Points
- `components/catalogue/TimedTrackPlayer.tsx` — remove `WAVE_BARS` (line 44), render real
  peaks, add span mode, pins, shortcuts, speed.
- `components/catalogue/VersionComparisonPanel.tsx` — remove `WAVE_BARS` (line 32), render
  level-matched peaks, fix "timed notes" copy.
- `components/catalogue/WorkPage.tsx` — broadcasts `track_comment_changed`; range comments ride
  this, pins must not.
- `app/api/works/[workId]/versions/[versionId]/comments/route.ts` — range fields.
- `work_versions` — gains persisted peaks.

</code_context>

<specifics>
## Specific Ideas

- The owner's confusion during discussion **is** the argument for D-08: reading "range notes"
  as musical notes. Copy should be written so that never happens again.
- "The picture matches what you are actually hearing" (D-02) is the stated principle for any
  future question about what a waveform draws.
- A pin is *a bookmark, not a letter*. That distinction is the whole design (D-10, D-11).
- 2s of pre-roll was chosen against tempo: at 90 BPM a bar is ~2.7s, so 2s lands just inside
  the previous bar — enough to hear the run-in, short enough not to feel like a rewind.

</specifics>

<deferred>
## Deferred Ideas

- **Waveform zoom** — owner-deferred 2026-09-12. Range comments may absorb the precision need.
  Revisit only if real usage shows writers hitting the ceiling. Note D-15's rationale depends
  on zoom being absent.
- **Renaming the Studio Notes surface** — would touch `work_studio_notes`, `work_note_reactions`,
  `StudioNotes.tsx`, migration 180's lineage and every string. Its own small phase if ever.
- **Shared/team markers** — pins are private by decision (D-11). A visible "I've been through
  this" signal is a different feature.
- **Clickable transcript pane, DAW marker export, stacked multi-track lanes, guest reviewer
  links** — surfaced by the notetracks.com teardown (2026-09-12), all out of this phase.
- **Adjusting a posted span** without rewriting the comment — not discussed, not scoped.

### Reviewed Todos (not folded)
- *Activate and verify Writer's Room section comments in production* — **not folded; now a
  human-UAT follow-up**. Migration 146 is applied; only the multi-account behavior pass remains,
  and it does not block Phase 39; see Canonical References.
- *Activate and production-test Writer's Room lyric snapshots* — one cross-browser visual
  confirmation outstanding. Adjacent subsystem, not this phase's work.
- *Plan and ship block-level live collaboration in the Writer's Room* — the Phase 37.2 line.
  Realtime comment delivery already exists via broadcast; this phase adds no realtime.

</deferred>

---

*Phase: 39-writer-s-room-the-take-as-a-real-review-surface*
*Context gathered: 2026-09-12*
