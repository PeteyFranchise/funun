import { compareMarkdownLines } from './diff'

describe('compareMarkdownLines', () => {
  it('preserves shared context and aligns the changed middle', () => {
    expect(compareMarkdownLines('# Policy\nOld rule\nFooter', '# Policy\nNew rule\nAdded detail\nFooter')).toEqual([
      {
        left: { line: 1, text: '# Policy' },
        right: { line: 1, text: '# Policy' },
        kind: 'unchanged',
      },
      {
        left: { line: 2, text: 'Old rule' },
        right: { line: 2, text: 'New rule' },
        kind: 'changed',
      },
      {
        left: null,
        right: { line: 3, text: 'Added detail' },
        kind: 'changed',
      },
      {
        left: { line: 3, text: 'Footer' },
        right: { line: 4, text: 'Footer' },
        kind: 'unchanged',
      },
    ])
  })

  it('handles empty and identical documents without throwing', () => {
    expect(compareMarkdownLines('', '')).toHaveLength(1)
    expect(compareMarkdownLines('', 'New')[0].kind).toBe('changed')
  })
})
