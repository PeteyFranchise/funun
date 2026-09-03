import { clearTextDraft, readTextDraft, writeTextDraft } from './local-drafts'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => Array.from(values.keys())[index] ?? null,
    removeItem: key => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('local Writer room draft recovery', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: memoryStorage() } })
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('round-trips text and its server base, then clears after save', () => {
    writeTextDraft('writer-a:verse-1', 'new line', 'old line')
    expect(readTextDraft('writer-a:verse-1')).toMatchObject({ text: 'new line', baseText: 'old line' })
    clearTextDraft('writer-a:verse-1')
    expect(readTextDraft('writer-a:verse-1')).toBeNull()
  })

  it('expires abandoned drafts', () => {
    window.localStorage.setItem('old', JSON.stringify({ text: 'stale', updatedAt: 1 }))
    expect(readTextDraft('old', 1000)).toBeNull()
    expect(window.localStorage.getItem('old')).toBeNull()
  })
})
