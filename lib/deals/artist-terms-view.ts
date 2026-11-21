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
}

const ARTIST_TERMS_OPEN_COPY =
  "Every license request across your projects, with its current deal stage. Funūn handles negotiation and buyer communication for you. Set pre-cleared terms on a song to help requests move faster."

// Promises nothing: no date, no notification commitment, no implication the
// pause is good or bad news.
const ARTIST_TERMS_WITHHELD_COPY =
  "Every license request for your songs, with its current deal stage. Funūn handles negotiation and buyer communication for you. Pre-cleared terms are moving onto a song by song footing, so terms setting is paused for now."

export function artistTermsView(input: ArtistTermsViewInput): ArtistTermsView {
  const { withheld } = input

  return {
    showTermsLinks: !withheld,
    introCopy: withheld ? ARTIST_TERMS_WITHHELD_COPY : ARTIST_TERMS_OPEN_COPY,
  }
}
