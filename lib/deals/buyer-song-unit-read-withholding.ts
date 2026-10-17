// ─── Phase 50.5 Task 2 — READ/RENDER withholding ────────────────────────────
// The companion to lib/deals/buyer-song-unit-withholding.ts, which freezes
// commercial WRITES. That module is Codex-owned; this one is the read half and
// must not duplicate it.
//
// WHY THIS EXISTS. Until `crate_songs` holds its own captured facts, every
// Crate answer is computed by dereferencing the artist's live Sound Vault rows.
// Some of those answers are project-shaped: a clearance badge taken from one
// "representative" sibling, a readiness fraction summed across a whole release,
// a staff note written about a different song. A buyer or a staff member cannot
// tell a borrowed answer from a real one, which is precisely the problem.
//
// So these surfaces say "we are confirming this" rather than answering wrongly.
// Silence would read as "fine"; a wrong answer reads as a fact. Neither is
// acceptable on a page where someone decides whether they can license a song.
//
// REMOVAL. Each flag comes off individually, on its own evidence, once the
// surface reads from the captured song. A bulk re-enable throws away the only
// thing this buys: knowing which replacement was actually proven.

export const BUYER_SONG_UNIT_READS_WITHHELD = true

/** Every read surface currently answering a song question from a project fact. */
export const WITHHELD_READ_SURFACES = [
  'buyer_clearance_badge',
  'staff_rights_detail',
  'staff_sibling_note_fallback',
  'usage_cleared_filter',
  'project_readiness_figure',
] as const

export type WithheldReadSurface = (typeof WITHHELD_READ_SURFACES)[number]

/**
 * True while `surface` must not render a project-derived answer.
 *
 * Takes the surface name so flags can be lifted one at a time. Today they share
 * one switch; the signature is what makes the staged removal possible without
 * touching every call site again.
 */
export function isReadWithheld(surface: WithheldReadSurface): boolean {
  return BUYER_SONG_UNIT_READS_WITHHELD && WITHHELD_READ_SURFACES.includes(surface)
}

// ─── Honest withheld copy ───────────────────────────────────────────────────
// Industry voice, no dashes, and it promises nothing. It must not imply the
// answer is bad news, or good news, or imminent.

/** Staff: replaces the project-wide "n/m required rights documents signed". */
export const STAFF_RIGHTS_DETAIL_WITHHELD = 'Rights detail for this song is being confirmed'

/** Buyer: shown where a clearance badge would otherwise sit. */
export const BUYER_CLEARANCE_WITHHELD = 'Clearance required'
