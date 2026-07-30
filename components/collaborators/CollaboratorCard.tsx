'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import type { CollaboratorProfile } from '@/lib/collaborators'
import { assembleDisplayName, isClaimedCollaborator } from '@/lib/collaborators'
import { PRO_LABELS } from '@/lib/metadata/schema'

// ─── CollaboratorCard ─────────────────────────────────────────
// Avatar-forward roster card. Clean at rest — avatar, name, PRO, and ONE
// primary action; everything else (Edit, Archive, Start a split sheet,
// Message, View profile) hides behind the ⋯ menu until clicked (progressive
// disclosure). The primary action is state-driven:
//   • non-member → a loud brand-gradient "Invite" — the highest-leverage
//     action on this page: it gets a collaborator onto Funūn so their rights
//     data self-maintains and they can e-sign split sheets in-app. The loud
//     buttons across the roster ARE the artist's punch-list.
//   • member → a quiet "✓ Funūn member" state (no competing CTA); avatar and
//     name link straight to their profile.

type Props = {
  collaborator: CollaboratorProfile
  onEdit: () => void
  onArchive?: () => void         // replaces onDelete for claimed rows
  onDelete?: () => void          // for unclaimed rows
  onFavoriteToggle?: () => void  // star button
  onInvite?: () => Promise<{ ok: boolean; error?: string }>
  invited?: boolean              // invite already sent (or on cooldown)
  memberHandle?: string | null   // handle of the claimed Funūn member, for the profile link
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function CollaboratorCard({
  collaborator,
  onEdit,
  onArchive,
  onDelete,
  onFavoriteToggle,
  onInvite,
  invited,
  memberHandle,
}: Props) {
  const { pro, ipi } = collaborator
  const name = assembleDisplayName(collaborator)
  const proLabel = pro && pro !== 'none' ? PRO_LABELS[pro as keyof typeof PRO_LABELS] ?? pro : null
  const hasIpi = Boolean(ipi && ipi.trim())
  const isClaimed = isClaimedCollaborator(collaborator)
  const isArchived = Boolean(collaborator.archived_at)

  const [menuOpen, setMenuOpen] = useState(false)
  const [inviteState, setInviteState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    invited ? 'sent' : 'idle'
  )
  const [inviteError, setInviteError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the ⋯ menu on any outside click.
  useEffect(() => {
    if (!menuOpen) return
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  async function handleInviteClick() {
    if (!onInvite || inviteState === 'sending' || inviteState === 'sent') return
    setInviteState('sending')
    setInviteError(null)
    const res = await onInvite()
    if (res.ok) {
      setInviteState('sent')
    } else {
      setInviteState('error')
      setInviteError(res.error ?? 'Could not send invite')
    }
  }

  // Archived rows render read-only at reduced opacity — no controls.
  if (isArchived) {
    return (
      <div className="relative flex flex-col items-center gap-2 rounded-[18px] border border-hair bg-card p-5 text-center opacity-50">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-card2 text-lg font-bold text-lavdim">
          {initialsOf(name)}
        </div>
        <p className="text-[14.5px] font-bold italic text-white">{name}</p>
        <p className="text-[12.5px] text-lavdim">{proLabel ?? 'No PRO on file'}</p>
        <span className="mt-1 inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
          Archived
        </span>
      </div>
    )
  }

  const profileHref = isClaimed && memberHandle ? `/u/${memberHandle}` : null
  const menuItemClass =
    'block w-full px-3 py-2 text-left text-[13px] text-lav transition hover:bg-white/5 hover:text-white'

  return (
    <div className="relative flex flex-col items-center gap-2 rounded-[18px] border border-hair bg-card p-5 text-center">
      {/* Favorite star — top-left, subtle until active/hovered */}
      <button
        type="button"
        onClick={onFavoriteToggle}
        aria-label={collaborator.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
        className="absolute left-3 top-3 min-h-[28px] min-w-[28px] text-base leading-none"
      >
        <span className={collaborator.is_favorite ? 'text-brandindigo' : 'text-white/15 hover:text-white/40'}>
          {collaborator.is_favorite ? '★' : '☆'}
        </span>
      </button>

      {/* ⋯ overflow menu — top-right; actions revealed only on click */}
      <div ref={menuRef} className="absolute right-2 top-2">
        <button
          type="button"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex min-h-[28px] min-w-[28px] items-center justify-center rounded-lg leading-none text-white/30 transition hover:bg-white/5 hover:text-white/70"
        >
          <span className="text-lg leading-none">⋯</span>
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-hairstrong bg-card2 py-1 text-left shadow-cta"
          >
            {profileHref && (
              <Link href={profileHref} role="menuitem" className={menuItemClass} onClick={() => setMenuOpen(false)}>
                View profile
              </Link>
            )}
            {isClaimed && (
              <Link
                href={`/split-sheets/new?collaborator=${collaborator.id}`}
                role="menuitem"
                className={menuItemClass}
                onClick={() => setMenuOpen(false)}
              >
                Start a split sheet
              </Link>
            )}
            {isClaimed && collaborator.claimed_by && (
              <Link
                href={`/messages?with=${collaborator.claimed_by}`}
                role="menuitem"
                className={menuItemClass}
                onClick={() => setMenuOpen(false)}
              >
                Message
              </Link>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); onEdit() }}
              className={menuItemClass}
            >
              Edit
            </button>
            {isClaimed ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); onArchive?.() }}
                className="block w-full px-3 py-2 text-left text-[13px] text-amber-300/90 transition hover:bg-white/5 hover:text-amber-300"
              >
                Archive
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); onDelete?.() }}
                className="block w-full px-3 py-2 text-left text-[13px] text-red-400/90 transition hover:bg-white/5 hover:text-red-400"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Avatar — brand-gradient initials (links to profile for members) */}
      {profileHref ? (
        <Link href={profileHref} className="mt-2" aria-label={`View ${name}'s profile`}>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-grad text-lg font-bold text-white">
            {initialsOf(name)}
          </span>
        </Link>
      ) : (
        <span className="mt-2 flex h-16 w-16 items-center justify-center rounded-full bg-grad text-lg font-bold text-white">
          {initialsOf(name)}
        </span>
      )}

      {/* Name (links to profile for members) */}
      {profileHref ? (
        <Link href={profileHref} className="text-[15px] font-bold text-white hover:underline">
          {name}
        </Link>
      ) : (
        <p className="text-[15px] font-bold text-white">{name}</p>
      )}

      {/* PRO subtitle */}
      <p className="text-[12.5px] text-lavdim">{proLabel ?? 'No PRO on file'}</p>

      {/* IPI-missing flag — subtle, only when missing (a small rights nudge) */}
      {!hasIpi && (
        <span className="inline-flex items-center rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
          IPI missing
        </span>
      )}

      {/* Primary action — state-driven */}
      <div className="mt-3 w-full">
        {isClaimed ? (
          <p className="flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-brandindigo">
            <span aria-hidden>✓</span> Funūn member
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={handleInviteClick}
              disabled={inviteState === 'sending' || inviteState === 'sent'}
              className={[
                'w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition',
                inviteState === 'sent'
                  ? 'cursor-default bg-white/5 text-lavdim'
                  : 'bg-grad text-white shadow-cta hover:opacity-90 disabled:opacity-60',
              ].join(' ')}
            >
              {inviteState === 'sending' ? 'Sending…' : inviteState === 'sent' ? 'Invited ✓' : 'Invite'}
            </button>
            {inviteState === 'error' && inviteError && (
              <p className="mt-1.5 text-[11px] text-red-300">{inviteError}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
