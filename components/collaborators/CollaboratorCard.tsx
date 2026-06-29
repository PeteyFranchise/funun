'use client'

import type { CollaboratorProfile } from '@/lib/collaborators'
import { assembleDisplayName, isClaimedCollaborator } from '@/lib/collaborators'
import { PRO_LABELS } from '@/lib/metadata/schema'

// ─── CollaboratorCard ─────────────────────────────────────────
// Renders a single collaborator in the roster grid.
// IPI-missing cards show a warning badge and left-border accent (D-05, D-11).
// Claimed rows show a "Funūn member" badge, Archive button (not Delete), and
// favorite star; archived rows render read-only at reduced opacity (D-10, D-12).

type Props = {
  collaborator: CollaboratorProfile
  onEdit: () => void
  onArchive?: () => void         // replaces onDelete for claimed rows
  onDelete?: () => void          // for unclaimed rows
  onFavoriteToggle?: () => void  // star button
}

export function CollaboratorCard({
  collaborator,
  onEdit,
  onArchive,
  onDelete,
  onFavoriteToggle,
}: Props) {
  const { pro, ipi } = collaborator
  const name = assembleDisplayName(collaborator)
  const proLabel = pro && pro !== 'none' ? PRO_LABELS[pro as keyof typeof PRO_LABELS] ?? pro : null
  const hasIpi = Boolean(ipi && ipi.trim())
  const isClaimed = isClaimedCollaborator(collaborator)
  const isArchived = Boolean(collaborator.archived_at)

  // Archived rows render read-only at reduced opacity — no controls
  if (isArchived) {
    return (
      <div
        className={[
          'relative flex flex-col gap-2 rounded-[18px] border bg-card p-4 opacity-50',
          hasIpi ? 'border-hair' : 'border-hair border-l-2 border-l-amber-400/70',
        ].join(' ')}
      >
        <p className="text-[14.5px] font-bold italic text-white">{name}</p>
        <p className="text-[12.5px] text-lavdim">{proLabel ?? 'No PRO on file'}</p>
        {isClaimed && (
          <span className="inline-flex items-center rounded-full border border-brandindigo/30 bg-brandindigo/10 px-2 py-0.5 text-[10px] font-bold text-brandindigo">
            Funūn member
          </span>
        )}
        <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
          Archived
        </span>
      </div>
    )
  }

  return (
    <div
      className={[
        'relative flex flex-col gap-2 rounded-[18px] border bg-card p-4',
        hasIpi ? 'border-hair' : 'border-hair border-l-2 border-l-amber-400/70',
      ].join(' ')}
    >
      {/* Favorite star — top-right, min 32×32 touch target */}
      <button
        type="button"
        onClick={onFavoriteToggle}
        aria-label={collaborator.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
        className="absolute right-4 top-3 min-h-[32px] min-w-[32px] text-lg leading-none transition"
      >
        <span
          className={
            collaborator.is_favorite
              ? 'text-brandindigo'
              : 'text-white/20 hover:text-white/50'
          }
        >
          {collaborator.is_favorite ? '★' : '☆'}
        </span>
      </button>

      {/* Name */}
      <p className="text-[14.5px] font-bold text-white">{name}</p>

      {/* PRO affiliation */}
      <p className="text-[12.5px] text-lavdim">
        {proLabel ?? 'No PRO on file'}
      </p>

      {/* Funūn member badge (claimed) — shown above IPI badge */}
      {isClaimed && (
        <span className="inline-flex items-center rounded-full border border-brandindigo/30 bg-brandindigo/10 px-2 py-0.5 text-[10px] font-bold text-brandindigo">
          Funūn member
        </span>
      )}

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

      {/* Edit trigger — ghost, bottom-left, min-32px touch target */}
      <button
        type="button"
        onClick={onEdit}
        className="absolute bottom-3 left-4 min-h-[32px] text-xs text-white/50 transition hover:text-white"
        aria-label={`Edit ${name}`}
      >
        Edit
      </button>

      {/* Archive (claimed) or Delete (unclaimed) — bottom-right */}
      {isClaimed ? (
        <button
          type="button"
          onClick={onArchive}
          className="absolute bottom-3 right-4 min-h-[32px] text-xs text-white/50 transition hover:text-amber-300"
          aria-label="Archive collaborator"
        >
          Archive
        </button>
      ) : (
        <button
          type="button"
          onClick={onDelete}
          className="absolute bottom-3 right-4 min-h-[32px] text-xs text-white/50 transition hover:text-red-400"
          aria-label={`Delete ${name}`}
        >
          Delete
        </button>
      )}
    </div>
  )
}
