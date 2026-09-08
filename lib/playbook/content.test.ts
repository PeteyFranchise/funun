import {
  PLAYBOOK_LIST_ITEMS_MAX,
  documentContent,
  readDocumentBody,
  safeParsePlaybookContent,
  slugifyPlaybookTitle,
} from '@/lib/playbook/content'

describe('Playbook content schemas', () => {
  it('accepts the existing SOP and Topic shapes', () => {
    expect(safeParsePlaybookContent('sop', { items: ['One', 'Two'] }).success).toBe(true)
    expect(safeParsePlaybookContent('topic', { questions: ['What changed?'] }).success).toBe(true)
  })

  it('accepts a versioned Markdown document', () => {
    const content = documentContent('# Doctrine\n\nA paragraph.')
    expect(safeParsePlaybookContent('document', content).success).toBe(true)
    expect(readDocumentBody(content)).toBe('# Doctrine\n\nA paragraph.')
  })

  it('rejects arbitrary content and oversized lists', () => {
    expect(safeParsePlaybookContent('document', { body: '# Missing version' }).success).toBe(false)
    expect(
      safeParsePlaybookContent('sop', {
        items: Array.from({ length: PLAYBOOK_LIST_ITEMS_MAX + 1 }, (_, i) => `Item ${i}`),
      }).success,
    ).toBe(false)
  })

  it('creates stable URL-safe slugs', () => {
    expect(slugifyPlaybookTitle('A&R — Purpose & Authority')).toBe('a-r-purpose-authority')
    expect(slugifyPlaybookTitle('   ')).toBe('document')
  })
})
