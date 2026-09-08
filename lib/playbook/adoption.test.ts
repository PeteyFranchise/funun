import { classifyAdoption, normalizePlaybookSourcePath, playbookSourceHash } from './adoption'

describe('normalizePlaybookSourcePath', () => {
  it('normalizes an approved repository-relative doctrine path', () => {
    expect(normalizePlaybookSourcePath('./.planning\\deliberations//organizational-doctrine/policy.md')).toBe(
      '.planning/deliberations/organizational-doctrine/policy.md'
    )
  })

  it('permits one safe heading fragment for separately published package sections', () => {
    const source = '.planning/deliberations/organizational-doctrine/functional-team-doctrines.md#1-ar-doctrine'
    expect(normalizePlaybookSourcePath(source)).toBe(source)
  })

  it.each(['/etc/passwd.md', '../secret.md', '.planning/private.md', 'doctrine.txt'])(
    'rejects an unsafe or unsupported path: %s',
    value => expect(() => normalizePlaybookSourcePath(value)).toThrow()
  )

  it.each(['docs/policy.md#Bad Fragment', 'docs/policy.md#one#two'])(
    'rejects an unsafe source fragment: %s',
    value => expect(() => normalizePlaybookSourcePath(value)).toThrow()
  )
})

describe('playbookSourceHash', () => {
  it('is stable and changes when the source changes', () => {
    expect(playbookSourceHash('same')).toBe(playbookSourceHash('same'))
    expect(playbookSourceHash('same')).not.toBe(playbookSourceHash('changed'))
  })
})

describe('classifyAdoption', () => {
  it('distinguishes new, unchanged, changed, and cross-room sources', () => {
    expect(classifyAdoption({ targetRoomId: 'a', sourceHash: '1', existing: null })).toBe('available')
    expect(
      classifyAdoption({ targetRoomId: 'a', sourceHash: '1', existing: { room_id: 'a', source_hash: '1' } })
    ).toBe('unchanged')
    expect(
      classifyAdoption({ targetRoomId: 'a', sourceHash: '2', existing: { room_id: 'a', source_hash: '1' } })
    ).toBe('changed')
    expect(
      classifyAdoption({ targetRoomId: 'b', sourceHash: '1', existing: { room_id: 'a', source_hash: '1' } })
    ).toBe('already_adopted_elsewhere')
  })
})
