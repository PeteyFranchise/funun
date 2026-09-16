// ─── DAW marker export — the pure core ─────────────────────────────────────
// Two rules this file exists to hold:
//   1. A marker is three facts and nothing more: a label, a start, an end
//      (or null, for a point). Comments and pins are structurally different
//      upstream — a pin has no body, no span, no author-in-file — but both
//      reduce to that one shape before any renderer sees them.
//   2. Every label is normalised HERE, once, so no format-specific renderer
//      downstream has to guess at safe handling. Neither the Audacity label
//      track nor the Audition marker file has an escape mechanism for its
//      delimiter, so a stray tab or newline in free text would otherwise
//      silently forge a column or split a row in whichever format happens to
//      render it.
//
// This module performs no I/O: no database client, no network call, no
// filesystem read. It must stay importable from a browser component, exactly
// like lib/metadata/cwr.ts. It also decides no format-specific text — that is
// the renderers' job (plans 40-02 and 40-03); this file decides WHAT a
// marker says, never HOW it is written.

import { formatTrackTimestamp } from '@/lib/catalogue/version-comments'
import type { WorkVersionCommentView, WorkVersionPinView } from '@/types/catalogue'

// ─── The shared marker shape ────────────────────────────────────────────────

/** endMs of null is the ONLY representation of a point marker in this phase.
 * Each renderer decides for itself how a point is written in its own format
 * (Audacity repeats the start, Audition writes a zero duration) — that
 * decision does not live here. */
export type ExportMarker = {
  label: string
  startMs: number
  endMs: number | null
}

// ─── Label sanitisation ─────────────────────────────────────────────────────

// Applied AFTER whitespace normalisation — this order is load-bearing. A
// label beginning with a tab followed by "=" would otherwise slip past this
// check with the formula character hidden behind the tab.
const CSV_FORMULA_LEAD = /^[=+\-@]/

// Every C0 control character is code point 0 through 31 inclusive, which
// covers the tab, the carriage return and the line feed among others.
// Written as a charCode comparison rather than a regex control-character
// class so no literal control byte has to live in this source file.
const MAX_C0_CONTROL_CODE = 0x1f

function collapseControlCharsToSpace(input: string): string {
  let out = ''
  for (let i = 0; i < input.length; i += 1) {
    out += input.charCodeAt(i) <= MAX_C0_CONTROL_CODE ? ' ' : input[i]
  }
  return out
}

/**
 * sanitizeMarkerLabel is the single place every label is made
 * delimiter-safe and spreadsheet-safe before any renderer sees it. It
 * applies two independent protections, in a fixed order:
 *
 * First, whitespace normalisation: every C0 control character — including
 * the tab, the carriage return and the line feed — becomes a single space,
 * runs of whitespace collapse to one space, then the result is trimmed.
 * Neither the Audacity label track nor the Audition marker file has any
 * escape mechanism for its delimiter, so a stray tab silently creates a
 * phantom column and a stray newline silently splits one marker into two;
 * normalising here, upstream of all three renderers, is the only place this
 * can be fixed once.
 *
 * Second, the spreadsheet-formula guard: if the normalised string's first
 * character is an equals sign, a plus, a minus or an at-sign, prepend one
 * apostrophe. This is OWASP's recommended mitigation
 * (owasp.org/www-community/attacks/CSV_Injection) and is defence in depth
 * rather than a guarantee — no single prefix works identically across every
 * spreadsheet application.
 */
export function sanitizeMarkerLabel(raw: string): string {
  const normalized = collapseControlCharsToSpace(raw)
    .replace(/\s+/g, ' ')
    .trim()
  return CSV_FORMULA_LEAD.test(normalized) ? `'${normalized}` : normalized
}

// ─── Comment and pin → marker ───────────────────────────────────────────────

/**
 * commentToMarker composes a label as an optional carried-version segment,
 * then the author's display name, then a colon and a space, then the
 * comment body — and passes the whole composed string through
 * sanitizeMarkerLabel.
 */
export function commentToMarker(comment: WorkVersionCommentView): ExportMarker {
  // The carried segment is present only when carriedFromVersionId is
  // non-null. Fall back to "an earlier version" when the display is null,
  // matching what presentVersionComments already does upstream.
  const carriedPrefix = comment.carriedFromVersionId
    ? `[${comment.carriedFromVersionDisplay ?? 'an earlier version'}] `
    : ''
  // Per E-07 and E-14 the author segment is the FULL display name and never
  // the handle; when the comment has no author, fall back to the same
  // "A former room member" string the presenter uses.
  const authorName = comment.author?.name ?? 'A former room member'
  const label = sanitizeMarkerLabel(`${carriedPrefix}${authorName}: ${comment.body}`)
  return {
    label,
    startMs: comment.timestampMs,
    endMs: comment.endTimestampMs ?? null,
  }
}

/**
 * pinToMarker's label is the word "Pin", a space, and the timestamp
 * formatted as minutes and seconds (E-04) — an ordinal was rejected because
 * it is not stable between exports. A pin has no span; endMs is always
 * null, and this module must never invent one.
 */
export function pinToMarker(pin: WorkVersionPinView): ExportMarker {
  // Passed through sanitizeMarkerLabel even though the composed string is
  // machine-generated and the call is a no-op today: one path, no special
  // case, is worth more than the microseconds saved.
  return {
    label: sanitizeMarkerLabel(`Pin ${formatTrackTimestamp(pin.timestampMs)}`),
    startMs: pin.timestampMs,
    endMs: null,
  }
}

// ─── Classification — what is excluded, and the one sentence that says why ──

/**
 * ExportRefusalReason distinguishes the five ways an export can produce no
 * markers, so the export control can say which one happened instead of a
 * generic "nothing to export" (E-11).
 */
export type ExportRefusalReason = 'none' | 'no_comments' | 'all_resolved' | 'all_repositioning' | 'no_pins'

export type ExportClassification = {
  exportable: ExportMarker[]
  skippedRepositionCount: number
  refusalReason: ExportRefusalReason
  /** Null exactly when refusalReason is 'none'. */
  refusalMessage: string | null
}

function sortByStartMsThenLabel(markers: ExportMarker[]): ExportMarker[] {
  return [...markers].sort((a, b) => a.startMs - b.startMs || a.label.localeCompare(b.label))
}

/**
 * classifyCommentExport applies four filters in order and returns early with
 * a tagged reason at each empty point. No pin ever reaches
 * classifyCommentExport and no comment ever reaches classifyPinExport —
 * they are two functions on purpose (E-03), not one classifier with a mode
 * argument.
 */
export function classifyCommentExport(comments: WorkVersionCommentView[]): ExportClassification {
  // 1. Root filter — done FIRST and unconditionally. The route also filters
  // roots in its query; these are two independent gates and neither is
  // allowed to be the only one (migration 225's CHECK constraint is not
  // relied on implicitly here).
  const roots = comments.filter(comment => comment.parentCommentId === null)
  if (roots.length === 0) {
    return {
      exportable: [],
      skippedRepositionCount: 0,
      refusalReason: 'no_comments',
      refusalMessage: 'No comments on this take yet.',
    }
  }

  // 2. Unresolved filter (E-01) — the count in the message is the number of
  // ROOT comments, not the original array length, because a reply is not a
  // comment the writer can see a marker for.
  const unresolved = roots.filter(comment => comment.resolvedAt === null)
  if (unresolved.length === 0) {
    const rootCount = roots.length
    return {
      exportable: [],
      skippedRepositionCount: 0,
      refusalReason: 'all_resolved',
      refusalMessage:
        rootCount === 1
          ? 'The only comment on this take is resolved — nothing outstanding to export.'
          : `All ${rootCount} comments are resolved — nothing outstanding to export.`,
    }
  }

  // 3. Reposition filter (E-09) — a flagged comment has a known-wrong
  // timestamp and writing it to a timeline puts it on the wrong music.
  const flagged = unresolved.filter(comment => comment.needsReposition === true)
  const positioned = unresolved.filter(comment => comment.needsReposition !== true)
  if (positioned.length === 0) {
    const flaggedCount = flagged.length
    return {
      exportable: [],
      skippedRepositionCount: flaggedCount,
      refusalReason: 'all_repositioning',
      refusalMessage:
        flaggedCount === 1
          ? '1 comment needs repositioning before it can be exported.'
          : `${flaggedCount} comments need repositioning before they can be exported.`,
    }
  }

  // 4. Success — skippedRepositionCount is carried here too, because E-09
  // requires the writer to be told what was left out even when the export
  // otherwise worked, not only when it is the sole blocker.
  return {
    exportable: sortByStartMsThenLabel(positioned.map(commentToMarker)),
    skippedRepositionCount: flagged.length,
    refusalReason: 'none',
    refusalMessage: null,
  }
}

/**
 * classifyPinExport is a genuinely separate function from
 * classifyCommentExport, not a parameterised one — E-03 makes the
 * separation of the comments path and the pins path a structural fact
 * rather than a runtime invariant, and a shared classifier with a mode
 * argument is exactly the shape a later change would add a third mode to.
 * A pin has no reposition concept and must never borrow one.
 */
export function classifyPinExport(pins: WorkVersionPinView[]): ExportClassification {
  if (pins.length === 0) {
    return {
      exportable: [],
      skippedRepositionCount: 0,
      refusalReason: 'no_pins',
      refusalMessage: 'No pins on this take yet.',
    }
  }
  return {
    exportable: sortByStartMsThenLabel(pins.map(pinToMarker)),
    skippedRepositionCount: 0,
    refusalReason: 'none',
    refusalMessage: null,
  }
}

/**
 * skippedRepositionNote is the success-path sentence the export control
 * renders (E-09) — null at zero, otherwise the count of comments that were
 * excluded from an otherwise-successful export. Lives here rather than in
 * the component so the refusal sentences and the success sentence have one
 * home.
 */
export function skippedRepositionNote(count: number): string | null {
  if (count === 0) return null
  return count === 1
    ? "1 comment needs repositioning and wasn't included."
    : `${count} comments need repositioning and weren't included.`
}

// ─── Filename — the provenance carrier ──────────────────────────────────────

// Windows-reserved filename characters. This is a cross-platform superset
// rather than a macOS requirement: a slightly over-stripped name is a
// cosmetic cost, while an under-stripped one is a broken download or a
// header injection into Content-Disposition.
const RESERVED_FILENAME_CHARS = ['<', '>', ':', '"', '/', '\\', '|', '?', '*']
const MAX_FILENAME_TITLE_LENGTH = 80

function isHostileFilenameChar(char: string): boolean {
  return RESERVED_FILENAME_CHARS.includes(char) || char.charCodeAt(0) <= MAX_C0_CONTROL_CODE
}

/**
 * sanitizeFilenameTitle strips only what is genuinely hostile — the
 * Windows-reserved character set plus every C0 control character — and
 * replaces each with a single space rather than deleting it: deleting
 * would silently join two words, and the title is the only provenance
 * carrier this file has. Case, internal spaces, apostrophes, hyphens, and
 * accented or non-Latin characters are all preserved exactly.
 */
function sanitizeFilenameTitle(rawTitle: string): string {
  let out = ''
  for (const char of rawTitle) {
    out += isHostileFilenameChar(char) ? ' ' : char
  }
  const collapsed = out.replace(/\s+/g, ' ').trim().replace(/\.+$/, '')
  const capped = collapsed.slice(0, MAX_FILENAME_TITLE_LENGTH).trim()
  return capped.length > 0 ? capped : 'Untitled'
}

/**
 * exportFilename composes E-06's fixed shape exactly: the sanitised title,
 * space hyphen space, the version display, space hyphen space, the kind, a
 * dot, the extension. No format token is added even though two of the
 * three formats share the .csv extension — E-06 fixes this shape with two
 * literal examples, and changing a locked filename convention to avoid a
 * browser-dedupe nuisance is not a trade this phase gets to make.
 *
 * Only the title segment is sanitised. versionDisplay, kind and ext are
 * values this codebase generates, never user text.
 */
export function exportFilename(input: {
  workTitle: string
  versionDisplay: string
  kind: 'comments' | 'my-pins'
  ext: string
}): string {
  const title = sanitizeFilenameTitle(input.workTitle)
  return `${title} - ${input.versionDisplay} - ${input.kind}.${input.ext}`
}
