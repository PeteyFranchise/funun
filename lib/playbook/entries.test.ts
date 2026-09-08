import { resolveWrite, applyApproval, applyReject, mergeVisibleEntries, type PlaybookEntryRow } from './entries'

// ─── lib/playbook/entries.ts — draft→publish transition logic (31.2-04 Task 1) ─
// Generalizes the Tips tip_draft→tip_approved flow (app/api/admin/tips/[itemKey]/route.ts)
// into playbook_entries' content/draft_content/status shape. These pure
// transition helpers are the tested surface — resolveWrite/applyApproval/
// applyReject never touch the DB, isApprover is always passed in
// pre-resolved (the ROUTE derives it server-side, never the client).

describe('resolveWrite', () => {
  it('publishes directly for an approver — content set, status published, no draft_content', () => {
    const result = resolveWrite({ isApprover: true, incoming: { body: 'Approved SOP text' } })

    expect(result).toEqual({ content: { body: 'Approved SOP text' }, draft_content: null, status: 'published' })
  })

  it('drafts for a non-approver — draft_content set, status draft_pending, content untouched', () => {
    const result = resolveWrite({ isApprover: false, incoming: { body: 'Draft SOP text' } })

    expect(result).toEqual({ draft_content: { body: 'Draft SOP text' }, status: 'draft_pending' })
    expect(result).not.toHaveProperty('content')
  })

  it('a non-approver cannot self-publish by any means — status is always draft_pending', () => {
    const result = resolveWrite({ isApprover: false, incoming: { body: 'x' } })
    expect(result.status).toBe('draft_pending')
  })

  it('keeps existing published content live while a revision waits for approval', () => {
    const result = resolveWrite({
      isApprover: false,
      incoming: { body: 'Proposed revision' },
      currentStatus: 'published',
    })

    expect(result).toEqual({ draft_content: { body: 'Proposed revision' }, status: 'published' })
    expect(result).not.toHaveProperty('content')
  })

  it('lets an approver explicitly save a draft without publishing it', () => {
    const result = resolveWrite({
      isApprover: true,
      incoming: { body: 'Work in progress' },
      publishRequested: false,
      currentStatus: 'published',
    })

    expect(result).toEqual({ draft_content: { body: 'Work in progress' }, status: 'published' })
  })
})

describe('applyApproval', () => {
  it('promotes draft_content to content, clears draft_content, sets status published', () => {
    const result = applyApproval({ draft_content: { body: 'Pending text' } })

    expect(result).toEqual({
      content: { body: 'Pending text' },
      draft_content: null,
      status: 'published',
    })
  })

  it('refuses to publish an empty placeholder when no draft exists', () => {
    expect(() => applyApproval({ draft_content: null })).toThrow('Entry has no pending draft to approve')
  })
})

describe('applyReject', () => {
  it('clears a proposed revision without unpublishing the live entry', () => {
    const result = applyReject()

    expect(result).toEqual({ draft_content: null })
    expect(result).not.toHaveProperty('content')
    expect(result).not.toHaveProperty('status')
  })

  it('archives a rejected never-published draft', () => {
    expect(applyReject('draft_pending')).toEqual({ draft_content: null, status: 'archived' })
  })
})

describe('mergeVisibleEntries', () => {
  const publishedRow: PlaybookEntryRow = {
    id: 'entry-1',
    room_id: 'room-1',
    sub_group_id: null,
    entry_type: 'document',
    title: 'Doctrine',
    content: { schemaVersion: 1, format: 'markdown', body: 'Published' },
    draft_content: { schemaVersion: 1, format: 'markdown', body: 'Confidential draft' },
    draft_author_id: 'author-1',
    draft_updated_at: '2026-09-07T00:00:00.000Z',
    draft_version: 3,
    status: 'published',
    author_id: 'author-1',
    approved_by: null,
    created_at: '2026-09-07T00:00:00.000Z',
    updated_at: '2026-09-07T00:00:00.000Z',
  }

  it('does not leak a pending revision through the service-role published query', () => {
    const [result] = mergeVisibleEntries([publishedRow], [])

    expect(result.content).toEqual(publishedRow.content)
    expect(result.draft_content).toBeNull()
    expect(result.draft_author_id).toBeNull()
    expect(result.draft_version).toBe(0)
  })

  it('restores a draft only when the scoped draft query returned it', () => {
    const [result] = mergeVisibleEntries([publishedRow], [publishedRow])

    expect(result.draft_content).toEqual(publishedRow.draft_content)
    expect(result.draft_author_id).toBe('author-1')
    expect(result.draft_version).toBe(3)
  })
})
