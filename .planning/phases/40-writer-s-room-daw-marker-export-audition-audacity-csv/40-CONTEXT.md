# Phase 40: Writer's Room — DAW marker export - Context

**Gathered:** 2026-09-12
**Status:** Ready for planning — **but see the sequencing note in Canonical References.**

<domain>
## Phase Boundary

A take's comments leave Funūn as timeline markers a DAW can import. Three formats
(Audition, Audacity, CSV), one export endpoint, a download control.

**In scope:** serializing one take's comments as markers; a separate author-only pin export;
the download controls.

**Out of scope:** importing markers back into Funūn (one-way, outbound only); formats beyond the
three named (no Reaper, Logic or Pro Tools — owner declined to expand); any change to comment
data, resolution state, rights, credits, splits, approvals or delivery state; the clickable
transcript pane (separately deferred).

**Export is a READ.** Nothing in this phase writes to a comment or a pin.

</domain>

<decisions>
## Implementation Decisions

### What goes in the file
- **E-01:** **Unresolved comments only** (`resolved_at IS NULL`). The file is a worklist, not an
  archive — every marker a producer imports is something still to do. A "include resolved" flag is
  an easy later addition and deliberately not built now.
- **E-02:** **An author may export their own pins.** Owner decision, taken against the
  recommendation.
  - This is **not** an exception to Phase 39's D-11. D-11 makes pins invisible to *other people*;
    an author exporting their own data is consistent with it.
  - The genuinely new risk is narrower: the file is forwardable in a way the in-app pin was not.
    **E-03 is what contains that risk and must not be softened.**
- **E-03:** **Pins get a separate file and a separate action.** Pins NEVER touch the comments
  export. There must be no flag, no default and no code path by which a shareable comments file can
  contain private pins. Two distinct controls: *Export comments* and *Export my pins*.
  - The pin export MUST filter server-side to `author_user_id = auth.uid()` — never "all pins on
    this take". This is a security invariant, not a preference.
- **E-04:** A pin's marker label is **`Pin {timestamp}`** — e.g. `Pin 1:12`. Honest and scannable;
  invents no meaning for a mark that is wordless by decision (Phase 39 D-10). Ordinals were
  rejected because they are not stable between exports.

### How much of the song
- **E-05:** **One take, always.** This is closer to physics than preference: a DAW marker file is
  imported against ONE audio file, so markers from several takes would land on music they were
  never written about — v1's 0:58 is not v3's 0:58. Comments carried onto this take come along
  correctly, because carrying already placed them on this take's timeline.
- **E-06:** **Provenance lives in the filename, always** — `Midnight - v3 - comments.txt`,
  `Midnight - v3 - my-pins.txt`. The filename is the one carrier every format supports; Audacity's
  label track is strict TSV with no room for a header. **No in-file header** — it would be uneven
  across formats and a stray line can break a strict parser.

### What a marker says
- **E-07:** The label carries the author's **display name, not their @handle** — e.g.
  `Maya: bring the bass up here`. The person reading the file may not be a Funūn user, and an
  @handle means nothing to them.
- **E-08:** A carried comment keeps a **`[v1]` prefix** — e.g. `[v1] Maya: bring the bass up here`.
  Owner decision, taken against the recommendation, on the reasoning that feedback still open after
  a revision is a real signal to a producer: it flags the thing that keeps not getting fixed.
- **E-09:** Comments flagged as **needing a new position** (Phase 39 D-07) are **excluded**, and the
  export control states plainly how many were skipped — *"2 comments need repositioning and weren't
  included."* A flagged comment has a known-wrong timestamp; writing it to a timeline puts it on the
  wrong music. Fix the position in the room and it exports normally. **Nothing goes silently
  missing** — the count is required, not optional.

### Settled without discussion (owner declined the area)
- **Formats are exactly the three the roadmap names: Audition, Audacity, CSV.** No expansion to
  Reaper, Logic or Pro Tools. Treat this as decided, not discretionary.

### Claude's Discretion
- How a point comment renders in a format that expects a range (presumably `start == end`).
- Rate limiting and payload bounds on the export endpoint.
- Exact filename sanitization for song titles containing path-hostile characters.
- Whether the two export controls share one route with a path segment or are two routes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The dependency — read this first
- `.planning/phases/39-writer-s-room-the-take-as-a-real-review-surface-real-wavefor/39-CONTEXT.md` —
  Phase 39's D-01..D-18. This phase serializes what Phase 39 builds. Especially:
  **D-04/D-07** (range comments, the `needs_reposition` flag E-09 depends on), **D-08**
  (terminology: records are *comments*, never "notes" — export copy must follow),
  **D-09** (the carried-from provenance E-08 surfaces), **D-10/D-11** (pins are wordless and
  private — E-02/E-03/E-04 all derive from this).

### ⚠ SEQUENCING — this phase cannot be planned against shipped code yet
**Phase 39 is planned but NOT executed** (11 plans, 7 waves, execution held pending a parallel
Codex build as of 2026-09-12). The schema this phase serializes — `end_timestamp_ms`, the
`needs_reposition` flag, the `work_version_pins` table — exists only inside Phase 39's plans.
**Planning should wait until Phase 39 has executed**, so plans reference shipped columns rather
than planned ones. This CONTEXT.md is deliberately code-independent and does not go stale.

### House pattern for exports — follow it, do not invent
- `app/api/vault/[projectId]/metadata/export/route.ts` — the established shape:
  `GET …/export?format=csv|ddex|rdr`, auth → access → serialize → `new NextResponse(body, {
  headers: { 'Content-Type', 'Content-Disposition': 'attachment; filename="…"' } })`.
- `lib/metadata/cwr.ts` — the closest sibling: a spec-format serializer for domain data.
- `app/api/ideas/[ideaId]/export/route.ts` — the smallest complete example of the same pattern.

### Format specifics
- **Audacity label track** — `start⇥end⇥label` TSV. Well documented; ranges supported natively.
- **Audition** — **format UNVERIFIED. Do not assume XML.** Notetracks advertises the integration
  without documenting the file. Confirming this is a research task, not an assumption.
- **CSV** — universal fallback, no external spec to satisfy.

### Reviewed and NOT applicable
- `.planning/todos/pending/2026-09-01-accountable-download-history.md` — governs *protected asset*
  delivery (masters, clean files, custody grants). A comments text file is not that class. Recorded
  as considered so a future reader does not have to rediscover the question.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Eight existing export/download routes establish the pattern; `?format=` query-param dispatch is
  already in use at `app/api/vault/[projectId]/metadata/export/route.ts:21`.
- `lib/metadata/cwr.ts` — precedent for a pure spec-serializer module in `lib/`, testable without
  a route.
- Phase 39's `lib/catalogue/take-spans.ts` (planned) will already hold span geometry and clamping —
  the export should read spans through it rather than recomputing.

### Established Patterns
- Serializers live in `lib/`, routes stay thin — the route authenticates, authorizes, calls the
  serializer, and sets headers.
- Access is checked before any data is read, using the work's existing membership gate
  (`is_work_owner` / `work_member_tier`).
- Funūn conventions: named exports, no semicolons, 2-space indent, `@/` imports only,
  section-header comments, descriptive thrown Errors.

### Integration Points
- Reads `work_version_comments` (with Phase 39's `end_timestamp_ms` and reposition flag) and
  `work_version_pins` (Phase 39, author-only RLS).
- The download controls attach to the take surface built in Phase 39.

</code_context>

<specifics>
## Specific Ideas

- *"A marker file is imported against one audio file"* is the reasoning behind E-05 and should
  settle any future question about widening export scope.
- E-03 is the safety mechanism for E-02. If a future change proposes merging the two exports behind
  a flag, that is the change that breaks pin privacy — the separation is the point.
- E-09's skipped-count message is required, not decorative: excluding feedback silently is the
  failure mode it exists to prevent.

</specifics>

<deferred>
## Deferred Ideas

- **Include-resolved-comments flag** — E-01 ships unresolved-only; a flag is the obvious later
  addition if anyone asks.
- **Formats beyond the three** — Reaper, Logic, Pro Tools. Owner declined; revisit only on demand.
- **Export accounting** — a record of who exported which take and when. Raised, not discussed.
  Sharper now that pins can leave the platform.
- **Reaching a non-member producer** — today only room members can export. Whether the file should
  ever travel further is a question for the access model, not this phase.
- **Clickable transcript pane** — from the notetracks.com teardown; pairs naturally with this phase
  but stays deferred.
- **Importing markers back from a DAW** — explicitly out of scope; one-way by design.

</deferred>

---

*Phase: 40-writer-s-room-daw-marker-export-audition-audacity-csv*
*Context gathered: 2026-09-12*
