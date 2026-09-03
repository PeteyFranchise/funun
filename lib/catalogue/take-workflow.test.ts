import { normalizeTakeLabel, workingTakeFirst } from './take-workflow'

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
})
