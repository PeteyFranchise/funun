// ─── attempt-copy ──────────────────────────────────────────────────────
// Generalises the handling already in components/catalogue/CopyLyricMenu.tsx
// — `navigator.clipboard` is `undefined` on non-secure origins, and
// `writeText` rejects (or, with no feature detect, throws synchronously)
// when the document is unfocused or permission is refused. Unguarded, that
// throws inside an async handler, the success state never runs, and a
// button whose only feedback is a label flip silently does nothing.
//
// RETURN-SHAPE DECISION (recorded here, not only in the plan/PR). A boolean
// is too thin: several sites in this app already distinguish "there is no
// clipboard API here" from "the write failed" and show different copy for
// each (QuickInviteModal, PartyPicker, ProducerInbox, ProducerHandoffTimeline,
// CopyLyricMenu). Collapsing both into one branch would be a worse UX than
// those sites already have. Throwing is also rejected: it recreates the
// exact defect being fixed — an uncaught throw in an async handler — and
// would force a try/catch at every call site instead of one shared helper.
//
// NAMING, per the label-integrity-funun skill: the member is 'rejected',
// not 'refused'. "Refused" asserts a cause (permission denied) that a
// rejected promise does not establish — a rejection can be a transient
// DOMException with no refusal involved. 'rejected' states only what was
// observed. 'unavailable' is derived from a feature check and claims only
// that no write API is reachable. 'copied' is the browser's own report
// that the write resolved — the strongest evidence obtainable. The function
// is named for the attempt it makes, not for an outcome it cannot promise.

export type ClipboardAttempt = 'copied' | 'unavailable' | 'rejected'

export type ClipboardWriter = { writeText: (text: string) => Promise<void> }

/**
 * Pure function: does `nav` carry a usable clipboard writer? Takes the
 * navigator as an argument (rather than reading the global) so this is
 * testable under `testEnvironment: 'node'` with no jsdom and no global
 * mutation.
 */
export function resolveClipboard(nav: unknown): ClipboardWriter | undefined {
  if (nav === null || typeof nav !== 'object') return undefined
  const clipboard = (nav as { clipboard?: unknown }).clipboard
  if (clipboard === null || typeof clipboard !== 'object') return undefined
  const writeText = (clipboard as { writeText?: unknown }).writeText
  if (typeof writeText !== 'function') return undefined
  return clipboard as ClipboardWriter
}

/**
 * Attempt to copy `text`. Never throws and never resolves to a lie — the
 * caller gets exactly one of three honest outcomes and decides its own
 * failure UX. When `writer` is omitted, resolves it from the global via a
 * `typeof navigator` guard, which is what keeps this SSR-safe: several
 * callers are client components rendered inside a server-rendered tree.
 */
export async function attemptCopy(text: string, writer?: ClipboardWriter): Promise<ClipboardAttempt> {
  const resolved = writer ?? resolveClipboard(typeof navigator === 'undefined' ? undefined : navigator)
  if (!resolved) return 'unavailable'
  try {
    // The try encloses the call itself, not just the await, so a
    // synchronous TypeError (e.g. calling writeText on an undefined
    // clipboard with no feature detect) is caught too, not only a rejected
    // promise.
    await resolved.writeText(text)
    return 'copied'
  } catch {
    return 'rejected'
  }
}
