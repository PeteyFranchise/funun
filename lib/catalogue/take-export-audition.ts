// ─── Adobe Audition marker file — the Audition-only renderer ───────────────
// Deliberately its OWN module, isolated from lib/catalogue/take-export-formats.ts
// (the Audacity/CSV renderers, plan 40-02). E-12 permits this phase to ship
// without Audition at all: dropping this format later means deleting this
// one file and its one dispatch branch, nothing else. A shared time helper
// between this file and the Audacity renderer is exactly how a length gets
// confused for an end timestamp — see the paragraph on auditionDuration
// below — so this module imports nothing from that one, and that one
// imports nothing from here.
//
// The shape below is CONFIRMED by three independent, mutually-corroborating
// third-party sources (a forum thread quoting a literal exported header, and
// two separately-authored open-source parsers that both hard-code the same
// tab delimiter, column count and column order against real Audition
// exports) — see 40-RESEARCH.md, "Adobe Audition marker file — the phase's
// gating question". Nobody in this phase has run Audition itself, so several
// details below are recorded as INFERRED rather than observed, and each one
// is named here for plan 40-08's blocking human byte-level check.
//
// What is confirmed:
//   - The file extension is `.csv`, but the delimiter is a TAB. This is the
//     single most surprising fact about the format, confirmed three times
//     over by independent sources.
//   - There are six columns with a header row, in the order Name, Start,
//     Duration, Time Format, Type, Description.
//   - The Time Format column's value is the literal word `decimal`, and it
//     is REQUIRED — a user report attributes import errors to omitting it.
//     Despite that word, the Start and Duration values are NOT plain decimal
//     seconds — they are `M:SS.mmm` strings. Confusing this with Audacity's
//     genuinely-decimal seconds is the mistake an hour of familiarity with
//     that other format sets a reader up to make (this is Pitfall 1 in
//     40-RESEARCH.md).
//   - The third column is a LENGTH, not an end time. Getting this wrong
//     produces a file that imports successfully with every range marker at
//     the wrong length — a silent, plausible-looking corruption with no
//     error message anywhere (Pitfall 2). auditionDuration exists as its own
//     named function, below, specifically so this cannot be "simplified"
//     into a call to auditionTime(endMs) by a future reader being helpful.
//
// What is INFERRED, not observed, and named here so a future reader does not
// mistake it for confirmed:
//   - The `Type` value for a RANGE marker is INFERRED to be the same `Cue`
//     literal seen in every corroborating example — but every corroborating
//     example found in research was a point marker. Adobe's own
//     documentation says the only difference between the two marker kinds is
//     that range markers carry a duration, which is why `Cue` is used here
//     regardless of point or range, but this is INFERRED and plan 40-08's
//     procedure requires a range marker to be part of its diff.
//   - Line endings are INFERRED to be CRLF. Plan 40-08 is where this gets
//     settled against a real export.
//   - The encoding is INFERRED to be UTF-8. Plan 40-08 is where this gets
//     settled against a real export.
//   - The Description field is written as an empty sixth value, producing a
//     trailing tab rather than omitting the column. This is the safer of two
//     unobserved options: both real-world parsers found in research index
//     fields positionally, so an extra empty field is far less likely to
//     break parsing than a missing one.

import type { ExportMarker } from '@/lib/catalogue/take-export'

/** The header line, in the confirmed column order. Exported so a test can
 * assert it without re-typing the literal, and so a future reader has one
 * place to look for the column order. */
export const AUDITION_MARKER_HEADER = 'Name\tStart\tDuration\tTime Format\tType\tDescription'

/**
 * auditionTime formats a millisecond value as Audition's M:SS.mmm string:
 * whole minutes with no leading zero, a colon, seconds zero-padded to two
 * digits, a dot, milliseconds zero-padded to three digits. Minutes
 * accumulate past sixty rather than rolling into an hours field, because no
 * corroborating source shows an hours segment. A negative input clamps to
 * zero — a negative can never reach a column.
 */
export function auditionTime(ms: number): string {
  const clamped = Math.max(0, Math.round(ms))
  const minutes = Math.floor(clamped / 60000)
  const seconds = Math.floor((clamped % 60000) / 1000)
  const millis = clamped % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

/**
 * auditionDuration is a SEPARATE named function rather than a call site that
 * subtracts inline, on purpose: a named function is a thing a test can aim
 * at directly and a thing a reviewer can see, where an inline subtraction is
 * a thing that gets "simplified" into auditionTime(endMs) by someone being
 * helpful. Audition's Duration column is a LENGTH, not an end timestamp — a
 * point marker (endMs === null) has zero length; a range marker's length is
 * endMs minus startMs, formatted through auditionTime the same as any other
 * time value in this format.
 */
export function auditionDuration(startMs: number, endMs: number | null): string {
  if (endMs === null) return auditionTime(0)
  return auditionTime(endMs - startMs)
}

/**
 * renderAuditionMarkers writes the header line followed by one line per
 * marker, each line six tab-joined fields in the confirmed order: the
 * label, the start time, the duration (via auditionDuration, never the end
 * timestamp), the literal `decimal`, the literal `Cue`, and an empty
 * Description. Labels are neither sanitised, filtered nor re-ordered here —
 * both already happened in plan 40-01, upstream of every renderer. Lines are
 * joined with a carriage return and a line feed, and the file ends with the
 * same pair; an empty marker array renders the header line alone plus its
 * terminator.
 */
export function renderAuditionMarkers(markers: ExportMarker[]): string {
  const rows = markers.map(marker =>
    [
      marker.label,
      auditionTime(marker.startMs),
      auditionDuration(marker.startMs, marker.endMs),
      'decimal',
      'Cue',
      '',
    ].join('\t')
  )
  return [AUDITION_MARKER_HEADER, ...rows].join('\r\n') + '\r\n'
}
