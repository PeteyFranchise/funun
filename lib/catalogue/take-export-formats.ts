// ─── DAW marker export — Audacity and CSV renderers ─────────────────────────
// This module holds the two output formats research could verify against a
// primary source: the Audacity label track and a generic CSV. Both take the
// same ExportMarker[] shape from lib/catalogue/take-export.ts and produce a
// whole file as a string — nothing more.
//
// Audacity label track (renderAudacityLabels):
//   - File extension: .txt, NOT .csv — this is not a comma-separated format.
//   - Delimiter: a tab character. There is no escape mechanism for a tab or a
//     newline inside a label, unlike RFC4180 CSV, so a delimiter accidentally
//     left in a label would silently forge a phantom column or split one
//     marker into two.
//   - Exactly three columns, in this fixed order: start, end, label.
//   - No header row. The format is strictly line-based — every line is a
//     marker — so a header line would import as a garbage label sitting at
//     time zero rather than being recognised as column names.
//   - Encoding: UTF-8, no byte-order mark. The manual warns that a non-UTF-8
//     file containing accented or non-Latin characters may fail to import
//     entirely, and display names in this file are free text.
//   - Source: Audacity's own manual, "Importing and Exporting Labels"
//     (manual.audacityteam.org/man/importing_and_exporting_labels.html).
//
// Generic CSV (renderMarkerCsv):
//   - Answers to no external application — "correct" means it opens cleanly
//     and reads clearly in Excel, Numbers or Google Sheets.
//   - RFC4180 quoting only, via a module-private csvField copied from (not
//     imported from) lib/metadata/export.ts's csvCell — see the comment
//     directly above csvField for why the two are deliberately not shared.
//
// This file decides no marker content — that decision lives entirely in
// lib/catalogue/take-export.ts (label composition, sanitisation, filtering,
// ordering). It also imports nothing from the Audition renderer and shares no
// time helper with it: Audacity's second column is an END TIMESTAMP,
// Audition's is a DURATION, and those are different numbers for the same
// marker. A shared time helper between the two would silently corrupt every
// Audition range marker.

import type { ExportMarker } from '@/lib/catalogue/take-export'
import { formatTrackTimestamp } from '@/lib/catalogue/version-comments'

// ─── Audacity label track ────────────────────────────────────────────────

/**
 * renderAudacityLabels produces a whole Audacity label-track file from a
 * marker list. Each line is the start in seconds, a tab, the end in seconds,
 * a tab, then the label — six decimal places on every time value, which is
 * what the manual shows and what keeps millisecond-precision inputs lossless
 * through the ms-to-seconds conversion.
 *
 * A point marker (endMs === null) writes the START value again in the end
 * column. This repetition is the format's own convention, not a workaround:
 * the manual's own example of a point label at 3.4 seconds shows the same
 * value in both columns.
 *
 * The label is written through untouched. Plan 40-01's sanitizeMarkerLabel
 * already collapsed every tab and newline in it before this function ever
 * sees it, and sanitising a second time here invites the two implementations
 * to disagree later. Markers are neither filtered, sorted nor re-ordered
 * here either — they arrive ordered from classification.
 *
 * An empty array returns the empty string. The export routes never call this
 * with an empty list — classification refuses first — but a renderer that
 * returns a lone newline for an empty list is a renderer that writes an
 * empty label at time zero the day someone removes that guard.
 */
export function renderAudacityLabels(markers: ExportMarker[]): string {
  if (markers.length === 0) return ''
  return (
    markers
      .map(marker => {
        const startSeconds = (marker.startMs / 1000).toFixed(6)
        const endMs = marker.endMs ?? marker.startMs
        const endSeconds = (endMs / 1000).toFixed(6)
        return `${startSeconds}\t${endSeconds}\t${marker.label}`
      })
      .join('\n') + '\n'
  )
}

// ─── Generic CSV ─────────────────────────────────────────────────────────

// csvField implements the same RFC4180 quoting rule as csvCell in
// lib/metadata/export.ts: wrap a value in double quotes and double any
// embedded double quote when it contains a comma, a double quote or a
// newline; otherwise return it unchanged. This is a deliberate COPY of the
// rule rather than an import of csvCell itself — the two exporters must be
// free to diverge, because this one writes creative notes for a human and
// csvCell writes distributor-bound release metadata, and coupling them means
// a change made for one silently changes the bytes of the other. The
// equivalence test in take-export-formats.test.ts is what keeps this copy
// honest: it imports csvCell IN THE TEST ONLY and asserts the two agree
// across a table of RFC4180 cases.
//
// Unlike csvCell, csvField has no formula-injection guard. That protection
// already happened upstream, once, in sanitizeMarkerLabel — duplicating it
// here would risk the two guards disagreeing on which characters trigger it.
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * renderMarkerCsv produces a whole generic-CSV file from a marker list:
 * three columns — Start, End, Marker — with a column-name header row.
 *
 * This header is NOT the in-file provenance header E-06 rules out. E-06
 * rejects a line stating which take and version the file belongs to, so that
 * a rename cannot be papered over and a strict parser cannot be broken. A
 * column-name row carries no take-identifying information at all, and a
 * spreadsheet without one is unreadable.
 *
 * The Marker cell holds the whole composed label — author name and any
 * carried-version prefix included — rather than splitting those into their
 * own columns. E-13 makes the three export formats a choice of DAW, not a
 * choice of how much data you get; a CSV carrying more fields than the label
 * formats would be a second content contract to maintain.
 *
 * Times render through formatTrackTimestamp — human-readable minutes and
 * seconds, not raw milliseconds, because that is what a person opening this
 * in a spreadsheet can act on. The End cell is EMPTY for a point marker:
 * Audacity's strict format has a structural reason to repeat the start, but
 * a CSV does not, and an empty cell reads more honestly as "this is not a
 * range." Only the Marker cell passes through csvField — the two time cells
 * are generated by this codebase and contain no delimiter.
 */
export function renderMarkerCsv(markers: ExportMarker[]): string {
  const header = 'Start,End,Marker'
  const rows = markers.map(marker => {
    const start = formatTrackTimestamp(marker.startMs)
    const end = marker.endMs === null ? '' : formatTrackTimestamp(marker.endMs)
    return `${start},${end},${csvField(marker.label)}`
  })
  return [header, ...rows].join('\n') + '\n'
}
