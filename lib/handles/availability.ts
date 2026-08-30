// ─── Handle field-state derivation (D-14) ─────────────────────────────────
// There is no jsdom in this repo (testEnvironment: 'node'), so all of the
// signup handle field's decision logic lives here as a pure function and the
// component that renders it stays a thin shell. Reused verbatim by plan 06's
// ChooseHandleGate so the two handle-picking surfaces behave identically.
//
// Format is evaluated FIRST, unconditionally, via lib/handles/validate's
// shared handleFormatError() — so a stale remote verdict for a since-edited
// value can never override a locally-knowable failure.

import { handleFormatError } from '@/lib/handles/validate'

export type HandleFieldStatus =
  | 'idle'
  | 'invalid'
  | 'checking'
  | 'available'
  | 'unavailable'
  | 'unknown'

export type HandleRemoteVerdict = { available: boolean | null; reason: string | null }

export interface HandleFieldStateInput {
  raw: string
  checking: boolean
  remote: HandleRemoteVerdict | null
}

export interface HandleFieldState {
  status: HandleFieldStatus
  message: string | null
  blocksSubmit: boolean
}

/**
 * Derives the signup/settings handle field's display state from the raw
 * typed value, whether a debounced availability check is in flight, and the
 * most recent verdict from GET /api/handles/available (or null if none has
 * resolved yet).
 *
 * `blocksSubmit` is a UX convenience only (D-14) — the unique index and the
 * reserved-name guard are the real enforcement, so nothing here can ever
 * create or destroy a handle claim.
 */
export function handleFieldState({
  raw,
  checking,
  remote,
}: HandleFieldStateInput): HandleFieldState {
  const trimmed = raw.trim()

  const formatError = handleFormatError(raw)
  if (formatError) {
    // Nothing typed yet is a distinct case from a genuine format violation —
    // both block submit (the field is required either way), but only one
    // has something to say.
    if (trimmed.length === 0) {
      return { status: 'idle', message: null, blocksSubmit: true }
    }
    return { status: 'invalid', message: formatError, blocksSubmit: true }
  }

  if (checking) {
    // D-15: a lost race is harmless — the trigger falls back to a NULL
    // handle and plan 06's gate collects one on next sign-in — so there is
    // no reason to make someone wait on a debounce that hasn't resolved.
    return { status: 'checking', message: null, blocksSubmit: false }
  }

  if (remote === null) {
    // Valid format, but no debounced check has fired or resolved yet.
    // Same "nothing to report, don't block" posture as checking/unknown.
    return { status: 'idle', message: null, blocksSubmit: false }
  }

  if (remote.available === true) {
    return { status: 'available', message: null, blocksSubmit: false }
  }

  if (remote.available === null) {
    // A courtesy check that could not reach the server must never stand
    // between someone and their account (D-14).
    return { status: 'unknown', message: null, blocksSubmit: false }
  }

  // remote.available === false — taken, reserved, or retired, collapsed by
  // the route into a single reason (T-36-19). This is the ONLY verdict that
  // blocks, and purely as UX: it stops someone submitting a name they would
  // silently lose. A convenience, not enforcement (D-14).
  return {
    status: 'unavailable',
    message: 'That handle is taken — try another.',
    blocksSubmit: true,
  }
}
