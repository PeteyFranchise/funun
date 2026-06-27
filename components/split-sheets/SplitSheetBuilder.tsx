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
// Props:
//   projects — artist's vault projects for the optional linked-project
//              select. Omit (or pass empty) for industry users — the sheet
//              will always be standalone (vault_project_id = null, D-18).

type PartyRow = {
  collaboratorId: string | null
  name: string
  email: string
  pro: string
  ipi: string
  role: ComposerRole
  split: number
}

function blankParty(count: number): PartyRow {
  return {
    collaboratorId: null,
    name: '',
    email: '',
    pro: 'none',
    ipi: '',
    role: 'composer_lyricist',
    split: evenSplit(count),
  }
}

// ─── Shared input / label classes (established project conventions) ───
const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-white/30'

const labelClass = 'block text-xs font-medium uppercase tracking-wide text-white/40'

type Props = {
  projects?: { id: string; title: string }[]
}

export function SplitSheetBuilder({ projects = [] }: Props) {
  const router = useRouter()

  const [songName, setSongName] = useState('')
  const [vaultProjectId, setVaultProjectId] = useState<string | null>(null)
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

  // CollaboratorPicker.onSelect: auto-fills name/email/PRO/IPI only — NOT role or split (D-13)
  function handlePick(i: number, collab: CollaboratorProfile) {
    setParties(prev =>
      prev.map((p, idx) =>
        idx === i
          ? {
              ...p,
              collaboratorId: collab.id,
              name: collab.name,
              email: collab.email ?? '',
              pro: collab.pro ?? 'none',
              ipi: collab.ipi ?? '',
              // role and split intentionally not modified
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
    if (!totalValid) {
      setError('Splits must total 100% before saving.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        song_name: songName.trim(),
        vault_project_id: vaultProjectId,
        parties: parties.map(p => ({
          collaborator_id: p.collaboratorId,
          name: p.name,
          email: p.email || null,
          pro: p.pro || null,
          ipi: p.ipi || null,
          role: p.role || null,
          split_percentage: p.split,
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

      {/* ── Section 3: Parties ── */}
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

        <div className="space-y-2">
          {parties.map((party, i) => (
            <div
              key={i}
              className="grid grid-cols-1 gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2 sm:grid-cols-12"
            >
              {/* Name + picker */}
              <div className="flex items-center gap-1.5 sm:col-span-3">
                <input
                  value={party.name}
                  onChange={e => setPartyField(i, 'name', e.target.value)}
                  placeholder="Full legal name"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
                />
                <CollaboratorPicker onSelect={collab => handlePick(i, collab)} />
              </div>

              {/* Role */}
              <select
                value={party.role}
                onChange={e => setPartyField(i, 'role', e.target.value as ComposerRole)}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white focus:border-white/30 focus:outline-none sm:col-span-2"
              >
                {COMPOSER_ROLE_VALUES.map(r => (
                  <option key={r} value={r} className="bg-[#0a0a0f]">
                    {COMPOSER_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>

              {/* PRO */}
              <select
                value={party.pro}
                onChange={e => setPartyField(i, 'pro', e.target.value as PRO)}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white focus:border-white/30 focus:outline-none sm:col-span-2"
              >
                {PRO_VALUES.map(p => (
                  <option key={p} value={p} className="bg-[#0a0a0f]">
                    {PRO_LABELS[p]}
                  </option>
                ))}
              </select>

              {/* IPI */}
              <input
                value={party.ipi}
                onChange={e => setPartyField(i, 'ipi', e.target.value)}
                placeholder="IPI #"
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none sm:col-span-2"
              />

              {/* Split % + remove */}
              <div className="flex items-center gap-1 sm:col-span-3">
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.001}
                    value={party.split || ''}
                    onChange={e =>
                      setPartyField(i, 'split', Number(e.target.value) || 0)
                    }
                    placeholder="0"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 pr-6 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/40">
                    %
                  </span>
                </div>
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
