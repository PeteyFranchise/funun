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
