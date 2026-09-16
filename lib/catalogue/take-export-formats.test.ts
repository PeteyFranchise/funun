import { renderAudacityLabels, renderMarkerCsv } from './take-export-formats'
import { csvCell } from '@/lib/metadata/export'
import type { ExportMarker } from '@/lib/catalogue/take-export'

function marker(overrides: Partial<ExportMarker> = {}): ExportMarker {
  return {
    label: 'Maya Okonkwo: bring the bass up here',
    startMs: 9000,
    endMs: null,
    ...overrides,
  }
}

describe('renderAudacityLabels', () => {
  it('renders a point marker with the start value repeated in the end column', () => {
    const markers: ExportMarker[] = [marker({ startMs: 3400, endMs: null, label: 'Pin 0:03' })]
    expect(renderAudacityLabels(markers)).toBe('3.400000\t3.400000\tPin 0:03\n')
  })

  it('renders a range marker with distinct start and end columns', () => {
    const markers: ExportMarker[] = [
      marker({ startMs: 72000, endMs: 78000, label: 'Maya Okonkwo: lower the guitars' }),
    ]
    expect(renderAudacityLabels(markers)).toBe(
      '72.000000\t78.000000\tMaya Okonkwo: lower the guitars\n'
    )
  })

  it('renders a marker at 0ms as exactly 0.000000 in the start column', () => {
    const markers: ExportMarker[] = [marker({ startMs: 0, endMs: null, label: 'Pin 0:00' })]
    expect(renderAudacityLabels(markers)).toBe('0.000000\t0.000000\tPin 0:00\n')
  })

  it('renders a marker at 1ms as 0.001000 — millisecond precision survives', () => {
    const markers: ExportMarker[] = [marker({ startMs: 1, endMs: null, label: 'Pin 0:00' })]
    expect(renderAudacityLabels(markers)).toBe('0.001000\t0.001000\tPin 0:00\n')
  })

  it('renders a marker at 3661500ms as 3661.500000 — seconds throughout, never minutes past an hour', () => {
    const markers: ExportMarker[] = [marker({ startMs: 3661500, endMs: null, label: 'Pin 1:01:01' })]
    expect(renderAudacityLabels(markers)).toBe('3661.500000\t3661.500000\tPin 1:01:01\n')
  })

  it('renders three markers as three lines, each ending in a newline, no header, no blank line', () => {
    const markers: ExportMarker[] = [
      marker({ startMs: 0, endMs: null, label: 'Pin 0:00' }),
      marker({ startMs: 9000, endMs: null, label: 'Maya Okonkwo: bring the bass up here' }),
      marker({ startMs: 72000, endMs: 78000, label: 'Maya Okonkwo: lower the guitars' }),
    ]
    expect(renderAudacityLabels(markers)).toBe(
      '0.000000\t0.000000\tPin 0:00\n' +
        '9.000000\t9.000000\tMaya Okonkwo: bring the bass up here\n' +
        '72.000000\t78.000000\tMaya Okonkwo: lower the guitars\n'
    )
  })

  it('renders an empty marker array as the empty string', () => {
    expect(renderAudacityLabels([])).toBe('')
  })

  it('writes exactly two tab characters per line — three fields, never four', () => {
    const markers: ExportMarker[] = [
      marker({ startMs: 3400, endMs: null, label: 'Pin 0:03' }),
      marker({ startMs: 72000, endMs: 78000, label: 'Maya Okonkwo: lower the guitars' }),
    ]
    const lines = renderAudacityLabels(markers).split('\n').filter(line => line.length > 0)
    expect(lines).toHaveLength(2)
    for (const line of lines) {
      expect(line.split('\t')).toHaveLength(3)
    }
  })

  it('does not sanitise or re-order the label — that already happened upstream', () => {
    const markers: ExportMarker[] = [
      marker({ startMs: 5000, endMs: null, label: "'=already sanitised" }),
    ]
    expect(renderAudacityLabels(markers)).toBe("5.000000\t5.000000\t'=already sanitised\n")
  })
})

describe('renderMarkerCsv', () => {
  it('renders an empty marker array as exactly the header row', () => {
    expect(renderMarkerCsv([])).toBe('Start,End,Marker\n')
  })

  it('renders a point marker with an empty End cell, not a repeat of Start', () => {
    const markers: ExportMarker[] = [
      marker({ startMs: 9000, endMs: null, label: 'Maya Okonkwo: bring the bass up here' }),
    ]
    expect(renderMarkerCsv(markers)).toBe(
      'Start,End,Marker\n0:09,,Maya Okonkwo: bring the bass up here\n'
    )
  })

  it('renders a range marker with distinct minutes:seconds Start and End cells', () => {
    const markers: ExportMarker[] = [
      marker({ startMs: 72000, endMs: 78000, label: 'Maya Okonkwo: lower the guitars' }),
    ]
    const [, dataLine] = renderMarkerCsv(markers).split('\n')
    const [start, end] = dataLine.split(',')
    expect(start).toBe('1:12')
    expect(end).toBe('1:18')
  })

  it('switches to an hours:minutes:seconds Start cell past an hour', () => {
    const markers: ExportMarker[] = [marker({ startMs: 3661500, endMs: null, label: 'Pin 1:01:01' })]
    const [, dataLine] = renderMarkerCsv(markers).split('\n')
    const [start] = dataLine.split(',')
    expect(start).toBe('1:01:01')
  })

  it('wraps a label containing a comma in double quotes', () => {
    const markers: ExportMarker[] = [
      marker({ startMs: 9000, endMs: null, label: 'Maya: bring the bass, please' }),
    ]
    expect(renderMarkerCsv(markers)).toBe(
      'Start,End,Marker\n0:09,,"Maya: bring the bass, please"\n'
    )
  })

  it('wraps a label containing a double quote in double quotes with the quote doubled', () => {
    const markers: ExportMarker[] = [
      marker({ startMs: 9000, endMs: null, label: 'Maya: the "hook" needs work' }),
    ]
    expect(renderMarkerCsv(markers)).toBe(
      'Start,End,Marker\n0:09,,"Maya: the ""hook"" needs work"\n'
    )
  })

  it('leaves a label containing neither a comma nor a quote unquoted', () => {
    const markers: ExportMarker[] = [
      marker({ startMs: 9000, endMs: null, label: 'Maya: bring the bass up here' }),
    ]
    expect(renderMarkerCsv(markers)).toBe(
      'Start,End,Marker\n0:09,,Maya: bring the bass up here\n'
    )
  })

  it('renders a plan-40-01 apostrophe-prefixed label intact, without a second guard', () => {
    const markers: ExportMarker[] = [marker({ startMs: 9000, endMs: null, label: "'=1+1" })]
    expect(renderMarkerCsv(markers)).toBe('Start,End,Marker\n0:09,,\'=1+1\n')
  })

  it.each([
    ['plain text', 'plain text'],
    ['a value with a comma, right here', 'a value with a comma, right here'],
    ['a value with a "quote"', 'a value with a "quote"'],
    ['a value with a "quote", and a comma', 'a value with a "quote", and a comma'],
    ['a value with\na newline', 'a value with\na newline'],
    ['', ''],
  ])('csvField agrees with csvCell on quoting for: %s', input => {
    // This equivalence is deliberately about QUOTING only. The formula guard
    // lives upstream in sanitizeMarkerLabel and is expected in neither
    // csvField nor csvCell for this comparison — none of these inputs begin
    // with a formula-lead character, so csvCell's additional guard never
    // fires and the two functions' outputs are directly comparable.
    const [, dataLine] = renderMarkerCsv([marker({ startMs: 0, endMs: null, label: input })]).split(
      '\n'
    )
    const csvFieldOutput = dataLine.slice('0:00,,'.length)
    expect(csvFieldOutput).toBe(csvCell(input))
  })
})
