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
  memberAffordances,
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
//
// BLOCK-AWARE READS: the hint's `memberVisible` flag is false ONLY when a
// block exists in either direction, and when it is false this card renders
// none of the member-derived affordances — no "✓ Funūn member" state, no
// Message link (the worst of them: an affordance aimed at someone who blocked
// you), no profile link on the name or avatar, and no "Start a split sheet",
// whose mere presence is itself a membership tell.
//
// What such a row DOES keep is everything an UNCLAIMED row has, Invite button
// included. The server strips `claimed_by` for exactly these rows, so the card
// reads them as unclaimed and renders the ordinary non-member layout — and a
// lone card with no call to action would be as legible a tell as the badge it
// replaced. The invite route refuses the pair with the shared,
// block-state-agnostic error (13-03), so acting on it discloses nothing
// either.
//
// The ROW DOES NOT VANISH. It is the owner's own roster entry — their name
// for that person, their notes, their PRO — and a block on this platform
// filters rather than severs. Only the member-derived parts go.
//
// `memberVisible` is NOT the handle predicate. A hidden, connections-only or
// is_public:false member keeps every affordance below; whether their
// membership may be disclosed is Phase 41's D-01a, an open owner decision.

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

const MENU_ITEM_CLASS =
  'block w-full px-3 py-2 text-left text-[13px] text-lav transition hover:bg-white/5 hover:text-white'

type MenuProps = {
  collaborator: CollaboratorProfile
  identityHint?: CollaboratorIdentityHint | null
  /** The row has an invite on record (or one was just sent) and is not claimed. */
  canResendInvite: boolean
  onClose: () => void
  onEdit: () => void
  onArchive?: () => void
  onDelete?: () => void
  onResend: () => void
}

/**
 * The ⋯ dropdown panel.
 *
 * Extracted from CollaboratorCard as its own component for one reason: the
 * Message link is the WORST of this roster's block leaks — an affordance
 * aimed at someone who blocked you — and a panel that only exists inside a
 * `menuOpen` state cannot be asserted on by a markup test, so the assertion
 * that it is gone would pass whether or not the gate existed. Rendering it
 * directly is what lets that assertion actually bite.
 *
 * It re-derives the affordances from the SAME shared helper the card uses,
 * rather than receiving hrefs as props, so the disclosure decision has
 * exactly one definition (lib/collaborators/display-identity.ts).
 */
export function CollaboratorCardMenu({
  collaborator,
  identityHint,
  canResendInvite,
  onClose,
  onEdit,
  onArchive,
  onDelete,
  onResend,
}: MenuProps) {
  const isClaimed = isClaimedCollaborator(collaborator)
  const { memberVisible, profileHref, messageHref } = memberAffordances(collaborator, identityHint)

  return (
    <div
      role="menu"
      className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-hairstrong bg-card2 py-1 text-left shadow-cta"
    >
      {profileHref && (
        <Link href={profileHref} role="menuitem" className={MENU_ITEM_CLASS} onClick={onClose}>
          View profile
        </Link>
      )}
      {isClaimed && memberVisible && (
        <Link
          href={`/split-sheets/new?collaborator=${collaborator.id}`}
          role="menuitem"
          className={MENU_ITEM_CLASS}
          onClick={onClose}
        >
          Start a split sheet
        </Link>
      )}
      {messageHref && (
        <Link href={messageHref} role="menuitem" className={MENU_ITEM_CLASS} onClick={onClose}>
          Message
        </Link>
      )}
      {canResendInvite && (
        <button
          type="button"
          role="menuitem"
          onClick={() => { onClose(); onResend() }}
          className={MENU_ITEM_CLASS}
        >
          Resend invite
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => { onClose(); onEdit() }}
        className={MENU_ITEM_CLASS}
      >
        Edit
      </button>
      {isClaimed ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => { onClose(); onArchive?.() }}
          className="block w-full px-3 py-2 text-left text-[13px] text-amber-300/90 transition hover:bg-white/5 hover:text-amber-300"
        >
          Archive
        </button>
      ) : (
        <button
          type="button"
          role="menuitem"
          onClick={() => { onClose(); onDelete?.() }}
          className="block w-full px-3 py-2 text-left text-[13px] text-red-400/90 transition hover:bg-white/5 hover:text-red-400"
        >
          Delete
        </button>
      )}
    </div>
  )
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
  // disclosure decision that produced it. `memberVisible` is the second,
  // block-only signal; it gates the member state and the Message link.
  const { memberVisible, profileHref: hintProfileHref } = memberAffordances(collaborator, identityHint)
  const profileHref = isClaimed ? hintProfileHref : null

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
        <CollaboratorCardMenu
          collaborator={collaborator}
          identityHint={identityHint}
          canResendInvite={!isClaimed && (hasBeenInvited || inviteState === 'sent')}
          onClose={() => setMenuOpen(false)}
          onEdit={onEdit}
          onArchive={onArchive}
          onDelete={onDelete}
          onResend={() => runInvite(true)}
        />
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

  // Collision remedy. Never invents an identifier — it asks the owner for the
  // one piece of data that would actually disambiguate, and falls back to the
  // full form when a last name is already on file.
  //
  // Fires on ANY collision, including rows that already show a handle. The
  // first version required `!profileHref`, on the reasoning that a visible
  // @handle already tells two rows apart. It does — on screen. But a handle is
  // not a name: @djsoko does not identify a person to a PRO, and a split sheet
  // needs the surname. Two same-named collaborators still need last names even
  // when the roster can distinguish them, so the handle must not silence the
  // ask. Owner decision 2026-09-24, from looking at two handled Erics and still
  // wanting their surnames.
  const ambiguityAction =
    isAmbiguous ? (
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
  //
  // A row the viewer may not see as a member shows NO member state. It does
  // NOT lose the Invite button: the server has already stripped `claimed_by`
  // from that row, so it arrives looking exactly like an unclaimed one, and
  // withholding the CTA would put the tell back — a single card with no action
  // is as legible as a badge. The invite route refuses the pair with the
  // shared, block-state-agnostic error every other gated action returns, so
  // the resting state discloses nothing and acting discloses nothing specific.
  const primaryAction = isClaimed ? (
    memberVisible ? (
      <p className={`flex items-center gap-1.5 text-[12.5px] font-semibold text-brandindigo ${isRow ? '' : 'justify-center'}`}>
        <span aria-hidden>✓</span> Funūn member
      </p>
    ) : null
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
