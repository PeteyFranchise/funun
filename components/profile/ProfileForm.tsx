'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { ArtistProfile } from '@/types'
import type { UserProfile } from '@/app/(artist)/settings/page'
import { PRO_VALUES, PRO_LABELS } from '@/lib/metadata/schema'
import { INDUSTRY_ROLE_GROUPS, ALL_INDUSTRY_ROLE_SLUGS } from '@/lib/industry-roles'
import { GENRES } from '@/lib/genres'
import AddressAutocomplete from '@/components/profile/AddressAutocomplete'

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30'
const labelClass = 'block text-xs font-medium uppercase tracking-wide text-white/40'

const CAREER_STAGES: { value: 1 | 2 | 3 | 4; label: string }[] = [
  { value: 1, label: 'Emerging' },
  { value: 2, label: 'Developing' },
  { value: 3, label: 'Established' },
  { value: 4, label: 'Professional' },
]

type FormState = {
  artist_name: string
  genre: string
  location: string
  bio: string
  instagram_handle: string
  threads_handle: string
  tiktok_handle: string
  spotify_url: string
  career_stage: 1 | 2 | 3 | 4
  genres: string[]
  isrc_country_code: string
  isrc_registrant_code: string
  pro: string
  ipi: string
  publisher: string
  mlc_id: string
  soundexchange_id: string
  legal_first_name: string
  legal_middle_name: string
  legal_last_name: string
  legal_name_suffix: string
  contact_phone: string
  mailing_address: string
  mailing_address_structured: Record<string, string> | null
  industry_roles: string[]
  allow_resharing: boolean
}

// State for the Rights Identity section — saved to /api/user-profiles
type RightsIdentityState = {
  pro: string
  ipi: string
  publisher: string
  phone: string
  mailing_address: string
  mailing_address_structured: Record<string, string> | null
}

function toForm(p: ArtistProfile): FormState {
  return {
    artist_name: p.artist_name ?? '',
    genre: p.genre ?? '',
    location: p.location ?? '',
    bio: p.bio ?? '',
    instagram_handle: p.instagram_handle ?? '',
    threads_handle: p.threads_handle ?? '',
    tiktok_handle: p.tiktok_handle ?? '',
    spotify_url: p.spotify_url ?? '',
    career_stage: p.career_stage ?? 1,
    genres: Array.isArray(p.genres) ? p.genres : [],
    isrc_country_code: p.isrc_country_code ?? '',
    isrc_registrant_code: p.isrc_registrant_code ?? '',
    pro: p.pro ?? '',
    ipi: p.ipi ?? '',
    publisher: p.publisher ?? '',
    mlc_id: p.mlc_id ?? '',
    soundexchange_id: p.soundexchange_id ?? '',
    legal_first_name: p.legal_first_name ?? '',
    legal_middle_name: p.legal_middle_name ?? '',
    legal_last_name: p.legal_last_name ?? '',
    legal_name_suffix: p.legal_name_suffix ?? '',
    contact_phone: p.contact_phone ?? '',
    mailing_address: (p.mailing_address as { raw?: string } | null)?.raw ?? '',
    mailing_address_structured: (p.mailing_address as Record<string, string> | null) ?? null,
    industry_roles: Array.isArray(p.industry_roles) ? p.industry_roles : [],
    allow_resharing: p.allow_resharing ?? false,
  }
}

// Seed Rights Identity state from userProfile, falling back to artist_profile values
function toRightsIdentity(
  userProfile: UserProfile | null,
  artistProfile: ArtistProfile
): RightsIdentityState {
  const address = (userProfile?.mailing_address as { raw?: string } | null)?.raw
    ?? (artistProfile.mailing_address as { raw?: string } | null)?.raw
    ?? ''
  const addressStructured =
    (userProfile?.mailing_address as Record<string, string> | null)
    ?? (artistProfile.mailing_address as Record<string, string> | null)
    ?? null
  return {
    pro: userProfile?.pro ?? artistProfile.pro ?? '',
    ipi: userProfile?.ipi ?? artistProfile.ipi ?? '',
    publisher: userProfile?.publisher ?? artistProfile.publisher ?? '',
    phone: userProfile?.phone ?? artistProfile.contact_phone ?? '',
    mailing_address: address,
    mailing_address_structured: addressStructured,
  }
}

function IsrcLearnMore() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-white/10 bg-white/5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-semibold text-white/60">Learn more about ISRC codes</span>
        <svg
          className={`h-4 w-4 text-white/30 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="space-y-4 border-t border-white/10 px-4 pb-4 pt-3">
          <div className="space-y-2 text-xs text-white/50 leading-relaxed">
            <p>
              An <span className="text-white/80 font-medium">ISRC (International Standard Recording Code)</span> is
              a unique 12-character identifier permanently attached to a specific recording — not a song, but that
              exact recorded performance. Every version (album mix, radio edit, TikTok snippet) gets its own ISRC.
            </p>
            <p>
              <span className="text-white/70 font-medium">Should you mint your own?</span> Most independent artists
              don't need to. Your distributor (DistroKid, TuneCore, CD Baby, etc.) assigns ISRCs for free when you
              upload a release. Those ISRCs work everywhere — streaming, sync licensing, SoundExchange royalty tracking.
            </p>
            <p>
              <span className="text-white/70 font-medium">When it makes sense to hold your own registrant code:</span> If
              you're releasing frequently, running a label, or want full control over your catalog's identifiers, you
              can apply for a registrant code through your country's ISRC agency (RIAA in the US). This lets Funūn
              generate ISRCs for you directly here.
            </p>
            <p>
              <span className="text-white/70 font-medium">TikTok & short-form clips:</span> TikTok uses ISRCs to
              route digital performance royalties through SoundExchange. If you upload your full master via a
              distributor, use the same ISRC — don't create a separate one for the clip. Register that ISRC with
              SoundExchange to collect those royalties.
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2.5">
            <p className="text-xs text-white/30 italic">
              Video walkthrough coming soon — how to apply for an ISRC registrant code and when it's worth it.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

type ProfileFormProps = {
  profile: ArtistProfile
  userProfile?: UserProfile | null
}

export function ProfileForm({ profile, userProfile = null }: ProfileFormProps) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(toForm(profile))
  const [showSuffix, setShowSuffix] = useState(Boolean(profile.legal_name_suffix))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Rights Identity section state — saved to /api/user-profiles
  const [rightsForm, setRightsForm] = useState<RightsIdentityState>(
    toRightsIdentity(userProfile, profile)
  )
  const [rightsSubmitting, setRightsSubmitting] = useState(false)
  const [rightsError, setRightsError] = useState<string | null>(null)
  const [rightsSaved, setRightsSaved] = useState(false)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
    setSaved(false)
  }

  function setRights<K extends keyof RightsIdentityState>(key: K, value: RightsIdentityState[K]) {
    setRightsForm(f => ({ ...f, [key]: value }))
    setRightsSaved(false)
  }

  function toggleGenre(slug: string) {
    setForm(f => {
      const genres = f.genres.includes(slug)
        ? f.genres.filter(g => g !== slug)
        : [...f.genres, slug]
      return { ...f, genres }
    })
    setSaved(false)
  }

  const handleAddressChange = useCallback((display: string, structured: Record<string, string> | null) => {
    setForm(f => ({
      ...f,
      mailing_address: display,
      mailing_address_structured: structured ?? f.mailing_address_structured,
    }))
    setSaved(false)
  }, [])

  const handleRightsAddressChange = useCallback((display: string, structured: Record<string, string> | null) => {
    setRightsForm(f => ({
      ...f,
      mailing_address: display,
      mailing_address_structured: structured ?? f.mailing_address_structured,
    }))
    setRightsSaved(false)
  }, [])

  function toggleRole(slug: string) {
    setForm(f => {
      const roles = f.industry_roles.includes(slug)
        ? f.industry_roles.filter(r => r !== slug)
        : [...f.industry_roles, slug]
      return { ...f, industry_roles: roles }
    })
    setSaved(false)
  }

  // Main profile save — non-rights fields to /api/profile
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        mailing_address: form.mailing_address.trim()
          ? (form.mailing_address_structured ?? { raw: form.mailing_address.trim() })
          : null,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Could not save profile')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    setSaved(true)
    router.refresh()
  }

  // Rights Identity save — to /api/user-profiles; triggers back-fill of claimed rows
  async function handleRightsSave(e: React.FormEvent) {
    e.preventDefault()
    setRightsSubmitting(true)
    setRightsError(null)

    const mailingAddress = rightsForm.mailing_address.trim()
      ? (rightsForm.mailing_address_structured ?? { raw: rightsForm.mailing_address.trim() })
      : null

    const res = await fetch('/api/user-profiles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pro: rightsForm.pro || null,
        ipi: rightsForm.ipi || null,
        publisher: rightsForm.publisher || null,
        phone: rightsForm.phone || null,
        mailing_address: mailingAddress,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setRightsError(json.error ?? 'Could not save rights identity')
      setRightsSubmitting(false)
      return
    }

    setRightsSubmitting(false)
    setRightsSaved(true)
    router.refresh()
  }

  return (
    <div className="space-y-12">
      <form onSubmit={handleSubmit} className="space-y-8">

        {/* ── Legal Identity ──────────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Legal Identity</h2>
            <p className="mt-1 text-xs text-white/40">
              Your legal name for contracts, split sheets, and rights registrations.
              This is separate from your artist name — someone who only works behind
              the scenes can leave Artist Name blank.
            </p>
          </div>

          <div className="rounded-lg border border-lav/20 bg-lav/5 px-4 py-3 text-xs text-white/60 space-y-1">
            <p className="font-semibold text-white/80">Use the exact same name everywhere</p>
            <p>
              Your legal name must appear <span className="text-white/90 font-medium">identically</span> on
              every composition, split sheet, PRO registration, and copyright filing.
              For example, if you don&apos;t use your middle name when you register your work,
              leave that field blank here, too. Inconsistencies — even minor ones — can
              freeze payments or cause royalties to be misdirected.
            </p>
            <p className="text-white/40 pt-0.5">
              Funūn does not collect or pay royalties. We organize this data so you can
              communicate easily with the entities that do — your PRO, The MLC, SoundExchange, and others.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <label className={labelClass}>First name</label>
              <input
                value={form.legal_first_name}
                onChange={e => set('legal_first_name', e.target.value)}
                placeholder="Jane"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Middle name / initial</label>
              <input
                value={form.legal_middle_name}
                onChange={e => set('legal_middle_name', e.target.value)}
                placeholder="A."
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Last name</label>
              <input
                value={form.legal_last_name}
                onChange={e => set('legal_last_name', e.target.value)}
                placeholder="Smith"
                className={`mt-1 ${inputClass}`}
              />
            </div>

            {showSuffix && (
              <div className="sm:col-span-2">
                <label className={labelClass}>Suffix</label>
                <input
                  value={form.legal_name_suffix}
                  onChange={e => set('legal_name_suffix', e.target.value)}
                  placeholder="Jr., Sr., II…"
                  className={`mt-1 ${inputClass}`}
                />
              </div>
            )}
            {!showSuffix && (
              <div className="sm:col-span-6">
                <button
                  type="button"
                  onClick={() => setShowSuffix(true)}
                  className="text-xs text-white/40 hover:text-white/70 transition"
                >
                  + Add suffix (Jr., Sr., II…)
                </button>
              </div>
            )}
          </div>
        </section>

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

        {/* ── Contact ────────────────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Contact</h2>
            <p className="mt-1 text-xs text-white/40">
              Used on contracts and split sheets. Your login email is managed through
              your account settings.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Phone</label>
              <input
                type="tel"
                value={form.contact_phone}
                onChange={e => set('contact_phone', e.target.value)}
                placeholder="+1 555 000 0000"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Mailing address</label>
              <AddressAutocomplete
                value={form.mailing_address}
                onChange={handleAddressChange}
                inputClass={`mt-1 ${inputClass}`}
              />
              {form.mailing_address_structured && (
                <p className="mt-1 text-xs text-white/30">
                  Address verified via Google
                </p>
              )}
            </div>
          </div>
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

        {/* ── Sharing ────────────────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Sharing</h2>
            <p className="mt-1 text-xs text-white/40">
              Controls whether listeners can reshare your public releases from the player.
              Your own Share button always works.
            </p>
          </div>
          <label className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <span className="text-sm text-white/80">
              Allow others to share my music
              <span className="mt-0.5 block text-xs text-white/40">
                Adds a Share button to your public player for every visitor. Only applies to releases you&apos;ve made public.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={form.allow_resharing}
              onClick={() => set('allow_resharing', !form.allow_resharing)}
              className={[
                'relative h-6 w-11 flex-none rounded-full border transition',
                form.allow_resharing ? 'border-transparent bg-grad' : 'border-white/15 bg-white/10',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-all',
                  form.allow_resharing ? 'left-[22px]' : 'left-[2px]',
                ].join(' ')}
              />
            </button>
          </label>
        </section>

        {/* ── Rights & Royalties ─────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Rights &amp; Royalties</h2>
            <p className="mt-1 text-xs text-white/40">
              Your rights registry information. Flows automatically into split sheets,
              metadata, and registration checklists.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>PRO affiliation</label>
              <select
                value={form.pro}
                onChange={e => set('pro', e.target.value)}
                className={`mt-1 ${inputClass}`}
              >
                <option value="" className="bg-neutral-900">Select PRO (optional)</option>
                {PRO_VALUES.map(v => (
                  <option key={v} value={v} className="bg-neutral-900">
                    {PRO_LABELS[v]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>IPI / CAE number</label>
              <input
                value={form.ipi}
                onChange={e => set('ipi', e.target.value)}
                placeholder="00000000000"
                className={`mt-1 ${inputClass}`}
              />
              <p className="mt-1 text-xs text-white/30">Assigned by your PRO when you register.</p>
            </div>
            <div>
              <label className={labelClass}>Publisher</label>
              <input
                value={form.publisher}
                onChange={e => set('publisher', e.target.value)}
                placeholder="Publisher name"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className={labelClass}>MLC member ID</label>
              <input
                value={form.mlc_id}
                onChange={e => set('mlc_id', e.target.value)}
                placeholder="MLC-XXXXXXXX"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className={labelClass}>SoundExchange ID</label>
              <input
                value={form.soundexchange_id}
                onChange={e => set('soundexchange_id', e.target.value)}
                placeholder="SE-XXXXXXXX"
                className={`mt-1 ${inputClass}`}
              />
            </div>
          </div>
        </section>

        {/* ── ISRC registrant ────────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-white">ISRC registrant</h2>
            <p className="mt-1 text-xs text-white/40">
              If you hold your own ISRC registrant code, add it here and Funūn can mint
              compliant ISRCs for your tracks automatically. Don't have one? Your distributor
              assigns ISRCs for free — leave this blank.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Country code</label>
              <input
                value={form.isrc_country_code}
                onChange={e => set('isrc_country_code', e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
                placeholder="US"
                maxLength={2}
                className={`mt-1 ${inputClass} uppercase`}
              />
              <p className="mt-1 text-xs text-white/30">2 letters — country of the registrant.</p>
            </div>
            <div>
              <label className={labelClass}>Registrant code</label>
              <input
                value={form.isrc_registrant_code}
                onChange={e => set('isrc_registrant_code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3))}
                placeholder="S1Z"
                maxLength={3}
                className={`mt-1 ${inputClass} uppercase`}
              />
              <p className="mt-1 text-xs text-white/30">3 characters — issued to you by the agency.</p>
            </div>
          </div>

          {/* ── ISRC learn more ─────────────────────────────────────── */}
          <IsrcLearnMore />
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

      {/* ── Rights Identity ─────────────────────────────────────────
          Separate section — saves to /api/user-profiles and fires an additive
          back-fill of every collaborator row this user has claimed (D-08).
          Seeded from user_profiles, falling back to artist_profile values.
      ────────────────────────────────────────────────────────────── */}
      <form onSubmit={handleRightsSave} className="space-y-6">
        <div className="border-t border-white/10 mt-8 pt-8">
          <h2 className="text-lg font-semibold text-white">Rights Identity</h2>
          <p className="text-sm text-lavdim mt-1">Saved here, auto-filled into every split sheet and contract.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>PRO affiliation</label>
            <select
              value={rightsForm.pro}
              onChange={e => setRights('pro', e.target.value)}
              className={`mt-1 ${inputClass}`}
            >
              <option value="" className="bg-neutral-900">Select PRO (optional)</option>
              {PRO_VALUES.map(v => (
                <option key={v} value={v} className="bg-neutral-900">
                  {PRO_LABELS[v]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>IPI / CAE number</label>
            <input
              value={rightsForm.ipi}
              onChange={e => setRights('ipi', e.target.value)}
              placeholder="00000000000"
              className={`mt-1 ${inputClass}`}
            />
            <p className="mt-1 text-xs text-white/30">Assigned by your PRO when you register.</p>
          </div>
          <div>
            <label className={labelClass}>Publisher</label>
            <input
              value={rightsForm.publisher}
              onChange={e => setRights('publisher', e.target.value)}
              placeholder="Publisher name"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input
              type="tel"
              value={rightsForm.phone}
              onChange={e => setRights('phone', e.target.value)}
              placeholder="+1 555 000 0000"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Mailing address</label>
            <AddressAutocomplete
              value={rightsForm.mailing_address}
              onChange={handleRightsAddressChange}
              inputClass={`mt-1 ${inputClass}`}
            />
            {rightsForm.mailing_address_structured && (
              <p className="mt-1 text-xs text-white/30">
                Address verified via Google
              </p>
            )}
          </div>
        </div>

        {rightsError && <p className="text-sm text-rose-300">{rightsError}</p>}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={rightsSubmitting}
            className="rounded-lg bg-grad px-4 py-2 text-sm font-semibold text-white shadow-cta disabled:opacity-40"
          >
            {rightsSubmitting ? 'Saving…' : 'Save rights identity'}
          </button>
          {rightsSaved && <span className="text-sm text-emerald-300">Saved</span>}
        </div>
      </form>
    </div>
  )
}
