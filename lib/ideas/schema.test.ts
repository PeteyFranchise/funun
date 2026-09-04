import { automaticIdeaTitle, buildIdeaRecordingPath, ideaPermissionAllows, normalizeIdeaMoods, normalizeIdeaTitle, safeIdeaDownloadName } from './schema'

describe('idea schema helpers', () => {
  it('creates an automatic voice-note title and accepts later naming', () => {
    expect(automaticIdeaTitle(new Date('2026-09-03T21:42:00Z'))).toBe('Voice idea · Sep 3, 9:42 PM')
    expect(normalizeIdeaTitle('  Midnight   thought ', 'fallback')).toBe('Midnight thought')
    expect(normalizeIdeaTitle(' ', 'Voice idea')).toBe('Voice idea')
  })

  it('normalizes, de-duplicates and bounds optional moods', () => {
    expect(normalizeIdeaMoods([' Dark ', 'dark', '', 'Gospel'])).toEqual(['Dark', 'Gospel'])
  })

  it('orders idea permissions without granting management', () => {
    expect(ideaPermissionAllows('listen', 'listen')).toBe(true)
    expect(ideaPermissionAllows('listen', 'comment')).toBe(false)
    expect(ideaPermissionAllows('comment', 'comment')).toBe(true)
    expect(ideaPermissionAllows('contribute', 'contribute')).toBe(true)
    expect(ideaPermissionAllows('contribute', 'manage')).toBe(false)
    expect(ideaPermissionAllows('owner', 'manage')).toBe(true)
  })

  it('binds storage paths and safe downloads', () => {
    expect(buildIdeaRecordingPath('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'webm'))
      .toBe('ideas/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webm')
    expect(safeIdeaDownloadName('My Hook!', { label: 'First hum', audioExt: 'webm' })).toBe('my-hook-first-hum.webm')
  })
})
