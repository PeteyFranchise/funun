import type { CatalogRow } from '@/components/buyer/CatalogBrowserLight'
import type { CatalogCard } from '@/lib/deals/catalog'

// ─── Buyer-catalogue light view-model ─────────────────────────────────────
// The buyer browse renders the faithful light table from a CatalogRow
// view-model. The live CatalogCard shape (id/title/type/genre/coverArtUrl/
// tracks) does NOT yet carry artist name, energy, aggregate length, mood,
// vocal, instruments, or the tri-state rights signal — enriching the catalog
// query with those is slice 1.5. Until then, mapCardsToLightRows maps what
// exists and the page falls back to SAMPLE_CATALOG_ROWS (representative, real
// album-art covers) so the design + the working filters render in full.

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

// Best-effort mapping from the live catalog data. Fields the live shape does
// not yet carry (artist, energy, length, mood, vocal, instruments) render
// blank until slice 1.5 enriches the query.
export function mapCardsToLightRows(cards: CatalogCard[]): CatalogRow[] {
  return cards.map(c => ({
    id: c.id,
    title: c.title,
    artist: '',
    coverUrl: c.coverArtUrl,
    gradient: gradientFor(c.id),
    genres: c.genre ?? '',
    energy: '',
    length: '',
    versions: Math.max(1, c.tracks.length),
    rights: 'ok' as const, // the live query only returns rights-ready catalog today
    dynamics: 'steady' as const,
    mood: '',
    vocal: '',
    instruments: [],
    // 22-02 — real ids so the License modal can POST a request that passes
    // the route's authorizeRequestTarget + track-membership checks.
    vaultProjectId: c.id,
    tracks: c.tracks.map(t => ({ id: t.id, title: t.title ?? 'Untitled track' })),
  }))
}

// Representative catalogue for the faithful design render + the working filters.
// Real album-art covers live in public/buyer-catalogue/. vaultProjectId/tracks
// below are SYNTHETIC (reuse the row's own fixture id) — they exist only so
// the modal's track selector renders; a License submit over a fixture row is
// expected to 404 at the route's authorizeRequestTarget gate (no matching
// vault_projects row exists). Real deals require live rows (slice 1.5 / 22-05).
export const SAMPLE_CATALOG_ROWS: CatalogRow[] = [
  { id: 's1', title: 'Paper', artist: 'Maya Reyes', coverUrl: '/buyer-catalogue/paper.jpg', gradient: GRADIENTS[1], genres: 'Alt-Pop, Electronic', energy: 'Medium', length: '3:24', versions: 1, rights: 'ok', dynamics: 'twin', mood: 'Driving', vocal: 'Vocal', instruments: ['Synth', 'Guitar'], vaultProjectId: 's1', tracks: [{ id: 's1-t1', title: 'Paper' }] },
  { id: 's2', title: 'Moonlight', artist: 'Maya Reyes', coverUrl: '/buyer-catalogue/moonlight.jpg', gradient: GRADIENTS[0], genres: 'Ambient, Cinematic', energy: 'Low', length: '3:05', versions: 2, rights: 'ok', dynamics: 'steady', mood: 'Cinematic', vocal: 'Instrumental', instruments: ['Piano', 'Strings'], vaultProjectId: 's2', tracks: [{ id: 's2-t1', title: 'Moonlight' }] },
  { id: 's3', title: 'Cross the Wire', artist: 'Sable Roy', coverUrl: '/buyer-catalogue/midnight-ride.jpg', gradient: GRADIENTS[5], genres: 'Synthwave, Electronic', energy: 'High', length: '3:42', versions: 1, rights: 'ok', dynamics: 'build', mood: 'Driving', vocal: 'Vocal', instruments: ['Synth'], vaultProjectId: 's3', tracks: [{ id: 's3-t1', title: 'Cross the Wire' }] },
  { id: 's4', title: 'Golden Hour', artist: 'Ledger & Vine', coverUrl: '/buyer-catalogue/golden-hour.jpg', gradient: GRADIENTS[4], genres: 'Soul, Pop', energy: 'Low-Medium', length: '4:11', versions: 1, rights: 'part', dynamics: 'twin', mood: 'Warm', vocal: 'Vocal', instruments: ['Guitar', 'Piano'], vaultProjectId: 's4', tracks: [{ id: 's4-t1', title: 'Golden Hour' }] },
  { id: 's5', title: 'Lantern', artist: 'Odile Faye', coverUrl: '/buyer-catalogue/lantern.jpg', gradient: GRADIENTS[2], genres: 'Folk, Singer-Songwriter, Acoustic', energy: 'Medium', length: '3:12', versions: 3, rights: 'ok', dynamics: 'fade', mood: 'Pensive', vocal: 'Vocal', instruments: ['Guitar', 'Strings'], vaultProjectId: 's5', tracks: [{ id: 's5-t1', title: 'Lantern' }] },
  { id: 's6', title: 'Static Heart', artist: 'The Warm Fronts', coverUrl: '/buyer-catalogue/static-heart.jpg', gradient: GRADIENTS[2], genres: 'Indie Rock, Alternative', energy: 'Medium-High', length: '3:58', versions: 1, rights: 'req', dynamics: 'peak', mood: 'Driving', vocal: 'Vocal', instruments: ['Guitar'], vaultProjectId: 's6', tracks: [{ id: 's6-t1', title: 'Static Heart' }] },
  { id: 's7', title: 'Slow Static', artist: 'Junia Vale', coverUrl: null, gradient: GRADIENTS[0], genres: 'Downtempo, Electronic', energy: 'Low', length: '4:36', versions: 1, rights: 'ok', dynamics: 'fade', mood: 'Pensive', vocal: 'Instrumental', instruments: ['Synth'], vaultProjectId: 's7', tracks: [{ id: 's7-t1', title: 'Slow Static' }] },
  { id: 's8', title: 'Brass Season', artist: 'Ilo Marchetti', coverUrl: null, gradient: GRADIENTS[4], genres: 'Jazz, Cinematic', energy: 'High', length: '2:48', versions: 2, rights: 'part', dynamics: 'peak', mood: 'Warm', vocal: 'Instrumental', instruments: ['Brass', 'Piano'], vaultProjectId: 's8', tracks: [{ id: 's8-t1', title: 'Brass Season' }] },
]
