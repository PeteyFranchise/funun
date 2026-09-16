import { AUDITION_MARKER_HEADER, auditionDuration, auditionTime, renderAuditionMarkers } from './take-export-audition'
import type { ExportMarker } from '@/lib/catalogue/take-export'
// Test-only cross-import. The two format modules must NOT import each other in
// production -- their independence is pinned by each plan's import count -- but
// the divergence between them is exactly what this test exists to prove, so the
// comparison belongs here and nowhere else.
import { renderAudacityLabels } from './take-export-formats'

describe('take export audition: auditionTime', () => {
  it('formats zero as 0:00.000', () => {
    expect(auditionTime(0)).toBe('0:00.000')
  })

  it('formats nine seconds as 0:09.000', () => {
    expect(auditionTime(9000)).toBe('0:09.000')
  })

  it('formats ninety seconds as 1:30.000', () => {
    expect(auditionTime(90000)).toBe('1:30.000')
  })

  it('formats seventy-two seconds as 1:12.000', () => {
    expect(auditionTime(72000)).toBe('1:12.000')
  })

  it('accumulates minutes past sixty rather than rolling into an hours field', () => {
    expect(auditionTime(3661500)).toBe('61:01.500')
  })

  it('clamps a negative input to zero — a negative can never reach a column', () => {
    expect(auditionTime(-5)).toBe('0:00.000')
  })
})

describe('take export audition: auditionDuration is a length, never an end timestamp', () => {
  it('returns the SIX-SECOND length for a 72000ms-to-78000ms range, not the end timestamp', () => {
    expect(auditionDuration(72000, 78000)).toBe('0:06.000')
  })

  it('returns zero length for a point marker (endMs null)', () => {
    expect(auditionDuration(72000, null)).toBe('0:00.000')
  })

  // This is the named negative test the plan requires: the end timestamp is
  // the exact wrong answer, and it is the one every other format in this
  // phase would give. A file containing 1:18.000 in this column for this
  // input imports successfully, with the range marker at the wrong length,
  // and nothing anywhere reports an error.
  it('does NOT return the end timestamp 1:18.000 for a 72000ms-to-78000ms range — that is the duration trap', () => {
    const result = auditionDuration(72000, 78000)
    expect(result).not.toBe('1:18.000')
    expect(result).toBe('0:06.000')
  })
})

describe('take export audition: AUDITION_MARKER_HEADER', () => {
  it('is exactly the six confirmed column names, tab-joined', () => {
    expect(AUDITION_MARKER_HEADER).toBe('Name\tStart\tDuration\tTime Format\tType\tDescription')
  })
})

describe('take export audition: renderAuditionMarkers', () => {
  it('renders the header line alone, plus its CRLF terminator, for an empty array', () => {
    expect(renderAuditionMarkers([])).toBe('Name\tStart\tDuration\tTime Format\tType\tDescription\r\n')
  })

  it('renders a point marker at 90000ms as a zero-duration Cue row', () => {
    const markers: ExportMarker[] = [{ label: 'Pin 1:30', startMs: 90000, endMs: null }]
    expect(renderAuditionMarkers(markers)).toBe(
      'Name\tStart\tDuration\tTime Format\tType\tDescription\r\n' + 'Pin 1:30\t1:30.000\t0:00.000\tdecimal\tCue\t\r\n'
    )
  })

  it('renders a range marker from 72000ms to 78000ms with a six-second Duration, not an end timestamp', () => {
    const markers: ExportMarker[] = [
      { label: 'Maya Okonkwo: lower the guitars', startMs: 72000, endMs: 78000 },
    ]
    expect(renderAuditionMarkers(markers)).toBe(
      'Name\tStart\tDuration\tTime Format\tType\tDescription\r\n' +
        'Maya Okonkwo: lower the guitars\t1:12.000\t0:06.000\tdecimal\tCue\t\r\n'
    )
  })

  it('gives every row — point and range alike — exactly five tab characters', () => {
    const markers: ExportMarker[] = [
      { label: 'Pin 1:30', startMs: 90000, endMs: null },
      { label: 'Maya Okonkwo: lower the guitars', startMs: 72000, endMs: 78000 },
    ]
    const lines = renderAuditionMarkers(markers).split('\r\n').filter(line => line.length > 0)
    const rows = lines.slice(1) // drop the header line
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.split('\t')).toHaveLength(6)
      expect((row.match(/\t/g) ?? []).length).toBe(5)
    }
  })

  it('writes the literal decimal in the fourth field and the literal Cue in the fifth field for every row', () => {
    const markers: ExportMarker[] = [
      { label: 'Pin 1:30', startMs: 90000, endMs: null },
      { label: 'Maya Okonkwo: lower the guitars', startMs: 72000, endMs: 78000 },
    ]
    const rows = renderAuditionMarkers(markers).split('\r\n').filter(line => line.length > 0).slice(1)
    for (const row of rows) {
      const fields = row.split('\t')
      expect(fields[3]).toBe('decimal')
      expect(fields[4]).toBe('Cue')
    }
  })

  it('does not sanitise, filter or re-order markers — that already happened upstream in plan 40-01', () => {
    const markers: ExportMarker[] = [
      { label: 'Second', startMs: 5000, endMs: null },
      { label: 'First', startMs: 1000, endMs: null },
    ]
    const rows = renderAuditionMarkers(markers).split('\r\n').filter(line => line.length > 0).slice(1)
    expect(rows[0].startsWith('Second\t')).toBe(true)
    expect(rows[1].startsWith('First\t')).toBe(true)
  })
})

describe('take export audition: cross-format divergence — Audacity and Audition disagree on purpose', () => {
  // Plan 40-02 (lib/catalogue/take-export-formats.ts, renderAudacityLabels)
  // executes in a separate, parallel worktree for this wave and has not
  // merged into this worktree yet, so a live cross-module import is not
  // resolvable from here. The Audacity value below is not a guess: it is a
  // literal transcription of 40-02-PLAN.md's own pinned behavior contract
  // for this exact input (a range marker from 72000ms to 78000ms renders an
  // end column of `78.000000` — the absolute end timestamp in seconds to six
  // decimal places). That contract is enforced by plan 40-02's own
  // acceptance criteria independently of this test.
  it('produces a different second-time-value than Audacity for the same 72000ms-78000ms range, and both are correct for their own format', () => {
    const markers: ExportMarker[] = [
      { label: 'Maya Okonkwo: lower the guitars', startMs: 72000, endMs: 78000 },
    ]

    const auditionRow = renderAuditionMarkers(markers).split('\r\n')[1]
    const auditionDurationField = auditionRow.split('\t')[2]

    // Live output from the Audacity renderer, not a literal transcribed from a
    // plan document. That distinction is the whole point: a transcription only
    // proves someone copied a number correctly once, whereas this fails if
    // EITHER module ever drifts toward the other's meaning.
    const audacityEndField = renderAudacityLabels(markers).split('\n')[0].split('\t')[1]

    // Audacity's second column is an END TIMESTAMP: 78s.
    expect(audacityEndField).toBe('78.000000')
    // Audition's is a DURATION: 78s - 72s = 6s.
    expect(auditionDurationField).toBe('0:06.000')
    // The claim that matters. If Audition ever emitted the end timestamp
    // instead, the file would still import cleanly and every range marker
    // would land in the wrong place.
    expect(auditionDurationField).not.toBe(audacityEndField)
  })
})
