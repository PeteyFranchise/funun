'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { CollaboratorProfile } from '@/lib/collaborators'

// ─── QuickInviteModal ──────────────────────────────────────────────────
// Standalone "Invite collaborator" path (260825-i4i): first name + email
// only, no split sheet, no full royalty form. The done panel is the point
// of this component — Resend is currently down in prod, so a failed or
// unconfigured email send is described honestly and a copyable
// /signup?invite=<token> link is ALWAYS surfaced, whether or not the
// email actually sent. A dead email provider must never produce a dead
// invite. When the roster identity is already linked to a Funūn member,
// the modal shows that fact instead and deliberately exposes no signup link.

type Props = {
  onClose: () => void
  onInvited: (collaborator: CollaboratorProfile) => void
}

type ModalState = 'form' | 'sending' | 'done' | 'error'

type QuickInviteResponse = {
  data?: {
    collaborator?: CollaboratorProfile
    inviteLink?: string
    emailSent?: boolean
    skipped?: boolean
    reused?: boolean
    alreadyMember?: boolean
  }
  error?: string
}

const INPUT_CLASS =
  'w-full rounded-lg border border-hairstrong bg-card2 px-3 py-2 text-[14px] text-white placeholder:text-lavdim/60 transition focus:border-brandindigo focus:outline-none'

export function QuickInviteModal({ onClose, onInvited }: Props) {
  const [state, setState] = useState<ModalState>('form')
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [alreadyMember, setAlreadyMember] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  const firstNameRef = useRef<HTMLInputElement | null>(null)
  const linkInputRef = useRef<HTMLInputElement | null>(null)

  // Autofocus the first-name input on mount.
  useEffect(() => {
    firstNameRef.current?.focus()
  }, [])

  // Close on Escape, but never while a request is in flight.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && state !== 'sending') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [state, onClose])

  function resetToForm() {
    setState('form')
    setFirstName('')
    setEmail('')
    setError(null)
    setInviteLink('')
    setEmailSent(false)
    setAlreadyMember(false)
    setCopied(false)
    setCopyError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (state === 'sending') return
    setState('sending')
    setError(null)
    try {
      const res = await fetch('/api/collaborators/quick-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: firstName.trim(), email: email.trim() }),
      })
      const json = (await res.json().catch(() => ({}))) as QuickInviteResponse

      if (!res.ok) {
        setError(json.error ?? 'Could not send invite')
        setState('error')
        // The row may genuinely exist even on the unhappy path — fold it
        // into the roster so the artist sees it was added.
        if (json.data?.collaborator) onInvited(json.data.collaborator)
        return
      }

      if (json.data?.collaborator) onInvited(json.data.collaborator)
      setInviteLink(json.data?.inviteLink ?? '')
      setEmailSent(Boolean(json.data?.emailSent))
      setAlreadyMember(Boolean(json.data?.alreadyMember))
      setState('done')
    } catch {
      setError('Network error — try again')
      setState('error')
    }
  }

  async function handleCopyLink() {
    if (!navigator.clipboard) {
      setCopyError('Clipboard unavailable — select the link above and copy it manually')
      return
    }
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setCopyError(null)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError('Could not copy — select the link above and copy it manually')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => {
        if (state !== 'sending') onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-invite-title"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-2xl border border-hair bg-card p-6 shadow-cta"
      >
        <h2 id="quick-invite-title" className="text-[18px] font-extrabold text-white">
          Invite collaborator
        </h2>

        {state === 'done' ? (
          <div className="mt-4 space-y-4">
            {alreadyMember ? (
              <p className="rounded-lg border border-brandindigo/30 bg-brandindigo/10 p-3 text-[13.5px] text-lav">
                <span className="font-semibold text-white">{firstName}</span> is already a Funūn
                member and is already in your collaborator roster. No signup invite was sent.
              </p>
            ) : emailSent ? (
              <p className="rounded-lg border border-hair bg-card2 p-3 text-[13.5px] text-lav">
                The invite was emailed to <span className="font-semibold text-white">{email}</span>.
              </p>
            ) : (
              <p className="rounded-lg border border-hair bg-card2 p-3 text-[13.5px] text-lav">
                Funūn couldn&apos;t deliver the invite email right now. Send this link to{' '}
                <span className="font-semibold text-white">{firstName}</span> yourself — the invite
                still works.
              </p>
            )}

            {!alreadyMember && (
              <>
                <div>
                  <label htmlFor="quick-invite-link" className="mb-1.5 block text-[12px] font-semibold text-lavdim">
                    Invite link
                  </label>
                  <input
                    id="quick-invite-link"
                    ref={linkInputRef}
                    type="text"
                    readOnly
                    value={inviteLink}
                    onFocus={e => e.currentTarget.select()}
                    onClick={e => e.currentTarget.select()}
                    className={INPUT_CLASS}
                  />
                </div>

                {copyError && <p className="text-[12.5px] text-rose-300">{copyError}</p>}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="rounded-lg bg-grad px-4 py-2 text-sm font-semibold text-white shadow-cta"
                  >
                    {copied ? 'Copied ✓' : 'Copy invite link'}
                  </button>
                  <button
                    type="button"
                    onClick={resetToForm}
                    className="text-sm text-white/60 hover:text-white"
                  >
                    Invite another
                  </button>
                </div>
              </>
            )}

            <div className="border-t border-hair pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-hairstrong px-4 py-2 text-sm font-semibold text-lav hover:text-white"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <p className="text-[12.5px] text-lavdim">
              They&apos;ll fill in their own legal name, IPI, and PRO when they claim their profile —
              this row is intentionally partial.
            </p>

            {error && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                {error}
              </p>
            )}

            <div>
              <label htmlFor="quick-invite-first-name" className="mb-1.5 block text-[12px] font-semibold text-lavdim">
                First name
              </label>
              <input
                id="quick-invite-first-name"
                ref={firstNameRef}
                type="text"
                required
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="e.g. Jordan"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label htmlFor="quick-invite-email" className="mb-1.5 block text-[12px] font-semibold text-lavdim">
                Email
              </label>
              <input
                id="quick-invite-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@example.com"
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={state === 'sending'}
                className="rounded-lg bg-grad px-4 py-2 text-sm font-semibold text-white shadow-cta disabled:opacity-40"
              >
                {state === 'sending' ? 'Sending…' : 'Send invite'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={state === 'sending'}
                className="text-sm text-white/60 hover:text-white disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
