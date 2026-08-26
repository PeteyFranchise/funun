'use client'

// ── The single owner of editable artist-Settings state ──────────────────
// Mounted by app/(artist)/settings/layout.tsx, NOT by any page. That is the
// load-bearing detail: Next.js App Router partial rendering does not unmount
// a shared layout when navigating between its child segments, so a client
// component the layout renders keeps its React state across
// /settings ↔ /settings/profile ↔ /settings/payouts. This is the only place
// in the tree where "the two form tabs are one continuous page" is literally
// true rather than simulated — an edit typed on one tab is still in the
// field when you come back to it.
//
// The `profile` prop is passed straight through the context value and is
// deliberately NOT copied into useState: the sections read
// legal_name_locked_at and claim_prefill off it and rely on router.refresh()
// to update them. Mirror it into state and both quietly stop refreshing.
//
// The dirty BASELINE is the opposite case — it must be state, and it must be
// reset explicitly after a successful write, because useState ignores its
// initial value on re-render and so a refreshed prop can never move it.

import { createContext, useContext, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { UserProfile } from '@/types'
import {
  toForm,
  isTabDirty,
  buildTabPayload,
  buildSaversForTab,
  type FormState,
  type SaveResult,
  type SettingsTabId,
  type TabSaver,
} from '@/lib/profile/settings-form'
import type { ProfileVisibility, OpenToVisibility } from '@/lib/trust-safety/contracts'

// ── Claim pre-fill fields (R2, migration 072) ───────────────────────────
// The canonical rights fields the claim path can pre-fill. Kept in sync with
// app/api/profile/route.ts's CLAIM_PREFILL_FIELDS and
// lib/profile/claim-prefill.ts's ClaimPrefillEntry shape — do not let these
// drift. Declared here rather than in RightsContractsSections because the
// confirm handler lives here; the sections import the type from this file,
// which keeps the dependency one-directional.
export const CLAIM_PREFILL_FIELDS = [
  'pro',
  'ipi',
  'publisher',
  'administrator',
  'contact_phone',
  'mailing_address',
] as const
export type ClaimPrefillField = (typeof CLAIM_PREFILL_FIELDS)[number]

type VisibilityForm = {
  profile_visibility: ProfileVisibility
  open_to_visibility: OpenToVisibility
}

type SettingsFormContextValue = {
  profile: UserProfile
  form: FormState
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  updateForm: (updater: (f: FormState) => FormState) => void

  submitting: boolean
  error: string | null
  saved: boolean
  saveTab: (tab: SettingsTabId) => Promise<SaveResult>
  tabDirty: (tab: SettingsTabId) => boolean

  lockSubmitting: boolean
  lockError: string | null
  lockLegalName: () => Promise<void>

  confirmingField: ClaimPrefillField | null
  confirmFieldError: string | null
  confirmPrefillField: (field: ClaimPrefillField) => Promise<void>

  visibilityForm: VisibilityForm
  setVisibilityForm: (updater: (f: VisibilityForm) => VisibilityForm) => void
  visibilitySubmitting: boolean
  visibilityError: string | null
  visibilitySaved: boolean
  visibilityDirty: boolean
  saveVisibility: () => Promise<SaveResult>

  /** The ordered savers to run when leaving `tab`. See buildSaversForTab. */
  saversForTab: (tab: SettingsTabId) => TabSaver[]
}

const SettingsFormContext = createContext<SettingsFormContextValue | null>(null)

export function useSettingsForm(): SettingsFormContextValue {
  const ctx = useContext(SettingsFormContext)
  if (!ctx) {
    throw new Error(
      'useSettingsForm must be called inside <SettingsFormProvider> — the artist settings layout mounts it'
    )
  }
  return ctx
}

/**
 * Null-tolerant read, for the one consumer that renders both inside and
 * outside the provider: the tab bar. When the layout cannot resolve a
 * profile it still shows the chrome (including the tabs) around a "couldn't
 * load your profile" message, and there is nothing to save in that state.
 */
export function useSettingsFormOptional(): SettingsFormContextValue | null {
  return useContext(SettingsFormContext)
}

export function SettingsFormProvider({
  profile,
  children,
}: {
  profile: UserProfile
  children: React.ReactNode
}) {
  const router = useRouter()

  const [form, setForm] = useState<FormState>(() => toForm(profile))
  const [baseline, setBaseline] = useState<FormState>(() => toForm(profile))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Legal-name confirm-and-lock (migration 066, deliberation section 2).
  const [lockSubmitting, setLockSubmitting] = useState(false)
  const [lockError, setLockError] = useState<string | null>(null)

  // Claim pre-fill confirm (R2, migration 072).
  const [confirmingField, setConfirmingField] = useState<ClaimPrefillField | null>(null)
  const [confirmFieldError, setConfirmFieldError] = useState<string | null>(null)

  // Privacy settings — saved to /api/profile/visibility (SAFETY-04). These
  // two columns have no authenticated UPDATE grant at all (migration 058),
  // so they are deliberately NOT part of the main `form`/saveTab above.
  const [visibilityForm, setVisibilityFormState] = useState<VisibilityForm>({
    profile_visibility: profile.profile_visibility,
    open_to_visibility: profile.open_to_visibility,
  })
  const [visibilityBaseline, setVisibilityBaseline] = useState<VisibilityForm>({
    profile_visibility: profile.profile_visibility,
    open_to_visibility: profile.open_to_visibility,
  })
  const [visibilitySubmitting, setVisibilitySubmitting] = useState(false)
  const [visibilityError, setVisibilityError] = useState<string | null>(null)
  const [visibilitySaved, setVisibilitySaved] = useState(false)

  function updateForm(updater: (f: FormState) => FormState) {
    setForm(updater)
    setSaved(false)
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    updateForm(f => ({ ...f, [key]: value }))
  }

  function setVisibilityForm(updater: (f: VisibilityForm) => VisibilityForm) {
    setVisibilityFormState(updater)
    setVisibilitySaved(false)
  }

  function tabDirty(tab: SettingsTabId) {
    return isTabDirty(tab, form, baseline)
  }

  const visibilityDirty =
    visibilityForm.profile_visibility !== visibilityBaseline.profile_visibility ||
    visibilityForm.open_to_visibility !== visibilityBaseline.open_to_visibility

  // Main profile save — only the fields owned by `tab`, to /api/profile.
  // sanitize() there skips allowlisted keys absent from the body, so a
  // partial payload needs no backend change.
  async function saveTab(tab: SettingsTabId): Promise<SaveResult> {
    setSubmitting(true)
    setError(null)

    // A thrown fetch (offline, DNS, aborted) has to become a returned error,
    // not an unhandled rejection: save-on-switch reads this result to decide
    // whether to navigate, and a rejection there would let the artist leave
    // the tab holding the values that never got written.
    let res: Response
    try {
      res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildTabPayload(tab, form)),
      })
    } catch {
      const message = 'Could not reach the server. Check your connection and try again.'
      setError(message)
      setSubmitting(false)
      return { ok: false, error: message }
    }

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = json.error ?? 'Could not save profile'
      setError(message)
      setSubmitting(false)
      return { ok: false, error: message }
    }

    setSubmitting(false)
    setSaved(true)
    // Reset the dirty baseline to what was just written. A refreshed
    // `profile` prop cannot do this — useState ignores its initial value on
    // re-render — so without this line the tab stays permanently dirty and
    // every subsequent switch re-writes.
    setBaseline(form)
    router.refresh()
    return { ok: true }
  }

  // Legal-name confirm-and-lock — saves the current legal-name field values
  // AND signals lock_legal_name: true in one gesture. The server owns the
  // actual lock timestamp (app/api/profile/route.ts); this is a one-time
  // action — no unlock is ever offered here.
  async function lockLegalName() {
    setLockSubmitting(true)
    setLockError(null)

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        legal_first_name: form.legal_first_name,
        legal_middle_name: form.legal_middle_name,
        legal_last_name: form.legal_last_name,
        legal_name_suffix: form.legal_name_suffix,
        lock_legal_name: true,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setLockError(json.error ?? 'Could not lock legal name')
      setLockSubmitting(false)
      return
    }

    setLockSubmitting(false)
    router.refresh()
  }

  // Claim pre-fill confirm (R2) — signals confirm_prefill_fields: [field]
  // to /api/profile. The server owns setting claim_prefill[field].confirmed
  // (mirrors lock_legal_name's server-owned-signal pattern above); this
  // does not save any other unsaved form edits, matching the legal-name
  // lock's scoped-signal behavior.
  async function confirmPrefillField(field: ClaimPrefillField) {
    setConfirmingField(field)
    setConfirmFieldError(null)

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm_prefill_fields: [field] }),
    })
    const json = await res.json()
    if (!res.ok) {
      setConfirmFieldError(json.error ?? 'Could not confirm this value')
      setConfirmingField(null)
      return
    }

    setConfirmingField(null)
    router.refresh()
  }

  // Privacy settings save — to /api/profile/visibility (SAFETY-04). Always
  // its own request to its own endpoint, never folded into the /api/profile
  // body above.
  async function saveVisibility(): Promise<SaveResult> {
    setVisibilitySubmitting(true)
    setVisibilityError(null)

    const sent = visibilityForm
    let res: Response
    try {
      res = await fetch('/api/profile/visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileVisibility: sent.profile_visibility,
          openToVisibility: sent.open_to_visibility,
        }),
      })
    } catch {
      const message = 'Could not reach the server. Check your connection and try again.'
      setVisibilityError(message)
      setVisibilitySubmitting(false)
      return { ok: false, error: message }
    }

    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const message = json.error ?? 'Could not save privacy settings'
      setVisibilityError(message)
      setVisibilitySubmitting(false)
      return { ok: false, error: message }
    }

    setVisibilitySubmitting(false)
    setVisibilitySaved(true)
    setVisibilityBaseline(sent)
    router.refresh()
    return { ok: true }
  }

  function saversForTab(tab: SettingsTabId): TabSaver[] {
    return buildSaversForTab(tab, {
      profileDirty: tabDirty(tab),
      saveProfile: () => saveTab(tab),
      visibilityDirty,
      saveVisibility,
    })
  }

  const value: SettingsFormContextValue = {
    profile,
    form,
    set,
    updateForm,
    submitting,
    error,
    saved,
    saveTab,
    tabDirty,
    lockSubmitting,
    lockError,
    lockLegalName,
    confirmingField,
    confirmFieldError,
    confirmPrefillField,
    visibilityForm,
    setVisibilityForm,
    visibilitySubmitting,
    visibilityError,
    visibilitySaved,
    visibilityDirty,
    saveVisibility,
    saversForTab,
  }

  return <SettingsFormContext.Provider value={value}>{children}</SettingsFormContext.Provider>
}
