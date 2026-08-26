'use client'

// ── Your public profile tab (/settings/profile) ─────────────────────────
// The public half of artist Settings: public profile fields, role badges and
// "open to" chips, industry roles, and links. Moved verbatim out of
// ProfileForm.tsx — this file is a relocation, not a redesign.
//
// Editable state comes from useSettingsForm(), mounted by the settings
// LAYOUT, so an unsaved edit here survives a switch to another tab.

import { useState } from 'react'
import type { OpenTo, ProfileRole, ProfileRoleSlug } from '@/types'
import { PROFILE_ROLES, PROFILE_ROLE_LABELS } from '@/types'
import { INDUSTRY_ROLE_GROUPS } from '@/lib/industry-roles'
import { GENRES } from '@/lib/genres'
import { inputClass, labelClass } from '@/lib/profile/settings-form'
import { useSettingsForm } from '@/components/settings/SettingsFormProvider'

const MAX_PROFILE_ROLES = 6
const MAX_CUSTOM_ROLE_LEN = 40

function profileRoleLabel(r: ProfileRole): string {
  return r.kind === 'preset' ? PROFILE_ROLE_LABELS[r.slug] : r.label
}

// "Open to" editor options — labels per UI-SPEC section 4b, mapped onto the
// existing OpenTo union (types/index.ts). There is no dedicated `brand_deals`
// slug; `management` is used as the closest existing slug for "Brand deals"
// (per 09-04-PLAN.md's discretion note — see 09-04-SUMMARY.md deviations).
const OPEN_TO_EDITOR_OPTIONS: { slug: OpenTo; label: string }[] = [
  { slug: 'sync', label: 'Sync licensing' },
  { slug: 'collabs', label: 'Co-writes' },
  { slug: 'features', label: 'Features' },
  { slug: 'management', label: 'Brand deals' },
]

const CAREER_STAGES: { value: 1 | 2 | 3 | 4; label: string }[] = [
  { value: 1, label: 'Emerging' },
  { value: 2, label: 'Developing' },
  { value: 3, label: 'Established' },
  { value: 4, label: 'Professional' },
]

export function PublicProfileSections() {
  const { form, set, updateForm, submitting, error, saved, saveTab } = useSettingsForm()

  // ── Profile role badges (PROFILE-02) ──────────────────────────────
  // Lead role = array index 0 (existing convention, ProfileView.tsx) —
  // NOT a separate schema field. Min 1 role, max 6 total (presets + custom),
  // mirroring the server-side Zod cap (lib/profile/validate.ts).
  // addingCustomRole / customRoleInput are transient editor state, not part
  // of the saved form, so they stay local rather than going in the provider.
  const [addingCustomRole, setAddingCustomRole] = useState(false)
  const [customRoleInput, setCustomRoleInput] = useState('')

  function isPresetRoleSelected(slug: ProfileRoleSlug) {
    return form.roles.some(r => r.kind === 'preset' && r.slug === slug)
  }

  function togglePresetRole(slug: ProfileRoleSlug) {
    updateForm(f => {
      const idx = f.roles.findIndex(r => r.kind === 'preset' && r.slug === slug)
      if (idx >= 0) {
        if (f.roles.length <= 1) return f // block removing the last role
        return { ...f, roles: f.roles.filter((_, i) => i !== idx) }
      }
      if (f.roles.length >= MAX_PROFILE_ROLES) return f
      return { ...f, roles: [...f.roles, { kind: 'preset', slug }] }
    })
  }

  function addCustomRole() {
    const label = customRoleInput.trim().slice(0, MAX_CUSTOM_ROLE_LEN)
    if (!label) return
    updateForm(f => {
      if (f.roles.length >= MAX_PROFILE_ROLES) return f
      return { ...f, roles: [...f.roles, { kind: 'custom', label }] }
    })
    setCustomRoleInput('')
    setAddingCustomRole(false)
  }

  function removeRoleAt(index: number) {
    updateForm(f => {
      if (f.roles.length <= 1) return f // min 1 role required
      if (index === 0) return f // lead chip has no remove action
      return { ...f, roles: f.roles.filter((_, i) => i !== index) }
    })
  }

  function setLeadRole(index: number) {
    updateForm(f => {
      if (index === 0) return f
      const roles = [...f.roles]
      const [entry] = roles.splice(index, 1)
      roles.unshift(entry)
      return { ...f, roles }
    })
  }

  // ── Open-to availability chips (PROFILE-04) ───────────────────────
  function toggleOpenTo(slug: OpenTo) {
    updateForm(f => {
      const open_to = f.open_to.includes(slug)
        ? f.open_to.filter(o => o !== slug)
        : [...f.open_to, slug]
      return { ...f, open_to }
    })
  }

  function toggleGenre(slug: string) {
    updateForm(f => {
      const genres = f.genres.includes(slug)
        ? f.genres.filter(g => g !== slug)
        : [...f.genres, slug]
      return { ...f, genres }
    })
  }

  function toggleRole(slug: string) {
    updateForm(f => {
      const roles = f.industry_roles.includes(slug)
        ? f.industry_roles.filter(r => r !== slug)
        : [...f.industry_roles, slug]
      return { ...f, industry_roles: roles }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await saveTab('profile')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* ── Group divider ───────────────────────────────── */}
      <div className="border-t border-white/10 pt-8 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-lav">
          Your public profile
        </p>
        <p className="mt-1.5 text-xs text-white/40">
          What everyone else sees. Fill it in to show up in search, on your profile
          page, and in front of industry pros browsing for people to work with.
        </p>
      </div>

      {/* ── Public Profile ─────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Public Profile</h2>
          <p className="mt-1 text-xs text-white/40">
            Your artist / stage name and public-facing info. Leave Artist Name blank
            if you work exclusively behind the scenes.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Artist name <span className="normal-case font-normal">(stage name — optional)</span></label>
            <input
              value={form.artist_name}
              onChange={e => set('artist_name', e.target.value)}
              placeholder="Your stage name"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Genre <span className="normal-case font-normal">(select all that apply)</span></label>
            <div className="mt-2 flex flex-wrap gap-2">
              {GENRES.map(genre => {
                const selected = form.genres.includes(genre.slug)
                return (
                  <button
                    key={genre.slug}
                    type="button"
                    onClick={() => toggleGenre(genre.slug)}
                    className={[
                      'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                      selected
                        ? 'border-lav/50 bg-lav/20 text-white'
                        : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:text-white/80',
                    ].join(' ')}
                  >
                    {genre.label}
                  </button>
                )
              })}
            </div>
            {form.genres.length > 0 && (
              <p className="mt-2 text-xs text-white/30">
                {form.genres.length} genre{form.genres.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>Location</label>
            <input
              value={form.location}
              onChange={e => set('location', e.target.value)}
              placeholder="City, Country"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Bio</label>
            <textarea
              value={form.bio}
              onChange={e => set('bio', e.target.value)}
              rows={4}
              placeholder="Tell your story"
              className={`mt-1 ${inputClass} resize-none`}
            />
          </div>
          <div>
            <label className={labelClass}>Career stage</label>
            <select
              value={form.career_stage}
              onChange={e => set('career_stage', Number(e.target.value) as 1 | 2 | 3 | 4)}
              className={`mt-1 ${inputClass}`}
            >
              {CAREER_STAGES.map(s => (
                <option key={s.value} value={s.value} className="bg-neutral-900">
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ── Profile Badges & Availability ──────────────────────────
          Public profile role badges (PROFILE-02), "Open to" chips
          (PROFILE-04), and the resharing toggle (D-07). Distinct from
          the "Industry Roles" section below, which powers split
          sheets/contracts — these badges are what visitors see on
          /u/[handle].
      ─────────────────────────────────────────────────────────────── */}
      <section className="space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-white">Profile Badges &amp; Availability</h2>
          <p className="mt-1 text-xs text-white/40">
            Role badges and "open to" chips shown on your public profile.
          </p>
        </div>

        {/* Roles */}
        <div className="space-y-3">
          <label className={labelClass}>
            Role badges <span className="normal-case font-normal">(up to {MAX_PROFILE_ROLES})</span>
          </label>

          <div className="flex flex-wrap gap-2">
            {PROFILE_ROLES.map(slug => {
              const selected = isPresetRoleSelected(slug)
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => togglePresetRole(slug)}
                  className={[
                    'rounded-[10px] border px-[14px] py-2 text-[13px] font-semibold transition',
                    selected
                      ? 'border-hairstrong bg-card2 text-white'
                      : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:text-white/80',
                  ].join(' ')}
                >
                  {PROFILE_ROLE_LABELS[slug]}
                </button>
              )
            })}
          </div>

          <p className="text-xs text-white/30">
            Current badges — first is your lead role, shown highlighted on your profile.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {form.roles.map((r, i) => (
              <span
                key={i}
                className={[
                  'inline-flex items-center gap-2 rounded-[10px] border px-[14px] py-2 text-[14px] font-semibold text-white',
                  i === 0
                    ? 'border-brandindigo/40 bg-[linear-gradient(105deg,rgba(129,140,248,.22),rgba(217,70,239,.18))]'
                    : 'border-hairstrong bg-card2',
                ].join(' ')}
              >
                {profileRoleLabel(r)}
                {i !== 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setLeadRole(i)}
                      className="text-[11px] font-semibold text-brandindigo hover:text-white"
                    >
                      Set as lead
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRoleAt(i)}
                      aria-label={`Remove ${profileRoleLabel(r)}`}
                      className="text-white/40 hover:text-white"
                    >
                      ×
                    </button>
                  </>
                )}
              </span>
            ))}

            {addingCustomRole ? (
              <span className="inline-flex items-center gap-2 rounded-[10px] border border-dashed border-hairstrong bg-card2 px-[10px] py-1.5">
                <input
                  autoFocus
                  value={customRoleInput}
                  onChange={e => setCustomRoleInput(e.target.value.slice(0, MAX_CUSTOM_ROLE_LEN))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCustomRole()
                    }
                    if (e.key === 'Escape') {
                      setAddingCustomRole(false)
                      setCustomRoleInput('')
                    }
                  }}
                  placeholder="e.g. Mixing engineer"
                  maxLength={MAX_CUSTOM_ROLE_LEN}
                  className="w-40 bg-transparent text-[13px] text-white placeholder-white/30 outline-none"
                />
                <button
                  type="button"
                  onClick={addCustomRole}
                  className="text-[12px] font-semibold text-brandindigo hover:text-white"
                >
                  Add
                </button>
              </span>
            ) : (
              <button
                type="button"
                disabled={form.roles.length >= MAX_PROFILE_ROLES}
                onClick={() => setAddingCustomRole(true)}
                className="rounded-[10px] border border-dashed border-hairstrong px-[14px] py-2 text-[13px] font-semibold text-lavdim disabled:opacity-40"
              >
                + Add role
              </button>
            )}
          </div>
        </div>

        {/* Open to */}
        <div className="space-y-2">
          <label className={labelClass}>Open to</label>
          <div className="flex flex-wrap gap-2">
            {OPEN_TO_EDITOR_OPTIONS.map(({ slug, label }) => {
              const selected = form.open_to.includes(slug)
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => toggleOpenTo(slug)}
                  className={[
                    'inline-flex items-center gap-[7px] rounded-full border px-[13px] py-[7px] text-[13.5px] font-semibold transition',
                    selected
                      ? 'border-emerald-400/26 bg-emerald-400/10 text-emerald-400'
                      : 'border-hairstrong bg-card2 text-lavdim',
                  ].join(' ')}
                >
                  {selected && (
                    <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                      <path d="m20 6-11 11-5-5" />
                    </svg>
                  )}
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Resharing toggle */}
        <div className="flex items-start justify-between gap-4 border-t border-white/10 pt-4">
          <div>
            <p className="text-sm font-medium text-white">Allow others to share my music</p>
            <p className="mt-1 text-xs text-white/40">
              When on, visitors can share your public tracks and profile link. Turned off, only you can share.
            </p>
          </div>
          <button
            type="button"
            onClick={() => set('allow_resharing', !form.allow_resharing)}
            role="switch"
            aria-checked={form.allow_resharing}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
              form.allow_resharing ? 'bg-emerald-400' : 'bg-white/15'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                form.allow_resharing ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </section>

      {/* ── Industry Roles ─────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Industry Roles</h2>
          <p className="mt-1 text-xs text-white/40">
            Select every hat you wear in the industry. When you appear on a split sheet
            or contract, you'll choose which roles apply to that specific collaboration
            from this list — no re-entry needed.
          </p>
        </div>

        <div className="space-y-5">
          {INDUSTRY_ROLE_GROUPS.map(group => (
            <div key={group.group}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[.18em] text-lavdim">
                {group.group}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.roles.map(role => {
                  const selected = form.industry_roles.includes(role.slug)
                  return (
                    <button
                      key={role.slug}
                      type="button"
                      onClick={() => toggleRole(role.slug)}
                      className={[
                        'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                        selected
                          ? 'border-lav/50 bg-lav/20 text-white'
                          : 'border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:text-white/80',
                      ].join(' ')}
                    >
                      {role.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {form.industry_roles.length > 0 && (
          <p className="text-xs text-white/30">
            {form.industry_roles.length} role{form.industry_roles.length !== 1 ? 's' : ''} selected
          </p>
        )}
      </section>

      {/* ── Links ──────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-white">Links</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Instagram</label>
            <input
              value={form.instagram_handle}
              onChange={e => set('instagram_handle', e.target.value)}
              placeholder="@handle"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className={labelClass}>Threads</label>
            <input
              value={form.threads_handle}
              onChange={e => set('threads_handle', e.target.value)}
              placeholder="@handle"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className={labelClass}>TikTok</label>
            <input
              value={form.tiktok_handle}
              onChange={e => set('tiktok_handle', e.target.value)}
              placeholder="@handle"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className={labelClass}>Spotify URL</label>
            <input
              value={form.spotify_url}
              onChange={e => set('spotify_url', e.target.value)}
              placeholder="https://open.spotify.com/artist/…"
              className={`mt-1 ${inputClass}`}
            />
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
        {saved && <span className="text-sm text-emerald-300">Saved</span>}
      </div>
    </form>
  )
}
