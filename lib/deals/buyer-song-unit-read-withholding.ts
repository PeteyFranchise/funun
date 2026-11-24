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
  'license_request_modal',
  'shortlist_availability',
  'artist_project_terms_links',
  'buyer_request_identity',
  'selects_ai_draft',
  'buyer_catalogue_row',
  'simulated_playback',
  'matched_precleared',
  'request_composer',
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

/**
 * Buyer: the badge's withheld state.
 *
 * It must NOT reuse 'Clearance required'. That string asserts a negative
 * outcome, and reusing it made the withholding indistinguishable from the open
 * path in both the UI and the tests — a deleted call site changed nothing
 * observable. `rightsWithheld` on the row is the distinct signal; this is its
 * label.
 */
export const BUYER_CLEARANCE_WITHHELD = 'Clearance status being confirmed'

/**
 * Buyer: replaces the multi-song licence form.
 *
 * The form let a buyer tick several songs at once, which is not how these deals
 * are done, and the write route now refuses the POST anyway. Showing the form
 * and failing after it is filled in is worse than not showing it: say what is
 * happening and give a way through.
 */
export const LICENCE_REQUEST_WITHHELD_HEADING = 'Licensing requests are paused'
// NOT "this song": the row this panel opens from is still a project, so saying
// "this song" asserts an identity the data does not carry. Say what is true.
export const LICENCE_REQUEST_WITHHELD_BODY =
  'We are moving licensing onto a song by song footing so every request names one exact recording. Email us about what you are after and we will pick it up by hand.'

/** Staff/artist: stands in for a project-level terms link or a project title. */
export const BEING_CONFIRMED = 'Being confirmed'

/**
 * Buyer: the catalogue itself, while every row is still project-shaped.
 *
 * Distinct from the genuine zero-rows state. "Nothing in here yet" would be a
 * lie if rows exist and are being held back.
 */
export const CATALOGUE_WITHHELD_HEADING = 'The catalogue is being rebuilt song by song'
export const CATALOGUE_WITHHELD_BODY =
  'Listings are moving from releases to individual recordings so every row names one exact song.'
