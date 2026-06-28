import type { CollaboratorProfile } from '@/lib/collaborators'
import { assembleDisplayName } from '@/lib/collaborators'
import { PRO_LABELS } from '@/lib/metadata/schema'

// ─── CollaboratorCard ─────────────────────────────────────────
// Renders a single collaborator in the roster grid.
// IPI-missing cards show a warning badge and left-border accent (D-05, D-11).

type Props = {
  collaborator: CollaboratorProfile
  onEdit: () => void
}

export function CollaboratorCard({ collaborator, onEdit }: Props) {
  const { pro, ipi } = collaborator
  const name = assembleDisplayName(collaborator)
  const proLabel = pro && pro !== 'none' ? PRO_LABELS[pro as keyof typeof PRO_LABELS] ?? pro : null
  const hasIpi = Boolean(ipi && ipi.trim())

  return (
    <div
      className={[
        'relative flex flex-col gap-2 rounded-[18px] border bg-card p-4',
        hasIpi ? 'border-hair' : 'border-hair border-l-2 border-l-amber-400/70',
      ].join(' ')}
    >
      {/* Name */}
      <p className="text-[14.5px] font-bold text-white">{name}</p>

      {/* PRO affiliation */}
      <p className="text-[12.5px] text-lavdim">
        {proLabel ?? 'No PRO on file'}
      </p>

      {/* IPI status badge */}
      {hasIpi ? (
        <span className="inline-flex items-center rounded-full border border-brandindigo/30 bg-brandindigo/10 px-3 py-1 text-xs font-bold text-brandindigo">
          IPI on file
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-300">
          IPI missing
        </span>
      )}

      {/* Edit trigger — ghost, bottom-right, min-32px touch target */}
      <button
        type="button"
        onClick={onEdit}
        className="absolute bottom-3 right-4 min-h-[32px] text-xs text-white/50 transition hover:text-white"
      >
        Edit
      </button>
    </div>
  )
}
