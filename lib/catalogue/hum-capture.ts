// ─── Hum capture — codec selection, pure and browser-injectable ───────
// Pure module in the style of lib/split-sheets/approval.ts: no Supabase
// client, no framework import, no I/O of its own. The one thing this file
// does that touches a browser API is ASK it a question at runtime
// (`MediaRecorder.isTypeSupported`) — it never branches on a user-agent
// string. RESEARCH's own assumption log (A1/A2) flags that the specific
// browser-support claims behind the candidate order below are from
// secondary sources, not verified against a live device this session.
// That is exactly why the choice is made by asking, not sniffing: the
// worst case of a wrong assumption here is a suboptimal codec pick, never
// a broken recorder — and the real verification step is the owner device
// test (plan 13's UAT gate across Chrome desktop and iPhone Safari), not
// a change to this module.

import { extensionForMime } from '@/lib/catalogue/audio-mime'

// The route's own MIME→extension mapper (plan 06), re-exported rather
// than reimplemented — HumCaptureButton, and this module's own test,
// import it from here so hum capture speaks through one name for "does
// this MIME type map to something the upload allow-list accepts." A
// drift between the candidate list below and that allow-list would
// produce a recording the server silently rejects; the test below is
// what catches that before a real take ever hits the route.
export { extensionForMime }

/**
 * Ordered by the RESEARCH's cross-browser findings: Opus-in-WebM first
 * (Chrome/Firefox/Edge's own default, and recordable on Safari 18.4+ when
 * explicitly requested), then the MP4/AAC family — Safari's default on
 * every version, including pre-18.4 — then bare AAC as the last resort.
 * `pickSupportedMimeType()` below never assumes this order is right for a
 * given browser; it asks `isTypeSupported()` for each candidate in turn
 * and takes the first one the browser itself accepts.
 */
export const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/aac',
] as const

/**
 * The real browser check, wrapped so importing this module never throws
 * in an environment with no `MediaRecorder` global — this repo's Jest
 * suite runs with `testEnvironment: 'node'` (no jsdom), so `MediaRecorder`
 * is simply undeclared there. `typeof` is the one operator that is safe
 * against an undeclared identifier; a bare `MediaRecorder.isTypeSupported`
 * reference would throw a ReferenceError the moment this module loaded
 * under Jest. The ternary's untaken branch is never evaluated, so the
 * bare reference inside it is safe too.
 */
const DEFAULT_IS_TYPE_SUPPORTED: (mime: string) => boolean =
  typeof MediaRecorder !== 'undefined'
    ? (mime: string) => MediaRecorder.isTypeSupported(mime)
    : () => false

/**
 * Returns the first candidate `isTypeSupported` accepts, or null when
 * none are. The predicate is injectable — defaulting to the browser's own
 * `MediaRecorder.isTypeSupported` — so this function, and every caller of
 * it, can be exercised with no browser API present at all (this module's
 * own suite, and HumCaptureButton's). Never branches on `navigator`'s
 * user-agent string; the browser is asked, not guessed at.
 */
export function pickSupportedMimeType(
  isTypeSupported: (mime: string) => boolean = DEFAULT_IS_TYPE_SUPPORTED
): string | null {
  return CANDIDATE_MIME_TYPES.find(isTypeSupported) ?? null
}
