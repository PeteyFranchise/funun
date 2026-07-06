import Link from 'next/link'
import type { VaultProjectStatus, VaultProjectType } from '@/types'
import { VAULT_PROJECT_TYPE_LABELS } from '@/types'

// ─── Release card (.rcard) ───────────────────────────────────────────
// Full-bleed cover (gloss scrim + status chip + readiness ring) over a
// meta block. Ring/right-label banding matches the design: ≥80 green,
// ≥50 amber, else rose.

export type VaultCard = {
  id: string
  title: string
  type: VaultProjectType
  artist: string | null
  status: VaultProjectStatus
  score: number
  completeItems: number
  totalItems: number
  trackCount: number
  releaseDate: string | null
  coverUrl: string | null
  lane: 'live' | 'scheduled' | 'draft'
}

type Band = { arc: string; value: string }
function band(score: number): Band {
  if (score >= 80) return { arc: '#34D399', value: '#34D399' }
  if (score >= 50) return { arc: '#F59E0B', value: '#F4C77B' }
  return { arc: '#F43F5E', value: '#F43F5E' }
}

const CHIP: Record<VaultProjectStatus, { cls: string; text: string }> = {
  released: { cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', text: 'Live' },
  submitted: { cls: 'text-money2 bg-money/10 border-money/30', text: 'In review' },
  vault_ready: { cls: 'text-brandindigo bg-brandindigo/10 border-brandindigo/30', text: 'Scheduled' },
  in_progress: { cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30', text: 'Draft' },
  shelved: { cls: 'text-rose-400 bg-rose-500/10 border-rose-500/30', text: 'Shelved' },
  archived: { cls: 'text-lavdim bg-white/5 border-hairstrong', text: 'Archived' },
}

function dateLine(card: VaultCard): string {
  if (!card.releaseDate) return 'No date set'
  const d = new Date(card.releaseDate).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return card.status === 'released' ? `Released ${d}` : `Drops ${d}`
}

function rightLabel(card: VaultCard): { text: string; cls: string } {
  const gatesLeft = Math.max(0, card.totalItems - card.completeItems)
  if (card.score >= 80) return { text: 'Deal-ready', cls: 'gtext' }
  if (card.score >= 50)
    return {
      text: gatesLeft > 0 ? `${gatesLeft} gate${gatesLeft === 1 ? '' : 's'} left` : 'Almost ready',
      cls: 'text-money2',
    }
  return { text: 'Needs work', cls: 'text-rose-400' }
}

export function VaultProjectCard({ card }: { card: VaultCard }) {
  const b = band(card.score)
  const chip = CHIP[card.status]
  const right = rightLabel(card)
  const typeLabel = VAULT_PROJECT_TYPE_LABELS[card.type]

  return (
    <Link
      href={`/vault/${card.id}/play`}
      className="group block overflow-hidden rounded-card border border-hair bg-card transition hover:border-hairstrong"
    >
      {/* Cover */}
      <div
        className="relative flex h-[182px] items-end bg-gradient-to-br from-brandindigo/40 to-brandfuchsia/30 bg-cover bg-center"
        style={card.coverUrl ? { backgroundImage: `url('${card.coverUrl}')` } : undefined}
      >
        {/* gloss scrim */}
        <div
          className="absolute inset-0 z-[1]"
          style={{
            background:
              'linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,0) 24%,rgba(0,0,0,0) 52%,rgba(0,0,0,.58) 100%)',
          }}
        />
        {!card.coverUrl && (
          <div className="absolute inset-0 z-[1] flex items-center justify-center text-3xl font-black text-white/70">
            {typeLabel.charAt(0)}
          </div>
        )}
        {/* status chip */}
        <span
          className={`absolute left-[14px] top-[14px] z-[2] inline-flex items-center gap-[7px] rounded-full border px-[11px] py-[5px] text-[12.5px] font-bold ${chip.cls}`}
        >
          <span className="h-[7px] w-[7px] rounded-full bg-current" />
          {chip.text}
        </span>
        {/* readiness ring */}
        <div
          className="absolute -bottom-[26px] right-[18px] z-[3] flex h-[66px] w-[66px] items-center justify-center rounded-full shadow-[0_8px_22px_rgba(0,0,0,.5)]"
          style={{
            background: `conic-gradient(${b.arc} 0 ${card.score}%,rgba(199,203,247,.14) ${card.score}% 100%)`,
          }}
        >
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#0c0b1a]">
            <span className="tnum text-[21px] font-extrabold leading-none" style={{ color: b.value }}>
              {card.score}
            </span>
          </span>
        </div>
      </div>

      {/* Meta */}
      <div className="px-5 pb-[22px] pt-5">
        <div className="text-[19px] font-bold tracking-[-.01em] text-white">{card.title}</div>
        <div className="mt-1 text-[14px] font-medium text-lavdim">
          {card.artist ? `${card.artist} · ` : ''}
          {typeLabel}
        </div>
        <div className="mt-4 flex items-center gap-2 text-[13px] font-medium text-lavdim">
          {card.trackCount} track{card.trackCount === 1 ? '' : 's'}
          <span className="h-[3px] w-[3px] rounded-full bg-lavdim" />
          {dateLine(card)}
        </div>
        <div className="mt-[18px] flex justify-between text-[12px] font-semibold text-lavdim">
          <span>Release readiness</span>
          <span className={`${right.cls} font-bold`}>{right.text}</span>
        </div>
      </div>
    </Link>
  )
}
