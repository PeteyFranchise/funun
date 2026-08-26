'use client'

// SUPPORT_EMAIL is imported, never re-typed — it is text-locked in
// __tests__/report-problem-link.test.ts against aspirational aliases
// (support@ etc.) that do not yet receive mail. A second literal here
// would silently escape that guard.

// ── Contracts & rights tab (/settings) ──────────────────────────────────
// The private half of artist Settings: legal identity, contact, rights
// registry, ISRC registrant, and release-identifier prefixes. Every field,
// label, helper line, banner, and LearnWhy disclosure below moved here
// character-for-character out of ProfileForm.tsx — this file is a relocation,
// not a redesign.
//
// State comes from useSettingsForm(), which the settings LAYOUT mounts, so
// an unsaved edit here survives a switch to another tab.

import { useState } from 'react'
import { PRO_VALUES, PRO_LABELS } from '@/lib/metadata/schema'
import AddressAutocomplete from '@/components/profile/AddressAutocomplete'
import { LearnWhy } from '@/components/ui/LearnWhy'
import { SUPPORT_EMAIL } from '@/components/nav/ReportProblemLink'
import { composeLegalNameFromProfile } from '@/lib/split-sheets/agreement'
import type { ClaimPrefillEntry } from '@/lib/profile/claim-prefill'
import { inputClass, labelClass } from '@/lib/profile/settings-form'
import {
  useSettingsForm,
  type ClaimPrefillField,
} from '@/components/settings/SettingsFormProvider'

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

// ── Claim pre-fill confirm UI (R2) ─────────────────────────────────────
// Parametrizes the legal-name confirm-and-lock two-state block per rights
// field (D-01/D-02): a field the claim path pre-filled from a claimed
// collaborator record renders this "unconfirmed — review" notice, with
// named provenance (D-03 — the person who added you, NOT the song) and a
// per-field Confirm control, until the user confirms or edits the value.
// A field absent from profile.claim_prefill (user-entered, or still
// blank) renders nothing here.
function ClaimPrefillNotice({
  field,
  entry,
  submitting,
  error,
  onConfirm,
}: {
  field: ClaimPrefillField
  entry: ClaimPrefillEntry
  submitting: boolean
  error: string | null
  onConfirm: (field: ClaimPrefillField) => void
}) {
  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2">
      <p className="text-xs font-semibold text-amber-300">Unconfirmed — review this value</p>
      <p className="text-xs text-white/50">
        We filled this from a credit {entry.source_name || 'someone'} added you to. Confirm
        it&apos;s correct, or just edit and save above.
      </p>
      {error && <p className="text-xs text-rose-300">{error}</p>}
      <button
        type="button"
        disabled={submitting}
        onClick={() => onConfirm(field)}
        className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/20 disabled:opacity-40"
      >
        {submitting ? 'Confirming…' : 'Confirm this value'}
      </button>
    </div>
  )
}

export function RightsContractsSections() {
  const {
    profile,
    form,
    set,
    updateForm,
    submitting,
    error,
    saved,
    saveTab,
    lockSubmitting,
    lockError,
    lockLegalName,
    confirmingField,
    confirmFieldError,
    confirmPrefillField,
  } = useSettingsForm()

  const [showSuffix, setShowSuffix] = useState(Boolean(profile.legal_name_suffix))

  // Live preview for the confirm-and-lock control — composed the same way
  // agreement.ts composes it for the split-sheet document (first/middle/last
  // plus ", suffix"), from the current (possibly unsaved) form field values.
  const composedLegalNamePreview = composeLegalNameFromProfile({
    legal_first_name: form.legal_first_name,
    legal_middle_name: form.legal_middle_name,
    legal_last_name: form.legal_last_name,
    legal_name_suffix: form.legal_name_suffix,
  })

  function handleAddressChange(display: string, structured: Record<string, string> | null) {
    updateForm(f => ({
      ...f,
      mailing_address: display,
      mailing_address_structured: structured ?? f.mailing_address_structured,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await saveTab('rights')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* ── Group divider ───────────────────────────────── */}
      <div className="border-b border-white/10 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-lav">
          Contracts &amp; rights
        </p>
        <p className="mt-1.5 text-xs text-white/40">
          Private — only you and the documents you generate see this. Fill it in once
          and your name, contact, and rights details flow into every split sheet,
          contract, and registration automatically, with no retyping.
        </p>
      </div>

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

        <div className="rounded-lg border border-lav/20 bg-lav/5 px-4 py-3 text-xs text-white/60 space-y-1.5">
          <p className="font-semibold text-white/80">Use the exact same name everywhere</p>
          <LearnWhy>
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
          </LearnWhy>
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

        {/* ── Confirm & lock legal name (deliberation section 2) ────────
            One-time attestation, not a field freeze — the name fields
            above stay editable even after locking. Without this, a
            first-time user's read-only party-1 legal name (built in
            18-01) can never be set, blocking split-sheet creation
            entirely for new users. */}
        {profile.legal_name_locked_at ? (
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-xs">
            <p className="font-semibold text-emerald-300">
              Legal name confirmed on {new Date(profile.legal_name_locked_at).toLocaleDateString()}
            </p>
            <p className="mt-1 text-white/50">
              This locked name is what appears read-only as party 1 on your split sheets.
              You can still edit and save corrections above at any time.
            </p>
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-xs font-semibold text-white/80">Confirm &amp; lock your legal name</p>
            <LearnWhy label="What does locking do?">
              <p className="text-xs text-white/40">
                Locking your legal name lets it appear automatically, read-only, on every
                split sheet you create — no manual re-entry, no &quot;Use my info&quot; click.
              </p>
            </LearnWhy>
            {composedLegalNamePreview ? (
              <p className="text-sm text-white/70">
                Preview: <span className="font-medium text-white">{composedLegalNamePreview}</span>
              </p>
            ) : (
              <p className="text-xs text-white/30 italic">
                Enter your legal name above, then confirm and lock it.
              </p>
            )}
            {lockError && <p className="text-xs text-rose-300">{lockError}</p>}
            <button
              type="button"
              disabled={!composedLegalNamePreview || lockSubmitting}
              onClick={lockLegalName}
              className="rounded-lg bg-grad px-3 py-1.5 text-xs font-semibold text-white shadow-cta disabled:opacity-40"
            >
              {lockSubmitting ? 'Locking…' : 'Confirm & lock your legal name'}
            </button>
          </div>
        )}
      </section>

      {/* ── Contact ────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Contact</h2>
          {/* "Used on contracts and split sheets" was dropped — the group
              divider above says exactly that for the whole group, and
              repeating it here is the wordiness beta users flagged. What
              survives is the part the divider does NOT cover: why a contract
              wants a home address at all, and why there is no email field in a
              section called Contact.

              The why-clause is one sentence on purpose. "Identify each party by
              name and address" is the actual legal reason a split sheet asks —
              a party is identified by name AND notice address, not name alone.
              Artists asked why their home address was needed; answering costs
              one line, and not answering reads as data collection for its own
              sake.

              This previously read "Your login email is managed through your
              account settings." There IS no account-settings page, and no
              self-serve way to change a sign-in email at all — the only
              auth.updateUser() call in the codebase is the PASSWORD reset in
              app/(auth)/update-password. The sentence sent artists looking for
              a screen that does not exist. Do not restore it unless that
              screen is actually built; a Supabase email change confirms to
              BOTH the old and new address (takeover protection), so it is a
              real feature, not a form field. Until then the honest answer is
              "ask us", pointed at the same proven mailbox the nav's Report a
              problem link uses. */}
          <p className="mt-1 text-xs text-white/40">
            Contracts and split sheets identify each party by name and address. Your
            sign-in email isn&apos;t editable here.{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Funūn — change my sign-in email')}`}
              className="text-lav underline underline-offset-2 transition hover:text-white"
            >
              Ask us to change it
            </a>
            .
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
            {profile.claim_prefill?.contact_phone && !profile.claim_prefill.contact_phone.confirmed && (
              <ClaimPrefillNotice
                field="contact_phone"
                entry={profile.claim_prefill.contact_phone}
                submitting={confirmingField === 'contact_phone'}
                error={confirmingField === 'contact_phone' ? confirmFieldError : null}
                onConfirm={confirmPrefillField}
              />
            )}
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
            {profile.claim_prefill?.mailing_address && !profile.claim_prefill.mailing_address.confirmed && (
              <ClaimPrefillNotice
                field="mailing_address"
                entry={profile.claim_prefill.mailing_address}
                submitting={confirmingField === 'mailing_address'}
                error={confirmingField === 'mailing_address' ? confirmFieldError : null}
                onConfirm={confirmPrefillField}
              />
            )}
          </div>
        </div>
      </section>

      {/* ── Rights & Royalties ─────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Rights &amp; Royalties</h2>
          <p className="mt-1 text-xs text-white/40">
            Your rights registry information. Flows automatically into split sheets,
            metadata, and registration checklists.
          </p>
          {/* D-12 (19-CONTEXT.md) — verbatim help line, single canonical
              rights input now that the duplicate "Rights Identity"
              section and its API route are removed (R1). */}
          <p className="mt-1 text-xs text-white/40">
            Used on your split sheets, metadata, and registrations.
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
            {profile.claim_prefill?.pro && !profile.claim_prefill.pro.confirmed && (
              <ClaimPrefillNotice
                field="pro"
                entry={profile.claim_prefill.pro}
                submitting={confirmingField === 'pro'}
                error={confirmingField === 'pro' ? confirmFieldError : null}
                onConfirm={confirmPrefillField}
              />
            )}
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
            {profile.claim_prefill?.ipi && !profile.claim_prefill.ipi.confirmed && (
              <ClaimPrefillNotice
                field="ipi"
                entry={profile.claim_prefill.ipi}
                submitting={confirmingField === 'ipi'}
                error={confirmingField === 'ipi' ? confirmFieldError : null}
                onConfirm={confirmPrefillField}
              />
            )}
          </div>
          <div>
            <label className={labelClass}>Publisher</label>
            <input
              value={form.publisher}
              onChange={e => set('publisher', e.target.value)}
              placeholder="Publisher name"
              className={`mt-1 ${inputClass}`}
            />
            {profile.claim_prefill?.publisher && !profile.claim_prefill.publisher.confirmed && (
              <ClaimPrefillNotice
                field="publisher"
                entry={profile.claim_prefill.publisher}
                submitting={confirmingField === 'publisher'}
                error={confirmingField === 'publisher' ? confirmFieldError : null}
                onConfirm={confirmPrefillField}
              />
            )}
          </div>
          <div>
            <label className={labelClass}>Administrator</label>
            <input
              value={form.administrator}
              onChange={e => set('administrator', e.target.value)}
              placeholder="Publishing administrator"
              className={`mt-1 ${inputClass}`}
            />
            <p className="mt-1 text-xs text-white/30">
              Enter your publishing administrator if you have one. If you do not have one yet, enter &quot;None&quot;.
            </p>
            {profile.claim_prefill?.administrator && !profile.claim_prefill.administrator.confirmed && (
              <ClaimPrefillNotice
                field="administrator"
                entry={profile.claim_prefill.administrator}
                submitting={confirmingField === 'administrator'}
                error={confirmingField === 'administrator' ? confirmFieldError : null}
                onConfirm={confirmPrefillField}
              />
            )}
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
          <div>
            <label className={labelClass}>ISNI</label>
            <input
              value={form.isni}
              onChange={e => set('isni', e.target.value)}
              placeholder="0000 0001 2103 2683"
              className={`mt-1 ${inputClass}`}
            />
            <p className="mt-1 text-xs text-white/30">
              Your own International Standard Name Identifier, if you have one. Funūn never
              generates an ISNI — it's allocated by the ISNI International Agency.
            </p>
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

      {/* ── Release-identifier prefixes (migration 082, 16-11) ───── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Release identifier prefixes</h2>
          {/* The RULE stays visible; the WHY collapses (see components/ui/
              LearnWhy.tsx). "Most artists hold none, and nothing here is
              required" is the one line an artist must not miss — this whole
              section is defensive, existing mainly to stop people entering
              junk into fields they have no business filling. */}
          <p className="mt-1 text-xs text-white/40">
            Only fill these in if you hold your own prefix — most artists hold none, and
            nothing here is required.
          </p>
          {/* Do NOT reintroduce "Funūn mints GRids by default under its own
              platform issuer code" here. platform_identifier_config
              .grid_issuer_code is NULL on purpose — Funūn is not registered
              with IFPI, and migration 082 forbids seeding a placeholder
              because a fabricated issuer code would stamp invalid GRids
              under a non-existent authority. canGenerate() refuses the
              scheme accordingly (lib/metadata/generate.ts), so promising it
              here would advertise a capability the system deliberately
              declines to have. Revisit only once registration actually
              happens — a real deal, DDEX delivery, or distributor
              conversation is the trigger named in 082. */}
          <div className="mt-1.5">
            <LearnWhy>
              <p className="text-xs text-white/40">
                Funūn issues no identifiers under its own name: a GS1 prefix is the only
                way to generate a UPC, and most artists get one free from their
                distributor instead. GRid generation stays unavailable until you add your
                own issuer code, or Funūn registers as an issuer.
              </p>
            </LearnWhy>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>GS1 company prefix</label>
            <input
              value={form.gs1_company_prefix}
              onChange={e => set('gs1_company_prefix', e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="060123"
              className={`mt-1 ${inputClass}`}
            />
            <p className="mt-1 text-xs text-white/30">Only if you hold your own GS1 prefix — required to generate a UPC.</p>
          </div>
          <div>
            <label className={labelClass}>GRid issuer code (optional override)</label>
            <input
              value={form.grid_issuer_code}
              onChange={e => set('grid_issuer_code', e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 5))}
              placeholder="A12B3"
              maxLength={5}
              className={`mt-1 ${inputClass} uppercase`}
            />
            {/* The "leave blank" instruction lives here, NOT in the
                placeholder: a GRid issuer code is 5 characters, so the input
                is sized for 5 characters and any sentence-length placeholder
                is guaranteed to truncate mid-word. Placeholder shows the
                SHAPE of a valid value; the helper carries the direction. */}
            <p className="mt-1 text-xs text-white/30">
              Only if your label already holds its own GRid issuer code — without one,
              GRid generation is unavailable.
            </p>
          </div>
          <div>
            <label className={labelClass}>Catalog number prefix</label>
            <input
              value={form.catalog_number_prefix}
              onChange={e => set('catalog_number_prefix', e.target.value.toUpperCase().slice(0, 12))}
              placeholder="FUN"
              className={`mt-1 ${inputClass} uppercase`}
            />
            <p className="mt-1 text-xs text-white/30">Your own internal label prefix — no issuing body involved.</p>
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
