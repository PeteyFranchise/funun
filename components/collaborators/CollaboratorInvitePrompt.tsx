'use client'

import { useState } from 'react'

// ─── CollaboratorInvitePrompt ──────────────────────────────────
// Default-on, inline (not modal) nudge shown immediately after saving a
// NEW collaborator with an email (D-08a). Third of D-08's three invite
// pathways — the explicit "Invite" button on CollaboratorCard already
// exists; this is a post-save prompt, never a gate on the save itself.
//
// Sending is delegated entirely to the caller's onSend — this component
// is a new entry point into the existing /api/collaborators/[id]/invite
// send action, not a new send mechanism (UI-SPEC surface 4).

type Props = {
  collaboratorName: string
  onSend: () => Promise<{ ok: boolean; error?: string }>
  onDismiss: () => void
}

function firstNameOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts[0] || name
}

export function CollaboratorInvitePrompt({ collaboratorName, onSend, onDismiss }: Props) {
  const [invited, setInvited] = useState(true) // pre-checked — default-on per D-08
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const firstName = firstNameOf(collaboratorName)

  async function handleSend() {
    if (state === 'sending') return
    setState('sending')
    setError(null)
    const res = await onSend()
    if (res.ok) {
      setState('sent')
      // Brief confirmation, then auto-dismiss.
      setTimeout(onDismiss, 1500)
    } else {
      setState('error')
      setError(res.error ?? 'Could not send invite')
    }
  }

  return (
    <div className="w-full space-y-3 rounded-xl border border-hair bg-card p-4">
      {state === 'sent' ? (
        <p className="text-[13px] font-semibold text-brandindigo">Invite sent ✓</p>
      ) : (
        <>
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={invited}
              onChange={e => setInvited(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-hairstrong bg-card2 accent-brandindigo"
            />
            <span>
              <span className="block text-[14px] font-semibold text-white">
                Invite {firstName} to Funūn?
              </span>
              <span className="block text-[12.5px] text-lavdim">
                They&apos;ll get an email to join and their rights data self-maintains.
              </span>
            </span>
          </label>

          {error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSend}
              disabled={!invited || state === 'sending'}
              className="rounded-lg bg-grad px-4 py-2 text-sm font-semibold text-white shadow-cta disabled:opacity-40"
            >
              {state === 'sending' ? 'Sending…' : 'Send invite'}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="text-sm text-white/50 hover:text-white"
            >
              Not now
            </button>
          </div>
        </>
      )}
    </div>
  )
}
