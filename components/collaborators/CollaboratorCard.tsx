'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import type { CollaboratorProfile } from '@/lib/collaborators'
import { isClaimedCollaborator } from '@/lib/collaborators'
import type { CollaboratorIdentityHint } from '@/lib/collaborators/display-identity'
import {
  collaboratorDisplayName,
  collaboratorEditActionLabel,
  collaboratorInitials,
  memberProfileHref,
} from '@/lib/collaborators/display-identity'
import { CollaboratorIdentityLabel } from '@/components/collaborators/CollaboratorIdentityLabel'
import { PRO_LABELS } from '@/lib/metadata/schema'

// ─── CollaboratorCard ─────────────────────────────────────────
// Avatar-forward roster entry. Clean at rest — avatar, identity, PRO, and ONE
// primary action; everything else (Edit, Archive, Start a split sheet,
// Message, View profile) hides behind the ⋯ menu until clicked (progressive
// disclosure). The primary action is state-driven:
//   • non-member → a loud brand-gradient "Invite" — the highest-leverage
//     action on this page: it gets a collaborator onto Funūn so their rights
//     data self-maintains and they can e-sign split sheets in-app. The loud
//     buttons across the roster ARE the artist's punch-list.
//   • member → a quiet "✓ Funūn member" state (no competing CTA); avatar and
//     name link straight to their profile.
//
// TWO LAYOUTS, ONE COMPONENT (`variant`): the card grid and the dense list
// row. They are deliberately not two components — a second component would
// own a second copy of the invite state machine, the ⋯ menu and, fatally, the
// identity markup. Both layouts render the same <CollaboratorIdentityLabel>,
// which is the whole point of the disambiguation work.
//
// Identity comes from the shared display contract
// (lib/collaborators/display-identity.ts) plus a server-decided
// CollaboratorIdentityHint. The card never resolves a handle itself.

type Props = {
  collaborator: CollaboratorProfile
  onEdit: () => void
  onArchive?: () => void         // replaces onDelete for claimed rows
  onDelete?: () => void          // for unclaimed rows
  onFavoriteToggle?: () => void  // star button
  onInvite?: () => Promise<{ ok: boolean; error?: string }>
  invite?: { sentAt: string; status: string } | null  // latest invite on record — drives "Invited …" + Resend
  /** Server-resolved, viewer-scoped identity supplement (the @handle). */
  identityHint?: CollaboratorIdentityHint | null
  /** True when another active row shows the same name and neither has a handle. */
  isAmbiguous?: boolean
  /** Card grid cell (default) or dense list row. */
  variant?: 'card' | 'row'
}

// Compact relative time for the "Invited …" status line.
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return 'recently'
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return new Date(iso).toLocaleDateString()
}

export function CollaboratorCard({
  collaborator,
  onEdit,
  onArchive,
  onDelete,
  onFavoriteToggle,
  onInvite,
  invite,
  identityHint,
  isAmbiguous = false,
  variant = 'card',
}: Props) {
  const { pro, ipi } = collaborator
  const name = collaboratorDisplayName(collaborator)
  const initials = collaboratorInitials(collaborator)
  const proLabel = pro && pro !== 'none' ? PRO_LABELS[pro as keyof typeof PRO_LABELS] ?? pro : null
  const hasIpi = Boolean(ipi && ipi.trim())
  const isClaimed = isClaimedCollaborator(collaborator)
  const isArchived = Boolean(collaborator.archived_at)
  // A non-member who already has an invite on record (from a prior session).
  const hasBeenInvited = !isClaimed && Boolean(invite)
  const isRow = variant === 'row'

  const [menuOpen, setMenuOpen] = useState(false)
  const [inviteState, setInviteState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [didResend, setDidResend] = useState(false)
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

  // First invite (loud button) and resend (⋯ menu) share the same endpoint.
  async function runInvite(isResend: boolean) {
    if (!onInvite || inviteState === 'sending') return
    setDidResend(isResend)
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
      <div className="relative flex flex-col items-center gap-2 rounded-[16px] border border-hair bg-card p-4 text-center opacity-50">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-card2 text-[21px] font-bold text-lavdim">
          {initials}
        </div>
        <p className="text-[14.5px] font-bold italic text-white">{name}</p>
        <p className="text-[12.5px] text-lavdim">{proLabel ?? 'No PRO on file'}</p>
        <span className="mt-1 inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
          Archived
        </span>
      </div>
    )
  }

  // The profile link exists only where the SAFE handle exists — the same hint
  // the visible @handle comes from, so a link can never outlive the
  // disclosure decision that produced it.
  const profileHref = isClaimed ? memberProfileHref(identityHint) : null
  const menuItemClass =
    'block w-full px-3 py-2 text-left text-[13px] text-lav transition hover:bg-white/5 hover:text-white'

  const favoriteButton = (
    <button
      type="button"
      onClick={onFavoriteToggle}
      aria-label={
        collaborator.is_favorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`
      }
      className={
        isRow
          ? 'min-h-[28px] min-w-[28px] shrink-0 text-base leading-none'
          : 'absolute left-3 top-3 min-h-[28px] min-w-[28px] text-base leading-none'
      }
    >
      <span className={collaborator.is_favorite ? 'text-brandindigo' : 'text-white/15 hover:text-white/40'}>
        {collaborator.is_favorite ? '★' : '☆'}
      </span>
    </button>
  )

  // ⋯ overflow menu. The trigger names the person: on a roster holding two
  // Erics, "More actions" is exactly the ambiguity this work exists to remove.
  const overflowMenu = (
    <div ref={menuRef} className={isRow ? 'relative shrink-0' : 'absolute right-2 top-2'}>
      <button
        type="button"
        onClick={() => setMenuOpen(o => !o)}
        aria-label={`More actions for ${name}`}
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
          {!isClaimed && (hasBeenInvited || inviteState === 'sent') && (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); runInvite(true) }}
              className={menuItemClass}
            >
              Resend invite
            </button>
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
  )

  const avatarSizeClass = isRow
    ? 'flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full bg-grad text-[13px] font-bold text-white'
    : 'flex h-[72px] w-[72px] items-center justify-center rounded-full bg-grad text-[21px] font-bold text-white'

  const avatar = profileHref ? (
    <Link href={profileHref} className={isRow ? 'shrink-0' : 'mt-2'} aria-label={`View ${name}'s profile`}>
      <span className={avatarSizeClass}>{initials}</span>
    </Link>
  ) : (
    <span className={isRow ? avatarSizeClass : `mt-2 ${avatarSizeClass}`}>{initials}</span>
  )

  const identity = (
    <CollaboratorIdentityLabel
      collaborator={collaborator}
      hint={identityHint}
      align={isRow ? 'left' : 'center'}
      linkProfile={Boolean(profileHref)}
      nameClassName={isRow ? 'text-[14px] font-bold text-white' : 'text-[15px] font-bold text-white'}
    />
  )

  // Legacy/unclaimed collision remedy. Never invents an identifier — it asks
  // the owner for the one piece of data that would actually disambiguate, and
  // falls back to the full form when a last name is already on file.
  const ambiguityAction =
    isAmbiguous && !profileHref ? (
      <button
        type="button"
        onClick={onEdit}
        className="text-[11.5px] font-semibold text-brandindigo hover:underline"
      >
        {collaboratorEditActionLabel(collaborator)}
      </button>
    ) : null

  const ipiFlag = !hasIpi ? (
    <span className="inline-flex items-center rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
      IPI missing
    </span>
  ) : null

  // Primary action — state-driven. member → quiet ✓; just sent → quiet
  // confirmation; already invited → quiet status (Resend lives in the ⋯
  // menu); never invited → loud Invite.
  const primaryAction = isClaimed ? (
    <p className={`flex items-center gap-1.5 text-[12.5px] font-semibold text-brandindigo ${isRow ? '' : 'justify-center'}`}>
      <span aria-hidden>✓</span> Funūn member
    </p>
  ) : inviteState === 'sent' ? (
    <p className="text-[12.5px] font-semibold text-brandindigo">
      {didResend ? 'Invite resent ✓' : 'Invite sent ✓'}
    </p>
  ) : hasBeenInvited ? (
    <div>
      <p className="text-[12.5px] text-lavdim">
        {inviteState === 'sending'
          ? 'Resending…'
          : invite
            ? `Invited ${timeAgo(invite.sentAt)}`
            : 'Invited'}
      </p>
      {inviteState === 'error' && inviteError && (
        <p className="mt-1.5 text-[11px] text-red-300">{inviteError}</p>
      )}
    </div>
  ) : (
    <>
      <button
        type="button"
        onClick={() => runInvite(false)}
        disabled={inviteState === 'sending'}
        className={
          isRow
            ? 'rounded-lg bg-grad px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-cta transition hover:opacity-90 disabled:opacity-60'
            : 'w-full rounded-xl bg-grad px-4 py-2.5 text-sm font-semibold text-white shadow-cta transition hover:opacity-90 disabled:opacity-60'
        }
      >
        {inviteState === 'sending' ? 'Sending…' : 'Invite'}
      </button>
      {inviteState === 'error' && inviteError && (
        <p className="mt-1.5 text-[11px] text-red-300">{inviteError}</p>
      )}
    </>
  )

  // ─── Dense list row ───────────────────────────────────────────────────
  // The scanning view: one line per person, identity first. Status and PRO
  // are tertiary metadata to the right, exactly as they are subordinate to
  // the name on the card.
  if (isRow) {
    return (
      <div className="flex items-center gap-3 rounded-[12px] border border-hair bg-card px-3 py-2.5">
        {favoriteButton}
        {avatar}
        <div className="flex min-w-0 flex-1 flex-col">
          {identity}
          {ambiguityAction}
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <span className="text-[12px] text-lavdim">{proLabel ?? 'No PRO on file'}</span>
          {ipiFlag}
        </div>
        <div className="flex shrink-0 items-center justify-end text-right">{primaryAction}</div>
        {overflowMenu}
      </div>
    )
  }

  // ─── Card grid cell ───────────────────────────────────────────────────
  return (
    <div className="relative flex flex-col items-center gap-2 rounded-[16px] border border-hair bg-card p-4 text-center">
      {favoriteButton}
      {overflowMenu}
      {avatar}
      {identity}
      {ambiguityAction}

      {/* PRO subtitle */}
      <p className="text-[12.5px] text-lavdim">{proLabel ?? 'No PRO on file'}</p>

      {/* IPI-missing flag — subtle, only when missing (a small rights nudge) */}
      {ipiFlag}

      <div className="mt-3 w-full">{primaryAction}</div>
    </div>
  )
}
