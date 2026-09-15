import {
  DEFAULT_PLAYBACK_SPEED,
  NUDGE_COARSE_MS,
  NUDGE_FINE_MS,
  PLAYBACK_SPEEDS,
  activePlayerId,
  applyPlaybackShape,
  claimActivePlayer,
  isActivePlayer,
  preRollStartMs,
  releaseActivePlayer,
  resolveTransportAction,
  shouldSuppressShortcut,
} from './take-transport'

describe('take transport', () => {
  beforeEach(() => {
    const holder = activePlayerId()
    if (holder) releaseActivePlayer(holder)
  })

  it('resolves space (and the legacy Spacebar key name) to toggle-play', () => {
    expect(resolveTransportAction({ key: ' ' })).toEqual({ kind: 'toggle-play' })
    expect(resolveTransportAction({ key: 'Spacebar' })).toEqual({ kind: 'toggle-play' })
  })

  it('resolves arrow keys to coarse and fine nudges', () => {
    expect(resolveTransportAction({ key: 'ArrowLeft' })).toEqual({ kind: 'nudge', deltaMs: -NUDGE_COARSE_MS })
    expect(resolveTransportAction({ key: 'ArrowLeft', shiftKey: true })).toEqual({
      kind: 'nudge',
      deltaMs: -NUDGE_FINE_MS,
    })
    expect(resolveTransportAction({ key: 'ArrowRight' })).toEqual({ kind: 'nudge', deltaMs: NUDGE_COARSE_MS })
    expect(resolveTransportAction({ key: 'ArrowRight', shiftKey: true })).toEqual({
      kind: 'nudge',
      deltaMs: NUDGE_FINE_MS,
    })
  })

  it('resolves [ and ] to previous/next comment navigation', () => {
    expect(resolveTransportAction({ key: '[' })).toEqual({ kind: 'step-comment', direction: -1 })
    expect(resolveTransportAction({ key: ']' })).toEqual({ kind: 'step-comment', direction: 1 })
  })

  it('never hijacks a browser or OS shortcut', () => {
    expect(resolveTransportAction({ key: ' ', metaKey: true })).toBeNull()
    expect(resolveTransportAction({ key: 'ArrowLeft', ctrlKey: true })).toBeNull()
    expect(resolveTransportAction({ key: ']', altKey: true })).toBeNull()
  })

  it('returns null for an unmapped key', () => {
    expect(resolveTransportAction({ key: 'j' })).toBeNull()
    expect(resolveTransportAction({ key: 'k' })).toBeNull()
    expect(resolveTransportAction({ key: 'l' })).toBeNull()
    expect(resolveTransportAction({ key: 'Escape' })).toBeNull()
  })

  it('suppresses shortcuts while a typing surface or an IME holds focus', () => {
    expect(shouldSuppressShortcut({ isComposing: true }, null)).toBe(true)
    expect(shouldSuppressShortcut({ keyCode: 229 }, null)).toBe(true)
    expect(shouldSuppressShortcut({}, { tagName: 'INPUT' })).toBe(true)
    expect(shouldSuppressShortcut({}, { tagName: 'TEXTAREA' })).toBe(true)
    expect(shouldSuppressShortcut({}, { tagName: 'SELECT' })).toBe(true)
    expect(shouldSuppressShortcut({}, { tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  // Regression, found in production during 39-11: clicking a waveform leaves
  // focus on the scrubber, which is an <input type="range">. Suppressing there
  // returned before preventDefault, so space scrolled the page instead of
  // playing -- the shortcut looked broken exactly when a writer reached for it.
  it('does not suppress shortcuts for a range input -- the scrubber is transport, not typing', () => {
    expect(shouldSuppressShortcut({}, { tagName: 'INPUT', type: 'range' })).toBe(false)
    expect(shouldSuppressShortcut({}, { tagName: 'INPUT', type: 'RANGE' })).toBe(false)
  })

  it('still suppresses every text-entry input, and the types where space has its own meaning', () => {
    expect(shouldSuppressShortcut({}, { tagName: 'INPUT' })).toBe(true)
    expect(shouldSuppressShortcut({}, { tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(shouldSuppressShortcut({}, { tagName: 'INPUT', type: 'search' })).toBe(true)
    expect(shouldSuppressShortcut({}, { tagName: 'INPUT', type: 'email' })).toBe(true)
    // Space toggles these natively -- hijacking it would be this same bug
    // pointed the other way.
    expect(shouldSuppressShortcut({}, { tagName: 'INPUT', type: 'checkbox' })).toBe(true)
    expect(shouldSuppressShortcut({}, { tagName: 'INPUT', type: 'radio' })).toBe(true)
  })

  it('does not suppress shortcuts for an ordinary element', () => {
    expect(shouldSuppressShortcut({}, { tagName: 'BUTTON' })).toBe(false)
    expect(shouldSuppressShortcut({}, { tagName: 'DIV', isContentEditable: false })).toBe(false)
  })

  it('clamps pre-roll at the top of a take', () => {
    expect(preRollStartMs(9000)).toBe(7000)
    expect(preRollStartMs(1200)).toBe(0)
    expect(preRollStartMs(0)).toBe(0)
  })

  it('defines exactly four playback speeds with 1x as the default', () => {
    expect(PLAYBACK_SPEEDS).toEqual([0.5, 0.75, 1, 1.5])
    expect(DEFAULT_PLAYBACK_SPEED).toBe(1)
  })

  it('applies playback shape (rate, preservesPitch, webkitPreservesPitch) to a media-like object', () => {
    const fake: { playbackRate: number; preservesPitch?: boolean; webkitPreservesPitch?: boolean } = {
      playbackRate: 1,
    }
    applyPlaybackShape(fake, 0.5)
    expect(fake.playbackRate).toBe(0.5)
    expect(fake.preservesPitch).toBe(true)
    expect(fake.webkitPreservesPitch).toBe(true)
  })

  it('lets only one claimed player hold the active slot', () => {
    claimActivePlayer('a')
    expect(isActivePlayer('a')).toBe(true)
    expect(isActivePlayer('b')).toBe(false)
    releaseActivePlayer('b')
    expect(isActivePlayer('a')).toBe(true)
    releaseActivePlayer('a')
    expect(isActivePlayer('a')).toBe(false)
    expect(activePlayerId()).toBeNull()
  })
})
