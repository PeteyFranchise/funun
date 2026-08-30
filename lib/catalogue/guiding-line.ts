// ─── The guiding line — one sentence, never a stack ────────────────────
// Pure module in the style of lib/split-sheets/approval.ts: no Supabase
// client, no framework import, no I/O. resolveGuidingLine() is the single
// input to plan 10's GuidingLine component (sketch 005-C).
//
// DESIGN RULE, VERBATIM FROM THE SKETCH: never a stack, dismissible,
// absent when nothing is needed. Creation leads; the song gets one
// sentence. The return type enforces this at the type level — a single
// GuidingLineStep or null, never an array — so no caller can render more
// than one line even by accident.
//
// THE ROTATION (sketch 005-C, decided): splits nudge → hum-to-claim → the
// DDEX gap → Crate-qualifies. In 37.1 the last two resolve to nothing —
// the destination doors (sketch 004) land in 37.2, so there is nothing
// yet that could make either eligible. They are declared in
// GUIDING_LINE_PRIORITY anyway, and deliberately inert below, so the
// rotation's ORDER is already correct the day they land and plan 10's
// component never has to reshuffle.
//
// THE CADENCE RULE — three independent gates (owner-decided, CAT-Q1a):
//   1. Once per new contributor per work (the "fired for" set) — the
//      splits step for a given person is returned at most once, ever,
//      whether or not it was explicitly dismissed. Firing IS the cadence
//      event; dismissal is a courtesy on top of it, not the gate itself.
//   2. Dismissible (the dismissed-keys set) — any step, once dismissed
//      for this work, is skipped and the next-highest eligible step is
//      returned instead.
//   3. A global silencer — when the artist has set split reminders to
//      doors-only, the splits step never appears, full stop, because
//      CAT-Q2's doors are the real enforcement and the line is only ever
//      a courtesy on top of them.
// None of these fire per edit, per keystroke, or per block — the caller
// (plan 12's page) computes the snapshot once per render from data it
// already has, and this function's job is picking one line from it.

import { identityKey, type PartyIdentity } from './splits'

// ─── Types ──────────────────────────────────────────────────────────

export type GuidingLineStepKey = 'splits' | 'hum_to_claim' | 'ddex_gap' | 'crate_qualifies'

/** The rotation order, highest priority first — sketch 005-C, decided. */
export const GUIDING_LINE_PRIORITY: GuidingLineStepKey[] = [
  'splits',
  'hum_to_claim',
  'ddex_gap',
  'crate_qualifies',
]

export type GuidingLineStep = {
  key: GuidingLineStepKey
  /** The one sentence itself. */
  headline: string
  /** Optional supporting line — never a second action, just why. */
  reason?: string
  /** The Do-it button's label. */
  actionLabel: string
  /** Where the Do-it button goes — always present, so the button always has somewhere to go. */
  actionTarget: string
  /** Present only on the splits step — the identity key of the person it names. */
  contributorIdentity?: string
}

/**
 * The already-assembled snapshot of a song, per plan 12's own render
 * data. This function performs no I/O and does no additional fetching —
 * every field here is something the caller already has.
 */
export type GuidingLineSnapshot = {
  /** How many versions (recordings/hums/uploads) this work has. */
  versionCount: number
  /** How many lyric-pad blocks this work has. */
  blockCount: number
  /** Every work member (used by future, currently-inert steps — declared for shape stability). */
  members: PartyIdentity[]
  /** Contributing writers absent from the split sheet — lib/catalogue/splits.ts's writersMissingFromSheet() output. People only, never a percentage. */
  writersMissingFromSheet: PartyIdentity[]
  /** AI entries still needing a re-author decision (used by the currently-inert ddex_gap step). */
  unresolvedAiEntries: number
  /** Step keys the artist has dismissed for this work. Splits dismissals are namespaced per contributor: `splits:${identityKey}`. */
  dismissedStepKeys: string[]
  /** Identity keys the splits nudge has already fired for, on this work — once fired, never returned again for that person. */
  splitsNudgeFiredFor: string[]
  /** The pad setting (sketch 006): 'on' shows the courtesy line; 'doors_only' silences the splits step entirely. */
  splitReminderSetting: 'on' | 'doors_only'
}

// ─── Splits nudge ──────────────────────────────────────────────────────

function resolveSplitsStep(snapshot: GuidingLineSnapshot): GuidingLineStep | null {
  // Gate 3 — the global silencer. CAT-Q2's doors are the real
  // enforcement; when the artist has quieted the courtesy line, this step
  // never appears, no matter how many writers are missing.
  if (snapshot.splitReminderSetting === 'doors_only') return null

  for (const writer of snapshot.writersMissingFromSheet) {
    const key = identityKey(writer)

    // Gate 1 — once per new contributor per work, regardless of dismissal.
    if (snapshot.splitsNudgeFiredFor.includes(key)) continue

    // Gate 2 — dismissible, namespaced to this specific person.
    if (snapshot.dismissedStepKeys.includes(`splits:${key}`)) continue

    return {
      key: 'splits',
      headline: `${writer.name} isn't on the sheet yet — add them?`,
      actionLabel: 'Add to the sheet',
      actionTarget: 'splits',
      contributorIdentity: key,
    }
  }

  return null
}

// ─── Hum-to-claim ──────────────────────────────────────────────────────

function resolveHumToClaimStep(snapshot: GuidingLineSnapshot): GuidingLineStep | null {
  if (snapshot.dismissedStepKeys.includes('hum_to_claim')) return null

  // A version already exists — some melody has already been captured in
  // this work's history, so there's nothing left to claim by humming.
  if (snapshot.versionCount > 0) return null

  if (snapshot.blockCount === 0) {
    // Brand-new work: nothing hummed, nothing written — the empty-state
    // variant, owner's lead line verbatim.
    return {
      key: 'hum_to_claim',
      headline: 'Start with a hum',
      reason: 'Save and protect your idea by just humming or singing right now.',
      actionLabel: 'Hum it in',
      actionTarget: 'hum',
    }
  }

  // Lyrics exist but no version has captured a melody yet — the
  // protect-the-melody variant (doctrine's rule line, verbatim).
  return {
    key: 'hum_to_claim',
    headline: 'Protect your melody — hum it in',
    reason: 'Hum every melody you want to own, and the song is entirely yours.',
    actionLabel: 'Hum it in',
    actionTarget: 'hum',
  }
}

// ─── DDEX gap / Crate-qualifies — declared, intentionally inert ──────

/**
 * The DDEX-readiness gap step. Inert in 37.1: the Distribution door
 * (sketch 004) that this step would route to doesn't exist yet. Declared
 * now so GUIDING_LINE_PRIORITY's order is locked before the door lands.
 */
function resolveDdexGapStep(_snapshot: GuidingLineSnapshot): GuidingLineStep | null {
  return null
}

/**
 * The Crate-qualifies step. Inert in 37.1 for the same reason as the DDEX
 * gap — the Crate door it would route to is a 37.2 destination.
 */
function resolveCrateQualifiesStep(_snapshot: GuidingLineSnapshot): GuidingLineStep | null {
  return null
}

// ─── The resolver ──────────────────────────────────────────────────────

/**
 * Returns the song's single highest-priority next step, or null when
 * nothing is needed. Never an array — see module header. Priority order
 * is GUIDING_LINE_PRIORITY; the first resolver that returns non-null
 * wins, and every other candidate (including a second eligible splits
 * contributor) is discarded for this render, not queued.
 */
export function resolveGuidingLine(snapshot: GuidingLineSnapshot): GuidingLineStep | null {
  const splitsStep = resolveSplitsStep(snapshot)
  if (splitsStep) return splitsStep

  const humStep = resolveHumToClaimStep(snapshot)
  if (humStep) return humStep

  const ddexStep = resolveDdexGapStep(snapshot)
  if (ddexStep) return ddexStep

  const crateStep = resolveCrateQualifiesStep(snapshot)
  if (crateStep) return crateStep

  return null
}
