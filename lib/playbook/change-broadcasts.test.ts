import {
  changeBroadcastAppliesToViewer,
  isChangeBroadcastSchemaMissing,
  sortChangeBroadcasts,
  type ChangeBroadcastItem,
} from '@/lib/playbook/change-broadcasts'

function item(overrides: Partial<ChangeBroadcastItem>): ChangeBroadcastItem {
  return {
    id: 'broadcast', entry_id: 'entry', room_id: 'room', revision_number: 2,
    headline: 'A change', change_summary: 'Changed.', why_it_matters: 'Important.', action_required: null,
    priority: 'standard', audience_kind: 'all_team', target_role: null, target_user_id: null,
    effective_at: '2026-09-08T12:00:00Z', reading_required: false, reading_due_at: null,
    published_by: 'publisher', published_at: '2026-09-08T12:00:00Z', entryTitle: 'Doctrine',
    entrySlug: 'doctrine', roomKey: 'company-wide', roomLabel: 'Company-wide', publisherName: 'Peter', isRead: false,
    ...overrides,
  }
}

describe('Playbook change broadcasts', () => {
  it('matches all-team, role, and individual audiences without widening them', () => {
    expect(changeBroadcastAppliesToViewer(item({}), 'viewer', ['ae'])).toBe(true)
    expect(changeBroadcastAppliesToViewer(item({ audience_kind: 'role', target_role: 'ae' }), 'viewer', ['ae'])).toBe(true)
    expect(changeBroadcastAppliesToViewer(item({ audience_kind: 'role', target_role: 'legal' }), 'viewer', ['ae'])).toBe(false)
    expect(changeBroadcastAppliesToViewer(item({ audience_kind: 'user', target_user_id: 'viewer' }), 'viewer', ['ae'])).toBe(true)
    expect(changeBroadcastAppliesToViewer(item({ audience_kind: 'user', target_user_id: 'other' }), 'viewer', ['ae'])).toBe(false)
  })

  it('keeps unread work first, then urgency, then recency', () => {
    const sorted = sortChangeBroadcasts([
      item({ id: 'read-urgent', isRead: true, priority: 'urgent' }),
      item({ id: 'standard', priority: 'standard', published_at: '2026-09-08T14:00:00Z' }),
      item({ id: 'urgent', priority: 'urgent', published_at: '2026-09-08T10:00:00Z' }),
      item({ id: 'important-new', priority: 'important', published_at: '2026-09-08T13:00:00Z' }),
      item({ id: 'important-old', priority: 'important', published_at: '2026-09-08T11:00:00Z' }),
    ])
    expect(sorted.map(value => value.id)).toEqual(['urgent', 'important-new', 'important-old', 'standard', 'read-urgent'])
  })

  it('recognizes missing-table errors without hiding unrelated failures', () => {
    expect(isChangeBroadcastSchemaMissing({ code: '42P01', message: 'relation missing' })).toBe(true)
    expect(isChangeBroadcastSchemaMissing({ code: 'PGRST205', message: 'cache miss' })).toBe(true)
    expect(isChangeBroadcastSchemaMissing({ code: '42501', message: 'permission denied' })).toBe(false)
  })
})
