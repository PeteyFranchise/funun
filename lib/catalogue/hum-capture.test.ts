// Tests for the pure codec-selection logic in lib/catalogue/hum-capture.ts.
// No browser API is present in this environment (Jest runs with
// testEnvironment: 'node', no jsdom, no MediaRecorder global) — every
// behaviour here is exercised through the injected predicate, which is
// exactly the point: `pickSupportedMimeType()` never assumes a global
// exists, it asks whatever predicate it is given.

import { CANDIDATE_MIME_TYPES, pickSupportedMimeType } from './hum-capture'
import { EXT_BY_MIME } from './audio'

describe('pickSupportedMimeType', () => {
  it('returns the FIRST candidate the injected predicate accepts', () => {
    const acceptsEverything = () => true
    expect(pickSupportedMimeType(acceptsEverything)).toBe(CANDIDATE_MIME_TYPES[0])
    expect(CANDIDATE_MIME_TYPES[0]).toBe('audio/webm;codecs=opus')
  })

  it('returns an MP4-family type, not the WebM one, when only MP4 is accepted', () => {
    const acceptsOnlyMp4Family = (mime: string) => mime.startsWith('audio/mp4')
    const picked = pickSupportedMimeType(acceptsOnlyMp4Family)
    expect(picked).not.toBeNull()
    expect(picked?.startsWith('audio/mp4')).toBe(true)
    expect(picked).not.toBe('audio/webm;codecs=opus')
  })

  it('returns null when the predicate accepts nothing', () => {
    const acceptsNothing = () => false
    expect(pickSupportedMimeType(acceptsNothing)).toBeNull()
  })

  it('runs with no browser API present at all — the default predicate never throws', () => {
    // No argument passed: falls through to the module's own default,
    // which must survive a Node environment with no MediaRecorder global.
    expect(() => pickSupportedMimeType()).not.toThrow()
    expect(pickSupportedMimeType()).toBeNull()
  })

  it('every candidate maps to a known extension in plan 06\'s upload allow-list', () => {
    // Imports the allow-list rather than restating it — a drift between
    // the candidate order above and EXT_BY_MIME would silently produce a
    // recording the versions route rejects with a 400. This is the trip
    // wire audio.test.ts's own comment names as not-yet-possible until
    // this module existed.
    const allowedExtensions = new Set(Object.values(EXT_BY_MIME))
    for (const candidate of CANDIDATE_MIME_TYPES) {
      const base = candidate.split(';')[0]!.trim().toLowerCase()
      const ext = EXT_BY_MIME[base]
      expect(ext).toBeDefined()
      expect(allowedExtensions.has(ext!)).toBe(true)
    }
  })
})
