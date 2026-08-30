'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { handleFieldState } from '@/lib/handles/availability'
import { HANDLE_MIN_LENGTH, HANDLE_MAX_LENGTH, handleFormatError } from '@/lib/handles/validate'

// ─── D-09's hard gate: choose a handle to continue ────────────────────────
// The screen a signed-in User Account with no handle sees INSTEAD of the app
// (mounted in app/(artist)/layout.tsx, which returns this in place of the
// nav, the header and children). The owner chose a hard gate over softer
// options because it guarantees complete coverage immediately, which is what
// lets plan 07's NOT NULL constraint land instead of waiting on stragglers.
//
// Deliberately absent, and not to be added back: a skip, a dismiss, a close
// control, a "later" link, an escape-key handler. There is exactly one way
// past this screen — pick a handle — plus a sign-out link, which is an exit
// rather than a skip: it grants access to nothing. Unskippable is the
// requirement; inescapable is not, and someone who signed in as the wrong
// account has to be able to leave.
//
// Nothing here re-implements a rule: the format authority is
// lib/handles/validate, the field state is lib/handles/availability's
// handleFieldState (shared verbatim with the signup field), and the write is
// the same PATCH /api/profile/handle a settings-page change uses. One
// server-side write path for both surfaces.

// Mirrors app/(auth)/signup/page.tsx's local shape for a resolved
// GET /api/handles/available verdict.
type HandleRemote = { available: boolean | null; reason: string | null }

const inputClass =
  'w-full rounded-lg border border-hair bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition focus:border-white/30'

export function ChooseHandleGate({ userId }: { userId: string }) {
  const router = useRouter()
  const [handle, setHandle] = useState('')
  const [checking, setChecking] = useState(false)
  const [remote, setRemote] = useState<HandleRemote | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const fieldState = handleFieldState({ raw: handle, checking, remote })

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Monotonic counter: a slow response for an earlier keystroke must never
  // overwrite the verdict for what is currently typed (same treatment as the
  // signup field).
  const requestCounter = useRef(0)

  // Live availability check (D-14, courtesy only — the unique index and
  // migration 133's guard are the sole authority). Only fires once the value
  // is already locally valid, so a half-typed handle never costs a request.
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }

    if (handleFormatError(handle)) {
      setChecking(false)
      setRemote(null)
      return
    }

    const requestId = ++requestCounter.current
    debounceTimer.current = setTimeout(() => {
      setChecking(true)
      fetch(`/api/handles/available?handle=${encodeURIComponent(handle.trim())}`)
        .then(r => r.json())
        .then((data: HandleRemote) => {
          if (requestId !== requestCounter.current) return
          setRemote({ available: data.available, reason: data.reason })
        })
        .catch(() => {
          if (requestId !== requestCounter.current) return
          // A courtesy check that could not reach the server must never
          // stand between someone and their account (D-14).
          setRemote({ available: null, reason: null })
        })
        .finally(() => {
          if (requestId === requestCounter.current) setChecking(false)
        })
    }, 350)

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
        debounceTimer.current = null
      }
    }
  }, [handle])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaveError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/profile/handle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: handle.trim() }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        // The database is the authority (D-14) — show its verdict verbatim
        // so the person knows whether to pick a different name.
        setSaveError(body.error ?? 'Could not save that handle. Please try again.')
        return
      }
      // The server layout re-runs, resolveHandleGate now sees a handle, and
      // the app renders in place of this screen.
      router.refresh()
    } catch {
      setSaveError('Could not save that handle. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    // userId identifies the account this screen is collecting a handle for,
    // which is what a support conversation needs when someone says they are
    // stuck here. It is NEVER sent with the write: the PATCH route authorises
    // from the session, and a client-supplied id is not identity (T-04-01).
    <div
      data-gate-user-id={userId}
      className="flex min-h-screen items-center justify-center bg-ink px-6 py-12 text-white"
    >
      <div className="w-full max-w-md">
        <h1 className="text-xl font-semibold text-white">Choose your handle</h1>
        <p className="mt-2 text-sm text-white/60">
          Funūn now identifies every account by a handle, and yours doesn&apos;t have one yet.
          Pick one to continue — it&apos;s the last thing between you and the app.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="gate-handle" className="block text-sm font-medium text-white/80">
              Handle
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
                @
              </span>
              <input
                id="gate-handle"
                type="text"
                value={handle}
                onChange={e => setHandle(e.target.value)}
                required
                autoFocus
                minLength={HANDLE_MIN_LENGTH}
                maxLength={HANDLE_MAX_LENGTH}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="maya-reyes"
                className={`${inputClass} pl-7`}
              />
            </div>
            <p className="mt-1 text-xs text-white/40">
              Your profile will live at funun.io/u/{handle.trim() || 'your-handle'}. You can
              change it later.
            </p>
            {fieldState.message && (
              <p className="mt-1 text-xs text-rose-300">{fieldState.message}</p>
            )}
            {fieldState.status === 'checking' && (
              <p className="mt-1 text-xs text-white/40">Checking availability…</p>
            )}
            {fieldState.status === 'available' && (
              <p className="mt-1 text-xs text-emerald-300">Available</p>
            )}
          </div>

          {saveError && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              {saveError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || fieldState.blocksSubmit}
            className="w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Continue'}
          </button>
        </form>

        {/* An exit, not a skip — it grants access to nothing. Omitting it is
            how an unskippable screen becomes a support ticket (T-36-30). */}
        <div className="mt-6 text-center">
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
