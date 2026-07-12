// Wave 0 — Phase 9 (rich-member-profile), D-13. Asserts readLyrics() still
// parses legacy plain-text lyrics unchanged after the additive `synced`
// field is added to TrackLyrics, and that a synced-carrying object preserves
// `text` and does not throw. RED until Task 2 of this plan adds the `synced`
// field to TrackLyrics (the fixture below references it by type); GREEN once
// that additive extension lands.

import { readLyrics, type TrackLyrics } from '@/lib/metadata/schema'

const legacyLyrics: TrackLyrics = { text: 'Hello world' }

const syncedLyrics: TrackLyrics = {
  text: 'Hello world',
  synced: {
    lines: [
      { atMs: 0, text: 'Hello' },
      { atMs: 1000, text: 'world' },
    ],
    method: 'manual',
    updated_at: '2026-07-12T00:00:00Z',
  },
}

describe('readLyrics — backward compatibility with the additive synced field (D-13)', () => {
  it('parses legacy plain-text lyrics unchanged', () => {
    const result = readLyrics({ lyrics: legacyLyrics })
    expect(result).toEqual({
      text: 'Hello world',
      language: undefined,
      explicit: false,
      updated_at: undefined,
    })
  })

  it('preserves text and does not throw when a well-formed synced block is present', () => {
    expect(() => readLyrics({ lyrics: syncedLyrics })).not.toThrow()
    expect(readLyrics({ lyrics: syncedLyrics })?.text).toBe('Hello world')
  })

  it('returns null when lyrics text is empty even if a synced block is present', () => {
    const emptyText: TrackLyrics = { text: '', synced: syncedLyrics.synced }
    expect(readLyrics({ lyrics: emptyText })).toBeNull()
  })
})
