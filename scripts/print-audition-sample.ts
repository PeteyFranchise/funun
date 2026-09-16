import { renderAuditionMarkers } from '@/lib/catalogue/take-export-audition'
import type { ExportMarker } from '@/lib/catalogue/take-export'

// A fixed, canonical three-marker list — two point markers and one range
// marker, with round, easily-reproducible times so a human can recreate
// them in Audition by hand without arithmetic. Plain ASCII labels only: an
// accented-character check belongs in plan 40-08's procedure, not baked
// into the default sample.
const SAMPLE_MARKERS: ExportMarker[] = [
  { label: 'Point marker one', startMs: 9000, endMs: null },
  { label: 'Point marker two', startMs: 90000, endMs: null },
  { label: 'Range marker', startMs: 72000, endMs: 78000 },
]

function formatMinutesSeconds(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function describeMarker(marker: ExportMarker): string {
  const start = formatMinutesSeconds(marker.startMs)
  if (marker.endMs === null) {
    return `  ${marker.label} — starts at ${start} (point)`
  }
  const end = formatMinutesSeconds(marker.endMs)
  const lengthSeconds = (marker.endMs - marker.startMs) / 1000
  return `  ${marker.label} — ${start} to ${end}, length ${lengthSeconds}s (range)`
}

function main(): void {
  // Everything a human needs to recreate this sample in Audition goes to
  // stderr. Standard out carries ONLY the file's bytes — this script's
  // entire purpose is to be redirected into a file and diffed byte for byte
  // against a real Audition export, and anything else printed to stdout
  // becomes a spurious difference in that diff.
  //
  // Run it with --silent: plain `npm run export:audition-sample` (no flag)
  // has npm itself print a "> funun@... export:audition-sample" preamble to
  // STDOUT before this script ever runs, on the npm version this repo uses —
  // that preamble is not this script's own output, but it would corrupt the
  // redirected file all the same. `npm run export:audition-sample --silent`
  // (or `npx tsx scripts/print-audition-sample.ts` directly) keeps stdout
  // exactly this script's bytes and nothing else.
  process.stderr.write(
    'Audition marker sample — build these three markers in Audition by hand, export the marker list, and diff the raw bytes against this script\'s stdout.\n\n'
  )
  process.stderr.write(
    'Redirect with: npm run export:audition-sample --silent > sample.csv\n' +
      '(plain "npm run" without --silent prints an npm banner into stdout and would corrupt the diff)\n\n'
  )
  for (const marker of SAMPLE_MARKERS) {
    process.stderr.write(`${describeMarker(marker)}\n`)
  }
  process.stderr.write(
    '\nThe range marker is six seconds long. Audition\'s Duration column for it should read six seconds (0:06.000).\n'
  )

  process.stdout.write(renderAuditionMarkers(SAMPLE_MARKERS))
}

main()
