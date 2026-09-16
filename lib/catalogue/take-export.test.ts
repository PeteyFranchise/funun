import {
  classifyCommentExport,
  classifyPinExport,
  commentToMarker,
  pinToMarker,
  sanitizeMarkerLabel,
  skippedRepositionNote,
} from './take-export'
import type { WorkVersionCommentView, WorkVersionPinView } from '@/types/catalogue'

function makeComment(overrides: Partial<WorkVersionCommentView> = {}): WorkVersionCommentView {
  return {
    id: 'comment-1',
    versionId: 'version-1',
    parentCommentId: null,
    body: 'bring the bass up here',
    timestampMs: 9000,
    author: { userId: 'user-1', name: 'Maya Chen', handle: 'maya', avatarUrl: null },
    mentioned: [],
    resolvedAt: null,
    resolvedByName: null,
    carriedFromVersionId: null,
    carriedFromVersionDisplay: null,
    createdAt: '2026-01-01T00:00:00Z',
    canResolve: true,
    ...overrides,
  }
}

function makePin(overrides: Partial<WorkVersionPinView> = {}): WorkVersionPinView {
  return {
    id: 'pin-1',
    timestampMs: 72000,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('take export: marker shape and label sanitisation', () => {
  it('collapses a literal tab in a label to a single space', () => {
    expect(sanitizeMarkerLabel('lower\tthe guitars')).toBe('lower the guitars')
  })

  it('collapses a CRLF, an LF and a CR in a label to a single space at the break', () => {
    expect(sanitizeMarkerLabel('line one\r\nline two')).toBe('line one line two')
    expect(sanitizeMarkerLabel('line one\nline two')).toBe('line one line two')
    expect(sanitizeMarkerLabel('line one\rline two')).toBe('line one line two')
  })

  it('collapses three consecutive spaces to one', () => {
    expect(sanitizeMarkerLabel('drop   the drums')).toBe('drop the drums')
  })

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeMarkerLabel('  bring the bass up  ')).toBe('bring the bass up')
  })

  it('prepends a single apostrophe to a label beginning with a formula character', () => {
    expect(sanitizeMarkerLabel('=1+1')).toBe("'=1+1")
    expect(sanitizeMarkerLabel('+1')).toBe("'+1")
    expect(sanitizeMarkerLabel('-drop the beat')).toBe("'-drop the beat")
    expect(sanitizeMarkerLabel('@here check this')).toBe("'@here check this")
  })

  it('normalises whitespace before looking for a leading formula character, so a leading tab cannot hide one', () => {
    expect(sanitizeMarkerLabel('\t=cmd|calc')).toBe("'=cmd|calc")
  })

  it('adds no apostrophe to a label beginning with any other character', () => {
    expect(sanitizeMarkerLabel('bring the bass up here')).toBe('bring the bass up here')
  })

  it('is idempotent — sanitising an already-sanitised label returns it unchanged', () => {
    const once = sanitizeMarkerLabel('=1+1')
    expect(sanitizeMarkerLabel(once)).toBe(once)
  })

  it('presents the author segment as "A former room member" when a comment has no author', () => {
    const marker = commentToMarker(makeComment({ author: null, body: 'this needs work' }))
    expect(marker.label).toBe('A former room member: this needs work')
  })

  it('presents the display name and never the handle when the author has a handle', () => {
    const marker = commentToMarker(makeComment({ body: 'bring the bass up here' }))
    expect(marker.label).toBe('Maya Chen: bring the bass up here')
    expect(marker.label).not.toContain('maya')
    expect(marker.label).not.toContain('@')
  })

  it('starts a carried comment label with the source version display in square brackets', () => {
    const marker = commentToMarker(
      makeComment({
        carriedFromVersionId: 'version-0',
        carriedFromVersionDisplay: 'v1',
        body: 'bring the bass up here',
      })
    )
    expect(marker.label).toBe('[v1] Maya Chen: bring the bass up here')
  })

  it('starts a non-carried comment label with the author name and no bracket segment', () => {
    const marker = commentToMarker(makeComment({ body: 'bring the bass up here' }))
    expect(marker.label.startsWith('[')).toBe(false)
    expect(marker.label).toBe('Maya Chen: bring the bass up here')
  })

  it('renders a pin label as the word Pin, a space, and the timestamp as minutes and seconds', () => {
    const marker = pinToMarker(makePin({ timestampMs: 72000 }))
    expect(marker.label).toBe('Pin 1:12')
  })

  it('presents a point comment\'s endMs as exactly null, never undefined and never 0', () => {
    const marker = commentToMarker(makeComment({ endTimestampMs: undefined }))
    expect(marker.endMs).toBe(null)
    expect(marker.endMs).not.toBeUndefined()
    expect(marker.endMs).not.toBe(0)
  })
})

describe('take export: classification — what is excluded, and why', () => {
  it('classifies an empty comment array as no_comments', () => {
    const result = classifyCommentExport([])
    expect(result.refusalReason).toBe('no_comments')
    expect(result.refusalMessage).toBe('No comments on this take yet.')
    expect(result.exportable).toEqual([])
  })

  it('classifies an array containing only replies as no_comments — a reply is never a marker', () => {
    const result = classifyCommentExport([
      makeComment({ id: 'reply-1', parentCommentId: 'root-1' }),
      makeComment({ id: 'reply-2', parentCommentId: 'root-1' }),
    ])
    expect(result.refusalReason).toBe('no_comments')
    expect(result.refusalMessage).toBe('No comments on this take yet.')
  })

  it('classifies four resolved root comments as all_resolved with the plural message', () => {
    const result = classifyCommentExport([
      makeComment({ id: 'c1', resolvedAt: '2026-01-01T00:00:00Z' }),
      makeComment({ id: 'c2', resolvedAt: '2026-01-01T00:00:00Z' }),
      makeComment({ id: 'c3', resolvedAt: '2026-01-01T00:00:00Z' }),
      makeComment({ id: 'c4', resolvedAt: '2026-01-01T00:00:00Z' }),
    ])
    expect(result.refusalReason).toBe('all_resolved')
    expect(result.refusalMessage).toBe('All 4 comments are resolved — nothing outstanding to export.')
  })

  it('classifies a single resolved root comment as all_resolved with the singular message', () => {
    const result = classifyCommentExport([makeComment({ resolvedAt: '2026-01-01T00:00:00Z' })])
    expect(result.refusalReason).toBe('all_resolved')
    expect(result.refusalMessage).toBe(
      'The only comment on this take is resolved — nothing outstanding to export.'
    )
  })

  it('classifies three unresolved, all-flagged root comments as all_repositioning with the plural message', () => {
    const result = classifyCommentExport([
      makeComment({ id: 'c1', needsReposition: true }),
      makeComment({ id: 'c2', needsReposition: true }),
      makeComment({ id: 'c3', needsReposition: true }),
    ])
    expect(result.refusalReason).toBe('all_repositioning')
    expect(result.refusalMessage).toBe('3 comments need repositioning before they can be exported.')
  })

  it('classifies one unresolved, flagged root comment as all_repositioning with the singular message', () => {
    const result = classifyCommentExport([makeComment({ needsReposition: true })])
    expect(result.refusalReason).toBe('all_repositioning')
    expect(result.refusalMessage).toBe('1 comment needs repositioning before it can be exported.')
  })

  it('classifies two exportable plus two repositioning-flagged comments as none, carrying the skipped count on the success path', () => {
    const result = classifyCommentExport([
      makeComment({ id: 'c1', timestampMs: 1000 }),
      makeComment({ id: 'c2', timestampMs: 2000 }),
      makeComment({ id: 'c3', timestampMs: 3000, needsReposition: true }),
      makeComment({ id: 'c4', timestampMs: 4000, needsReposition: true }),
    ])
    expect(result.refusalReason).toBe('none')
    expect(result.refusalMessage).toBe(null)
    expect(result.exportable).toHaveLength(2)
    expect(result.skippedRepositionCount).toBe(2)
  })

  it('returns markers ordered by startMs ascending regardless of input order', () => {
    const result = classifyCommentExport([
      makeComment({ id: 'c1', timestampMs: 9000, body: 'last' }),
      makeComment({ id: 'c2', timestampMs: 1000, body: 'first' }),
      makeComment({ id: 'c3', timestampMs: 5000, body: 'middle' }),
    ])
    expect(result.exportable.map(m => m.startMs)).toEqual([1000, 5000, 9000])
  })

  it('never includes a resolved comment in exportable', () => {
    const result = classifyCommentExport([
      makeComment({ id: 'c1', timestampMs: 1000 }),
      makeComment({ id: 'c2', timestampMs: 2000, resolvedAt: '2026-01-01T00:00:00Z' }),
    ])
    expect(result.exportable).toHaveLength(1)
    expect(result.exportable[0]!.startMs).toBe(1000)
  })

  it('never includes a reply in exportable, even when it carries a span', () => {
    const result = classifyCommentExport([
      makeComment({ id: 'root', timestampMs: 1000 }),
      makeComment({
        id: 'reply',
        parentCommentId: 'root',
        timestampMs: 2000,
        endTimestampMs: 3000,
      }),
    ])
    expect(result.exportable).toHaveLength(1)
    expect(result.exportable[0]!.startMs).toBe(1000)
  })

  it('carries a null refusalMessage exactly when the refusal reason is none', () => {
    const result = classifyCommentExport([makeComment()])
    expect(result.refusalReason).toBe('none')
    expect(result.refusalMessage).toBe(null)
  })

  it('classifies an empty pin array as no_pins', () => {
    const result = classifyPinExport([])
    expect(result.refusalReason).toBe('no_pins')
    expect(result.refusalMessage).toBe('No pins on this take yet.')
  })

  it('classifies two pins as none with a skippedRepositionCount of zero — a pin has no reposition concept', () => {
    const result = classifyPinExport([makePin({ id: 'p1', timestampMs: 1000 }), makePin({ id: 'p2', timestampMs: 2000 })])
    expect(result.refusalReason).toBe('none')
    expect(result.exportable).toHaveLength(2)
    expect(result.skippedRepositionCount).toBe(0)
  })

  it('returns null from skippedRepositionNote at zero', () => {
    expect(skippedRepositionNote(0)).toBe(null)
  })

  it('returns the singular skippedRepositionNote sentence for a count of one', () => {
    expect(skippedRepositionNote(1)).toBe("1 comment needs repositioning and wasn't included.")
  })

  it('returns the plural skippedRepositionNote sentence for a count above one', () => {
    expect(skippedRepositionNote(2)).toBe("2 comments need repositioning and weren't included.")
  })
})
