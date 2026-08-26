'use client'

// ── Privacy settings (SAFETY-04) ────────────────────────────────────────
// Its own <form>, its own endpoint, its own request — always. profile_
// visibility and open_to_visibility have no authenticated UPDATE grant at
// all (migration 058), so they must go through the dedicated service-role-
// backed /api/profile/visibility route and can never ride along in the
// /api/profile PATCH body.
//
// Save-on-switch fires this as a SECOND, INDEPENDENT request, sequenced
// after the profile PATCH when leaving the public-profile tab. Two requests
// to two endpoints — never one merged body.

import { useSettingsForm } from '@/components/settings/SettingsFormProvider'
import type { ProfileVisibility, OpenToVisibility } from '@/lib/trust-safety/contracts'
import { PROFILE_VISIBILITY_VALUES, OPEN_TO_VISIBILITY_VALUES } from '@/lib/trust-safety/contracts'
import { inputClass, labelClass } from '@/lib/profile/settings-form'

// Copy per 13-UI-SPEC.md "Privacy Settings" section (SAFETY-04).
const PROFILE_VISIBILITY_COPY: Record<ProfileVisibility, string> = {
  public: 'Anyone with your profile link can view your public profile.',
  connections_only: 'Only accepted connections can view your full profile.',
}

const PROFILE_VISIBILITY_LABELS: Record<ProfileVisibility, string> = {
  public: 'Public',
  connections_only: 'Connections-only',
}

const OPEN_TO_VISIBILITY_COPY: Record<OpenToVisibility, string> = {
  public: 'Your "open to" availability is shown to everyone.',
  connections: 'Only accepted connections see your "open to" availability.',
  hidden: 'Your preferences still help Funūn privately, but they are not shown publicly.',
}

const OPEN_TO_VISIBILITY_LABELS: Record<OpenToVisibility, string> = {
  public: 'Public',
  connections: 'Connections-only',
  hidden: 'Hidden',
}

export function PrivacySettingsForm() {
  const {
    visibilityForm,
    setVisibilityForm,
    visibilitySubmitting,
    visibilityError,
    visibilitySaved,
    saveVisibility,
  } = useSettingsForm()

  async function handleVisibilitySave(e: React.FormEvent) {
    e.preventDefault()
    await saveVisibility()
  }

  return (
    <form onSubmit={handleVisibilitySave} className="space-y-6">
      <div className="border-t border-white/10 mt-8 pt-8">
        <h2 className="text-lg font-semibold text-white">Privacy</h2>
        <p className="text-sm text-lavdim mt-1">
          Control who can see your profile and your &quot;open to&quot; availability.
        </p>
      </div>

      <div className="space-y-2">
        <label className={labelClass}>Profile visibility</label>
        <select
          value={visibilityForm.profile_visibility}
          onChange={e => {
            setVisibilityForm(f => ({ ...f, profile_visibility: e.target.value as ProfileVisibility }))
          }}
          className={`mt-1 ${inputClass}`}
        >
          {PROFILE_VISIBILITY_VALUES.map(v => (
            <option key={v} value={v} className="bg-neutral-900">
              {PROFILE_VISIBILITY_LABELS[v]}
            </option>
          ))}
        </select>
        <p className="text-xs text-white/40">{PROFILE_VISIBILITY_COPY[visibilityForm.profile_visibility]}</p>
      </div>

      <div className="space-y-2">
        <label className={labelClass}>&quot;Open to&quot; visibility</label>
        <select
          value={visibilityForm.open_to_visibility}
          onChange={e => {
            setVisibilityForm(f => ({ ...f, open_to_visibility: e.target.value as OpenToVisibility }))
          }}
          className={`mt-1 ${inputClass}`}
        >
          {OPEN_TO_VISIBILITY_VALUES.map(v => (
            <option key={v} value={v} className="bg-neutral-900">
              {OPEN_TO_VISIBILITY_LABELS[v]}
            </option>
          ))}
        </select>
        <p className="text-xs text-white/40">{OPEN_TO_VISIBILITY_COPY[visibilityForm.open_to_visibility]}</p>
      </div>

      {visibilityError && <p className="text-sm text-rose-300">{visibilityError}</p>}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={visibilitySubmitting}
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
        >
          {visibilitySubmitting ? 'Saving…' : 'Save privacy settings'}
        </button>
        {visibilitySaved && <span className="text-sm text-emerald-300">Saved</span>}
      </div>
    </form>
  )
}
