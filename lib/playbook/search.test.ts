import { searchPlaybookEntries, type SearchablePlaybookEntry } from '@/lib/playbook/search'

const entries: SearchablePlaybookEntry[] = [
  { id: '1', roomId: 'r1', roomKey: 'ae-sales', roomLabel: 'Account Executives', entryType: 'document', title: 'Client handoff doctrine', slug: 'handoff', content: { schemaVersion: 1, format: 'markdown', body: '## First 90 days\nBD remains joint owner during the transition.\n\n## Final handoff\nThe AE becomes the relationship owner.' }, revisionNumber: 2, publishedAt: '2026-09-08T00:00:00Z' },
  { id: '2', roomId: 'r2', roomKey: 'rights-legal', roomLabel: 'Rights', entryType: 'sop', title: 'Clearance', slug: 'clearance', content: { items: ['Confirm every writer', 'Resolve ownership conflicts'] }, revisionNumber: 1, publishedAt: '2026-09-07T00:00:00Z' },
]

describe('Playbook search', () => {
  it('returns section-level links and excerpts', () => {
    const result = searchPlaybookEntries(entries, 'relationship owner')
    expect(result[0]).toMatchObject({ entryId: '1', section: 'Final handoff', sectionId: 'final-handoff' })
    expect(result[0].excerpt).toContain('relationship owner')
  })

  it('searches structured SOP items', () => {
    expect(searchPlaybookEntries(entries, 'ownership conflicts')[0]).toMatchObject({ entryId: '2', section: 'Step 2' })
  })

  it('does not treat punctuation or regex syntax as executable input', () => {
    expect(() => searchPlaybookEntries(entries, '.* [a-z]')).not.toThrow()
    expect(searchPlaybookEntries(entries, 'x')).toEqual([])
  })
})
