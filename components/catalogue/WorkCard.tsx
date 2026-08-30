import Link from 'next/link'

// ─── WorkCard — the catalogue's card (Phase 37.1, S-03) ────────────────
// Deliberately LIGHTER than components/vault/VaultProjectCard.tsx. A work
// has no artwork, no release date, no distributor and no ISRC — reusing
// the release card here would show an artist four empty gates on a song
// that is three days old. This card shows only what a work actually has:
// title, version progress (with the latest take's numeral), structure
// progress, who's on it, the splits state in a word, and when it last
// moved.
//
// READINESS RING, DELIBERATELY ABSENT: the doctrine's rights-readiness
// scorecard (deliberation scope item 1) is NOT in 37.1. Rather than fill
// this card's corner with a release-readiness number that would be
// meaningless for a song going nowhere yet, the slot is left empty —
// a future plan fills it with the real thing, not a placeholder metric.
//
// A LEGACY row (a pre-37 `vault_projects` row typed `unreleased`) renders
// the same card shape with a small marker instead of version/section/
// splits facts it does not have, and links to its existing project room
// (`/vault/[id]`) rather than the composer (`/vault/works/[id]`) — see
// app/(artist)/vault/page.tsx's own RESEARCH Pitfall 4 comment for why
// this merge happens in application code, never a migration.

export type CatalogueWorkContributor = {
  /** work_members.id — the React key, not an identity fact. */
  id: string
  /** One or two glyphs for the avatar dot, resolved by the caller (page.tsx), never guessed here. */
  initial: string
  name: string | null
  isOwner: boolean
}

export type CatalogueWorkCard = {
  kind: 'work'
  id: string
  title: string
  versionCount: number
  /** Null only when versionCount === 0 — deriveVersionNumerals()/latestVersion() (lib/catalogue/versions.ts) already guard this; never recomputed here. */
  latestVersionNumeral: number | null
  blockCount: number
  contributors: CatalogueWorkContributor[]
  /** The split sheet's status, or 'none' when the work has no sheet row at all. Resolved by the caller — this component only translates it to a word. */
  splitsStatus: 'none' | 'draft' | 'pending_approval' | 'approved' | 'countered' | 'esign_pending' | 'executed'
  /** How many people are actually on the sheet — distinct from work membership (PITFALL 3, doctrine). */
  writerCount: number
  lastActivityAt: string
}

export type CatalogueLegacyCard = {
  kind: 'legacy'
  id: string
  title: string
  lastActivityAt: string
}

export type CatalogueCard = CatalogueWorkCard | CatalogueLegacyCard

// ─── Splits state, in a word (never a percentage — CAT-Q1a) ────────────
const SPLITS_STATUS_LABEL: Record<CatalogueWorkCard['splitsStatus'], string> = {
  none: 'No sheet yet',
  draft: 'Drafting',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  countered: 'Countered',
  esign_pending: 'Signing',
  executed: 'Executed',
}

function splitsStateLabel(card: CatalogueWorkCard): string {
  if (card.splitsStatus === 'none') return SPLITS_STATUS_LABEL.none
  if (card.writerCount === 0) return 'No writers yet'
  return SPLITS_STATUS_LABEL[card.splitsStatus]
}

// ─── Relative time — a small local copy, same treatment DiaryFeed.tsx
// already gives ActivityFeed.tsx's own timeAgo(): worth duplicating a
// few lines rather than exporting a formatting helper from a component
// that has nothing else in common with this one. ──────────────────────
function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Same two-gradient identity treatment as LyricBlockCard.tsx's AvatarDot
// — built from the individual `brandindigo`/`brandfuchsia`/`emerald-400`/
// `blue-400` tokens rather than the shared `bg-grad` utility, which this
// plan's own prohibition reserves as a single per-page CTA spend.
const OWNER_GRADIENT = 'bg-gradient-to-br from-brandindigo to-brandfuchsia'
const COLLABORATOR_GRADIENT = 'bg-gradient-to-br from-emerald-400 to-blue-400'

function ContributorDot({ initial, name, isOwner }: CatalogueWorkContributor) {
  return (
    <span
      title={name ?? undefined}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-card text-[10px] font-extrabold text-white ${
        isOwner ? OWNER_GRADIENT : COLLABORATOR_GRADIENT
      }`}
    >
      {initial}
    </span>
  )
}

function LegacyWorkCard({ card }: { card: CatalogueLegacyCard }) {
  return (
    <Link
      href={`/vault/${card.id}`}
      className="group block rounded-card border border-hair bg-card px-5 py-[18px] transition hover:border-hairstrong"
    >
      <span className="inline-flex items-center gap-[6px] rounded-full border border-hairstrong bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-lavdim">
        Legacy project
      </span>
      <div className="mt-3 text-[17px] font-bold tracking-[-.01em] text-white">{card.title}</div>
      <div className="mt-2 text-[12px] font-medium text-lavdim">Last activity {timeAgo(card.lastActivityAt)}</div>
    </Link>
  )
}

export function WorkCard({ card }: { card: CatalogueCard }) {
  if (card.kind === 'legacy') return <LegacyWorkCard card={card} />

  const versionLine =
    card.versionCount === 0
      ? 'No versions yet'
      : `${card.versionCount} version${card.versionCount === 1 ? '' : 's'} · v${card.latestVersionNumeral}`

  return (
    <Link
      href={`/vault/works/${card.id}`}
      className="group block rounded-card border border-hair bg-card px-5 py-[18px] transition hover:border-hairstrong"
    >
      <div className="text-[17px] font-bold tracking-[-.01em] text-white">{card.title}</div>

      <div className="mt-3 text-[13px] font-medium text-lavdim">{versionLine}</div>

      {/* Block count OR nothing — an empty pad renders no line at all
          rather than "0 sections", matching the release card's own
          zero-suppression on optional facts. */}
      {card.blockCount > 0 && (
        <div className="mt-1 text-[13px] font-medium text-lavdim">
          {card.blockCount} section{card.blockCount === 1 ? '' : 's'}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center -space-x-1.5">
          {card.contributors.map(c => (
            <ContributorDot key={c.id} {...c} />
          ))}
        </div>
        <span className="text-[12px] font-semibold text-lavdim">{splitsStateLabel(card)}</span>
      </div>

      <div className="mt-3 text-[11px] text-lavdim">{timeAgo(card.lastActivityAt)}</div>
    </Link>
  )
}
