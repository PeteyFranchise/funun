'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PartyPicker, type PartyPickerSelection } from '@/components/split-sheets/PartyPicker'
import {
  COMPOSER_ROLE_LABELS,
  COMPOSER_ROLE_VALUES,
  PRO_LABELS,
  PRO_VALUES,
  type ComposerRole,
} from '@/lib/metadata/schema'
import { validateApprovalTotal } from '@/lib/split-sheets/approval'
import { redistribute, type RedistributeMode } from '@/lib/split-sheets/redistribute'
import { summarizePartyChanges, formatPartyChanges, type PartyChangeSnapshot } from '@/lib/split-sheets/change-summary'
import { assertEditable, type SplitSheetStatus } from '@/lib/split-sheets/lifecycle'
import type { PRO } from '@/lib/metadata/schema'

// ─── SplitSheetBuilder ───────────────────────────────────────────────
// Split sheet creation AND edit form (18-01, HOME-02/HOME-03). The
// initiator is auto-included as party 1 on BOTH create and edit — no
// manual "+ Add party → Use my info" step (deliberation §9). This is a
// change to the builder's SHARED baseline behavior, not an edit-mode-only
// addition (research Pitfall 4): create mode's first render now shows a
// single, locked, 100%-split self row instead of an empty list.
//
// PartyRow carries a `kind` discriminant so the render layer knows the
// shape of each row:
//   - 'self'    — the initiator, party 1. Legal name is READ-ONLY, sourced
//                 from Settings (locked per deliberation §2); PRO/IPI/
//                 publishing designee/administrator are shown live but
//                 never manually re-entered (§1). No remove control, no
//                 picker on this row — the initiator isn't picking a
//                 collaborator, they ARE the party. Incomplete Settings
//                 data is a soft nudge, never a blocker.
//   - 'fastAdd' — a party added via PartyPicker's email/phone-only flow
//                 (§4), not yet responded. Advanced information (legal
//                 name, PRO, IPI, publishing designee, administrator) is
//                 collapsed by default, with a pending/confirmed badge.
//   - 'full'    — an existing roster collaborator, prefilled as today.
//
// Adding a party goes through PartyPicker (a NEW, separate component —
// components/collaborators/CollaboratorPicker.tsx is never imported here;
// it has a third caller, MetadataStudio's ComposerEditor, with no
// automated coverage — research Pitfall 2) and calls redistribute()
// (lib/split-sheets/redistribute.ts) so the other rows' percentages
// update without being retyped (P18-07).
//
// Edit mode is driven by an optional `existingSheet` prop: when present,
// saving issues PATCH /api/split-sheets/[id] instead of POST
// /api/split-sheets (HOME-02 — PATCH's first UI caller ever). The freeze
// boundary (lib/split-sheets/lifecycle.ts) renders its OWN refusal text
// when the sheet cannot be edited, and a consensus-reset save shows the
// P18-09 change summary (lib/split-sheets/change-summary.ts) diffed on
// the FROZEN pre-edit party set the server handed down.

export type MyProfilePrefill = {
  legalName: string
  artistName: string
  pro: string
  ipi: string
  publishingDesignee: string
  administrator: string
}

/** A single persisted party as loaded for edit mode — identity fields are
 * ALREADY live-resolved server-side (lib/split-sheets/live-identity.ts) for
 * a claimed party; `kind` is precomputed by the server from that resolved
 * legal name (empty ⇒ 'fastAdd', present ⇒ 'full'). */
export type ExistingSheetParty = {
  partyId: string
  collaboratorId: string | null
  name: string
  legalName: string
  email: string
  pro: string
  ipi: string
  role: ComposerRole
  publishingDesignee: string
  administrator: string
  split: number
  kind: 'full' | 'fastAdd'
}

export type ExistingSheet = {
  id: string
  status: SplitSheetStatus
  songName: string
  artistName: string
  albumProjectTitle: string
  recordLabel: string
  vaultProjectId: string | null
  selfPartyId: string | null
  selfSplit: number
  selfRole: ComposerRole
  otherParties: ExistingSheetParty[]
  /** ALL originally-persisted parties, untouched — the P18-09 "before"
   * snapshot for summarizePartyChanges(); never live-resolved. */
  frozenParties: PartyChangeSnapshot[]
}

type PartyRow = {
  kind: 'self' | 'fastAdd' | 'full'
  /** The persisted split_sheet_parties.id, when loaded from an existing sheet. */
  partyId: string | null
  collaboratorId: string | null
  legalName: string
  professionalName: string
  email: string
  phone: string
  pro: string
  ipi: string
  role: ComposerRole
  publishingDesignee: string
  administrator: string
  split: number
}

function partyDisplayName(p: PartyRow): string {
  return (
    p.professionalName.trim() ||
    p.legalName.trim() ||
    p.email.trim() ||
    p.phone.trim() ||
    (p.kind === 'self' ? 'You' : 'Unnamed collaborator')
  )
}

function buildInitialParties(
  myProfile: MyProfilePrefill | null,
  existingSheet: ExistingSheet | null
): PartyRow[] {
  const selfRow: PartyRow = {
    kind: 'self',
    partyId: existingSheet?.selfPartyId ?? null,
    collaboratorId: null,
    legalName: myProfile?.legalName ?? '',
    professionalName: myProfile?.artistName ?? '',
    email: '',
    phone: '',
    pro: myProfile?.pro || 'none',
    ipi: myProfile?.ipi ?? '',
    role: existingSheet?.selfRole ?? 'composer_lyricist',
    publishingDesignee: myProfile?.publishingDesignee ?? '',
    administrator: myProfile?.administrator ?? '',
    split: existingSheet ? existingSheet.selfSplit : 100,
  }

  if (!existingSheet) return [selfRow]

  const others: PartyRow[] = existingSheet.otherParties.map(p => ({
    kind: p.kind,
    partyId: p.partyId,
    collaboratorId: p.collaboratorId,
    legalName: p.legalName,
    professionalName: p.name,
    email: p.email,
    phone: '',
    pro: p.pro || 'none',
    ipi: p.ipi,
    role: p.role,
    publishingDesignee: p.publishingDesignee,
    administrator: p.administrator,
    split: p.split,
  }))

  return [selfRow, ...others]
}

// ─── Shared input / label classes (established project conventions) ───
const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30'
const disabledInputClass =
  'w-full rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm text-white/60'

const labelClass = 'block text-xs font-medium uppercase tracking-wide text-white/40'
const miniLabelClass = 'block text-[10px] font-medium uppercase tracking-wide text-white/30'

type Props = {
  projects?: { id: string; title: string }[]
  myProfile?: MyProfilePrefill | null
  existingSheet?: ExistingSheet | null
}

export function SplitSheetBuilder({ projects = [], myProfile = null, existingSheet = null }: Props) {
  const router = useRouter()

  const [songName, setSongName] = useState(existingSheet?.songName ?? '')
  const [vaultProjectId, setVaultProjectId] = useState<string | null>(
    existingSheet?.vaultProjectId ?? null
  )
  const [artistName, setArtistName] = useState(
    existingSheet?.artistName ?? myProfile?.artistName ?? ''
  )
  const [albumProjectTitle, setAlbumProjectTitle] = useState(existingSheet?.albumProjectTitle ?? '')
  const [recordLabel, setRecordLabel] = useState(existingSheet?.recordLabel ?? '')
  const [parties, setParties] = useState<PartyRow[]>(() =>
    buildInitialParties(myProfile, existingSheet)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [changeSummary, setChangeSummary] = useState<string[] | null>(null)

  // ─── Freeze boundary (P18-06) ─────────────────────────────────────────
  // The PATCH route always replaces the party set on this builder's saves,
  // so editsParties is always true here — the gate is computed once from
  // the sheet's CURRENT persisted status and drives the whole surface.
  const gate = existingSheet ? assertEditable(existingSheet.status, true) : { ok: true as const, resetsConsensus: false }

  // ─── Derived totals ──────────────────────────────────────────────────
  const liveSplitSum =
    parties.length > 0
      ? Math.round(parties.reduce((acc, p) => acc + p.split, 0) * 1000) / 1000
      : 0
  const totalValid = validateApprovalTotal(parties.map(p => p.split))

  // ─── Party management ─────────────────────────────────────────────────

  function applyRedistribution(next: PartyRow[], mode: RedistributeMode) {
    const splits = redistribute(next.map(p => p.split), mode)
    return next.map((p, i) => ({ ...p, split: splits[i] ?? p.split }))
  }

  function handleAddParty(selection: PartyPickerSelection) {
    const { collaborator } = selection
    const newRow: PartyRow = {
      kind: selection.kind === 'fastAdd' ? 'fastAdd' : 'full',
      partyId: null,
      collaboratorId: collaborator.id,
      legalName: collaborator.legal_name ?? '',
      professionalName: collaborator.name,
      email: collaborator.email ?? '',
      phone: collaborator.phone ?? '',
      pro: collaborator.pro || 'none',
      ipi: collaborator.ipi ?? '',
      role: 'composer_lyricist',
      publishingDesignee: collaborator.publisher ?? '',
      administrator: collaborator.administrator ?? '',
      // Placeholder — redistribute() below (proportional mode) reads a
      // zero split as "a party with no prior weight" and assigns it an
      // even share while scaling the rest to preserve their ratio (P18-07).
      split: 0,
    }
    setParties(prev => applyRedistribution([...prev, newRow], 'proportional'))
  }

  function removeParty(i: number) {
    // The initiator's own row can never be removed (locked decision 4,
    // research Open Question 2) — the UI never renders a remove control
    // on it, but this guard keeps the invariant even if that changes.
    if (parties[i].kind === 'self') return
    const next = parties.filter((_, idx) => idx !== i)
    if (next.length === 0) return
    setParties(applyRedistribution(next, 'proportional'))
  }

  function setPartyField<K extends keyof PartyRow>(i: number, field: K, value: PartyRow[K]) {
    setParties(prev => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)))
  }

  // Re-compute even split for all parties (the explicit "Split evenly" path).
  function splitEvenly() {
    if (parties.length === 0) return
    setParties(prev => applyRedistribution(prev, 'even'))
  }

  // ─── Save handlers ────────────────────────────────────────────────────

  async function saveSheet(sendForApproval: boolean) {
    setError(null)
    setSuccess(false)
    setChangeSummary(null)

    if (!songName.trim()) {
      setError('Song name is required.')
      return
    }
    // §4/§9: a legal name is required only for a 'full' row — the self
    // row is satisfied automatically (soft nudge, never a blocker) and a
    // freshly fast-added, not-yet-responded party is exempt.
    if (parties.some(p => p.kind === 'full' && !p.legalName.trim())) {
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
          name: partyDisplayName(p),
          legal_name: p.legalName.trim() || null,
          email: p.email.trim() || null,
          pro: p.pro || null,
          ipi: p.ipi || null,
          role: p.role || null,
          split_percentage: p.split,
          publishing_designee: p.publishingDesignee.trim() || null,
          administrator: p.administrator.trim() || null,
        })),
      }

      const url = existingSheet ? `/api/split-sheets/${existingSheet.id}` : '/api/split-sheets'
      const method = existingSheet ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed to save split sheet.')
        return
      }

      // P18-09: show what changed, diffed on the FROZEN pre-edit snapshot
      // the server handed down — never on live-resolved values, so a
      // party's own Settings update never appears as a spurious change.
      if (existingSheet && gate.ok && gate.resetsConsensus) {
        const after: PartyChangeSnapshot[] = parties.map(p => ({
          id: p.partyId ?? undefined,
          name: partyDisplayName(p),
          split_percentage: p.split,
        }))
        const diff = summarizePartyChanges(existingSheet.frozenParties, after)
        setChangeSummary(formatPartyChanges(diff))
      }

      if (sendForApproval) {
        setSuccess(true)
        setError(null)
        const sheetId = existingSheet?.id ?? json.data?.id
        if (sheetId) {
          const sendRes = await fetch(`/api/split-sheets/${sheetId}/send-for-approval`, {
            method: 'POST',
          })
          if (!sendRes.ok) {
            setError('Sheet saved. Sending for approval will be available shortly — try again from the sheet page.')
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

  // ─── Freeze boundary: fully read-only render ──────────────────────────
  // executed/esign_pending — the gate's OWN words, not a paraphrase.
  if (existingSheet && !gate.ok) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          {gate.error}
        </div>
        <div className="space-y-2">
          {parties.map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm"
            >
              <div>
                <span className="font-medium text-white">{partyDisplayName(p)}</span>
                {p.kind === 'self' && <span className="ml-2 text-xs text-brandindigo">(you)</span>}
              </div>
              <span className="font-semibold text-white/70">{p.split}%</span>
            </div>
          ))}
        </div>
      </div>
    )
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

      {/* ── Section 3: Work Details (standalone, optional — decision 4) ── */}
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
            <PartyRowCard
              key={i}
              party={party}
              index={i}
              onField={setPartyField}
              onRemove={removeParty}
            />
          ))}
        </div>

        {/* Add party — opens PartyPicker (roster pick or fast-add) */}
        <div className="mt-3">
          <PartyPicker onSelect={handleAddParty} />
        </div>
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

      {/* ── Consensus-reset warning (P18-06/P18-09) ── */}
      {existingSheet && gate.ok && gate.resetsConsensus && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          Saving will reset approvals collected so far — every party will need to
          re-approve, and they&rsquo;ll be shown exactly what changed.
        </div>
      )}

      {/* ── Error / success feedback ── */}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {success && !error && (
        <p className="text-sm text-emerald-300">Split sheet saved successfully.</p>
      )}

      {/* ── Change summary (P18-09), shown after a consensus-resetting save ── */}
      {changeSummary && changeSummary.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/70">
          <p className="mb-1 font-semibold text-white">What changed</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {changeSummary.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
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

// ─── PartyRowCard ─────────────────────────────────────────────────────
// Branches render entirely on `party.kind` — see the module header for
// what each kind means.
function PartyRowCard({
  party,
  index,
  onField,
  onRemove,
}: {
  party: PartyRow
  index: number
  onField: <K extends keyof PartyRow>(i: number, field: K, value: PartyRow[K]) => void
  onRemove: (i: number) => void
}) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const roleAndSplitRow = (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div>
        <label className={miniLabelClass}>Role</label>
        <select
          value={party.role}
          onChange={e => onField(index, 'role', e.target.value as ComposerRole)}
          className={`mt-1 ${inputClass}`}
        >
          {COMPOSER_ROLE_VALUES.map(r => (
            <option key={r} value={r} className="bg-[#0a0a0f]">
              {COMPOSER_ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={miniLabelClass}>Split %</label>
        <div className="relative mt-1">
          <input
            type="number"
            min={0}
            max={100}
            step={0.001}
            value={party.split || ''}
            onChange={e => onField(index, 'split', Number(e.target.value) || 0)}
            placeholder="0"
            className={`${inputClass} pr-6`}
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/40">
            %
          </span>
        </div>
      </div>
    </div>
  )

  if (party.kind === 'self') {
    return (
      <div className="space-y-2 rounded-lg border border-brandindigo/20 bg-brandindigo/[0.04] p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide text-brandindigo">
            You (party 1)
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className={miniLabelClass}>Legal name</label>
            <input
              value={party.legalName || 'Not set'}
              disabled
              className={`mt-1 ${disabledInputClass}`}
            />
            {!party.legalName && (
              <p className="mt-1 text-[11px] text-amber-300/80">
                Add your legal name in{' '}
                <Link href="/settings" className="underline underline-offset-2">
                  Settings
                </Link>{' '}
                so it appears here — this won&rsquo;t block saving.
              </p>
            )}
          </div>
          <div>
            <label className={miniLabelClass}>Professional name (p/k/a, optional)</label>
            <input
              value={party.professionalName}
              onChange={e => onField(index, 'professionalName', e.target.value)}
              placeholder="Stage name"
              className={`mt-1 ${inputClass}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <label className={miniLabelClass}>PRO / Society (live from Settings)</label>
            <input
              value={party.pro === 'none' ? 'None' : (PRO_LABELS[party.pro as PRO] ?? party.pro)}
              disabled
              className={`mt-1 ${disabledInputClass}`}
            />
          </div>
          <div>
            <label className={miniLabelClass}>IPI # (live from Settings)</label>
            <input value={party.ipi || '—'} disabled className={`mt-1 ${disabledInputClass}`} />
          </div>
          <div>
            <label className={miniLabelClass}>Publishing designee (live)</label>
            <input
              value={party.publishingDesignee || '—'}
              disabled
              className={`mt-1 ${disabledInputClass}`}
            />
          </div>
        </div>

        {roleAndSplitRow}
      </div>
    )
  }

  if (party.kind === 'fastAdd') {
    return (
      <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
            Pending
          </span>
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="shrink-0 rounded-lg border border-white/10 p-1.5 text-white/40 transition hover:border-rose-400/40 hover:text-rose-300"
            aria-label="Remove party"
          >
            <RemoveIcon />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className={miniLabelClass}>Email</label>
            <input
              type="email"
              value={party.email}
              onChange={e => onField(index, 'email', e.target.value)}
              placeholder="jane@example.com"
              className={`mt-1 ${inputClass}`}
            />
          </div>
          <div>
            <label className={miniLabelClass}>Phone</label>
            <input
              type="tel"
              value={party.phone}
              onChange={e => onField(index, 'phone', e.target.value)}
              placeholder="+1 555 000 0000"
              className={`mt-1 ${inputClass}`}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced(prev => !prev)}
          className="text-xs font-medium text-brandindigo hover:text-white"
        >
          {showAdvanced ? '– Hide advanced information' : '+ Advanced information'}
        </button>

        {showAdvanced && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div>
              <label className={miniLabelClass}>Legal name</label>
              <input
                value={party.legalName}
                onChange={e => onField(index, 'legalName', e.target.value)}
                placeholder="Full legal name, as registered with PRO"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className={miniLabelClass}>PRO / Society</label>
                <select
                  value={party.pro}
                  onChange={e => onField(index, 'pro', e.target.value as PRO)}
                  className={`mt-1 ${inputClass}`}
                >
                  {PRO_VALUES.map(p => (
                    <option key={p} value={p} className="bg-[#0a0a0f]">
                      {PRO_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={miniLabelClass}>IPI #</label>
                <input
                  value={party.ipi}
                  onChange={e => onField(index, 'ipi', e.target.value)}
                  placeholder="IPI #"
                  className={`mt-1 ${inputClass}`}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className={miniLabelClass}>Publishing designee</label>
                <input
                  value={party.publishingDesignee}
                  onChange={e => onField(index, 'publishingDesignee', e.target.value)}
                  placeholder="Publisher name, or None"
                  className={`mt-1 ${inputClass}`}
                />
              </div>
              <div>
                <label className={miniLabelClass}>Administrator</label>
                <input
                  value={party.administrator}
                  onChange={e => onField(index, 'administrator', e.target.value)}
                  placeholder="Publishing administrator, or None"
                  className={`mt-1 ${inputClass}`}
                />
              </div>
            </div>
          </div>
        )}

        {roleAndSplitRow}
      </div>
    )
  }

  // kind === 'full'
  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <div className="sm:col-span-5">
          <label className={miniLabelClass}>Legal name *</label>
          <input
            value={party.legalName}
            onChange={e => onField(index, 'legalName', e.target.value)}
            placeholder="Full legal name, as registered with PRO"
            className={`mt-1 ${inputClass}`}
          />
        </div>
        <div className="sm:col-span-5">
          <label className={miniLabelClass}>Professional name (p/k/a, optional)</label>
          <input
            value={party.professionalName}
            onChange={e => onField(index, 'professionalName', e.target.value)}
            placeholder="Stage name"
            className={`mt-1 ${inputClass}`}
          />
        </div>
        <div className="flex items-end justify-end sm:col-span-2">
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="shrink-0 rounded-lg border border-white/10 p-1.5 text-white/40 transition hover:border-rose-400/40 hover:text-rose-300"
            aria-label="Remove party"
          >
            <RemoveIcon />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <div className="sm:col-span-3">
          <label className={miniLabelClass}>Role</label>
          <select
            value={party.role}
            onChange={e => onField(index, 'role', e.target.value as ComposerRole)}
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
            onChange={e => onField(index, 'pro', e.target.value as PRO)}
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
            onChange={e => onField(index, 'ipi', e.target.value)}
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
              onChange={e => onField(index, 'split', Number(e.target.value) || 0)}
              placeholder="0"
              className={`${inputClass} pr-6`}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/40">
              %
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className={miniLabelClass}>Publishing designee</label>
          <input
            value={party.publishingDesignee}
            onChange={e => onField(index, 'publishingDesignee', e.target.value)}
            placeholder="Publisher name, or None"
            className={`mt-1 ${inputClass}`}
          />
        </div>
        <div>
          <label className={miniLabelClass}>Administrator</label>
          <input
            value={party.administrator}
            onChange={e => onField(index, 'administrator', e.target.value)}
            placeholder="Publishing administrator, or None"
            className={`mt-1 ${inputClass}`}
          />
        </div>
      </div>
    </div>
  )
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  )
}
