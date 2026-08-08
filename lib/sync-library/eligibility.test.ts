import { hasSyncLibraryCapability } from './eligibility'

describe('hasSyncLibraryCapability', () => {
  it('is true for an approved sync_library grant', () => {
    expect(hasSyncLibraryCapability({ capability: 'sync_library', status: 'approved' })).toBe(true)
  })

  it('is false for a pending sync_library grant', () => {
    expect(hasSyncLibraryCapability({ capability: 'sync_library', status: 'pending' })).toBe(false)
  })

  it('is false for an approved grant of a different capability', () => {
    expect(hasSyncLibraryCapability({ capability: 'artist', status: 'approved' })).toBe(false)
  })

  it('is false for null (no grant)', () => {
    expect(hasSyncLibraryCapability(null)).toBe(false)
  })
})
