// ─── Artist terms view (261121-505 Task 3) ─────────────────────────────────
// Pure decision logic shared by components/deals/ArtistDealsList.tsx and
// app/(artist)/deals/page.tsx, matching the house pattern set by
// lib/deals/admin-deal-queue-view.ts: an explicit boolean withholding input,
// never `isReadWithheld` called from inside this module.
//
// WHY THIS EXISTS. The "Review pre-cleared terms" link pointed at the
// PROJECT's Rights page, where terms cover every song on the project at
// once. A deal is about one song, so the link answered a different question
// than the row it sat under — and the project licensing route is frozen
// while terms move onto a song by song footing. Both call sites used to make
// this decision independently, which is how the deal-queue chips drifted
// into being dead in the first place; this routes both through one helper.

export type ArtistTermsViewInput = {
  /** True while the `artist_project_terms_links` read surface must stay withheld. */
  withheld: boolean
}

export type ArtistTermsView = {
  /** False while withheld — the per-row "Review pre-cleared terms" link must not render. */
  showTermsLinks: boolean
  introCopy: string
  /** The zero-row empty state's second sentence — the seam's decision, not the component's. */
  emptyStateCopy: string
}

const ARTIST_TERMS_OPEN_COPY =
  "Every license request across your projects, with its current deal stage. Funūn handles negotiation and buyer communication for you. Set pre-cleared terms on a song to help requests move faster."

// Promises nothing: no date, no notification commitment, no implication the
// pause is good or bad news, and no timing phrase ("for now", "currently", or
// similar) anywhere in the sentence. A previous revision of this comment made
// that same "promises nothing" claim while the string below still carried
// "for now" — a comment that denies what the string says is exactly how that
// got past review (261121-sqi). The test at artist-terms-view.test.ts widens
// its forbidden-phrase list for the same reason.
const ARTIST_TERMS_WITHHELD_COPY =
  "Every license request for your songs, with its current deal stage. Funūn handles negotiation and buyer communication for you. Pre-cleared terms are moving onto a song by song footing, so terms setting is paused."

// Zero-row empty state. Keep the open sentence exactly as it has always
// read — only the withheld sentence changes, because the open sentence's
// "Rights page" instruction is project-level and must not be reachable while
// `artist_project_terms_links` stays withheld (261121-sqi Task 1).
const ARTIST_TERMS_EMPTY_OPEN_COPY =
  "Set pre-cleared terms on a project's Rights page so matching requests move straight to contract."
const ARTIST_TERMS_EMPTY_WITHHELD_COPY =
  "Pre-cleared terms are moving onto a song by song footing, so terms setting is paused."

export function artistTermsView(input: ArtistTermsViewInput): ArtistTermsView {
  const { withheld } = input

  return {
    showTermsLinks: !withheld,
    introCopy: withheld ? ARTIST_TERMS_WITHHELD_COPY : ARTIST_TERMS_OPEN_COPY,
    emptyStateCopy: withheld ? ARTIST_TERMS_EMPTY_WITHHELD_COPY : ARTIST_TERMS_EMPTY_OPEN_COPY,
  }
}
