import { commentToMarker, pinToMarker, sanitizeMarkerLabel } from './take-export'
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
