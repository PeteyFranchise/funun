'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CollaboratorPicker } from '@/components/collaborators/CollaboratorPicker'
import {
  COMPOSER_ROLE_LABELS,
  COMPOSER_ROLE_VALUES,
  PRO_LABELS,
  PRO_VALUES,
  type ComposerRole,
} from '@/lib/metadata/schema'
import { evenSplit, validateApprovalTotal } from '@/lib/split-sheets/approval'
import type { CollaboratorProfile } from '@/lib/collaborators'
import type { PRO } from '@/lib/metadata/schema'

// ─── SplitSheetBuilder ───────────────────────────────────────────────
// Standalone split sheet creation form with per-party CollaboratorPicker
// auto-fill, even-split pre-fill, live 100% total validation, and CRUD
// persistence via POST /api/split-sheets.
//
// Captures the legal-grade document fields migration 063 added (P17-09) —
// without capture the columns are permanently null and the rebuilt
// renderer's Split Breakdown/Writer Signature Details sections are
// theatre. Per-party: Legal Name (the primary identity on the document),
// an optional Professional/Stage Name ("p/k/a"), Publishing Designee, and
// Administrator, alongside the existing PRO/IPI/Role/Split. At the sheet
// level: the optional standalone Work Details (Artist Name, Album/Project
// Title, Record Label — decision 4, all optional, em-dash on the document
// when absent).
//
// Props:
//   projects — artist's vault projects for the optional linked-project
//              select. Omit (or pass empty) for industry users — the sheet
//              will always be standalone (vault_project_id = null, D-18).
//   myProfile — the current user's own rights-registry snapshot (decision
//               3a, first link in the auto-populate chain: "signer is a
//               Funūn user → artist_profiles"). Powers the "Use my info"
//               prefill button on each party row. Only the CURRENT user's
//               own data is ever exposed here — the builder has no way to
//               look up another Funūn user's private profile, and should
//               not (that prefill link resolves at claim/reconciliation
//               time, not at sheet-creation time). Snapshot semantics
//               (decision 3a) are inherent here: prefill only copies
//               values into local row state once, at pick time — nothing
//               in this component re-reads the profile live.

export type MyProfilePrefill = {
  legalName: string
  artistName: string
  pro: string
  publishingDesignee: string
  administrator: string
}

type PartyRow = {
  collaboratorId: string | null
  legalName: string
  professionalName: string
  email: string
  pro: string
  ipi: string
  role: ComposerRole
  publishingDesignee: string
  administrator: string
  split: number
}

function blankParty(count: number): PartyRow {
  return {
    collaboratorId: null,
    legalName: '',
    professionalName: '',
    email: '',
    pro: 'none',
    ipi: '',
    role: 'composer_lyricist',
    publishingDesignee: '',
    administrator: '',
    split: evenSplit(count),
  }
}

// ─── Shared input / label classes (established project conventions) ───
const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30'

const labelClass = 'block text-xs font-medium uppercase tracking-wide text-white/40'
const miniLabelClass = 'block text-[10px] font-medium uppercase tracking-wide text-white/30'

type Props = {
  projects?: { id: string; title: string }[]
  myProfile?: MyProfilePrefill | null
}

export function SplitSheetBuilder({ projects = [], myProfile = null }: Props) {
  const router = useRouter()

  const [songName, setSongName] = useState('')
  const [vaultProjectId, setVaultProjectId] = useState<string | null>(null)
  const [artistName, setArtistName] = useState(myProfile?.artistName ?? '')
  const [albumProjectTitle, setAlbumProjectTitle] = useState('')
  const [recordLabel, setRecordLabel] = useState('')
  const [parties, setParties] = useState<PartyRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // ─── Derived totals ──────────────────────────────────────────────────
  const liveSplitSum =
    parties.length > 0
      ? Math.round(parties.reduce((acc, p) => acc + p.split, 0) * 1000) / 1000
      : 0
  const totalValid = validateApprovalTotal(parties.map(p => p.split))

  // ─── Party management ─────────────────────────────────────────────────

  function addParty() {
    const newCount = parties.length + 1
    // Pre-fill even split for all existing + new party (D-14)
    const even = evenSplit(newCount)
    setParties(prev =>
      [...prev.map(p => ({ ...p, split: even })), { ...blankParty(newCount), split: even }]
    )
  }

  function removeParty(i: number) {
    const next = parties.filter((_, idx) => idx !== i)
    const even = next.length > 0 ? evenSplit(next.length) : 0
    setParties(next.map(p => ({ ...p, split: even })))
  }

  function setPartyField<K extends keyof PartyRow>(i: number, field: K, value: PartyRow[K]) {
    setParties(prev => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)))
  }

  // CollaboratorPicker.onSelect: auto-fills identity/rights fields — NOT
  // role or split (D-13). legalName is deliberately NOT prefilled here —
  // collaborators has no legal-name column (decision 3a); the picked
  // name becomes the professional/stage name and the initiator (or the
  // party themselves, later) must enter the legal name.
  function handlePick(i: number, collab: CollaboratorProfile) {
    setParties(prev =>
      prev.map((p, idx) =>
        idx === i
          ? {
              ...p,
              collaboratorId: collab.id,
              professionalName: collab.name,
              email: collab.email ?? '',
              pro: collab.pro ?? 'none',
              ipi: collab.ipi ?? '',
              publishingDesignee: collab.publisher ?? p.publishingDesignee,
              administrator: collab.administrator ?? p.administrator,
              // role and split intentionally not modified
            }
          : p
      )
    )
  }

  // "Use my info" — prefills this row from the current user's own
  // rights-registry data (decision 3a, first prefill link). Only ever
  // reads the signed-in user's own snapshot passed down via `myProfile`.
  function applyMyInfo(i: number) {
    if (!myProfile) return
    setParties(prev =>
      prev.map((p, idx) =>
        idx === i
          ? {
              ...p,
              legalName: myProfile.legalName || p.legalName,
              professionalName: p.professionalName || myProfile.artistName,
              pro: myProfile.pro || p.pro,
              publishingDesignee: myProfile.publishingDesignee || p.publishingDesignee,
              administrator: myProfile.administrator || p.administrator,
            }
          : p
      )
    )
  }

  // Re-compute even split for all parties
  function splitEvenly() {
    if (parties.length === 0) return
    const even = evenSplit(parties.length)
    setParties(prev => prev.map(p => ({ ...p, split: even })))
  }

  // ─── Save handlers ────────────────────────────────────────────────────

  async function saveSheet(sendForApproval: boolean) {
    setError(null)
    setSuccess(false)

    if (!songName.trim()) {
      setError('Song name is required.')
      return
    }
    if (parties.length === 0) {
      setError('Add at least one party.')
      return
    }
    if (parties.some(p => !p.legalName.trim())) {
      setError('Every party needs a legal name.')
      return
    }
    if (!totalValid) {
      setError('Splits must total 100% before saving.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        song_name: songName.trim(),
        vault_project_id: vaultProjectId,
        artist_name: artistName.trim() || null,
        album_project_title: albumProjectTitle.trim() || null,
        record_label: recordLabel.trim() || null,
        parties: parties.map(p => ({
          collaborator_id: p.collaboratorId,
          // name (professional/display name, DB-required) falls back to
          // the legal name when no distinct professional name was
          // entered — decision 6's "legal name alone" case.
          name: p.professionalName.trim() || p.legalName.trim(),
          legal_name: p.legalName.trim() || null,
          email: p.email || null,
          pro: p.pro || null,
          ipi: p.ipi || null,
          role: p.role || null,
          split_percentage: p.split,
          publishing_designee: p.publishingDesignee.trim() || null,
          administrator: p.administrator.trim() || null,
        })),
      }

      const res = await fetch('/api/split-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed to save split sheet.')
        return
      }

      // Plan 04 will wire the send-for-approval email flow.
      // For now, if sendForApproval was clicked we save as draft and note that.
      if (sendForApproval) {
        setSuccess(true)
        setError(null)
        // Attempt to hit the send-for-approval route if it exists (Plan 04)
        const sheetId = json.data?.id
        if (sheetId) {
          const sendRes = await fetch(`/api/split-sheets/${sheetId}/send-for-approval`, {
            method: 'POST',
          })
          if (!sendRes.ok) {
            // Route not yet wired — surface a note, not an error
            setError('Sheet saved as draft. Approval email dispatch will be available in the next update.')
          }
        }
      } else {
        setSuccess(true)
      }

      router.refresh()
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── Section 1: Song name ── */}
      <div>
        <label className={labelClass}>Song name *</label>
        <input
          value={songName}
          onChange={e => setSongName(e.target.value)}
          placeholder="e.g. Ocean Drive"
          className={`mt-1.5 ${inputClass}`}
        />
      </div>

      {/* ── Section 2: Linked project (optional, artist-only) ── */}
      {projects.length > 0 && (
        <div>
          <label className={labelClass}>Linked release (optional)</label>
          <select
            value={vaultProjectId ?? ''}
            onChange={e => setVaultProjectId(e.target.value || null)}
            className={`mt-1.5 ${inputClass}`}
          >
            <option value="">Not tied to a release</option>
            {projects.map(p => (
              <option key={p.id} value={p.id} className="bg-[#0a0a0f]">
                {p.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Section 3: Work Details (standalone, optional — decision 4) ──
          Prints on the document; a missing value renders as an em-dash,
          never blocks saving or sending. ────────────────────────────── */}
      <div>
        <span className={labelClass}>Work Details</span>
        <p className="mt-1 text-xs text-white/30">
          Optional. Enter the release title if known; if not final, use the current
          working project title. If self-releasing, the label may be entered as
          &quot;Independent&quot;.
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <label className={miniLabelClass}>Artist name</label>
            <input
              value={artistName}
              onChange={e => setArtistName(e.target.value)}
              placeholder="Artist name"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className={miniLabelClass}>Album / project title</label>
            <input
              value={albumProjectTitle}
              onChange={e => setAlbumProjectTitle(e.target.value)}
              placeholder="Album / project title"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className={miniLabelClass}>Record label</label>
            <input
              value={recordLabel}
              onChange={e => setRecordLabel(e.target.value)}
              placeholder="Independent"
              className={`mt-1 ${inputClass}`}
            />
          </div>
        </div>
      </div>

      {/* ── Section 4: Parties ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <span className={labelClass}>Writers &amp; Split</span>
          {parties.length > 1 && (
            <button
              type="button"
              onClick={splitEvenly}
              className="text-xs text-brandindigo transition hover:text-white"
            >
              Split evenly
            </button>
          )}
        </div>

        <div className="space-y-3">
          {parties.map((party, i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3"
            >
              {/* Row A: Legal name + p/k/a + picker + remove */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <div className="sm:col-span-5">
                  <label className={miniLabelClass}>Legal name *</label>
                  <input
                    value={party.legalName}
                    onChange={e => setPartyField(i, 'legalName', e.target.value)}
                    placeholder="Full legal name, as registered with PRO"
                    className={`mt-1 ${inputClass}`}
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className={miniLabelClass}>Professional name (p/k/a, optional)</label>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      value={party.professionalName}
                      onChange={e => setPartyField(i, 'professionalName', e.target.value)}
                      placeholder="Stage name"
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
                    />
                    <CollaboratorPicker onSelect={collab => handlePick(i, collab)} />
                  </div>
                </div>
                <div className="flex items-end justify-end gap-1.5 sm:col-span-3">
                  {myProfile && (
                    <button
                      type="button"
                      onClick={() => applyMyInfo(i)}
                      className="rounded-lg border border-dashed border-white/15 px-2 py-1 text-xs text-white/50 transition hover:border-white/30 hover:text-white"
                    >
                      Use my info
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeParty(i)}
                    className="shrink-0 rounded-lg border border-white/10 p-1.5 text-white/40 transition hover:border-rose-400/40 hover:text-rose-300"
                    aria-label="Remove party"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Row B: Role, PRO, IPI, Split % */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <div className="sm:col-span-3">
                  <label className={miniLabelClass}>Role</label>
                  <select
                    value={party.role}
                    onChange={e => setPartyField(i, 'role', e.target.value as ComposerRole)}
                    className={`mt-1 ${inputClass}`}
                  >
                    {COMPOSER_ROLE_VALUES.map(r => (
                      <option key={r} value={r} className="bg-[#0a0a0f]">
                        {COMPOSER_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className={miniLabelClass}>PRO / Society</label>
                  <select
                    value={party.pro}
                    onChange={e => setPartyField(i, 'pro', e.target.value as PRO)}
                    className={`mt-1 ${inputClass}`}
                  >
                    {PRO_VALUES.map(p => (
                      <option key={p} value={p} className="bg-[#0a0a0f]">
                        {PRO_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className={miniLabelClass}>IPI #</label>
                  <input
                    value={party.ipi}
                    onChange={e => setPartyField(i, 'ipi', e.target.value)}
                    placeholder="IPI #"
                    className={`mt-1 ${inputClass}`}
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className={miniLabelClass}>Split %</label>
                  <div className="relative mt-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.001}
                      value={party.split || ''}
                      onChange={e => setPartyField(i, 'split', Number(e.target.value) || 0)}
                      placeholder="0"
                      className={`${inputClass} pr-6`}
                    />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/40">
                      %
                    </span>
                  </div>
                </div>
              </div>

              {/* Row C: Publishing Designee, Administrator */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className={miniLabelClass}>Publishing designee</label>
                  <input
                    value={party.publishingDesignee}
                    onChange={e => setPartyField(i, 'publishingDesignee', e.target.value)}
                    placeholder="Publisher name, or None"
                    className={`mt-1 ${inputClass}`}
                  />
                </div>
                <div>
                  <label className={miniLabelClass}>Administrator</label>
                  <input
                    value={party.administrator}
                    onChange={e => setPartyField(i, 'administrator', e.target.value)}
                    placeholder="Publishing administrator, or None"
                    className={`mt-1 ${inputClass}`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add party */}
        <button
          type="button"
          onClick={addParty}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 py-2 text-sm text-white/40 transition hover:border-white/30 hover:text-white/70"
        >
          <span className="text-base leading-none">+</span> Add party
        </button>
      </div>

      {/* ── Running total ── */}
      {parties.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span
            className={totalValid ? 'font-semibold text-emerald-300' : 'font-semibold text-amber-300'}
          >
            Total: {liveSplitSum}%
          </span>
          {!totalValid && (
            <span className="text-xs text-white/40">Must equal exactly 100%</span>
          )}
        </div>
      )}

      {/* ── Error / success feedback ── */}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {success && !error && (
        <p className="text-sm text-emerald-300">Split sheet saved successfully.</p>
      )}

      {/* ── Action row ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => saveSheet(false)}
          disabled={saving}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-40"
        >
          Save draft
        </button>

        <div className="group relative">
          <button
            type="button"
            onClick={() => saveSheet(true)}
            disabled={saving || !totalValid}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send for approval
          </button>
          {!totalValid && (
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 rounded-lg border border-white/10 bg-card px-3 py-1.5 text-xs text-white shadow-xl group-hover:block">
              All splits must total 100% before sending
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
