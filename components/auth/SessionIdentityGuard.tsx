'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ACCOUNT_SWITCH_INTENT_KEY,
  TAB_IDENTITY_KEY,
  accountWorkspaceHome,
  accountWorkspaceLabel,
  clearTabIdentity,
  finishAccountSwitch,
  readAccountSwitchIntent,
  readTabIdentity,
  resolveInitialSessionIdentity,
  resolveObservedSessionIdentity,
  writeTabIdentity,
  type ObservableAuthUser,
  type SessionIdentityIssue,
  type TabIdentity,
} from '@/lib/auth/session-identity'

export function SessionIdentityGuard({
  identity,
  children,
}: {
  identity: TabIdentity
  children: React.ReactNode
}) {
  const [issue, setIssue] = useState<SessionIdentityIssue | null>(null)
  const expectedUserId = identity.userId
  const expectedContext = identity.context
  const expectedLabel = identity.label

  useEffect(() => {
    const expectedIdentity: TabIdentity = {
      userId: expectedUserId,
      context: expectedContext,
      label: expectedLabel,
    }
    const stored = readTabIdentity(sessionStorage.getItem(TAB_IDENTITY_KEY))
    const intent = readAccountSwitchIntent(sessionStorage.getItem(ACCOUNT_SWITCH_INTENT_KEY))
    const initialDecision = resolveInitialSessionIdentity({ stored, intent, expected: expectedIdentity })

    if (initialDecision.kind === 'block') {
      setIssue(initialDecision.issue)
    } else if (initialDecision.finishSwitch) {
      finishAccountSwitch(initialDecision.identity)
    } else {
      writeTabIdentity(initialDecision.identity)
    }

    const supabase = createClient()
    function observeUser(nextUser: ObservableAuthUser | null) {
      // Ordinary sign-out clears the tab marker before the auth event. An
      // intentional switch keeps a short-lived target marker while the sign-in
      // handoff is in progress. Neither should flash an account-change modal.
      const activeIntent = readAccountSwitchIntent(sessionStorage.getItem(ACCOUNT_SWITCH_INTENT_KEY))
      const observedDecision = resolveObservedSessionIdentity({
        markerPresent: Boolean(sessionStorage.getItem(TAB_IDENTITY_KEY)),
        intent: activeIntent,
        expected: expectedIdentity,
        nextUser,
      })
      if (observedDecision.kind === 'block') setIssue(observedDecision.issue)
    }

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      observeUser(session?.user ?? null)
    })

    // Auth storage is shared by every tab in a browser profile. Re-check on
    // focus/visibility as well as auth events so browsers that coalesce a
    // background storage event still cannot silently replace this tab.
    async function verifyActiveUser() {
      const { data: userData, error } = await supabase.auth.getUser()
      // A temporary network/auth-service failure is not evidence that the
      // account changed. Middleware/server authorization remains authoritative;
      // this client guard should fail quiet and retry on the next focus.
      if (error) return
      observeUser(userData.user)
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void verifyActiveUser()
    }
    window.addEventListener('focus', verifyActiveUser)
    document.addEventListener('visibilitychange', onVisibilityChange)
    void verifyActiveUser()

    return () => {
      data.subscription.unsubscribe()
      window.removeEventListener('focus', verifyActiveUser)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [expectedContext, expectedLabel, expectedUserId])

  async function continueWithCurrent() {
    if (!issue?.current) return
    finishAccountSwitch(issue.current)
    window.location.assign(accountWorkspaceHome(issue.current.context))
  }

  async function signBackIn() {
    clearTabIdentity()
    const supabase = createClient()
    await supabase.auth.signOut({ scope: 'local' })
    window.location.assign('/signin?accountChanged=1')
  }

  return (
    <>
      {children}
      {issue && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-change-title"
        >
          <div className="w-full max-w-[480px] rounded-2xl border border-white/15 bg-[#11111d] p-7 text-white shadow-2xl">
            <div className="text-[11px] font-bold uppercase tracking-[.18em] text-[#9b96c8]">
              Account protection
            </div>
            <h1 id="account-change-title" className="mt-3 text-2xl font-bold tracking-[-.02em]">
              Your active account changed
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/65">
              This tab started as <strong className="text-white">{issue.previous.label}</strong> in{' '}
              {accountWorkspaceLabel(issue.previous.context)}. Another tab or window changed the browser session
              {issue.current ? (
                <> to <strong className="text-white">{issue.current.label}</strong>.</>
              ) : (
                <> by signing out.</>
              )}
            </p>
            <p className="mt-3 text-sm leading-6 text-white/50">
              Funūn stopped this page before it could silently become a different workspace.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {issue.current && (
                <button
                  type="button"
                  onClick={continueWithCurrent}
                  className="rounded-[10px] bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-white/90"
                >
                  Continue as {issue.current.label}
                </button>
              )}
              <button
                type="button"
                onClick={signBackIn}
                className="rounded-[10px] border border-white/15 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/5"
              >
                Sign in to another account
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
