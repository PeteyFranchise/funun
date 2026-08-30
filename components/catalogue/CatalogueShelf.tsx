import Link from 'next/link'
import { WorkCard, type CatalogueCard } from './WorkCard'

// ─── CatalogueShelf — My Catalogue, the vault's first shelf (S-03) ─────
// The section app/(artist)/vault/page.tsx mounts ABOVE the existing,
// untouched Releases grid: a heading, a short subtitle in the artist-side
// possessive voice (matching "Your Sound Vault"), the grid of `WorkCard`s
// — owned works, member works and legacy `unreleased` projects, already
// merged by the page in application code — and an empty state that
// repeats the hum pitch with the 🎵 door as its only action.
//
// GRADIENT BUDGET: this component spends none. The page's own Topbar
// "New project" action already carries the page's one `bg-grad` spend
// (this plan's own prohibition: no second gradient on the vault page),
// so the empty state's action below is deliberately the plain treatment,
// not the primary-CTA one ComposerCardEmptyState uses on the composer
// page (a different page, a different budget).
//
// WHERE THE VAULT LANDS: the deliberation records that the vault "may
// land on whichever shelf was used last" for a catalogue-heavy producer
// — that last-used memory is its own 37.2 seam (no column/cookie for it
// exists yet); this component renders unconditionally in shelf order
// (My Catalogue, then Releases) and does not decide which shelf the page
// opens on.

export type CatalogueShelfProps = {
  cards: CatalogueCard[]
}

export function CatalogueShelf({ cards }: CatalogueShelfProps) {
  return (
    <div className="mb-14">
      <h2 className="text-[19px] font-bold tracking-[-.01em] text-white">My Catalogue</h2>
      <p className="mt-1 text-[13.5px] text-lavdim">
        Your songs — hums, lyrics and drafts, with a diary that proves who wrote what and when.
      </p>

      {cards.length === 0 ? (
        <div className="mt-6 rounded-card border border-hair bg-card px-[22px] py-[26px] text-center">
          <b className="text-[15px] text-white">Start with a hum</b>
          <p className="mx-auto mb-4 mt-[5px] max-w-[420px] text-[12px] text-lavdim">
            Thirty seconds of melody makes it real — and provably yours.
          </p>
          <Link
            href="/vault/new"
            className="inline-flex items-center gap-2 rounded-[10px] border border-hairstrong bg-lav/[.06] px-5 py-3 text-[13.5px] font-bold text-lav hover:text-white"
          >
            🎵 Start a song
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(card => (
            <WorkCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  )
}
