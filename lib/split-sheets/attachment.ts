// ─── Song-level attachment (18-03) ────────────────────────────────────
// Pure functions supporting split-sheet-to-track attachment: fuzzy title
// matching for the picker (both directions, 17-DUAL-ENTRY-DESIGN section
// 3), same-track conflict detection (section 7), and the renamed-after-
// signing display record (section 7). Nothing here writes anything — the
// routes in app/api/split-sheets/[id]/attach and .../detach own every
// write, after their own party-AND-owner authorization checks.

import { normalizeName } from '@/lib/split-sheets/reconciliation'

// ─── Title normalization ───────────────────────────────────────────────
// Builds on reconciliation.ts's normalizeName (trim + case-fold) rather
// than inventing a second base normalization, then folds punctuation and
// whitespace and discounts common decorations — a parenthesized remix or
// feature suffix — so "Neon Hours" and "Neon Hours (feat. Aria)" compare
// as the same underlying title rather than a mismatch.

/** Strips a trailing/embedded parenthesized or bracketed decoration, e.g. "(Remix)", "[feat. X]". */
function stripDecorations(title: string): string {
  return title.replace(/[([][^)\]]*[)\]]/g, ' ')
}

/** Folds punctuation to spaces and collapses whitespace, after the shared name normalization. */
function normalizeTitle(title: string): string {
  return normalizeName(stripDecorations(title))
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Classic edit-distance, used only to derive a bounded 0..1 similarity ratio below. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1])
    }
    prev = curr
  }
  return prev[b.length]
}

/** 1.0 = identical normalized titles, 0.0 = nothing in common. */
function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (!na && !nb) return 1
  if (!na || !nb) return 0
  if (na === nb) return 1
  const distance = levenshtein(na, nb)
  const maxLen = Math.max(na.length, nb.length)
  return maxLen === 0 ? 1 : Math.max(0, 1 - distance / maxLen)
}

// A leading candidate is only ever marked when it clears this bar. Chosen
// high deliberately: a wrong confident suggestion on a legal document is
// worse than no suggestion at all (design section 7 / must_haves).
const CONFIDENCE_THRESHOLD = 0.72

export type TrackCandidate = { id: string; title: string }

export type TrackMatch = {
  id: string
  title: string
  /** 0..1 title-similarity score against the sheet's song name. */
  score: number
  /** True on at most one row — the leading candidate — and only when score clears CONFIDENCE_THRESHOLD. */
  suggested: boolean
}

/**
 * Orders a project's tracks by title similarity to the sheet's song name.
 * A renamed song produces a weak or zero match rather than a wrong
 * confident one — `suggested` is never true unless the top score clears
 * CONFIDENCE_THRESHOLD, so the caller can safely surface it as a
 * suggestion, never a preselection.
 */
export function suggestTrackMatches(songName: string, tracks: TrackCandidate[]): TrackMatch[] {
  const scored = tracks
    .map(t => ({ id: t.id, title: t.title, score: titleSimilarity(songName, t.title) }))
    .sort((a, b) => b.score - a.score)

  return scored.map((t, i) => ({
    ...t,
    suggested: i === 0 && t.score >= CONFIDENCE_THRESHOLD,
  }))
}

// ─── Same-track conflicts (design section 7) ──────────────────────────
// "Two sheets claim the same track" is allowed and flagged loudly, never
// blocked — the artist may be mid-correction. This function only reports.

export type AttachmentLite = { sheetId: string; trackId: string | null }

export type TrackConflict = { trackId: string; sheetIds: string[] }

/** Every non-null track id claimed by more than one sheet, with the claiming sheet ids. Never resolves anything. */
export function detectTrackConflicts(attachments: AttachmentLite[]): TrackConflict[] {
  const bySheet = new Map<string, Set<string>>()
  for (const a of attachments) {
    if (!a.trackId) continue
    if (!bySheet.has(a.trackId)) bySheet.set(a.trackId, new Set())
    bySheet.get(a.trackId)!.add(a.sheetId)
  }

  const conflicts: TrackConflict[] = []
  for (const [trackId, sheetIds] of bySheet) {
    if (sheetIds.size > 1) conflicts.push({ trackId, sheetIds: [...sheetIds] })
  }
  return conflicts
}

// ─── Renamed-after-signing display (design section 7) ─────────────────
// Data only — never a rendered sentence, and never an implication that the
// executed PDF should be regenerated. The document says the old title
// correctly, because that is what was signed.

export type SignedTitleRecord = {
  signedAs: string
  currentTitle: string
  diverges: boolean
}

export function describeSignedTitle(sheetSongName: string, currentTrackTitle: string): SignedTitleRecord {
  return {
    signedAs: sheetSongName,
    currentTitle: currentTrackTitle,
    diverges: normalizeTitle(sheetSongName) !== normalizeTitle(currentTrackTitle),
  }
}
