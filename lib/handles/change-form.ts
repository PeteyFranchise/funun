// ── Handle-change submit decision (D-04, D-07) ───────────────────────────
// Pure, client-safe decision logic for the settings-page handle field. There
// is no jsdom in this repo (jest.config.js runs testEnvironment: 'node'), so
// this is where the form's decision logic lives and where it is tested —
// components/profile/HandleSettingsForm.tsx stays a thin shell that calls
// this and renders the result.

import { handleFormatError } from '@/lib/handles/validate'

export type HandleChangeSubmitState =
  | { kind: 'unchanged' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; handle: string }

/**
 * Decides what a settings-page handle-field submit should do.
 *
 * Order is format first, then the exact-equality short circuit. `unchanged`
 * is byte-equality after trim, NOT lowered equality — a casing-only edit
 * (e.g. 'maya-reyes' -> 'Maya-Reyes') is still a submit, because D-04 stores
 * exactly what was typed and a casing change is a real (if minor) write.
 */
export function handleChangeSubmitState(input: {
  current: string | null
  next: string
}): HandleChangeSubmitState {
  const trimmed = input.next.trim()

  const formatError = handleFormatError(trimmed)
  if (formatError) {
    return { kind: 'invalid', message: formatError }
  }

  if (input.current !== null && input.current === trimmed) {
    return { kind: 'unchanged' }
  }

  return { kind: 'ready', handle: trimmed }
}
