import { profileDisplayTitle, profileHandleSubtitle } from '@/lib/profile/display-name'

describe('profileDisplayTitle', () => {
  it('uses the artist name when set', () => {
    expect(profileDisplayTitle({ artistName: 'Maya Reyes', handle: 'maya-reyes' })).toBe('Maya Reyes')
  })

  it('falls back to @handle when there is no artist name', () => {
    expect(profileDisplayTitle({ artistName: null, handle: 'maya-reyes' })).toBe('@maya-reyes')
  })

  it('treats a whitespace-only name as no name', () => {
    expect(profileDisplayTitle({ artistName: '   ', handle: 'maya-reyes' })).toBe('@maya-reyes')
  })

  it('returns an empty title when neither an artist name nor a handle exist', () => {
    expect(profileDisplayTitle({ artistName: null, handle: null })).toBe('')
  })

  it('preserves the stored casing of the handle', () => {
    expect(profileDisplayTitle({ artistName: null, handle: 'MayaReyes' })).toBe('@MayaReyes')
  })
})

describe('profileHandleSubtitle', () => {
  it('renders @handle beneath a name title', () => {
    expect(profileHandleSubtitle({ title: 'Maya Reyes', handle: 'maya-reyes' })).toBe('@maya-reyes')
  })

  it('does not duplicate the handle when the title already is @handle', () => {
    expect(profileHandleSubtitle({ title: '@maya-reyes', handle: 'maya-reyes' })).toBeNull()
  })

  it('returns null when there is no handle', () => {
    expect(profileHandleSubtitle({ title: 'Maya Reyes', handle: null })).toBeNull()
  })
})
