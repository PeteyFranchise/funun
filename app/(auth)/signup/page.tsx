'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isWaitlistSubmitDisabled } from './waitlist-gate'
import { signupCompletionState } from './completion'
import { handleFieldState } from '@/lib/handles/availability'
import { HANDLE_MIN_LENGTH, HANDLE_MAX_LENGTH, handleFormatError } from '@/lib/handles/validate'
import { postSignInPath } from '@/lib/auth/postSignInPath'
import { publicAuthError } from '@/lib/auth/public-errors'
import { reportBrowserAuthFailure } from '@/lib/auth/client-diagnostics'
import {
  AUTH_CTA,
  AUTH_ERROR_PANEL,
  AUTH_FOOT,
  AUTH_FOOT_LINK,
  AUTH_H1,
  AUTH_HINT,
  AUTH_HINT_BAD,
  AUTH_HINT_OK,
  AUTH_INLINE_LINK,
  AUTH_INPUT,
  AUTH_LABEL,
  AUTH_SUB,
  AUTH_TEXTAREA,
} from '@/app/(auth)/auth-ui'

// Debounce delay for the live availability check (D-14, courtesy only) and
// the shape of a resolved GET /api/handles/available verdict.
const HANDLE_CHECK_DEBOUNCE_MS = 400
type HandleRemote = { available: boolean | null; reason: string | null }

// The client state machine is UX only. Migration 214's handle_new_user()
// independently requires the same exact invite capability + email pair.
type GateState = 'form' | 'allowed' | 'existing-account' | 'denied' | 'invite-expired'

type DeepLinkInfo = { email: string; inviterName: string | null; token: string }

// Minimal Cloudflare Turnstile typing — no npm package installed (D-12,
// first Turnstile integration in this codebase per 27-PATTERNS); loaded via
// the vendor script tag and driven through the explicit-render API.
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          action?: string
          callback?: (token: string) => void
          'error-callback'?: () => void
          'expired-callback'?: () => void
        }
      ) => string
      reset: (widgetId?: string) => void
    }
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function SignUpFlow() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next')

  const [gateState, setGateState] = useState<GateState>('form')
  const [email, setEmail] = useState('')
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [deepLink, setDeepLink] = useState<DeepLinkInfo | null>(null)

  // D-02/D-03/D-14: the handle field's own state, independent of the
  // invite-gate `checking`/`checkError` above.
  const [handleChecking, setHandleChecking] = useState(false)
  const [handleRemote, setHandleRemote] = useState<HandleRemote | null>(null)
  const handleFieldStatus = handleFieldState({ raw: handle, checking: handleChecking, remote: handleRemote })
  const handleDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Monotonic counter (T-36-22): a response for a stale request must never
  // overwrite the verdict for a value the person has since edited.
  const handleRequestCounter = useRef(0)

  const [submitting, setSubmitting] = useState(false)
  const [signUpError, setSignUpError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  // Waitlist form (D-11/D-12)
  const [wlName, setWlName] = useState('')
  const [wlNote, setWlNote] = useState('')
  const [wlSubmitting, setWlSubmitting] = useState(false)
  const [wlError, setWlError] = useState<string | null>(null)
  const [wlSent, setWlSent] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileScriptError, setTurnstileScriptError] = useState(false)
  const turnstileRendered = useRef(false)
  const turnstileNode = useRef<HTMLDivElement | null>(null)
  const turnstileWidgetId = useRef<string | null>(null)
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  const checkInvite = useCallback(async (candidateEmail: string, inviteToken?: string) => {
    setChecking(true)
    setCheckError(null)
    try {
      const res = await fetch('/api/signup/check-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: candidateEmail, inviteToken }),
      })
      if (res.status === 429) {
        setCheckError('Too many requests. Please try again later.')
        setGateState('form')
        return
      }
      const data = (await res.json()) as { allowed: boolean; existingAccount: boolean }
      if (data.existingAccount) {
        setGateState('existing-account')
        return
      }
      if (data.allowed) {
        setGateState('allowed')
        return
      }
      setGateState('denied')
    } catch {
      setCheckError('Something went wrong — try again.')
      setGateState('form')
    } finally {
      setChecking(false)
    }
  }, [])

  // Deep-link landing (D-09, surface 2): resolve ?invite=token into pre-fill
  // data, then round-trip through the same check-invite call every plain
  // visitor goes through — the resolver never itself admits.
  useEffect(() => {
    const token = searchParams.get('invite')
    if (!token) return
    let cancelled = false

    async function resolve() {
      setChecking(true)
      try {
        const res = await fetch(`/api/signup/invite/${encodeURIComponent(token as string)}`)
        if (cancelled) return
        if (!res.ok) {
          setChecking(false)
          return
        }
        const data = (await res.json()) as {
          email: string
          inviterName: string | null
          expired: boolean
        }
        if (cancelled) return
        setEmail(data.email)
        setDeepLink({ email: data.email, inviterName: data.inviterName, token: token as string })
        if (data.expired) {
          setChecking(false)
          setGateState('invite-expired')
          return
        }
        await checkInvite(data.email, token as string)
      } catch {
        if (!cancelled) setChecking(false)
      }
    }

    resolve()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live handle availability check (D-14, courtesy only — the unique index
  // and migration 133's reserved/retired guard are the real enforcement).
  // Debounced ~400ms after typing stops, and only dispatched once the value
  // is already locally valid — handleFieldState()'s format gate is exactly
  // handleFormatError(), called directly here so this effect's own decision
  // to fire never depends on its own checking/remote state. A monotonic
  // request counter (T-36-22) discards any response that is not the latest,
  // since a slow early response can otherwise resolve after a newer one.
  useEffect(() => {
    if (handleDebounceTimer.current) {
      clearTimeout(handleDebounceTimer.current)
      handleDebounceTimer.current = null
    }

    if (handleFormatError(handle)) {
      setHandleChecking(false)
      setHandleRemote(null)
      return
    }

    const requestId = ++handleRequestCounter.current
    handleDebounceTimer.current = setTimeout(() => {
      setHandleChecking(true)
      fetch(`/api/handles/available?handle=${encodeURIComponent(handle.trim())}`)
        .then(res => res.json())
        .then((data: HandleRemote) => {
          if (requestId !== handleRequestCounter.current) return
          setHandleRemote({ available: data.available, reason: data.reason })
        })
        .catch(() => {
          if (requestId !== handleRequestCounter.current) return
          // A courtesy check that could not reach the server is 'unknown',
          // never a false 'unavailable' (D-14).
          setHandleRemote({ available: null, reason: null })
        })
        .finally(() => {
          if (requestId === handleRequestCounter.current) setHandleChecking(false)
        })
    }, HANDLE_CHECK_DEBOUNCE_MS)

    return () => {
      if (handleDebounceTimer.current) {
        clearTimeout(handleDebounceTimer.current)
        handleDebounceTimer.current = null
      }
    }
  }, [handle])

  async function handleGateSubmit(e: React.FormEvent) {
    e.preventDefault()
    await checkInvite(email.trim())
  }

  function handleAllowedEmailChange(value: string) {
    setEmail(value)
    // D-09: editing away from the invited email silently falls back to the
    // generic gate — no error, no re-ask.
    if (deepLink && normalizeEmail(value) !== normalizeEmail(deepLink.email)) {
      setDeepLink(null)
      setGateState('form')
    }
  }

  async function handleSignUpSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSignUpError(null)

    const callbackUrl = new URL('/auth/callback', window.location.origin)
    const inviteStillMatches =
      deepLink && normalizeEmail(email) === normalizeEmail(deepLink.email)
    const destination = postSignInPath({
      user: { app_metadata: {} },
      next: inviteStillMatches ? next : null,
    })
    callbackUrl.searchParams.set('next', destination)

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: callbackUrl.toString(),
        // D-03: user_metadata IS visible to handle_new_user() at INSERT on
        // this Supabase instance, while app_metadata and email_confirmed_at
        // are NOT — the same asymmetry documented in
        // lib/accounts/provisionIntent.ts that cost two cutover failures in
        // Phase 27. The industry branch's display_name key (below, same
        // trigger) is the existing proof of the mechanism. Because of this,
        // the profile row and its handle are created in ONE statement — a
        // new signup has no window in which it exists without a handle.
        //
        // Key name MUST be exactly `handle` — migration 133's trigger reads
        // NEW.raw_user_meta_data->>'handle', and a mismatch fails silently
        // by inserting NULL rather than erroring.
        //
        // Trimmed only, never lowercased (D-04) — storage preserves the
        // case the person typed; migration 010's lowered unique index is
        // what makes it unique regardless of casing.
          data: {
            handle: handle.trim(),
            ...(inviteStillMatches ? { signup_invite_token: deepLink.token } : {}),
          },
        },
      })
      if (error) {
        setSignUpError(reportBrowserAuthFailure(
          {
            eventCode: 'signup_failed',
            surface: 'signup',
            workspaceIntent: 'personal',
          },
          publicAuthError('sign-up', error)
        ))
        return
      }

      // Compatibility for local/staged environments that return an active
      // session immediately. The database still verifies confirmed email and
      // the exact invite capability before attaching any identity data.
      if (signupCompletionState(data.session) === 'active-session') {
        const claimResponse = await fetch('/api/claim-collaborators', { method: 'POST' })
        if (!claimResponse.ok) {
          await supabase.auth.signOut({ scope: 'local' })
          setSignUpError(reportBrowserAuthFailure(
            {
              eventCode: 'invitation_claim_failed',
              surface: 'signup',
              workspaceIntent: 'personal',
            },
            'Your account was created, but the invitation could not be completed. Check your email verification, then sign in again.'
          ))
          return
        }
        router.replace(destination)
        router.refresh()
        return
      }

      setSent(true)
    } catch {
      setSignUpError(reportBrowserAuthFailure(
        {
          eventCode: 'signup_failed',
          surface: 'signup',
          workspaceIntent: 'personal',
        },
        publicAuthError('sign-up', null)
      ))
    } finally {
      setSubmitting(false)
    }
  }

  // Single render() call site (both the callback-ref attach and the
  // <Script> onLoad race to render first) — keeps the widget options
  // (including the `action` marker) defined in exactly one place.
  const renderTurnstileWidget = useCallback(
    (node: HTMLDivElement) => {
      if (!siteKey || !window.turnstile || turnstileRendered.current) return
      turnstileRendered.current = true
      turnstileWidgetId.current = window.turnstile.render(node, {
        sitekey: siteKey,
        action: 'turnstile-spin-v2',
        callback: token => setTurnstileToken(token),
        'error-callback': () => setTurnstileToken(''),
        'expired-callback': () => setTurnstileToken(''),
      })
    },
    [siteKey]
  )

  const attachTurnstile = useCallback(
    (node: HTMLDivElement | null) => {
      turnstileNode.current = node
      if (node) renderTurnstileWidget(node)
    },
    [renderTurnstileWidget]
  )

  // Single-use token: any failed submit (rate-limited, verification
  // failure, network error) must reset the widget and clear the stale
  // token so the next attempt gets a fresh one instead of silently
  // resubmitting an already-consumed/invalid token.
  function resetTurnstile() {
    if (turnstileWidgetId.current && window.turnstile) {
      window.turnstile.reset(turnstileWidgetId.current)
    }
    setTurnstileToken('')
  }

  async function handleWaitlistSubmit(e: React.FormEvent) {
    e.preventDefault()
    setWlSubmitting(true)
    setWlError(null)

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: wlName, note: wlNote, turnstileToken }),
      })
      if (res.status === 429) {
        setWlError('Too many requests. Please try again later.')
        setWlSubmitting(false)
        resetTurnstile()
        return
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setWlError(data.error ?? 'Something went wrong — try again.')
        setWlSubmitting(false)
        resetTurnstile()
        return
      }
      setWlSent(true)
      setWlSubmitting(false)
    } catch {
      setWlError('Something went wrong — try again.')
      setWlSubmitting(false)
      resetTurnstile()
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <h1 className={AUTH_H1}>Check your email</h1>
        <p className={AUTH_SUB}>
          We sent a confirmation link to <span className="text-white">{email}</span>. Click it to
          finish setting up your vault.
        </p>
        <Link href="/signin" className={`mt-6 inline-block ${AUTH_INLINE_LINK}`}>
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <>
      {gateState === 'form' && deepLink && (
        <>
          <h1 className={AUTH_H1}>
            {deepLink.inviterName
              ? `${deepLink.inviterName} invited you to Funūn`
              : 'You’ve been invited to Funūn'}
          </h1>
          <p className={AUTH_SUB}>Checking your invite…</p>
        </>
      )}

      {gateState === 'form' && !deepLink && (
        <>
          <h1 className={AUTH_H1}>Funūn is invite-only — for now.</h1>
          <p className={AUTH_SUB}>
            We&rsquo;re building this with a founding cohort. Open the secure link in your
            invitation email to create your account.
          </p>

          <form onSubmit={handleGateSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="gate-email" className={AUTH_LABEL}>
                Need a new invitation link? Enter your email
              </label>
              <input
                id="gate-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className={AUTH_INPUT}
              />
            </div>

            {checkError && <p className={AUTH_ERROR_PANEL}>{checkError}</p>}

            <button type="submit" disabled={checking} className={AUTH_CTA}>
              {checking ? 'Checking…' : 'Continue'}
            </button>
          </form>

          <p className={AUTH_FOOT}>
            Already have an account?{' '}
            <Link href="/signin" className={AUTH_FOOT_LINK}>
              Sign in
            </Link>
          </p>
        </>
      )}

      {gateState === 'allowed' &&
        (() => {
          const viaDeepLink = Boolean(deepLink && normalizeEmail(email) === normalizeEmail(deepLink.email))
          const writerRoomInvite =
            viaDeepLink && /^\/vault\/works\/[^/?#]+$/.test(next ?? '')
          return (
            <>
              <p className="text-[12.5px] font-semibold text-white">
                {viaDeepLink
                  ? deepLink!.inviterName
                    ? `${deepLink!.inviterName} invited you to Funūn`
                    : 'You’ve been invited to Funūn'
                  : "You're invited ✓"}
              </p>
              <h1 className={`mt-1 ${AUTH_H1}`}>
                {writerRoomInvite ? 'Create your account to join the song' : 'Create your account'}
              </h1>
              <p className={AUTH_SUB}>
                {writerRoomInvite
                  ? 'You can fill in your profile and rights details later—we’ll help you stay on top of it. For now, let’s write.'
                  : 'Start building your Sound Vault.'}
              </p>

              <form onSubmit={handleSignUpSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="email" className={AUTH_LABEL}>
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={e => handleAllowedEmailChange(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={AUTH_INPUT}
                  />
                  {viaDeepLink && (
                    <p className={AUTH_HINT}>This invite was sent to {deepLink!.email}.</p>
                  )}
                </div>
                <div>
                  <label htmlFor="handle" className={AUTH_LABEL}>
                    Handle
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13.5px] text-lavdim">
                      @
                    </span>
                    <input
                      id="handle"
                      type="text"
                      value={handle}
                      onChange={e => setHandle(e.target.value)}
                      required
                      minLength={HANDLE_MIN_LENGTH}
                      maxLength={HANDLE_MAX_LENGTH}
                      autoComplete="off"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="maya-reyes"
                      className={`${AUTH_INPUT} pl-7`}
                    />
                  </div>
                  <p className={AUTH_HINT}>
                    This is just your username — your profile address, and how people tag you in
                    a room. Yours will be funun.studio/u/{handle.trim() || 'your-handle'}. Change
                    it whenever; old links keep working. Split sheets and credits run on your{' '}
                    <strong className="font-semibold text-lav">legal name, PRO and IPI</strong>,
                    and you&rsquo;ll add those later.
                  </p>
                  {handleFieldStatus.message && (
                    <p className={AUTH_HINT_BAD}>{handleFieldStatus.message}</p>
                  )}
                  {handleFieldStatus.status === 'checking' && (
                    <p className={AUTH_HINT}>Checking availability…</p>
                  )}
                  {handleFieldStatus.status === 'available' && (
                    <p className={AUTH_HINT_OK}>Available</p>
                  )}
                </div>
                <div>
                  <label htmlFor="password" className={AUTH_LABEL}>
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={10}
                    autoComplete="new-password"
                    placeholder="At least 10 characters"
                    className={AUTH_INPUT}
                  />
                </div>

                {signUpError && <p className={AUTH_ERROR_PANEL}>{signUpError}</p>}

                <button
                  type="submit"
                  disabled={submitting || handleFieldStatus.blocksSubmit}
                  className={AUTH_CTA}
                >
                  {submitting ? 'Creating account…' : 'Create account'}
                </button>
              </form>

              <p className={AUTH_FOOT}>
                Already have an account?{' '}
                <Link href="/signin" className={AUTH_FOOT_LINK}>
                  Sign in
                </Link>
              </p>
            </>
          )
        })()}

      {gateState === 'existing-account' && (
        <div className="text-center">
          <h1 className={AUTH_H1}>You already have an account</h1>
          <p className={AUTH_SUB}>
            You already have an account — sign in instead.
          </p>
          <Link
            href={`/signin?email=${encodeURIComponent(email)}${deepLink ? `&invite=${encodeURIComponent(deepLink.token)}` : ''}${next ? `&next=${encodeURIComponent(next)}` : ''}`}
            className={`mt-6 ${AUTH_CTA}`}
          >
            Sign in
          </Link>
        </div>
      )}

      {gateState === 'invite-expired' && (
        <>
          <h1 className={AUTH_H1}>This invite has expired</h1>
          <p className={AUTH_SUB}>
            Ask {deepLink?.inviterName ?? 'your inviter'} for a new invite, or join the waiting
            list below and we&rsquo;ll reach out the moment a spot opens.
          </p>
          <button
            type="button"
            onClick={() => setGateState('denied')}
            className={`mt-6 ${AUTH_CTA}`}
          >
            Join the waiting list
          </button>
        </>
      )}

      {gateState === 'denied' &&
        (wlSent ? (
          <div className="text-center">
            <h1 className={AUTH_H1}>You&rsquo;re on the list</h1>
            <p className={AUTH_SUB}>
              We&rsquo;ll email you the moment a spot opens.
            </p>
          </div>
        ) : (
          <>
            <h1 className={AUTH_H1}>
              A secure invitation link is required
            </h1>
            <p className={AUTH_SUB}>
              Ask your inviter to resend your link, or join the waiting list and we&rsquo;ll reach
              out when a spot opens.
            </p>

            <form onSubmit={handleWaitlistSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="wl-email" className={AUTH_LABEL}>
                  Email
                </label>
                <input
                  id="wl-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className={AUTH_INPUT}
                />
              </div>
              <div>
                <label htmlFor="wl-name" className={AUTH_LABEL}>
                  Name
                </label>
                <input
                  id="wl-name"
                  type="text"
                  value={wlName}
                  onChange={e => setWlName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="Your name"
                  className={AUTH_INPUT}
                />
              </div>
              <div>
                <label htmlFor="wl-note" className={AUTH_LABEL}>
                  Note (optional)
                </label>
                <textarea
                  id="wl-note"
                  value={wlNote}
                  onChange={e => setWlNote(e.target.value)}
                  placeholder="Tell us a bit about you (optional)"
                  className={AUTH_TEXTAREA}
                />
              </div>

              <div ref={attachTurnstile} className="min-h-[65px]">
                {!siteKey && (
                  <p className="text-xs text-white/30">Verification will appear here.</p>
                )}
                {siteKey && turnstileScriptError && (
                  <p className="text-xs text-rose-300">
                    Couldn&rsquo;t load verification — refresh the page and try again.
                  </p>
                )}
              </div>

              {wlError && <p className={AUTH_ERROR_PANEL}>{wlError}</p>}

              <button
                type="submit"
                disabled={isWaitlistSubmitDisabled(wlSubmitting, siteKey, turnstileToken)}
                className={AUTH_CTA}
              >
                {wlSubmitting ? 'Joining…' : 'Join the waiting list'}
              </button>
            </form>

            {siteKey && (
              <Script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
                strategy="afterInteractive"
                onLoad={() => {
                  if (turnstileNode.current) renderTurnstileWidget(turnstileNode.current)
                }}
                onError={() => setTurnstileScriptError(true)}
              />
            )}
          </>
        ))}
    </>
  )
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpFlow />
    </Suspense>
  )
}
