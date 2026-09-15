import { csvCell } from './export'

// This CSV is built to be SENT to distributors, so "someone else opens it in a
// spreadsheet" is the feature's purpose, not an edge case. Track titles, artist
// names, composer names and contact fields are all free text any account holder
// controls, and all of them reach csvCell.
describe('csvCell — CSV injection', () => {
  it('neutralises every character a spreadsheet treats as a formula start', () => {
    expect(csvCell('=HYPERLINK("http://evil","click")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""click"")"'
    )
    expect(csvCell('+1234')).toBe("'+1234")
    expect(csvCell('-Untitled-')).toBe("'-Untitled-")
    expect(csvCell('@SUM(A1:A9)')).toBe("'@SUM(A1:A9)")
  })

  // Testing only s[0] would miss these: a spreadsheet still parses the formula
  // when whitespace or a control character precedes it.
  it('sees through leading whitespace and control characters', () => {
    expect(csvCell('\t=1+1')).toBe('\'\t=1+1')
    expect(csvCell(' =1+1')).toBe("' =1+1")
    expect(csvCell('\r=1+1')).toBe('\'\r=1+1')
  })

  it('leaves ordinary values byte-identical', () => {
    expect(csvCell('Midnight Train')).toBe('Midnight Train')
    expect(csvCell('USRC17607839')).toBe('USRC17607839')
    expect(csvCell(120)).toBe('120')
    expect(csvCell('℗ 2026 Funun')).toBe('℗ 2026 Funun')
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  // The guard must not break the quoting that was already correct.
  it('still applies RFC4180 quoting, and composes with the guard', () => {
    expect(csvCell('Smith, John')).toBe('"Smith, John"')
    expect(csvCell('She said "hi"')).toBe('"She said ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
    // Both rules at once: formula lead AND a comma needing quotes.
    expect(csvCell('=A1,B1')).toBe('"\'=A1,B1"')
  })

  // A prefix that itself needed escaping would corrupt the cell.
  it('does not double-prefix an already-quoted apostrophe value', () => {
    expect(csvCell("'=already")).toBe("'=already")
  })
})
