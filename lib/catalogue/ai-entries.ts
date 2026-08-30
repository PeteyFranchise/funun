// ─── AI-entry hygiene — citation, level, Crate consequence, receipt ───
// Pure module in the style of lib/split-sheets/approval.ts: no Supabase
// client, no framework import, no I/O.
//
// This module is where CAT-Q3 either holds or leaks. The doctrine's own
// north star: "our artists able to cite SUNO or any other AI tool where
// necessary, but own the full song as much as possible" — disclosure is
// not forfeiture, but the safe citation must be TRUE. The when-in-doubt
// rule is the enforcement mechanism:
//
//   "Can you point to the human version that existed before the AI
//    touched it?"
//   YES → cite it as a reference performance, demo only. Ownership fully
//         preserved; the diary proves it.
//   NO  → do not reach for the label. Re-author the part first, then the
//         citation becomes true. Doubt is resolved by work, not wording.
//
// resolveCitation() below is that rule made STRUCTURAL rather than a UI
// validation: there is no code path in this module through which a
// `mode: 'generate'` entry (the tool invented something) can reach
// `kind: 'cited'` (the safe, maximal-ownership label), and no code path
// through which `mode: 'performance'` reaches `kind: 'cited'` without
// `hasHumanSource: true`. A future contributor cannot "fix a bug" that
// relaxes this without deleting the guard entirely — which is the point.
//
// DDEX vocabulary (vocal / instrument / lyric / melody / full) is the
// internal component type only. It surfaces to the artist ONLY inside
// composeReceipt()'s output (the receipt block, sketch 002-A) — never in
// any other artist-facing string in this module. No vendor or tool name
// (Suno or otherwise) appears in any string this module returns; citing a
// tool is the artist's own act inside the diary, not something Funūn's
// own copy names.

// ─── Types ──────────────────────────────────────────────────────────

/** DDEX's own component vocabulary — what the AI touched. */
export type AiEntryComponent = 'vocal' | 'instrument' | 'lyric' | 'melody' | 'full'

/** The two-door choice (sketch 002-A): did the tool perform something written, or invent something new. */
export type AiEntryMode = 'performance' | 'generate'

/** Where a resolved entry attaches — CAT-Q3's placement rule. */
export type AiEntryLevel = 'work' | 'version'

/** The shared input every resolver in this module works from. */
export type AiEntryInput = {
  mode: AiEntryMode
  component: AiEntryComponent
  /** Does the diary already hold a human take/draft this entry can point to? */
  hasHumanSource: boolean
}

export type CitationOutcome =
  | { kind: 'cited'; mode: AiEntryMode; component: AiEntryComponent; citation: string }
  | { kind: 'reauthor'; mode: AiEntryMode; component: AiEntryComponent; reason: string }
  | { kind: 'unowned'; mode: AiEntryMode; component: AiEntryComponent; reason: string }

export type CrateConsequence =
  | { eligible: true; disclosed: true; note: string }
  | { eligible: false; disclosed: false; reason: string; fix?: string }

export type Receipt = {
  /** The citation line — what the diary will say happened. */
  citation: string
  /** Always the same statement: AI takes zero splits, no exceptions. */
  splitsEffect: string
  /** What this means for the released master, if this element ever reaches it. */
  releaseEffect: string
  /** The Crate consequence, in plain words (never just eligible/ineligible). */
  crateConsequence: string
}

// ─── Vocabulary ────────────────────────────────────────────────────

export const AI_ENTRY_COMPONENT_VALUES: AiEntryComponent[] = [
  'vocal',
  'instrument',
  'lyric',
  'melody',
  'full',
]

/** Chip labels for the two-door form's component picker (sketch 002-A). */
export const AI_ENTRY_COMPONENT_LABELS: Record<AiEntryComponent, string> = {
  vocal: 'Vocal',
  instrument: 'Instrument',
  lyric: 'Lyrics',
  melody: 'Melody',
  full: 'Whole track',
}

export const AI_ENTRY_MODE_VALUES: AiEntryMode[] = ['performance', 'generate']

/** The two-door labels (sketch 002-A) — plain words, no DDEX jargon. */
export const AI_ENTRY_MODE_LABELS: Record<AiEntryMode, string> = {
  performance: 'It performed something we wrote',
  generate: 'It created something new',
}

// ─── Citation composer — the when-in-doubt rule, made structural ─────

/**
 * What a performance-mode citation says it did, by component — the noun
 * that follows "performed a human-written…". Kept as data rather than a
 * single string so every component gets an honest description instead of
 * one sentence stretched to fit all five.
 */
const PERFORMANCE_REFERENT: Record<AiEntryComponent, string> = {
  vocal: 'melody',
  instrument: 'arrangement',
  lyric: 'lyric',
  melody: 'melody',
  full: 'song',
}

function buildSafeCitation(component: AiEntryComponent): string {
  const label = AI_ENTRY_COMPONENT_LABELS[component].toLowerCase()
  const referent = PERFORMANCE_REFERENT[component]
  return `AI reference ${label} — performed a human-written ${referent}, demo only.`
}

/**
 * The when-in-doubt rule made structural. See module header for the full
 * reasoning — this function's contract is that `kind: 'cited'` is
 * UNREACHABLE unless `mode === 'performance' && hasHumanSource === true`.
 * Every other combination routes to `reauthor` (performance mode, no
 * human take on file — doubt is resolved by re-authoring the part, not by
 * softer wording) or `unowned` (generate mode — the tool invented this,
 * so there is no human version to point at in the first place; citation
 * is a badge for what a human made and a tool performed, never for what a
 * tool made).
 */
export function resolveCitation(input: AiEntryInput): CitationOutcome {
  const { mode, component, hasHumanSource } = input

  if (mode === 'generate') {
    return {
      kind: 'unowned',
      mode,
      component,
      reason:
        'AI created this rather than performing something already written — owned by no one until a human re-authors it.',
    }
  }

  // mode === 'performance'
  if (hasHumanSource) {
    return { kind: 'cited', mode, component, citation: buildSafeCitation(component) }
  }

  return {
    kind: 'reauthor',
    mode,
    component,
    reason:
      "There's no human take of this in the diary yet, so the citation can't be trusted — re-author the part first, then it becomes true.",
  }
}

// ─── Level resolution — CAT-Q3's placement rule ───────────────────────

/**
 * A performance entry attaches to the VERSION — it washes out naturally
 * the moment a human re-records that part, so pinning it to the work
 * would outlive its own relevance.
 *
 * A generated lyric or melody attaches to the WORK — these are
 * compositional, they persist through graduation, and they should: the
 * work IS that lyric and that melody until a human replaces them. `full`
 * (an entirely generated track) is treated the same way, since an
 * all-generated track necessarily includes the compositional layer.
 *
 * A generated vocal or instrument is still a recorded TAKE of something —
 * version-level, same as a performance entry, just without the
 * when-in-doubt citation available to it.
 */
export function resolveLevel(mode: AiEntryMode, component: AiEntryComponent): AiEntryLevel {
  if (mode === 'performance') return 'version'
  if (component === 'lyric' || component === 'melody' || component === 'full') return 'work'
  return 'version'
}

// ─── Crate consequence — the two disqualifiers + the BGV clause ──────

/**
 * The Crate rule has exactly two disqualifiers and one disclosure tier
 * (doctrine, owner-refined 2026-08-30):
 *
 * 1. Wholly AI-generated masters — not eligible, ownership grounds.
 *    `component === 'full'` means the ENTIRE recording came from the
 *    tool, whether it generated the song from scratch or performed an
 *    existing composition end-to-end (worked example 2's genre-flip
 *    remix is exactly this: mode is "performance" of a human
 *    composition, but the resulting MASTER is still wholly AI-rendered).
 *    Ownership of the composition doesn't rescue the recording — the
 *    Crate one-stop-licenses the master, and nobody owns this one.
 *
 * 2. AI vocals — the one hard "no AI," for now (owner: a current stance,
 *    not eternal doctrine). The BGV clause is the single test for every
 *    voice on a candidate master, lead or background: "can you point to
 *    the human take it came from?" Mode doesn't matter here — a
 *    voice-converted layer built from a human take (swap) and an
 *    AI-performed vocal with no scratch take on file both reduce to this
 *    one question. YES → production, eligible, disclosed. NO → the hard
 *    no; the one-pass fix (owner's words) is to track a rough human take
 *    of that part so the tool can build from it instead.
 *
 * Everything else — instrument, lyric, or melody at COMPONENT level
 * inside an otherwise human-produced master — is rule 3's territory: AI
 * instrumentation/MIDI/beats are eligible, disclosed, full stop. Nothing
 * in the doctrine disqualifies a component-level AI lyric or melody line
 * either; only a wholly AI master or an AI vocal does that.
 */
export function resolveCrateConsequence(input: AiEntryInput): CrateConsequence {
  const { component, hasHumanSource } = input

  if (component === 'full') {
    return {
      eligible: false,
      disclosed: false,
      reason:
        'A wholly AI-generated master has no owner to license from — not eligible on ownership grounds.',
    }
  }

  if (component === 'vocal') {
    if (hasHumanSource) {
      return {
        eligible: true,
        disclosed: true,
        note: 'Built from a human take on file — production, not generation. Disclosed to the buyer.',
      }
    }
    return {
      eligible: false,
      disclosed: false,
      reason:
        "An AI voice singing a part no human performed is the one hard no for The Crate, for now — background doesn't launder it.",
      fix:
        "Your singer's already here — track a rough human take of that part and the AI can build from it instead. That keeps the Crate door open.",
    }
  }

  // instrument, lyric, melody — component-level, inside an otherwise
  // human-produced master.
  return {
    eligible: true,
    disclosed: true,
    note: 'A component inside an otherwise human-produced master — eligible, disclosed to the buyer.',
  }
}

// ─── Receipt — the four statements, always ────────────────────────────

function citationLine(outcome: CitationOutcome): string {
  if (outcome.kind === 'cited') return outcome.citation
  if (outcome.kind === 'reauthor') return `Not cited yet — ${outcome.reason}`
  return `Owned by no one — ${outcome.reason}`
}

function crateLine(consequence: CrateConsequence): string {
  if (consequence.eligible) return `Crate: eligible — ${consequence.note}`
  const fix = consequence.fix ? ` Fix: ${consequence.fix}` : ''
  return `Crate: not eligible — ${consequence.reason}${fix}`
}

/**
 * Composes the four-statement receipt sketch 002-A specifies: the
 * citation line, the splits effect (ALWAYS zero — no component, mode or
 * level changes it, per CAT-Q1a: AI takes nothing, ever), the release
 * effect, and the Crate consequence.
 *
 * Plan 06's route calls this at WRITE time and stores the resulting
 * strings on the `ai_entries` row — never regenerated at render. What a
 * buyer or a registrar later reads is exactly what the artist was shown
 * when they filed it, not a string a newer version of this module might
 * phrase differently. Do not call this from a render path expecting live
 * copy; it is a write-time snapshot generator.
 */
export function composeReceipt(input: AiEntryInput): Receipt {
  const citationOutcome = resolveCitation(input)
  const level = resolveLevel(input.mode, input.component)
  const crateConsequence = resolveCrateConsequence(input)

  const releaseEffect =
    level === 'version'
      ? "Release: only matters if this take reaches the released master — it washes out automatically the moment a human re-records, and needs no disclosure until then. The citation lives on in the work's history as provenance either way."
      : "Release: carries through to the release, since it's part of the composition itself. The citation lives on in the work's history as provenance."

  return {
    citation: citationLine(citationOutcome),
    // A constant, on purpose — see module header. No branch above this
    // point may make it read otherwise; AI takes zero splits, always.
    splitsEffect: 'Splits: unaffected. AI takes zero — on every entry, every time.',
    releaseEffect,
    crateConsequence: crateLine(crateConsequence),
  }
}

// ─── First-entry routing (sketch 002 — B first time, A after) ────────

/**
 * The single condition that routes plan 09's AI-entry UI to the
 * conversational pacing (sketch 002-B) instead of the two-door form
 * (002-A). Kept as its own one-line function rather than an inline
 * `=== 0` check so the routing rule has one name and one place to change.
 */
export function isFirstEverAiEntry(priorEntryCount: number): boolean {
  return priorEntryCount === 0
}
