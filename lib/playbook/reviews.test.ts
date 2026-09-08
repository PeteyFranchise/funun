import {
  canAddressReview,
  canReplyToReview,
  canResubmitReview,
  isReviewSchemaMissing,
  isValidReviewAnchor,
  reviewAnchors,
} from '@/lib/playbook/reviews'

describe('reviewAnchors', () => {
  it('creates stable heading anchors for documents', () => {
    expect(reviewAnchors('document', { schemaVersion: 1, format: 'markdown', body: '# Opening\n\nText\n\n## Decisions' })).toEqual([
      { kind: 'overall', index: null, label: null },
      { kind: 'heading', index: 0, label: 'Opening' },
      { kind: 'heading', index: 1, label: 'Decisions' },
    ])
  })

  it('creates zero-based anchors for checklist items and questions', () => {
    expect(reviewAnchors('sop', { items: ['First', '', 'Third'] })).toEqual([
      { kind: 'overall', index: null, label: null },
      { kind: 'list_item', index: 0, label: 'First' },
      { kind: 'list_item', index: 2, label: 'Third' },
    ])
  })

  it('rejects an anchor whose exact label no longer matches', () => {
    const anchors = reviewAnchors('topic', { questions: ['What changed?'] })
    expect(isValidReviewAnchor({ kind: 'list_item', index: 0, label: 'What changed?' }, anchors)).toBe(true)
    expect(isValidReviewAnchor({ kind: 'list_item', index: 0, label: 'Old wording' }, anchors)).toBe(false)
  })
})

describe('review authorization helpers', () => {
  const base = {
    viewerId: 'viewer',
    isApprover: false,
    entryAuthorId: 'author',
    draftAuthorId: 'drafter',
    threadCreatorId: 'reviewer',
    mentionedUserIds: ['mentioned'],
  }

  it('admits approvers, authors, thread creators, and mentioned participants', () => {
    expect(canReplyToReview({ ...base, isApprover: true })).toBe(true)
    expect(canReplyToReview({ ...base, viewerId: 'author' })).toBe(true)
    expect(canReplyToReview({ ...base, viewerId: 'drafter' })).toBe(true)
    expect(canReplyToReview({ ...base, viewerId: 'reviewer' })).toBe(true)
    expect(canReplyToReview({ ...base, viewerId: 'mentioned' })).toBe(true)
  })

  it('rejects a room viewer who is not a review participant', () => {
    expect(canReplyToReview(base)).toBe(false)
  })

  it('lets only the entry author address an open requested change', () => {
    expect(canAddressReview({ viewerId: 'author', entryAuthorId: 'author', draftAuthorId: null, feedbackKind: 'requested_change', status: 'open' })).toBe(true)
    expect(canAddressReview({ viewerId: 'reviewer', entryAuthorId: 'author', draftAuthorId: null, feedbackKind: 'requested_change', status: 'open' })).toBe(false)
    expect(canAddressReview({ viewerId: 'author', entryAuthorId: 'author', draftAuthorId: null, feedbackKind: 'suggestion', status: 'open' })).toBe(false)
  })

  it('requires a newer draft and no open requested changes before resubmission', () => {
    expect(canResubmitReview({ currentDraftVersion: 4, previousDraftVersion: 3, requestedThreadStatuses: ['addressed', 'resolved'] })).toBe(true)
    expect(canResubmitReview({ currentDraftVersion: 3, previousDraftVersion: 3, requestedThreadStatuses: ['addressed'] })).toBe(false)
    expect(canResubmitReview({ currentDraftVersion: 4, previousDraftVersion: 3, requestedThreadStatuses: ['open', 'addressed'] })).toBe(false)
    expect(canResubmitReview({ currentDraftVersion: 4, previousDraftVersion: 3, requestedThreadStatuses: [] })).toBe(true)
  })

  it('recognizes missing-table errors without masking unrelated failures', () => {
    expect(isReviewSchemaMissing({ code: '42P01' })).toBe(true)
    expect(isReviewSchemaMissing({ code: 'PGRST205' })).toBe(true)
    expect(isReviewSchemaMissing({ code: 'PGRST202', message: 'function missing' })).toBe(true)
    expect(isReviewSchemaMissing({ message: "Could not find 'playbook_review_threads'" })).toBe(true)
    expect(isReviewSchemaMissing({ code: '42501', message: 'permission denied' })).toBe(false)
  })
})
