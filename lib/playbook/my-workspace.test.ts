import { myPlaybookSections, reviewTiming, type MyPlaybookEntry } from '@/lib/playbook/my-workspace'

function entry(overrides: Partial<MyPlaybookEntry>): MyPlaybookEntry {
  return {
    id: 'entry', room_id: 'room', sub_group_id: null, entry_type: 'document', title: 'Entry', slug: 'entry',
    status: 'published', author_id: 'author', draft_author_id: null, draft_updated_at: null, owner_id: null,
    review_due_at: null, updated_at: '2026-09-01T00:00:00Z', published_at: '2026-09-01T00:00:00Z', revision_number: 1,
    ...overrides,
  }
}

describe('My Playbook workspace classification', () => {
  it('collects only the viewer’s active drafts and owned reviews', () => {
    const sections = myPlaybookSections([
      entry({ id: 'mine', draft_author_id: 'viewer', draft_updated_at: '2026-09-03T00:00:00Z' }),
      entry({ id: 'theirs', draft_author_id: 'someone-else' }),
      entry({ id: 'owned', owner_id: 'viewer', review_due_at: '2026-09-30T00:00:00Z' }),
      entry({ id: 'retired', status: 'archived', draft_author_id: 'viewer', owner_id: 'viewer' }),
    ], 'viewer')

    expect(sections.drafts.map(item => item.id)).toEqual(['mine'])
    expect(sections.reviews.map(item => item.id)).toEqual(['owned'])
    expect(sections.recent.map(item => item.id)).not.toContain('retired')
  })

  it('limits recent publications while preserving the still-live version of a pending revision', () => {
    const entries = Array.from({ length: 14 }, (_, index) => entry({
      id: String(index),
      draft_author_id: index === 0 ? 'viewer' : null,
      published_at: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    }))
    const sections = myPlaybookSections(entries, 'viewer')

    expect(sections.recent).toHaveLength(12)
    expect(sections.recent[0].id).toBe('13')
  })

  it('classifies review timing without turning future work into an alert', () => {
    const now = new Date('2026-09-08T12:00:00Z')
    expect(reviewTiming('2026-09-07T12:00:00Z', now)).toBe('overdue')
    expect(reviewTiming('2026-09-20T12:00:00Z', now)).toBe('soon')
    expect(reviewTiming('2027-01-01T12:00:00Z', now)).toBe('scheduled')
    expect(reviewTiming(null, now)).toBe('unscheduled')
  })
})
