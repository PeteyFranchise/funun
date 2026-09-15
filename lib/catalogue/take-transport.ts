// ─── Keyboard ───────────────────────────────────────────────────────────────
// Every keyboard rule in D-14, D-15 and D-16 lives here as a pure function so
// it is testable without a browser. This module reads no DOM global at all —
// callers pass what they read from `document` (the active element, the
// keyboard event) at the call site.

export type TransportAction =
  | { kind: 'toggle-play' }
  | { kind: 'nudge'; deltaMs: number }
  | { kind: 'step-comment'; direction: -1 | 1 }

export const NUDGE_COARSE_MS = 5000
export const NUDGE_FINE_MS = 1000

/** D-14/D-15. Returns null for any binding with a meta, ctrl or alt modifier
 * so a browser or OS shortcut is never hijacked, and for any unmapped key. */
export function resolveTransportAction(event: {
  key: string
  shiftKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
}): TransportAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null

  // Accept both key names to cover older key-name reporting.
  if (event.key === ' ' || event.key === 'Spacebar') return { kind: 'toggle-play' }
  if (event.key === 'ArrowLeft') {
    return { kind: 'nudge', deltaMs: event.shiftKey ? -NUDGE_FINE_MS : -NUDGE_COARSE_MS }
  }
  if (event.key === 'ArrowRight') {
    return { kind: 'nudge', deltaMs: event.shiftKey ? NUDGE_FINE_MS : NUDGE_COARSE_MS }
  }
  // `[` / `]` step comments — shifted arrows stay reserved for the fine nudge.
  if (event.key === '[') return { kind: 'step-comment', direction: -1 }
  if (event.key === ']') return { kind: 'step-comment', direction: 1 }
  return null
}

/** D-16, non-negotiable: the room mounts LyricsPad, the comment composer and
 * the take-rename field simultaneously, all typed into constantly. Takes the
 * active element as a parameter rather than reading `document` so the
 * function is testable and a caller can pass the DOM's active element at the
 * call site. */
export function shouldSuppressShortcut(
  event: { isComposing?: boolean; keyCode?: number },
  activeElement: { tagName?: string; type?: string; isContentEditable?: boolean } | null
): boolean {
  if (event.isComposing) return true
  // Several IMEs report this keyCode during candidate selection.
  if (event.keyCode === 229) return true
  if (!activeElement) return false
  const tag = (activeElement.tagName ?? '').toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    // The scrubber is an <input type="range">, so clicking a waveform leaves
    // focus on an INPUT. Treating that as a typing surface made the most
    // natural gesture in the room -- click the take you want, press space --
    // return early before preventDefault and let the browser scroll the page
    // instead of playing. A range has no text entry and space does nothing
    // native on it, so it is a transport control, not somewhere words go.
    // Every other input type stays suppressed: space legitimately toggles a
    // checkbox or radio, and stealing it there would be the same bug pointed
    // the other way.
    return (activeElement.type ?? 'text').toLowerCase() !== 'range'
  }
  return activeElement.isContentEditable === true
}

// ─── Playback shape ─────────────────────────────────────────────────────────

export const PRE_ROLL_MS = 2000

/** D-06: playback begins 2s before a comment's timestamp or a span's
 * in-point, clamped at 0:00 near the top of a take. */
export function preRollStartMs(targetMs: number): number {
  return Math.max(0, Math.round(targetMs) - PRE_ROLL_MS)
}

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.5] as const
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number]
// 2x was omitted as rarely useful on music (D-17).
export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 1

/** D-18. Must be called from every `onLoadedMetadata` handler, not only at
 * mount, because `VersionComparisonPanel.changeSide()` swaps `src` on a live
 * `<audio>` element and media elements reset playback-adjacent properties on
 * a new source. */
export function applyPlaybackShape(
  media: { playbackRate: number; preservesPitch?: boolean; webkitPreservesPitch?: boolean },
  rate: number
): void {
  media.playbackRate = rate
  media.preservesPitch = true
  // Older WebKit builds still in the field only honor the prefixed property.
  media.webkitPreservesPitch = true
}

// ─── Active player ──────────────────────────────────────────────────────────
// A player claims on play and on pointer-down within its own root, releases
// on unmount, and every mounted player's keydown handler returns early
// unless it is the holder — this is what stops one spacebar from toggling
// every take on the page.

let currentPlayerId: string | null = null

export function claimActivePlayer(id: string): void {
  currentPlayerId = id
}

/** A no-op unless `id` currently holds — a stale unmount can't steal the
 * claim of whichever player took over after it. */
export function releaseActivePlayer(id: string): void {
  if (currentPlayerId === id) currentPlayerId = null
}

export function isActivePlayer(id: string): boolean {
  return currentPlayerId === id
}

export function activePlayerId(): string | null {
  return currentPlayerId
}
