import type { CatalogRow } from '@/components/buyer/CatalogBrowserLight'
import type { CatalogCard } from '@/lib/deals/catalog'

// ─── Buyer-catalogue light view-model ─────────────────────────────────────
// The buyer browse renders the faithful light table from a CatalogRow
// view-model. 30-07 (the minimal 22-05 slice): the live CatalogCard shape
// now carries the real authored artist name, mood/energy/vocal/instruments
// (from the project's tagged track's descriptors), and the real tri-state
// rights code (derived from the SAME rights signal the sync-library gate
// uses) — mapCardsToLightRows maps these through instead of synthesizing
// blanks or a hardcoded 'ok'. Aggregate length/versions/dynamics are still
// NOT carried by CatalogCard (out of this slice's scope).
//
// ─── SAMPLE_CATALOG_ROWS DELETED 2026-10-11 (owner decision) ─────────────
// This module used to export a representative fixture of eight songs with
// invented titles and invented artist names, used as the EMPTY-STATE fallback
// on /sync and /sync/catalog. The owner-run buyer-domain preflight proved every
// buyer table holds zero rows, which meant the fallback was not a fallback at
// all — it was what the public catalogue actually rendered, to real visitors,
// on main. Its own comment admitted "a row here is a row a real buyer sees",
// its project ids were synthetic, and a licence submit over one 404s at
// authorizeRequestTarget.
//
// A catalogue of music Funūn does not represent is a false claim about what is
// available to license, so it is gone rather than hidden behind a flag. The
// buyer surfaces now render an honest empty state. /sync keeps a visual
// illustration of the catalogue idea, but it carries NO song titles and NO
// artist names — see app/sync/page.tsx's CATALOGUE_ILLUSTRATION.
//
// Do not reintroduce a fixture that can reach a buyer surface. A design
// placeholder belongs in the gitignored bench, not in a live render path.

const GRADIENTS = [
  'linear-gradient(150deg,#3b4ad0,#818cf8 60%,#c4b5fd)',
  'linear-gradient(150deg,#7c3aed,#a855f7 60%,#e9d5ff)',
  'linear-gradient(150deg,#9d174d,#db2777 60%,#fbcfe8)',
  'linear-gradient(150deg,#0f766e,#14b8a6 60%,#99f6e4)',
  'linear-gradient(150deg,#b07e1e,#f4c77b 60%,#fde9c0)',
  'linear-gradient(150deg,#1e3a8a,#3b82f6 60%,#bfdbfe)',
]

function gradientFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return GRADIENTS[h % GRADIENTS.length]
}

// Maps the live, enriched catalog data (30-07) into the Crate's CatalogRow
// view-model. length/versions/dynamics are still not carried by CatalogCard
// (out of the minimal 22-05 slice) — versions falls back to the track count
// and length/dynamics stay their prior placeholder values.
export function mapCardsToLightRows(cards: CatalogCard[]): CatalogRow[] {
  return cards.map(c => ({
    id: c.id,
    title: c.title,
    artist: c.artist,
    coverUrl: c.coverArtUrl,
    gradient: gradientFor(c.id),
    genres: c.genre ?? '',
    energy: c.energy,
    length: '',
    versions: Math.max(1, c.tracks.length),
    rights: c.rights, // real tri-state, derived from the sync-library rights signal
    dynamics: 'steady' as const,
    mood: c.mood,
    vocal: c.vocal,
    instruments: c.instruments,
    // 22-02 — real ids so the License modal can POST a request that passes
    // the route's authorizeRequestTarget + track-membership checks.
    vaultProjectId: c.id,
    tracks: c.tracks.map(t => ({ id: t.id, title: t.title ?? 'Untitled track' })),
  }))
}
