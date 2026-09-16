# Phase 40: Writer's Room — DAW marker export - Research

**Researched:** 2026-09-15
**Domain:** DAW-interoperable marker file serialization (Audacity label tracks, Adobe Audition marker CSV, generic CSV), read-only export of Writer's Room comments/pins
**Confidence:** HIGH for Audacity and CSV; **MEDIUM-HIGH (third-party corroborated, not vendor-confirmed) for Audition**

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**What goes in the file**
- **E-01:** Unresolved comments only (`resolved_at IS NULL`). The file is a worklist, not an
  archive. An "include resolved" flag is a deliberately-deferred later addition.
- **E-02:** An author may export their own pins. Owner decision, taken against the recommendation.
  Not an exception to Phase 39's D-11 (which makes pins invisible to *other people*) — an author
  exporting their own data is consistent with it. The new risk is that the file is forwardable in
  a way the in-app pin was not; E-03 is what contains that risk.
- **E-03:** Pins get a separate file and a separate action. Pins NEVER touch the comments export.
  No flag, no default, no code path by which a shareable comments file can contain private pins.
  Two distinct controls: *Export comments* and *Export my pins*. The pin export MUST filter
  server-side to `author_user_id = auth.uid()` — never "all pins on this take." Security invariant,
  not a preference.
- **E-04:** A pin's marker label is `Pin {timestamp}` — e.g. `Pin 1:12`. Ordinals rejected (not
  stable between exports).

**How much of the song**
- **E-05:** One take, always. A DAW marker file is imported against ONE audio file; markers from
  several takes would land on music they were never written about.
- **E-06:** Provenance lives in the filename, always — `Midnight - v3 - comments.txt`,
  `Midnight - v3 - my-pins.txt`. No in-file header — it would be uneven across formats (Audacity's
  label track is strict TSV with no room for one) and a stray line can break a strict parser.

**What a marker says**
- **E-07:** The label carries the author's display name, not their @handle — the reader may not be
  a Funūn user.
- **E-08:** A carried comment keeps a `[v1]` prefix — e.g. `[v1] Maya: bring the bass up here`.
  Owner decision, against the recommendation: feedback still open after a revision is a real signal
  to a producer.
- **E-09:** Comments flagged as needing a new position (Phase 39 D-07) are excluded, and the export
  control states plainly how many were skipped — *"2 comments need repositioning and weren't
  included."* Nothing goes silently missing — the count is required, not optional.

**Does exporting leave a trace?**
- **E-10:** Nothing is recorded. No audit table, no `last_exported_at` marker, no Diary entry.
  Export stays a pure READ. A Diary entry was considered and rejected — it would be a write on a
  read path, and would break Phase 39's D-11 pin-invisibility if it ever applied to the pin export.

**When there is nothing to export**
- **E-11:** Refuse, and say which case it is. No file is produced, and the control explains why:
  no comments at all → *"No comments on this take yet."*; comments exist but all resolved → *"All
  4 comments are resolved — nothing outstanding to export."*; comments exist but all flagged for
  repositioning → *"3 comments need repositioning before they can be exported."* The message is
  required, not optional.

**Format risk and shape**
- **E-12:** Ship what is confirmed; Audition may follow. CSV and the Audacity label track are
  certain. If research cannot pin down Audition's marker format, the phase ships without it and
  Audition lands as a small follow-up. **The release is not blocked on a vendor's undocumented
  file format.** Research method: reverse-engineer it — have Audition export its own marker list
  and match that shape byte for byte, rather than guessing.
- **E-13:** Audacity, Audition and CSV stay three named options, even if Audition's format turns
  out to be a CSV variant. A user picks their DAW, not a serialization format.

**Reaching a producer outside Funūn**
- **E-14:** The label carries the author's full display name. First-name-only was rejected — not
  reliably splittable, ambiguous with shared first names.

**Settled without discussion**
- Formats are exactly the three the roadmap names: Audition, Audacity, CSV. No expansion to
  Reaper, Logic or Pro Tools. Treat this as decided, not discretionary.

### Claude's Discretion
- How a point comment renders in a format that expects a range (presumably `start == end`).
- Rate limiting and payload bounds on the export endpoint.
- Exact filename sanitization for song titles containing path-hostile characters.
- Whether the two export controls share one route with a path segment or are two routes.

### Deferred Ideas (OUT OF SCOPE)
- Include-resolved-comments flag — E-01 ships unresolved-only; a flag is the obvious later
  addition if anyone asks.
- Formats beyond the three — Reaper, Logic, Pro Tools. Owner declined; revisit only on demand.
- Export accounting — DECIDED against in E-10 (nothing is recorded). Revisit only if a comments
  file ever becomes a protected asset class.
- Audition support, if unverified — E-12 allows the phase to ship without it. The follow-up is one
  serializer plus its tests.
- Clickable transcript pane — from the notetracks.com teardown; pairs naturally with this phase but
  stays deferred.
- Importing markers back from a DAW — explicitly out of scope; one-way by design.

**⚠ Sequencing note (from CONTEXT.md canonical references):** Phase 39 was planned but not yet
executed as of context-gathering (2026-09-12/13). This research is written against Phase 39's
*plans* (`39-01-PLAN.md` through `39-05-PLAN.md`) and their SUMMARY files, which describe the
shipped shape of `work_version_comments`, `work_version_pins`, and migrations 224/225. **Before
planning Phase 40, confirm Phase 39 has actually executed and that these column names/migration
numbers match what is live in `supabase/migrations/`** — direct file reads this session confirm
migrations 224 and 225 are both present in `supabase/migrations/`, which suggests Phase 39 has
executed, but the planner should re-verify against current git state rather than trust this note
alone.
</user_constraints>

## Summary

Phase 40 is a pure-serialization phase: read unresolved, non-repositioning-flagged, root-level
`work_version_comments` for one take, map them to a common `{ label, startMs, endMs }` marker
shape, and render that shape into up to three text formats. The repo already has the exact
pattern to copy — `app/api/vault/[projectId]/metadata/export/route.ts` (`?format=` dispatch,
`new Response(body, { headers })`) and `lib/metadata/cwr.ts` (a pure spec-format serializer with
no Node-only deps). Nothing here is architecturally novel; the risk is entirely in getting three
independent, unforgiving text formats byte-correct, because a wrong delimiter or time format
fails **silently** — the DAW either refuses the file or imports garbage, and the user has no way
to tell which happened.

The gating question — Adobe Audition's marker file format — has a confident, citable answer, but
it is not one I obtained by running Audition myself (not available in this environment, and E-12's
own stated method requires someone with Audition installed). Instead it rests on **convergent
evidence from independent sources**: a community forum thread quoting a literal exported header
row and two example rows, cross-validated by two independently-authored open-source parsers (built
for unrelated purposes — a podcast CUE-sheet converter and a chapter-markdown generator) that were
each written against real Audition exports and that agree, byte-for-byte, on delimiter, column
count, and column order. That convergence is strong enough to build against, but it does not reach
the bar of "I personally reverse-engineered a real export," which is what E-12 asks for. **See the
Audition section below for the exact verdict and the recommended verification gate.**

**Primary recommendation:** Build one pure `lib/catalogue/take-export.ts` module (mirroring
`lib/metadata/cwr.ts`'s shape) that maps comments/pins into a shared internal marker type, then
has one render function per format. Ship CSV and Audacity as fully confirmed. Gate the Audition
serializer behind a `checkpoint:human-verify` task that diffs a Funūn-generated file against a
real Audition export before the format is exposed in the UI — this satisfies E-12's method using
a human-in-the-loop step this agent cannot perform itself.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Comment/pin filtering & marker-shape mapping | API / Backend (`lib/catalogue/take-export.ts`) | — | Pure data transformation of already-fetched rows; no UI or DB logic belongs here |
| Format-specific text rendering (CSV/Audacity/Audition) | API / Backend (`lib/catalogue/take-export.ts`) | — | String templating only — same tier as the mapping step, same file family as `lib/metadata/cwr.ts` |
| Access control (who may export) | API / Backend (route handler) | Database (RLS on `work_version_pins`) | `resolveWorkAccess(..., 'contribute')` is the existing gate for comment reads; pins additionally rely on RLS as the only author-scoping mechanism (defense in depth, not either/or) |
| Download trigger / empty-state messaging | Browser / Client | API / Backend | The refusal message (E-11) is server-computed (server knows the counts) but rendered by a client control; no export logic duplicated client-side |
| File delivery | API / Backend | CDN / Static | `Content-Disposition: attachment` on a `NextResponse`/`Response`, same as `metadata/export` — no storage bucket involved, nothing is persisted |

## Standard Stack

### Core
No new runtime dependencies. This phase is string templating over already-typed rows — the same
posture as `lib/metadata/cwr.ts`, which is explicitly "Client-safe: no Node-only deps." Node's
built-in `Buffer`/`Response` primitives (already used throughout `app/api/`) are sufficient.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 3.23.0 (already installed) | Validate the `?format=` query param against an allowlist | Same pattern as `CommentBodySchema` in the comments route |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written CSV/TSV string building | `csv-stringify` or similar npm package | Rejected — Audition's format is TAB-delimited-with-a-.csv-extension and Audacity's is a headerless strict TSV with no quoting mechanism; a generic RFC4180 CSV library would fight both of those constraints rather than help, and the repo's own `lib/metadata/export.ts` already hand-rolls its CSV cell escaping (`csvCell`) rather than pulling in a library |

**Installation:** None — no `npm install` needed for this phase.

**Version verification:** Not applicable — no new packages.

## Package Legitimacy Audit

**No external packages are introduced by this phase.** Every format is plain string templating
against data already fetched via existing Supabase clients. The Package Legitimacy Gate protocol
is not triggered.

**Packages removed due to [SLOP] verdict:** none — no packages evaluated.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```text
Take surface (WorkPage / ProducerHandoffTimeline-adjacent UI)
        │
        │  [Export comments ▾]  [Export my pins]
        ▼
GET /api/works/[workId]/versions/[versionId]/comments/export?format=csv|audacity|audition
GET /api/works/[workId]/versions/[versionId]/pins/export?format=csv|audacity|audition
        │
        ▼
1. auth.getUser() → 401 if none
        │
        ▼
2. resolveWorkAccess(deps, workId, userId, 'contribute') → 403/404 if refused
        │        (pins route ALSO relies on RLS: query filters
        │         author_user_id = user.id as a second, independent gate)
        ▼
3. Fetch rows
   comments: COMMENT_COLUMNS select, .eq('version_id', versionId),
             .is('parent_comment_id', null)   ← explicit root filter (do not rely on the
                                                  migration-225 CHECK implicitly)
   pins:     work_version_pins select, .eq('version_id', versionId),
             .eq('author_user_id', user.id)   ← explicit filter, RLS is the second gate, not the only one
        ▼
4. lib/catalogue/take-export.ts — PURE, no I/O
   a. classifyExportability(comments) →
        { exportable: ExportMarker[], skippedRepositionCount, refusalReason }
      refusalReason ∈ 'none' | 'no_comments' | 'all_resolved' | 'all_repositioning'
   b. if refusalReason !== 'none' → 200 with a JSON refusal body (E-11), NOT a file
   c. else → render(exportable, format) → text body
        ▼
5. Route sets headers and returns
   Content-Type: text/csv | text/csv | text/plain  (see per-format table below)
   Content-Disposition: attachment; filename="{Title} - {vN} - comments.{ext}"
        ▼
Browser downloads file → user imports into Audacity / Audition / spreadsheet
```

### Recommended Project Structure
```
lib/catalogue/
├── take-export.ts          # NEW — pure: marker mapping, classification, 3 format renderers, filename builder
├── take-export.test.ts     # NEW — table-driven tests per format, snapshot-style exact-string assertions
├── take-spans.ts           # EXISTING — reused only for its span geometry types, not re-implemented
└── version-comments.ts     # EXISTING — presentVersionComments() is the upstream shape take-export.ts consumes

app/api/works/[workId]/versions/[versionId]/
├── comments/export/route.ts    # NEW — GET, format dispatch, shareable file
└── pins/export/route.ts        # NEW — GET, author-only, separate route (E-03)
```

### Pattern 1: Shared internal marker shape, format-specific renderers
**What:** One small internal type feeds all three serializers, so comments and pins (which are
structurally different — a pin has no body, no span, no author-in-file) both reduce to the same
shape before rendering:
```typescript
// lib/catalogue/take-export.ts
export type ExportMarker = {
  label: string        // fully composed: "[v1] Maya: bring the bass up here" or "Pin 1:12"
  startMs: number
  endMs: number | null  // null = point marker
}
```
**When to use:** Always — do not special-case pins inside the CSV/Audacity/Audition renderers.
Build the `ExportMarker[]` once (one mapper for comments, one for pins), then call the same three
render functions either way. This is what keeps E-13 ("three named formats either way") cheap: the
renderers don't know or care whether they're rendering comments or pins.
**Example:**
```typescript
// Comment → marker (E-04, E-07, E-08, E-14)
function commentToMarker(c: WorkVersionCommentView): ExportMarker {
  const prefix = c.carriedFromVersionId ? `[${c.carriedFromVersionDisplay}] ` : ''
  const author = c.author?.name ?? 'A former room member'
  return {
    label: `${prefix}${author}: ${c.body}`,
    startMs: c.timestampMs,
    endMs: c.endTimestampMs,
  }
}

// Pin → marker (E-04)
function pinToMarker(p: WorkVersionPinView): ExportMarker {
  return { label: `Pin ${formatTrackTimestamp(p.timestampMs)}`, startMs: p.timestampMs, endMs: null }
}
```

### Pattern 2: Refusal is data, not an exception
**What:** `classifyExportability` never throws for "nothing to export" — it returns a tagged
result the route branches on. E-11 requires three *distinguishable* messages, so the function must
retain enough information to tell "no comments at all" apart from "all resolved" apart from "all
flagged for repositioning" — which means it needs the pre-filter counts, not just the final empty
array.
**When to use:** Any time an empty result is a normal, expected state with more than one cause.
**Example:**
```typescript
export type ExportRefusalReason = 'none' | 'no_comments' | 'all_resolved' | 'all_repositioning'

export function classifyExportability(rootComments: WorkVersionCommentView[]): {
  exportable: ExportMarker[]
  skippedRepositionCount: number
  refusalReason: ExportRefusalReason
} {
  if (rootComments.length === 0) {
    return { exportable: [], skippedRepositionCount: 0, refusalReason: 'no_comments' }
  }
  const unresolved = rootComments.filter(c => c.resolvedAt === null)          // E-01
  if (unresolved.length === 0) {
    return { exportable: [], skippedRepositionCount: 0, refusalReason: 'all_resolved' }
  }
  const flagged = unresolved.filter(c => c.needsReposition)                    // E-09
  const exportable = unresolved.filter(c => !c.needsReposition).map(commentToMarker)
  if (exportable.length === 0) {
    return { exportable: [], skippedRepositionCount: flagged.length, refusalReason: 'all_repositioning' }
  }
  return { exportable, skippedRepositionCount: flagged.length, refusalReason: 'none' }
}
```
The route surfaces `skippedRepositionCount` in the success response too (not just the refusal
case) — E-09 requires the "2 comments need repositioning and weren't included" count to appear
even when the export otherwise succeeds, not only when it's the sole blocker.

### Format specifics — build against these exactly

#### CSV (universal fallback) — HIGH confidence, no vendor spec to satisfy
This format answers to no external application, so "correct" means "opens cleanly and reads
clearly in Excel/Numbers/Google Sheets" (research point 2). Recommended shape:

```
Start,End,Timestamp,Author,Comment
0:09,,0:09,Maya,"Maya: bring the bass up here"
1:12,1:18,1:12–1:18,Maya,"[v1] Maya: lower the guitars through this section"
```
- **A header row IS appropriate here** — this is a column-name row (`Start,End,...`), which is a
  different thing from the *provenance* header E-06 rules out (a line stating "Midnight — v3" so
  the file survives a rename). E-06's discussion log frames the rejected option as "Filename plus
  in-file header where possible — survives a rename" — that's provenance, not column labeling.
  Re-stating the take/version inside a CSV *cell* would re-open that question; a plain
  `Start,End,...` header does not, because it carries no take-identifying information.
- Standard RFC4180 quoting: reuse the repo's existing `csvCell` pattern from
  `lib/metadata/export.ts` (quote + double-up embedded quotes when a value contains `,`, `"`, or a
  newline) — **but add the CSV-injection guard that `csvCell` currently lacks** (see Pitfall 5
  below). This phase is the first exporter in the codebase to put unmoderated third-party free
  text into a spreadsheet-openable file; `lib/metadata/export.ts`'s existing cells are all
  structured metadata (names, ISRCs, titles) where a leading `=` is implausible. Comment bodies
  have no such guarantee.
- Time columns: human-readable `m:ss` (via the existing `formatTrackTimestamp`) is more useful to
  a human opening this in a spreadsheet than raw milliseconds; keep raw milliseconds out entirely
  unless discretion favors adding a machine-parseable column too.
- `End` blank for a point marker — CSV has no format-imposed reason to repeat `Start` in `End` the
  way Audacity's strict TSV does; blank reads more honestly as "not a range."

#### Audacity label track — HIGH confidence [VERIFIED: Audacity Manual, "Importing and Exporting Labels"]
- **File extension:** `.txt` (not `.csv`) — `Content-Type: text/plain; charset=utf-8`.
- **Delimiter:** tab character. **No quoting or escaping mechanism exists.**
- **Columns:** exactly 3, in order — `start<TAB>end<TAB>label`. No header row; the format is
  strict and line-based, so any header line would import as a garbage label at time 0.
- **Time representation:** decimal seconds, **6 decimal places**, dot as the decimal separator
  regardless of locale (confirmed: "timepoints given in fractional seconds always use a dot as
  decimal separator, regardless of locale settings"). Example from the manual: `2.150000` for a
  point at 2.15s.
- **Point label:** `start` and `end` are the **same value, repeated** — not omitted. `3.400000`
  in both columns represents a point label at 3.4s. (This confirms the "presumably `start == end`"
  discretion note is correct for Audacity specifically.)
- **Range label:** `start<TAB>end<TAB>label` with `end > start`, e.g. `3.400000 6.100000 hook`.
- **Encoding:** UTF-8. The manual explicitly warns that importing a non-UTF-8 file with accented
  or non-Latin characters "may cause the file to not import" — since display names and comment
  bodies are free text, **write the file as UTF-8 with no BOM** and do not assume ASCII-only input
  is safe to skip encoding on.
- **No escape for embedded tabs/newlines in the label text.** A literal tab in a comment body would
  silently create a phantom 4th column; a literal newline would split one label into two label
  lines. **Sanitize before writing:** replace `\t` and any of `\r\n`/`\n`/`\r` in the composed
  label with a single space, collapsing repeats. This must happen in the shared marker-mapping
  step (Pattern 1) so CSV/Audition get the same normalized text — consistency matters more than
  any one format's tolerance for whitespace variance.

```typescript
// lib/catalogue/take-export.ts
export function renderAudacityLabels(markers: ExportMarker[]): string {
  return markers
    .map(m => {
      const startSec = (m.startMs / 1000).toFixed(6)
      const endSec = (m.endMs ?? m.startMs) / 1000    // point: end repeats start (confirmed above)
      return `${startSec}\t${endSec.toFixed(6)}\t${sanitizeLabelText(m.label)}`
    })
    .join('\n')
}
```
Source: [CITED: manual.audacityteam.org/man/importing_and_exporting_labels.html]

#### Adobe Audition marker file — the phase's gating question

**VERDICT: CONFIRMED (third-party corroborated) — build against the shape below, but gate its
production exposure behind a human verification checkpoint before shipping.**

This is not "NOT CONFIRMABLE" — I have specific, citable, mutually-corroborating evidence, precise
enough to build a working serializer against. It is also not "PLAUSIBLE BUT UNVERIFIED" in the
weak sense the phase context warns about — the evidence isn't a single unconfirmed claim, it's
three independent sources (a forum export sample, and two separately-authored open-source parsers
built against real Audition output for unrelated purposes) all agreeing on the same structure. What
keeps this from being a clean "I verified it myself" CONFIRMED is honest: **I do not have Audition
installed in this environment**, so I could not perform E-12's own stated method (export a real
marker list, diff byte-for-byte). That step still needs to happen — see the recommended gate below.

**The format, as corroborated:**
- **File extension:** `.csv` — but **do not assume comma-separated.** `Content-Type: text/csv;
  charset=utf-8` (matches the extension; the delimiter inside is tab).
- **Delimiter:** **TAB**, despite the `.csv` extension. Confirmed independently three times:
  a community thread's explicit statement ("the variables aren't comma separated, they're tab
  separated!"), and two open-source tools that both hard-code tab-splitting against real exported
  files (`csvtocue.py`: `newline = oneline.split("\t")`; `markers2markdown`'s `index.js`: `// Comes
  from Adobe Audition? (.i.e., CSV with \t separations)` followed by `.split('\t').join(',')` to
  convert it into a real CSV before using a CSV-parsing library).
- **Columns, in order (6 total), WITH a header row:**
  `Name<TAB>Start<TAB>Duration<TAB>Time Format<TAB>Type<TAB>Description`
  Both third-party parsers unconditionally discard row 0 as a header (`del array[0]` /
  `for (let i = 1; ...)`), and `markers2markdown` indexes `Description` at array position 5 —
  which only holds if there are exactly 6 columns in that exact order. This cross-validates the
  forum thread's literal claimed header string independently of it.
- **Example row (a point marker), quoted verbatim from the forum thread:**
  ```
  Mark 10	1:30.000	0:00.000	decimal	Cue
  Mark 09	1:21.000	0:00.000	decimal	Cue
  ```
  (Note: the quoted rows show 5 tab-separated fields — `Description` is empty/trailing and simply
  didn't render visibly, consistent with the 6-column header.)
- **Time representation:** the `Time Format` column literal value `decimal` is required for
  reliable import (confirmed by a user report that omitting it caused import errors). Despite the
  column name, the **Start/Duration values are NOT plain decimal seconds** — they are formatted as
  `M:SS.mmm` strings: minutes (no leading zero), a colon, two-digit seconds, a dot, three-digit
  milliseconds. `0:09.000` = 9.000s. `1:30.000` = 1 minute 30.000s.
- **Start vs Duration, not Start vs End.** This is the detail most likely to be silently gotten
  wrong by analogy to Audacity: Audition's second time column is a **duration** (length), not an
  end timestamp. A point marker has `Duration = 0:00.000`. A range marker's `Duration` is
  `(endMs - startMs)`, formatted the same way — **not** the absolute end time.
- **`Type` column:** official docs describe four marker categories in Audition (Cue, Track/CD
  Track, Subclip, and range variants), but **point vs range is not distinguished by this column** —
  official Adobe documentation states "point markers mark a single time position, while range
  markers define a section with a start and end time... the only difference between the two types
  is that range markers have a duration." Every example row found (all points) used `Cue`.
  **Recommendation:** emit `Cue` for every row regardless of point/range — it is the default
  category, it is what every corroborating example shows, and nothing in the evidence suggests a
  distinct literal value is required for a ranged Cue.
- **`Name` vs `Description`:** put the full composed label (`[v1] Maya: bring the bass up here`)
  in **`Name`** — that's the column that renders in Audition's Markers panel list view, which is
  the whole point of the export. Leave `Description` **empty** rather than duplicating the label
  into it: one third-party tool explicitly treats `Description == Name` as redundant and drops it
  ("Remove description if same as title"), which suggests Audition users don't expect the two
  columns to carry duplicate text either.

```typescript
// lib/catalogue/take-export.ts
function auditionTime(ms: number): string {
  const t = Math.max(0, Math.round(ms))
  const minutes = Math.floor(t / 60000)
  const seconds = Math.floor((t % 60000) / 1000)
  const millis = t % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

export function renderAuditionMarkers(markers: ExportMarker[]): string {
  const header = 'Name\tStart\tDuration\tTime Format\tType\tDescription'
  const rows = markers.map(m => {
    const durationMs = m.endMs !== null ? m.endMs - m.startMs : 0
    return [sanitizeLabelText(m.label), auditionTime(m.startMs), auditionTime(durationMs), 'decimal', 'Cue', '']
      .join('\t')
  })
  return [header, ...rows].join('\r\n')   // see open question on line endings below
}
```

**What would fully settle this (and should still happen before or shortly after ship):**
1. Someone with Audition installed exports a real marker list (a few point markers + one range
   marker) to CSV and shares the raw bytes (not a screenshot).
2. Diff that file byte-for-byte against `renderAuditionMarkers()`'s output for the same marker
   data — specifically checking the three things the evidence above does *not* settle: file
   encoding (UTF-8 vs UTF-16 — Adobe apps on Windows sometimes default to UTF-16 for exports),
   line-ending convention (CRLF vs LF), and the `Type` value actually used for a range marker (not
   directly observed in any source — inferred from "the only difference is duration").
3. Confirm the file re-imports cleanly into a fresh Audition session.

**Recommendation for the plan:** ship the Audition serializer as described above (it is buildable
and testable against the corroborated shape right now), but insert a `checkpoint:human-verify`
task before the "Export as Audition" option is exposed in the UI — Pete or a collaborator with
Audition installed runs the three-step check above. If the diff reveals a discrepancy, the fix is
almost certainly localized to `renderAuditionMarkers()`/`auditionTime()`; nothing else in the
architecture changes. This is a lighter version of E-12's "ship without it" fallback — the code
ships, gated, rather than being deferred to a separate follow-up phase, because the corroborating
evidence is strong enough to be worth building against now.

Sources: [CITED: community.adobe.com/t5/audition-discussions/importing-markers-csv-audition
(forum thread with literal header + example rows)], [VERIFIED: github.com/zombak/csvtocue —
`csvtocue.py` source, tab-split + header-skip against real Audition exports], [VERIFIED:
github.com/nonoesp/markers2markdown — `index.js` source, explicit tab-delimiter comment +
description-at-index-5 against real Audition exports], [CITED: helpx.adobe.com/audition/using/
markers.html, via search-result summary — point-vs-range-is-duration-only]

### Anti-Patterns to Avoid
- **Assuming Audition uses XML markers:** the roadmap explicitly warns against this, and no
  evidence found supports it — Notetracks-style "Audition-compatible" marketing language does not
  document a schema. The confirmed shape is tab-delimited-with-.csv-extension, not XML.
- **Reusing Audacity's start/end pair for Audition's start/duration:** the two formats look similar
  (both are 2-time-value marker lists) but encode the second value differently. Sharing one
  time-pair helper between them would silently corrupt every Audition range marker.
- **A generic RFC4180 CSV writer for Audition's file:** a library that quotes fields containing
  commas, or that uses `\r\n` by policy without checking, may "fix" things that must stay exactly
  tab-delimited-with-literal-header. Hand-roll this one render function; do not generalize it.
- **Trusting `end_timestamp_ms IS NULL` alone to mean "point," without also checking
  `parent_comment_id IS NULL`:** migration 225's CHECK constraint guarantees a reply never carries
  a span, but the phase's own constraints note says to filter to root comments **explicitly**
  rather than lean on that constraint implicitly — a future migration change to the CHECK would
  silently start leaking reply text into the marker list otherwise.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RFC4180 CSV quoting for the generic CSV format | A new quoting function | The existing `csvCell` pattern in `lib/metadata/export.ts` (copy the approach, extend with the injection guard below) | Already solved once in this codebase; re-deriving it risks a subtly different quoting rule between the two CSV exporters |
| Filename sanitization | A brand-new sanitizer from scratch | Model closely on `safeIdeaDownloadName` in `lib/ideas/schema.ts`, but **do not reuse it unmodified** — it slugifies to lowercase-hyphens, which would turn `Midnight - v3 - comments.txt` into `midnight-v3-comments-txt`-style output, contradicting E-06's literal example filename. Write a narrower sanitizer that strips only genuinely path-hostile characters (see Pitfall 4) and preserves spaces/case/punctuation otherwise |
| Access control | A bespoke ownership check in the export route | `resolveWorkAccess(createWorkAccessDeps(supabase), workId, userId, 'contribute')` — the identical call the comments GET route already makes | This is the phase's own operating boundary (b): "the same gate that governs reading the comments" |

**Key insight:** every piece of this phase that looks like it needs new infrastructure already has
a same-shape precedent in the codebase (export routes, CSV cell escaping, pure `lib/` serializers,
access gating). The actual novel work is entirely in the three format renderers' string output —
that is where research effort and test effort should concentrate, not in inventing new patterns.

## Common Pitfalls

### Pitfall 1: Treating "Time Format: decimal" as literal decimal seconds
**What goes wrong:** A developer sees the column named "Time Format" with value `decimal` and
writes `(ms/1000).toFixed(3)` (Audacity-style), producing `9.000` instead of `0:09.000`.
**Why it happens:** `decimal` sounds like it means "decimal number," and Audacity really does use
plain decimal seconds — the two formats' similarity invites this exact mistake.
**How to avoid:** Use `auditionTime()` (minutes:seconds.milliseconds string) for every Audition
Start/Duration value, never plain seconds.
**Warning signs:** A generated Audition file where every marker's Start column has no colon.

### Pitfall 2: Audition Duration as an end timestamp instead of a length
**What goes wrong:** Writing `auditionTime(m.endMs)` instead of `auditionTime(m.endMs - m.startMs)`
for the Duration column puts every range marker at the wrong length (and, for a marker near the
end of a long take, could make Duration exceed the take's own runtime).
**Why it happens:** Every other format in this phase (Audacity, CSV, the DB row itself) stores an
end timestamp, not a duration — Audition is the one outlier.
**How to avoid:** The `renderAuditionMarkers` example above computes `durationMs` explicitly as a
subtraction; keep that as a named intermediate rather than inlining `m.endMs` directly into the
Duration column.
**Warning signs:** A range marker imports at a wildly different length than the room's shaded span
showed.

### Pitfall 3: Embedded tabs/newlines corrupting Audacity or Audition rows
**What goes wrong:** A comment body containing a literal tab character (pasted from another app)
or a newline (a multi-line comment, if the UI ever allows one) silently creates a phantom extra
column or splits one marker into two.
**Why it happens:** Neither Audacity's label format nor the corroborated Audition format documents
a quoting/escaping mechanism — unlike RFC4180 CSV, there is no way to "protect" a tab inside a
tab-delimited field.
**How to avoid:** Sanitize every composed label in the shared marker-mapping step (Pattern 1):
collapse `\t`, `\r`, `\n` to a single space before the format-specific renderer ever sees the text.
Do this once, upstream of all three renderers, so behavior is consistent across formats rather than
three renderers independently guessing at safe handling.
**Warning signs:** A DAW showing more markers than Funūn reports, or a marker whose label looks
truncated.

### Pitfall 4: Filename sanitization stripping the wrong things
**What goes wrong:** A title containing `/`, `\`, `:`, or trailing periods/spaces breaks on some
OS/filesystem combinations if written through unsanitized into `Content-Disposition`. Overzealous
sanitization (see Don't Hand-Roll above) instead breaks E-06's literal filename convention.
**Why it happens:** Cross-platform filename rules differ (Windows reserves `< > : " / \ | ? *` and
disallows trailing dots/spaces and a short reserved-name list like `CON`/`PRN`; macOS/Linux are far
more permissive but a literal `/` is still a path separator everywhere).
**How to avoid:** Strip only the documented Windows-reserved character set plus control characters,
collapse repeated separators, trim trailing dots/spaces, and leave everything else — including
spaces and mixed case — intact, matching E-06's own example (`Midnight - v3 - comments.txt`).
[ASSUMED — Windows reserved-character set is training knowledge, not verified against a current
Microsoft doc this session; low risk since the consequence of over-inclusion is a slightly odd but
still-valid filename, not a broken export]
**Warning signs:** A title like `A/B Side` producing a nested-path-looking `Content-Disposition`
header, or a title ending in a period silently losing its extension boundary on Windows.

### Pitfall 5: CSV/formula injection from unmoderated comment text
**What goes wrong:** A comment body that happens to start with `=`, `+`, `-`, or `@` — plausible
for anything from an emoji-adjacent typo to a deliberately malicious collaborator — is interpreted
as a spreadsheet formula when the exported CSV (or the Audition file, which is also opened in
spreadsheet software by curious users despite its `.csv` extension being tab-delimited) is opened
in Excel, Numbers, or Google Sheets. This can range from a broken-looking cell to, in older Excel
versions, DDE-based remote code execution via a crafted formula.
**Why it happens:** The repo's existing `csvCell` helper (`lib/metadata/export.ts`) handles RFC4180
quoting (commas, quotes, newlines) but has **no CSV-injection guard** — it has never needed one,
because every prior CSV export in this codebase serializes structured metadata (titles, ISRCs,
names) where a leading `=` is not a realistic input. Phase 40 is the first exporter to put raw,
third-party-authored free text (a comment body) into a file destined for a spreadsheet.
**How to avoid:** [CITED: owasp.org/www-community/attacks/CSV_Injection] Prefix any field beginning
with `=`, `+`, `-`, or `@` with a single quote (`'`) before writing — OWASP's current guidance
prefers `'` over the older tab-character mitigation, and notes there is no universal fix that works
identically across every spreadsheet application, so this is defense-in-depth rather than a
guarantee. Apply this to the composed label in the shared marker-mapping step, alongside the
tab/newline sanitization in Pitfall 3, so all three formats get the same protection rather than
only the CSV format.
**Warning signs:** A round-trip test where a comment body of `=1+1` (or similar) appears as a raw
formula-looking string in the rendered output rather than a quoted/prefixed one.

## Runtime State Inventory

> Not applicable — this is a greenfield read/serialize feature, not a rename, refactor, or
> migration phase. No existing runtime state (stored data, live service config, OS-registered
> state, secrets, or build artifacts) is touched or renamed by this phase.

## Code Examples

### The house export-route pattern, adapted for this phase
```typescript
// Source: app/api/vault/[projectId]/metadata/export/route.ts (existing pattern) +
// app/api/works/[workId]/versions/[versionId]/comments/route.ts (existing auth/access pattern)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workId: string; versionId: string }> }
) {
  const { workId, versionId } = await params
  const format = new URL(request.url).searchParams.get('format') ?? 'csv'
  if (!['csv', 'audacity', 'audition'].includes(format)) {
    return NextResponse.json({ error: 'Unsupported export format.' }, { status: 400 })
  }

  const supabase = await createApiClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await resolveWorkAccess(createWorkAccessDeps(supabase), workId, user.id, 'contribute')
  if (!access.granted) return NextResponse.json({ error: access.reason }, { status: access.status })

  // ... fetch work title, version display, root comments for this version_id ...

  const { exportable, skippedRepositionCount, refusalReason } = classifyExportability(rootComments)
  if (refusalReason !== 'none') {
    return NextResponse.json({ refusalReason, skippedRepositionCount }, { status: 200 })
  }

  const body =
    format === 'audacity' ? renderAudacityLabels(exportable) :
    format === 'audition' ? renderAuditionMarkers(exportable) :
    renderCsv(exportable)

  const ext = format === 'audacity' ? 'txt' : 'csv'
  const contentType = format === 'audacity' ? 'text/plain' : 'text/csv'
  const filename = exportFilename(workTitle, versionDisplay, 'comments', ext)

  return new NextResponse(body, {
    headers: {
      'Content-Type': `${contentType}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Manual timecode translation by the producer/engineer receiving feedback | Structured marker file imported directly into the DAW | This phase | The core value proposition — no new "state of the art" shift in the DAW formats themselves, which have been stable for years |

**Deprecated/outdated:** None identified — Audacity's label format and Audition's marker CSV
format are both long-standing, unchanged formats with no announced replacement.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Audition marker file encoding is UTF-8, line endings are CRLF | Format specifics → Audition | Import could fail or mis-render accented/non-Latin display names; low-to-medium — this is exactly what the recommended `checkpoint:human-verify` gate is designed to catch before the format ships to users |
| A2 | Audition's `Type` column value for a *range* marker is the same `Cue` literal seen in every (point-marker-only) corroborating example | Format specifics → Audition | If wrong, range markers might import as points or fail; caught by the same human-verify gate (test with at least one range marker) |
| A3 | Windows-reserved filename character set (`< > : " / \ \| ? *`, trailing dot/space, reserved names) is current and complete | Pitfall 4 | Low — worst case is an unnecessarily-stripped-but-still-valid filename, not a broken export |
| A4 | A literal `'` prefix is sufficient CSV-injection mitigation across Excel/Numbers/Google Sheets | Pitfall 5 | Low-medium — OWASP itself notes no universal fix exists; a bypass would produce a formula-execution risk in a specific spreadsheet app/version, not a Funūn security boundary breach, since the file is a voluntary user download |

**If this table is empty:** N/A — see above.

## Open Questions

1. **Does the Audition marker file need `\r\n` or `\n` line endings, and what column separator
   trailing behavior (trailing tab for the empty `Description` field, or omit it)?**
   - What we know: the delimiter is confirmed as tab; the forum example shows what reads as 5
     visible fields for a 6-column header (Description empty/trailing).
   - What's unclear: whether Audition's own export always writes a trailing tab before the line
     ending, or whether the line simply ends after `Type` when `Description` is empty.
   - Recommendation: `renderAuditionMarkers` above always writes 6 tab-joined fields per row
     (empty string for a blank Description), which is the safer default — an extra empty field is
     far less likely to break parsing than a missing one, since both real-world parsers found index
     fields positionally. Confirm in the human-verify gate.

2. **What exactly should the "Export comments" vs "Export my pins" controls look like, and do they
   share a route with a `?type=` param or live at two paths?**
   - What we know: E-03 requires them to be separate actions with **no shared code path** that
     could accidentally include pins in a comments export.
   - What's unclear: nothing structurally — this is explicitly left as Claude's discretion in
     CONTEXT.md.
   - Recommendation: two separate route files (`comments/export/route.ts` and
     `pins/export/route.ts`), as laid out in Recommended Project Structure. Two files makes E-03's
     "no shared code path" guarantee a structural fact (nothing to audit for a stray flag) rather
     than a runtime invariant to test for. They may still both call the same pure renderers in
     `lib/catalogue/take-export.ts` — sharing the *format renderers* is fine and intended (E-13);
     sharing the *data-fetching path* between comments and pins is what E-03 forbids.

## Environment Availability

> Skipped — this phase has no external service, CLI, or runtime dependency to probe. Adobe
> Audition itself is a piece of desktop software a human collaborator would need for the
> verification gate described above; there is no CLI or API surface to check availability of in
> this environment, so it is handled as a `checkpoint:human-verify` task rather than an
> environment-availability row.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30.5.1 (`ts-jest`) |
| Config file | `package.json` (`"test": "jest"`) — no dedicated `jest.config.*` found; check for one during planning in case it's been added since |
| Quick run command | `npx jest lib/catalogue/take-export.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| E-01 | Only `resolved_at IS NULL` comments appear in the export | unit | `npx jest lib/catalogue/take-export.test.ts -t "unresolved"` | ❌ Wave 0 |
| E-03 | Pins export route contains no shared code path with comments export | unit (source-assertion style, matching `__tests__/writer-room-private-pins.test.ts`) | `npx jest __tests__/writer-room-daw-export.test.ts -t "no shared"` | ❌ Wave 0 |
| E-04 | Pin label renders as `Pin {m:ss}` | unit | `npx jest lib/catalogue/take-export.test.ts -t "pin label"` | ❌ Wave 0 |
| E-05 | Export reads exactly one `version_id`, never spans multiple takes | unit + route source-assertion | `npx jest lib/catalogue/take-export.test.ts -t "single version"` | ❌ Wave 0 |
| E-06 | Filename matches `{Title} - {vN} - comments.{ext}` exactly, no in-file provenance header | unit | `npx jest lib/catalogue/take-export.test.ts -t "filename"` | ❌ Wave 0 |
| E-07/E-14 | Label uses display name, never `@handle` | unit | `npx jest lib/catalogue/take-export.test.ts -t "display name"` | ❌ Wave 0 |
| E-08 | Carried comment gets `[vN]` prefix from `carriedFromVersionDisplay`, not the current version | unit | `npx jest lib/catalogue/take-export.test.ts -t "carried prefix"` | ❌ Wave 0 |
| E-09 | Repositioning-flagged comments excluded; skipped count surfaced on both success and refusal | unit | `npx jest lib/catalogue/take-export.test.ts -t "reposition"` | ❌ Wave 0 |
| E-10 | No write occurs anywhere in the export path (no audit row, no `last_exported_at`) | route source-assertion (negative) | `npx jest __tests__/writer-room-daw-export.test.ts -t "pure read"` | ❌ Wave 0 |
| E-11 | Three distinguishable refusal messages for the three empty-export cases | unit | `npx jest lib/catalogue/take-export.test.ts -t "refusal"` | ❌ Wave 0 |
| Audacity format | Exact `start<TAB>end<TAB>label`, point repeats start, 6-decimal seconds | unit (exact-string) | `npx jest lib/catalogue/take-export.test.ts -t "audacity"` | ❌ Wave 0 |
| Audition format | Exact 6-column tab-delimited header + rows, `M:SS.mmm` time, Duration not End | unit (exact-string) | `npx jest lib/catalogue/take-export.test.ts -t "audition"` | ❌ Wave 0 |
| Injection/escaping | Tab/newline collapsed; leading `=+-@` prefixed with `'` | unit | `npx jest lib/catalogue/take-export.test.ts -t "sanitize"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest lib/catalogue/take-export.test.ts` (and the corresponding route
  test file once it exists)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the Audition
  `checkpoint:human-verify` task completed (or explicitly deferred per E-12 with the option removed
  from the UI) before the phase is considered shippable.

### Wave 0 Gaps
- [ ] `lib/catalogue/take-export.ts` — does not exist yet; this phase creates it
- [ ] `lib/catalogue/take-export.test.ts` — table-driven, exact-string assertions per format (the
  established convention for this subsystem, matching `lib/catalogue/take-spans.test.ts`'s pure-
  function testing style — no jsdom needed since nothing here touches a component)
- [ ] `__tests__/writer-room-daw-export.test.ts` — a doctrine-gate test in the style of
  `__tests__/writer-room-private-pins.test.ts`, asserting (by `readFileSync` + `toContain`/negative
  assertions on route source) that: the pins export route contains no reference to the comments
  table, the comments export route contains no reference to `work_version_pins`, neither route
  contains an `.insert(`/`.update(` call, and the pins route's Supabase query includes an explicit
  `author_user_id` filter (not solely relying on RLS)
- [ ] Framework install: none — Jest is already configured

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Session already established upstream via Supabase auth cookie; this phase adds no new auth surface |
| V3 Session Management | no | Same as above |
| V4 Access Control | **yes** | `resolveWorkAccess(deps, workId, userId, 'contribute')` before any read (matches the comments route exactly); pins additionally scoped by an explicit `author_user_id = user.id` filter in the query **and** by RLS as a second, independent layer — do not rely on RLS alone per the phase's own constraint that the API should filter explicitly |
| V5 Input Validation | **yes** | `format` query param validated against a literal allowlist (`['csv','audacity','audition']`) via a Zod enum or plain `includes()` check before any branching; comment/pin IDs are path params already validated as UUIDs by the existing Next.js route shape |
| V6 Cryptography | no | No secrets, tokens, or encrypted payloads are introduced |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSV/formula injection via comment body text | Tampering (of the recipient's spreadsheet session, not Funūn's data) | Prefix `=+-@`-leading fields with `'` (Pitfall 5); apply to all three formats, not CSV alone |
| Private pin leaking into the shareable comments file | Information Disclosure | **Structural** separation (E-03): two route files, two data-fetch paths, zero shared query logic between them — verified by the doctrine-gate test above, not by a runtime flag check |
| IDOR — exporting another work's take by manipulating `workId`/`versionId` path params | Elevation of Privilege / Information Disclosure | `resolveWorkAccess` already binds the check to the specific `workId`; additionally scope every DB query by both `work_id` and `version_id` (not just `version_id`) so a version ID valid on a *different* work the caller can access doesn't leak through a missing join condition |
| Path traversal / header injection via song title in `Content-Disposition` | Tampering | Sanitize the filename (Pitfall 4) before interpolating into the header string; do not pass raw user-controlled title text directly into an HTTP header |
| Unbounded export requests (abuse/DoS) | Denial of Service | Rate-limit via the existing `checkRateLimit()` helper (`lib/security/rate-limit.ts`), same call shape as the comments POST route — left as Claude's discretion in CONTEXT.md for exact limits; a per-user key (`export:{userId}`) with a generous window (this is a low-cost read, not a fan-out write) is a reasonable default |

## Sources

### Primary (HIGH confidence)
- `manual.audacityteam.org/man/importing_and_exporting_labels.html` — Audacity label track format,
  decimal-seconds precision, locale-independent dot separator, UTF-8 encoding requirement
- `owasp.org/www-community/attacks/CSV_Injection` — CSV/formula injection mitigation (`'` prefix)
- Direct repo reads: `app/api/vault/[projectId]/metadata/export/route.ts`,
  `app/api/ideas/[ideaId]/export/route.ts`, `lib/metadata/cwr.ts`, `lib/metadata/export.ts`,
  `lib/catalogue/access.ts`, `lib/catalogue/version-comments.ts`, `lib/catalogue/take-spans.ts`,
  `lib/security/rate-limit.ts`, `types/catalogue.ts`,
  `app/api/works/[workId]/versions/[versionId]/comments/route.ts`,
  `.planning/phases/39-.../39-01-PLAN.md`, `39-04-PLAN.md`, `39-05-PLAN.md`,
  `supabase/migrations/224_writer_room_take_review_surface.sql`,
  `supabase/migrations/225_reply_span_and_peaks_grant.sql`

### Secondary (MEDIUM confidence)
- `github.com/zombak/csvtocue` (`csvtocue.py` source) — tab-delimited parsing of real Audition
  marker exports, header-row skip, confirmed independently of the forum thread below
- `github.com/nonoesp/markers2markdown` (`index.js` source) — tab-delimited parsing of real
  Audition marker exports, `Description` at column index 5, confirmed independently
- `community.adobe.com/t5/audition-discussions/importing-markers-csv-audition/td-p/12827219` —
  literal header row and two example rows from a real export, plus the "tab, not comma" statement
- `helpx.adobe.com/audition/using/markers.html` (via search-result summary; direct fetch returned
  HTTP 403) — point-vs-range markers differ only by duration

### Tertiary (LOW confidence)
- `dev.larryjordan.com/articles/adobe-audition-cc-how-to-share-markers-between-projects/` —
  general CSV-export workflow description, no exact column/delimiter detail; one commenter reported
  an inconsistent "unformatted" export, which is the residual uncertainty the human-verify gate
  exists to resolve
- `community.adobe.com/t5/audition-discussions/importing-markers-from-file/td-p/13223396` — reports
  of import friction, corroborates that Audition's own documentation is thin on this format (hence
  the reverse-engineering approach)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, entire approach mirrors existing `lib/metadata/cwr.ts`
- Architecture: HIGH — every structural piece (route shape, access gate, pure-lib serializer) has a
  direct precedent already in this codebase
- Audacity format: HIGH — official manual, internally consistent, no contradicting sources found
- CSV format: HIGH — no external spec to satisfy; recommendation is internally justified
- Audition format: MEDIUM-HIGH — convergent third-party evidence, buildable and testable now, but
  not personally verified against a live Audition export; gated behind `checkpoint:human-verify`
- Pitfalls: HIGH — each is either a direct reading of a cited format spec or an existing gap
  (`csvCell` lacking injection guard) found by direct code inspection

**Research date:** 2026-09-15
**Valid until:** 2026-10-15 (30 days) for Audacity/CSV — both are long-stable formats unlikely to
change. Audition's format has no version-change signal found, but since it is the medium-confidence
finding, treat any *new* evidence (especially an actual exported file) as superseding this document
immediately rather than waiting out the 30-day window.
