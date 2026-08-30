'use client'

import { useRef, useState, type FormEvent } from 'react'
import {
  canManageMembership,
  WORK_TIER_LABELS,
  WORK_TIER_VALUES,
  type WorkTier,
} from '@/lib/catalogue/membership'

// ─── WorkRoster — who is on the song, and who is on the sheet ──────────
// (S-02, doctrine — plan 11.)
//
// PITFALL 3 (doctrine, verbatim): being ON THE WORK and being ON THE
// SPLITS are different facts. Membership grants access; the sheet grants
// ownership. This component is the interface expression of that line —
// it renders membership and the split sheet as two clearly separate
// groupings with a plain-words sentence naming the difference, because
// collapsing them into one list would reintroduce exactly the confusion
// the separation exists to prevent. Nothing in this file renders a
// percentage input or a percentage suggestion, anywhere (CAT-Q1a).
//
// This is a persistent panel with its own network calls (matching
// WorkHeader.tsx's shape, not ComposerCard.tsx's pure-callback one): it
// POSTs to plan 05's `/api/works/[workId]/members` to add someone, and to
// this plan's own `/api/works/[workId]/members/[memberId]/promote` (a
// small addition alongside plan 05's route — see that file's header
// comment) to promote an EXISTING member to writer.

export type WorkRosterMember = {
  /** work_members.id */
  id: string
  name: string
  tier: WorkTier
  isOwner: boolean
  /** True when work_members.user_id is still null — invited, not yet signed up. */
  isPending: boolean
  /** True when this person is currently a party on the work's living-draft split sheet. */
  isOnSheet: boolean
  /**
   * ✍ badge — matches the pad's own badge vocabulary (PERFORMER RULE:
   * "whoever typed; moves splits"). Supplied by the caller, since only
   * the pad's per-block author data can compute it; this component
   * renders whatever it is given and infers nothing of its own.
   */
  isWriterBadge?: boolean
  /**
   * 🎤 badge — matches the pad's declared-performer vocabulary. Supplied
   * by the caller once per-version/per-block performer credits are
   * wired up (a later plan); defaults to false so this component works
   * correctly before that wiring exists.
   */
  isSingerBadge?: boolean
}

export type WorkRosterProps = {
  workId: string
  members: WorkRosterMember[]
  /** The viewer's own tier, or null when they hold no work_members row (the owner may not). */
  viewerTier: WorkTier | null
  viewerIsOwner: boolean
  onMemberAdded?: (member: WorkRosterMember) => void
  onWriterPromoted?: (memberId: string) => void
}

type AddMemberResponse = {
  data?: {
    member: { id: string; tier: WorkTier; user_id: string | null; collaborator_id: string | null }
    collaborator: { id: string; name: string; email: string | null }
    inviteLink: string | null
    inviteError: string | null
    splits: { changed: boolean } | null
  }
  error?: string
}

type PromoteResponse = { data?: { changed: boolean }; error?: string }

type AddFormState = 'form' | 'sending' | 'done' | 'error'

const INPUT_CLASS =
  'w-full rounded-lg border border-hairstrong bg-card2 px-3 py-2 text-[13.5px] text-white placeholder:text-lavdim/60 transition focus:border-brandindigo focus:outline-none'

export function WorkRoster({
  workId,
  members,
  viewerTier,
  viewerIsOwner,
  onMemberAdded,
  onWriterPromoted,
}: WorkRosterProps) {
  // canManageMembership() (lib/catalogue/membership.ts, plan 04) is the
  // one predicate — never reimplemented here. The gate below is
  // presentation only: plan 05's route (and this plan's own promote
  // route) independently require the administer tier server-side, so
  // hiding a control here is never the actual protection.
  const canManage = canManageMembership(viewerTier ?? 'contribute', viewerIsOwner)

  const [list, setList] = useState<WorkRosterMember[]>(members)
  const [addState, setAddState] = useState<AddFormState>('form')
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [tier, setTier] = useState<WorkTier>('contribute')
  const [addError, setAddError] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [promotionMessage, setPromotionMessage] = useState<string | null>(null)

  const linkInputRef = useRef<HTMLInputElement | null>(null)

  const writersOnSheet = list.filter(m => m.isOnSheet)

  function resetAddForm() {
    setAddState('form')
    setFirstName('')
    setEmail('')
    setTier('contribute')
    setAddError(null)
    setInviteLink('')
    setCopied(false)
  }

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault()
    if (addState === 'sending') return
    setAddState('sending')
    setAddError(null)
    try {
      const res = await fetch(`/api/works/${workId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // is_writer is ALWAYS false here — the add form never carries a
        // writer checkbox. Marking someone a writer is a separate,
        // explicit action on an existing member (below), never a field
        // bundled into adding them. Adding a member and granting a share
        // are different decisions made at different moments; a combined
        // form makes the second one accidental.
        body: JSON.stringify({
          first_name: firstName.trim(),
          email: email.trim(),
          tier,
          is_writer: false,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as AddMemberResponse

      if (!res.ok || !json.data) {
        setAddError(json.error ?? 'Could not add collaborator')
        setAddState('error')
        return
      }

      const { member, collaborator, inviteLink: link } = json.data
      const added: WorkRosterMember = {
        id: member.id,
        name: collaborator.name,
        tier: member.tier,
        isOwner: false,
        isPending: !member.user_id,
        isOnSheet: false,
        isWriterBadge: false,
        isSingerBadge: false,
      }
      setList(prev => [...prev, added])
      onMemberAdded?.(added)
      setInviteLink(link ?? '')
      setAddState('done')
    } catch {
      setAddError('Network error — try again')
      setAddState('error')
    }
  }

  async function handleCopyLink() {
    if (!navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Selection fallback — the input is readOnly and select-on-click below.
    }
  }

  async function handlePromote(member: WorkRosterMember) {
    if (!canManage || member.isOnSheet || promotingId) return
    setPromotingId(member.id)
    setPromotionMessage(null)
    try {
      const res = await fetch(`/api/works/${workId}/members/${member.id}/promote`, {
        method: 'POST',
      })
      const json = (await res.json().catch(() => ({}))) as PromoteResponse
      if (res.ok) {
        setList(prev =>
          prev.map(m => (m.id === member.id ? { ...m, isOnSheet: true, isWriterBadge: true } : m))
        )
        // CAT-Q1a, in words, never a number: equal is the default, and
        // writers move it from there themselves if they choose. This
        // component never states, computes, or displays what the new
        // share actually is.
        setPromotionMessage(`${member.name} was added to the split sheet — redrafted to equal shares.`)
        onWriterPromoted?.(member.id)
      } else {
        setPromotionMessage(json.error ?? 'Could not promote — try again')
      }
    } catch {
      setPromotionMessage('Network error — try again')
    } finally {
      setPromotingId(null)
    }
  }

  return (
    <div className="rounded-[12px] border border-hair bg-card px-5 py-[18px]">
      <b className="text-[13px] text-white">Who&apos;s on this song</b>

      {/* ─── Grouping 1: membership — tier + status per person. ────────── */}
      <ul className="mt-3 flex flex-col gap-2">
        {list.map(member => (
          <li
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-[9px] border border-hair bg-card2 px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-[6px]">
              <span className="text-[13px] font-semibold text-white">{member.name}</span>
              <span className="rounded-full bg-lav/[.08] px-2 py-0.5 text-[10px] font-bold text-lav">
                {member.isOwner ? 'Owner' : WORK_TIER_LABELS[member.tier]}
              </span>
              {/* ✍ / 🎤 — same badge vocabulary as the pad, so one person
                  reads the same in both places. */}
              {member.isWriterBadge && (
                <span aria-label="Writer" title="Writer">
                  ✍
                </span>
              )}
              {member.isSingerBadge && (
                <span aria-label="Performer" title="Performer">
                  🎤
                </span>
              )}
              {member.isPending && (
                // A pending invitee has no user id yet. Migration 136's
                // claim bridge backfills work_members.user_id the moment
                // they sign up — this state resolves itself with no
                // manual reconciliation, so it is shown plainly rather
                // than as an error or a stuck-looking spinner.
                <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                  Pending — hasn&apos;t signed up yet
                </span>
              )}
            </div>

            {canManage && !member.isOwner && !member.isOnSheet && (
              <button
                type="button"
                onClick={() => handlePromote(member)}
                disabled={promotingId === member.id}
                className="rounded-lg border border-hairstrong bg-lav/[.06] px-3 py-1.5 text-[11.5px] font-semibold text-lav hover:text-white disabled:opacity-40"
              >
                {promotingId === member.id ? 'Promoting…' : 'Mark as writer'}
              </button>
            )}
          </li>
        ))}
      </ul>

      {promotionMessage && <p className="mt-2 text-[11.5px] text-emerald-300">{promotionMessage}</p>}

      {/* ─── Grouping 2: the living split sheet — a separate fact. ─────── */}
      <div className="mt-4 border-t border-hair pt-3">
        <b className="text-[12px] text-white">On the split sheet</b>
        <p className="mt-1 text-[11px] text-lavdim">
          Being on the work means you can add to it. Being on the sheet means you own part of
          it — the two are different facts, on purpose.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {writersOnSheet.length === 0 ? (
            <span className="text-[11.5px] text-lavdim">No writers on the sheet yet.</span>
          ) : (
            writersOnSheet.map(w => (
              <span
                key={w.id}
                className="inline-flex items-center gap-1 rounded-full bg-lav/[.08] px-2.5 py-1 text-[11px] font-semibold text-lav"
              >
                {w.name}
              </span>
            ))
          )}
        </div>
      </div>

      {/* ─── Add a collaborator — the field shape matches the existing
          standalone quick-invite path (first name + email) so an artist
          meets ONE invite form in this product, plus the tier choice this
          route also requires. ──────────────────────────────────────── */}
      {canManage && (
        <div className="mt-4 border-t border-hair pt-3">
          <b className="text-[12px] text-white">Add a collaborator</b>

          {addState === 'done' ? (
            <div className="mt-2 space-y-3">
              <p className="rounded-lg border border-hair bg-card2 p-3 text-[12.5px] text-lav">
                {/*
                  Shown, never assumed delivered. sendCollaboratorInvite()
                  (reused verbatim by plan 05's route) returns a usable
                  link even when email delivery fails — surfacing it here
                  is what keeps a delivery outage from reading as a failed
                  invite.
                */}
                Invite ready. Share this link if the email doesn&apos;t land.
              </p>
              <div>
                <label htmlFor="work-roster-invite-link" className="mb-1 block text-[11px] font-semibold text-lavdim">
                  Invite link
                </label>
                <input
                  id="work-roster-invite-link"
                  ref={linkInputRef}
                  type="text"
                  readOnly
                  value={inviteLink}
                  onFocus={e => e.currentTarget.select()}
                  onClick={e => e.currentTarget.select()}
                  className={INPUT_CLASS}
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="rounded-lg bg-grad px-3 py-1.5 text-[12px] font-semibold text-white shadow-cta"
                >
                  {copied ? 'Copied ✓' : 'Copy invite link'}
                </button>
                <button
                  type="button"
                  onClick={resetAddForm}
                  className="text-[12px] text-white/60 hover:text-white"
                >
                  Add another
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleAddSubmit} className="mt-2 space-y-3">
              {addError && (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-[12.5px] text-rose-200">
                  {addError}
                </p>
              )}

              <div>
                <label htmlFor="work-roster-first-name" className="mb-1 block text-[11px] font-semibold text-lavdim">
                  First name
                </label>
                <input
                  id="work-roster-first-name"
                  type="text"
                  required
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="e.g. Jordan"
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="work-roster-email" className="mb-1 block text-[11px] font-semibold text-lavdim">
                  Email
                </label>
                <input
                  id="work-roster-email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="work-roster-tier" className="mb-1 block text-[11px] font-semibold text-lavdim">
                  Tier
                </label>
                <select
                  id="work-roster-tier"
                  value={tier}
                  onChange={e => setTier(e.target.value as WorkTier)}
                  className={INPUT_CLASS}
                >
                  {WORK_TIER_VALUES.map(t => (
                    <option key={t} value={t}>
                      {WORK_TIER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={addState === 'sending'}
                className="rounded-lg bg-grad px-3 py-1.5 text-[12px] font-semibold text-white shadow-cta disabled:opacity-40"
              >
                {addState === 'sending' ? 'Sending…' : 'Send invite'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
