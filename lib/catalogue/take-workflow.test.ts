import { normalizeTakeLabel, safeTakeDownloadName, workingTakeFirst } from './take-workflow'

describe("Writer's Room take workflow", () => {
  it('normalizes artist labels without replacing the version identity', () => {
    expect(normalizeTakeLabel('  Hook idea  ')).toBe('Hook idea')
    expect(normalizeTakeLabel('   ')).toBeNull()
    expect(normalizeTakeLabel('x'.repeat(250))).toHaveLength(200)
  })

  it('places only an active working take first and preserves the remaining order', () => {
    const takes = [{ id: 'v3' }, { id: 'v2' }, { id: 'v1' }]
    expect(workingTakeFirst(takes, 'v2').map(take => take.id)).toEqual(['v2', 'v3', 'v1'])
    expect(workingTakeFirst([{ id: 'v2', archivedAt: 'now' }, { id: 'v1' }], 'v2').map(take => take.id)).toEqual(['v2', 'v1'])
    expect(workingTakeFirst(takes, 'missing')).toBe(takes)
  })

  it('builds a safe take filename while retaining its real stored format', () => {
    expect(safeTakeDownloadName({
      songTitle: 'Midnight / Drive',
      versionDisplay: 'v4',
      label: 'Drums Up!',
      audioPath: 'work-1/version-4.mp3',
    })).toBe('Midnight-Drive-v4-Drums-Up.mp3')

    expect(safeTakeDownloadName({
      songTitle: 'Maya’s Song',
      versionDisplay: 'v2',
      label: null,
      audioPath: 'work-1/version-2.webm',
    })).toBe('Mayas-Song-v2.webm')
  })

  it('never copies an unrecognized storage suffix into a download filename', () => {
    expect(safeTakeDownloadName({
      songTitle: '../../Midnight',
      versionDisplay: 'v1',
      label: '../mix',
      audioPath: 'work-1/version-1.exe',
    })).toBe('Midnight-v1-mix.audio')
  })
})
