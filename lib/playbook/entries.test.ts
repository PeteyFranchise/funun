import { resolveWrite, applyApproval, applyReject } from './entries'

// ─── lib/playbook/entries.ts — draft→publish transition logic (31.2-04 Task 1) ─
// Generalizes the Tips tip_draft→tip_approved flow (app/api/admin/tips/[itemKey]/route.ts)
// into playbook_entries' content/draft_content/status shape. These pure
// transition helpers are the tested surface — resolveWrite/applyApproval/
// applyReject never touch the DB, isApprover is always passed in
// pre-resolved (the ROUTE derives it server-side, never the client).

describe('resolveWrite', () => {
  it('publishes directly for an approver — content set, status published, no draft_content', () => {
    const result = resolveWrite({ isApprover: true, incoming: { body: 'Approved SOP text' } })

    expect(result).toEqual({ content: { body: 'Approved SOP text' }, status: 'published' })
    expect(result).not.toHaveProperty('draft_content')
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
})

describe('applyReject', () => {
  it('clears draft_content only — content/status are untouched by the caller', () => {
    const result = applyReject()

    expect(result).toEqual({ draft_content: null })
    expect(result).not.toHaveProperty('content')
    expect(result).not.toHaveProperty('status')
  })
})
